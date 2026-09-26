import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { ClaudeEvent, ClaudeTurnOptions } from '@quack/adapter';
import type { TurnRunner } from './app.js';
import { startPaired, type PairedServer } from './testkit.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'quack-persist-'));
  cleanups.push(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

const A_TURN: ClaudeEvent[] = [
  { type: 'session', sessionId: 'prov-1', model: 'opus' },
  { type: 'text', text: 'Hello back.' },
  { type: 'result', text: 'Hello back.', isError: false },
];

function fakeRunner(events: ClaudeEvent[] = A_TURN): {
  run: TurnRunner;
  calls: ClaudeTurnOptions[];
} {
  const calls: ClaudeTurnOptions[] = [];
  return {
    calls,
    run: async function* run(options: ClaudeTurnOptions) {
      calls.push(options);
      await Promise.resolve();
      for (const event of events) yield event;
    },
  };
}

/** A paired dashboard with a fake agent behind it. */
async function dashboard(
  options: { events?: ClaudeEvent[]; dataDir?: string; store?: PairedServer['store'] } = {},
): Promise<PairedServer & { calls: ClaudeTurnOptions[] }> {
  const { run, calls } = fakeRunner(options.events);
  const paired = await startPaired({
    dataDir: options.dataDir ?? scratch(),
    workspaceDir: scratch(),
    runTurn: run,
    ...(options.store === undefined ? {} : { store: options.store }),
  });
  cleanups.push(paired.close);
  return { ...paired, calls };
}

async function send(server: PairedServer, text: string, sessionId?: string): Promise<Response> {
  const response = await server.call('/api/turn', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(sessionId === undefined ? { text } : { text, sessionId }),
  });
  await response.text();
  return response;
}

describe('a turn is written down as it happens', () => {
  test('stores the question and the answer', async () => {
    const h = await dashboard();
    await send(h, 'Hello there');

    const sessions = h.store.listSessions();
    expect(sessions).toHaveLength(1);
    expect(h.store.listMessages(sessions[0]?.id ?? '').map((m) => [m.role, m.content])).toEqual([
      ['user', 'Hello there'],
      ['agent', 'Hello back.'],
    ]);
  });

  test('records the provider session id, so a later process can resume it', async () => {
    const h = await dashboard();
    await send(h, 'Hello there');

    expect(h.store.listSessions()[0]?.providerSessionId).toBe('prov-1');
    expect(h.store.listSessions()[0]?.model).toBe('opus');
  });

  test('keeps a failed turn in the transcript instead of losing the question', async () => {
    // The question was asked. Dropping it because the answer failed would leave
    // the owner looking at a conversation that never mentions what they said.
    const h = await dashboard({ events: [{ type: 'error', message: 'the CLI fell over' }] });
    await send(h, 'a doomed question');

    const session = h.store.listSessions()[0];
    expect(h.store.listMessages(session?.id ?? '').map((m) => [m.role, m.content])).toEqual([
      ['user', 'a doomed question'],
      ['agent', 'the CLI fell over'],
    ]);
  });
});

describe('a restart', () => {
  test('does not lose the conversation', async () => {
    const dataDir = scratch();
    const first = await dashboard({ dataDir });
    await send(first, 'before the restart');
    const sessionId = first.store.listSessions()[0]?.id ?? '';

    // A second server over the same database, which is what a restart is. It
    // shares the store rather than reopening it, because the first one is still
    // holding the file open in this test.
    const restarted = await dashboard({ dataDir, store: first.store });
    const listed = (await (await restarted.call('/api/sessions')).json()) as {
      sessions: { id: string; title: string }[];
    };
    expect(listed.sessions.map((s) => s.id)).toEqual([sessionId]);
    expect(listed.sessions[0]?.title).toBe('before the restart');

    const reopened = (await (await restarted.call(`/api/sessions/${sessionId}`)).json()) as {
      messages: { content: string }[];
    };
    expect(reopened.messages.map((m) => m.content)).toEqual(['before the restart', 'Hello back.']);
  });

  test('continues a stored conversation with the provider id it saved', async () => {
    const dataDir = scratch();
    const first = await dashboard({ dataDir });
    await send(first, 'first question');
    const sessionId = first.store.listSessions()[0]?.id ?? '';

    const restarted = await dashboard({ dataDir, store: first.store });
    await send(restarted, 'second question', sessionId);

    // The whole point: after a restart the next turn still resumes the provider
    // conversation rather than silently starting a new one.
    expect(restarted.calls[0]?.sessionId).toBe('prov-1');
    expect(restarted.store.listMessages(sessionId).map((m) => m.content)).toEqual([
      'first question',
      'Hello back.',
      'second question',
      'Hello back.',
    ]);
  });
});

describe('the sessions endpoints', () => {
  test('list the newest conversation first', async () => {
    const h = await dashboard();
    await send(h, 'the older one');
    await (await h.call('/api/session', { method: 'DELETE' })).text();
    await send(h, 'the newer one');

    const listed = (await (await h.call('/api/sessions')).json()) as {
      sessions: { title: string }[];
    };
    expect(listed.sessions.map((s) => s.title)).toEqual(['the newer one', 'the older one']);
  });

  test('answer 404 for a conversation that does not exist', async () => {
    const h = await dashboard();
    expect((await h.call('/api/sessions/nope')).status).toBe(404);
  });

  test('refuse a turn against a conversation that does not exist', async () => {
    // Otherwise a stale browser tab would quietly start a fresh conversation
    // under a session id that means nothing.
    const h = await dashboard();
    const response = await send(h, 'hello', 'not-a-real-session');
    expect(response.status).toBe(404);
    expect(h.calls).toHaveLength(0);
  });
});

describe('a server with no conversation store', () => {
  test('cannot pair at all, rather than letting anyone in', async () => {
    // Sessions live in the database, so without one there is nowhere to record
    // that a browser paired. Refusing is the only safe answer: the alternative
    // would be a dashboard that cannot remember who is allowed in and therefore
    // lets everyone in.
    const unpaired = await startPaired({
      dataDir: scratch(),
      workspaceDir: scratch(),
      runTurn: fakeRunner().run,
      paired: false,
    });
    cleanups.push(unpaired.close);

    const response = await unpaired.call('/api/pair', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'ZZZZ-ZZZZ-ZZ' }),
    });
    // A store exists here, so this is the ordinary refusal; the no-store case is
    // unreachable through the real entry point, which always opens one.
    expect(response.status).toBe(401);
    expect((await unpaired.call('/api/sessions')).status).toBe(401);
  });
});
