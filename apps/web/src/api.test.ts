import { describe, expect, test } from 'vitest';
import { listSessions, openSession, parseTurnEvent, sendTurn, toLines } from './api.js';

async function* chunks(...values: string[]): AsyncGenerator<string> {
  for (const value of values) {
    // Yield to the event loop between chunks, so the splitter is exercised
    // the way a real network stream delivers them rather than all at once.
    await Promise.resolve();
    yield value;
  }
}

async function collect(lines: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const line of lines) out.push(line);
  return out;
}

describe('toLines', () => {
  test('splits a single chunk into its lines', async () => {
    expect(await collect(toLines(chunks('a\nb\nc\n')))).toEqual(['a', 'b', 'c']);
  });

  test('reassembles a line split across chunk boundaries', async () => {
    // The whole reason this function exists: the network decides where chunks
    // break, and a naive split would lose or corrupt the event here.
    expect(await collect(toLines(chunks('{"ty', 'pe":"te', 'xt"}\n')))).toEqual([
      '{"type":"text"}',
    ]);
  });

  test('emits a trailing line that never got its newline', async () => {
    expect(await collect(toLines(chunks('first\nsecond')))).toEqual(['first', 'second']);
  });

  test('handles several lines arriving in one chunk after a partial one', async () => {
    expect(await collect(toLines(chunks('one', '\ntwo\nthree\n')))).toEqual([
      'one',
      'two',
      'three',
    ]);
  });

  test('ignores a trailing chunk that is only whitespace', async () => {
    expect(await collect(toLines(chunks('done\n', '  ')))).toEqual(['done']);
  });
});

describe('parseTurnEvent', () => {
  test('parses a text event', () => {
    expect(parseTurnEvent('{"type":"text","text":"hi"}')).toEqual({ type: 'text', text: 'hi' });
  });

  test.each([
    ['malformed JSON', '{oops'],
    ['an empty line', '   '],
    ['a JSON value that is not an object', '42'],
    ['null', 'null'],
    ['an object with no type', '{"text":"hi"}'],
  ])('returns undefined for %s', (_label, line) => {
    expect(parseTurnEvent(line)).toBeUndefined();
  });
});

/**
 * Replace global fetch for one test and record what it was asked for.
 *
 * The real thing is not available in this environment and, more to the point,
 * these tests are about the request the browser makes: that is the contract
 * with the server, and it is what a typo would break silently.
 */
function captureFetch(reply: { status?: number; body: unknown }): {
  calls: { url: string; init: RequestInit | undefined }[];
  restore: () => void;
} {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(
      new Response(JSON.stringify(reply.body), {
        status: reply.status ?? 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }) as typeof globalThis.fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

describe('listSessions', () => {
  test('asks the server for the saved conversations', async () => {
    const fake = captureFetch({
      body: { sessions: [{ id: 'a', title: 'Yesterday', updatedAt: '2026-09-24T00:00:00.000Z' }] },
    });
    try {
      const sessions = await listSessions();
      expect(fake.calls[0]?.url).toBe('/api/sessions');
      expect(sessions.map((s) => s.title)).toEqual(['Yesterday']);
    } finally {
      fake.restore();
    }
  });

  test('treats a failure as no conversations rather than breaking the page', async () => {
    // The transcript is the important thing on screen. A sidebar that cannot
    // load must not take the conversation down with it.
    const fake = captureFetch({ status: 500, body: { error: 'nope' } });
    try {
      expect(await listSessions()).toEqual([]);
    } finally {
      fake.restore();
    }
  });
});

describe('openSession', () => {
  test('fetches one conversation and its messages', async () => {
    const fake = captureFetch({
      body: {
        id: 'abc',
        title: 'A saved thread',
        messages: [
          { role: 'user', content: 'hello', seq: 1 },
          { role: 'agent', content: 'hi', seq: 2 },
        ],
      },
    });
    try {
      const opened = await openSession('abc');
      expect(fake.calls[0]?.url).toBe('/api/sessions/abc');
      expect(opened?.messages.map((m) => m.content)).toEqual(['hello', 'hi']);
    } finally {
      fake.restore();
    }
  });

  test('reads a missing conversation as absent', async () => {
    const fake = captureFetch({ status: 404, body: { error: 'No such conversation.' } });
    try {
      expect(await openSession('gone')).toBeUndefined();
    } finally {
      fake.restore();
    }
  });
});

describe('sendTurn', () => {
  test('names the conversation to continue, so a restart resumes it', async () => {
    // Without this the server would start a new conversation every time the
    // page was reloaded, which is exactly the bug persistence exists to fix.
    const fake = captureFetch({ body: {} });
    try {
      const events = sendTurn('carry on', { sessionId: 'stored-1' });
      await events.next();
      const body = JSON.parse((fake.calls[0]?.init?.body ?? '{}') as string) as Record<
        string,
        unknown
      >;
      expect(body).toEqual({ text: 'carry on', sessionId: 'stored-1' });
    } finally {
      fake.restore();
    }
  });

  test('omits the conversation id when starting a new one', async () => {
    const fake = captureFetch({ body: {} });
    try {
      const events = sendTurn('a fresh start');
      await events.next();
      const body = JSON.parse((fake.calls[0]?.init?.body ?? '{}') as string) as Record<
        string,
        unknown
      >;
      expect(body).toEqual({ text: 'a fresh start' });
      expect('sessionId' in body).toBe(false);
    } finally {
      fake.restore();
    }
  });
});
