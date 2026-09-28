import { describe, expect, test } from 'vitest';
import {
  csrfToken,
  launchAgent,
  listAgents,
  listProjects,
  openAgent,
  pair,
  renameAgent,
  sendMessage,
  stopAgent,
  whoAmI,
} from './api.js';

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

describe('the CSRF token', () => {
  test('is read from the cookie the server set', () => {
    expect(csrfToken('quack_csrf=abc123; other=x')).toBe('abc123');
  });

  test('is absent rather than wrong when there is no cookie', () => {
    expect(csrfToken('')).toBeUndefined();
    expect(csrfToken('other=x')).toBeUndefined();
  });
});

describe('pairing from the browser', () => {
  test('sends the code the owner typed', async () => {
    const fake = captureFetch({ body: { ok: true } });
    try {
      expect((await pair('7H2K-9QMR-4B')).outcome).toBe('paired');
      expect(fake.calls[0]?.url).toBe('/api/pair');
      const body = JSON.parse((fake.calls[0]?.init?.body ?? '{}') as string) as {
        code: string;
      };
      expect(body.code).toBe('7H2K-9QMR-4B');
    } finally {
      fake.restore();
    }
  });

  test('reports a refused code without pretending it worked', async () => {
    const fake = captureFetch({ status: 401, body: { error: 'Pairing failed.' } });
    try {
      expect((await pair('wrong')).outcome).toBe('rejected');
    } finally {
      fake.restore();
    }
  });

  test('distinguishes being locked out, because the advice differs', async () => {
    // A wrong code means try again; too many attempts means wait. Telling the
    // owner to retry when retrying cannot work is worse than saying nothing.
    const fake = captureFetch({ status: 429, body: { error: 'Too many attempts.' } });
    try {
      expect((await pair('wrong')).outcome).toBe('locked');
    } finally {
      fake.restore();
    }
  });
});

describe('pairing from an address that cannot keep the cookie', () => {
  test('is its own outcome, not "could not reach the server"', async () => {
    // 421 used to fall through to 'unavailable', whose message tells the owner
    // to check whether the server is running — when the server is running,
    // answered them, and knows exactly what is wrong. That is the same
    // confusion #29 was filed about, one layer up.
    const fake = captureFetch({
      status: 421,
      body: { error: 'This address cannot keep the session cookie.' },
    });
    try {
      const result = await pair('7H2K-9QMR-4B');
      expect(result.outcome).toBe('wrongAddress');
      expect(result.outcome).not.toBe('unavailable');
    } finally {
      fake.restore();
    }
  });

  test('carries the server explanation, rather than a second hardcoded copy', async () => {
    const fake = captureFetch({
      status: 421,
      body: { error: 'Open the dashboard on this machine at a 127.0.0.1 address.' },
    });
    try {
      expect((await pair('x')).detail).toBe(
        'Open the dashboard on this machine at a 127.0.0.1 address.',
      );
    } finally {
      fake.restore();
    }
  });

  test('still names the outcome when the body cannot be read', async () => {
    // A 421 with no usable body must not become 'unavailable' again; the screen
    // has its own wording to fall back on.
    const fake = captureFetch({ status: 421, body: 'not json' });
    try {
      const result = await pair('x');
      expect(result.outcome).toBe('wrongAddress');
      expect(result.detail).toBeUndefined();
    } finally {
      fake.restore();
    }
  });

  test('leaves the other failures with the interface own wording', async () => {
    // The server is deliberately vague on a wrong code, so that text must not
    // replace the screen message, which says what to do about it.
    for (const [status, outcome] of [
      [401, 'rejected'],
      [429, 'locked'],
    ] as const) {
      const fake = captureFetch({ status, body: { error: 'Pairing failed.' } });
      try {
        const result = await pair('x');
        expect(result.outcome).toBe(outcome);
        expect(result.detail).toBeUndefined();
      } finally {
        fake.restore();
      }
    }
  });

  test('a server that truly cannot be reached is still unavailable', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = () => Promise.reject(new Error('connection refused'));
    try {
      expect((await pair('x')).outcome).toBe('unavailable');
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('whoAmI', () => {
  test('reports a paired browser', async () => {
    const fake = captureFetch({ body: { paired: true, device: 'Mac' } });
    try {
      const me = await whoAmI();
      expect(fake.calls[0]?.url).toBe('/api/me');
      expect(me?.device).toBe('Mac');
    } finally {
      fake.restore();
    }
  });

  test('reports an unpaired browser as absent, which is what shows the login screen', async () => {
    const fake = captureFetch({ status: 401, body: { error: 'Not paired.' } });
    try {
      expect(await whoAmI()).toBeUndefined();
    } finally {
      fake.restore();
    }
  });
});

describe('agents', () => {
  test('are listed with the sequence the list reflects', async () => {
    const fake = captureFetch({ body: { agents: [{ id: 'a' }], seq: 4 } });
    try {
      expect(await listAgents()).toEqual({ agents: [{ id: 'a' }], seq: 4 });
      expect(fake.calls[0]?.url).toBe('/api/agents');
    } finally {
      fake.restore();
    }
  });

  test('a list that cannot be read is absent, not an empty list that looks real', async () => {
    const fake = captureFetch({ status: 500, body: {} });
    try {
      expect(await listAgents()).toBeUndefined();
      expect(await listProjects()).toBeUndefined();
      expect(await openAgent('a')).toBeUndefined();
    } finally {
      fake.restore();
    }
  });

  test('an agent is opened by an escaped id', async () => {
    const fake = captureFetch({ body: { agent: { id: 'a/b' }, messages: [], live: [], seq: 1 } });
    try {
      await openAgent('a/b');
      expect(fake.calls[0]?.url).toBe('/api/agents/a%2Fb');
    } finally {
      fake.restore();
    }
  });
});

describe('state-changing requests', () => {
  test.each([
    [
      'launching',
      () => launchAgent({ name: 'n', project: '/p', model: '', text: '' }, 'tok'),
      '/api/agents',
      'POST',
    ],
    ['sending', () => sendMessage('a', 'hi', 'tok'), '/api/agents/a/messages', 'POST'],
    ['stopping', () => stopAgent('a', 'tok'), '/api/agents/a/stop', 'POST'],
    ['renaming', () => renameAgent('a', 'x', 'tok'), '/api/agents/a', 'PATCH'],
  ])('%s carries the CSRF header, or the server rejects it', async (_label, act, url, method) => {
    const fake = captureFetch({ body: { agent: { id: 'a' } } });
    try {
      await act();
      expect(fake.calls[0]?.url).toBe(url);
      expect(fake.calls[0]?.init?.method).toBe(method);
      expect(new Headers(fake.calls[0]?.init?.headers).get('x-csrf-token')).toBe('tok');
    } finally {
      fake.restore();
    }
  });

  test("a refusal comes back as the server's own explanation", async () => {
    const fake = captureFetch({ status: 409, body: { error: 'This agent is already working.' } });
    try {
      expect(await sendMessage('a', 'hi')).toBe('This agent is already working.');
    } finally {
      fake.restore();
    }
  });

  test('a refusal with no readable body still names the status', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = () => Promise.resolve(new Response('oops', { status: 502 }));
    try {
      expect(await stopAgent('a')).toBe('The server returned 502.');
    } finally {
      globalThis.fetch = original;
    }
  });

  test('a launch whose first message was refused keeps the agent and the reason', async () => {
    const fake = captureFetch({
      status: 201,
      body: { agent: { id: 'a' }, error: 'At the limit.' },
    });
    try {
      expect(await launchAgent({ name: '', project: '/p', model: '', text: 'go' })).toEqual({
        agent: { id: 'a' },
        error: 'At the limit.',
      });
    } finally {
      fake.restore();
    }
  });

  test('a server that cannot be reached says so', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = () => Promise.reject(new TypeError('offline'));
    try {
      expect(await sendMessage('a', 'hi')).toMatch(/Could not reach the server/);
      expect((await launchAgent({ name: '', project: '/p', model: '', text: '' })).error).toMatch(
        /Could not reach/,
      );
    } finally {
      globalThis.fetch = original;
    }
  });
});
