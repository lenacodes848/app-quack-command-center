import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, test } from 'vitest';
import type { ClaudeEvent, ClaudeTurnOptions } from '@quack/adapter';
import { openStore, type Store } from '@quack/storage';
import { createApp, type TurnRunner } from './app.js';

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

function freshStore(dir: string): Store {
  const store = openStore(join(dir, 'quack.db'));
  cleanups.push(() => {
    store.close();
  });
  return store;
}

async function serve(app: ReturnType<typeof createApp>): Promise<string> {
  const server: Server = createServer(app);
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', r);
  });
  cleanups.push(() => {
    server.close();
  });
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

function fakeRunner(events: ClaudeEvent[]): { run: TurnRunner; calls: ClaudeTurnOptions[] } {
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

const A_TURN: ClaudeEvent[] = [
  { type: 'session', sessionId: 'prov-1', model: 'opus' },
  { type: 'text', text: 'Hello back.' },
  { type: 'result', text: 'Hello back.', isError: false },
];

async function sendTurn(base: string, text: string, sessionId?: string): Promise<Response> {
  return fetch(`${base}/api/turn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(sessionId === undefined ? { text } : { text, sessionId }),
  });
}

describe('a turn is written down as it happens', () => {
  test('stores the question and the answer', async () => {
    const dir = scratch();
    const store = freshStore(dir);
    const { run } = fakeRunner(A_TURN);
    const base = await serve(createApp({ workspaceDir: dir, runTurn: run, store }));

    await (await sendTurn(base, 'Hello there')).text();

    const sessions = store.listSessions();
    expect(sessions).toHaveLength(1);
    const messages = store.listMessages(sessions[0]?.id ?? '');
    expect(messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'Hello there'],
      ['agent', 'Hello back.'],
    ]);
  });

  test('records the provider session id, so a later process can resume it', async () => {
    const dir = scratch();
    const store = freshStore(dir);
    const { run } = fakeRunner(A_TURN);
    const base = await serve(createApp({ workspaceDir: dir, runTurn: run, store }));

    await (await sendTurn(base, 'Hello there')).text();

    expect(store.listSessions()[0]?.providerSessionId).toBe('prov-1');
    expect(store.listSessions()[0]?.model).toBe('opus');
  });

  test('keeps a failed turn in the transcript instead of losing the question', async () => {
    // The question was asked. Dropping it because the answer failed would leave
    // the owner looking at a conversation that never mentions what they said.
    const dir = scratch();
    const store = freshStore(dir);
    const { run } = fakeRunner([{ type: 'error', message: 'the CLI fell over' }]);
    const base = await serve(createApp({ workspaceDir: dir, runTurn: run, store }));

    await (await sendTurn(base, 'a doomed question')).text();

    const session = store.listSessions()[0];
    expect(store.listMessages(session?.id ?? '').map((m) => [m.role, m.content])).toEqual([
      ['user', 'a doomed question'],
      ['agent', 'the CLI fell over'],
    ]);
  });
});

describe('a restart', () => {
  test('does not lose the conversation', async () => {
    const dir = scratch();
    const first = freshStore(dir);
    const base = await serve(
      createApp({ workspaceDir: dir, runTurn: fakeRunner(A_TURN).run, store: first }),
    );
    await (await sendTurn(base, 'before the restart')).text();
    const sessionId = first.listSessions()[0]?.id ?? '';
    first.close();

    // A brand new store and a brand new app, which is what a restart is.
    const second = freshStore(dir);
    const restarted = await serve(
      createApp({ workspaceDir: dir, runTurn: fakeRunner(A_TURN).run, store: second }),
    );

    const listed = (await (await fetch(`${restarted}/api/sessions`)).json()) as {
      sessions: { id: string; title: string }[];
    };
    expect(listed.sessions.map((s) => s.id)).toEqual([sessionId]);
    expect(listed.sessions[0]?.title).toBe('before the restart');

    const reopened = (await (await fetch(`${restarted}/api/sessions/${sessionId}`)).json()) as {
      messages: { role: string; content: string }[];
    };
    expect(reopened.messages.map((m) => m.content)).toEqual(['before the restart', 'Hello back.']);
  });

  test('continues a stored conversation with the provider id it saved', async () => {
    const dir = scratch();
    const first = freshStore(dir);
    const base = await serve(
      createApp({ workspaceDir: dir, runTurn: fakeRunner(A_TURN).run, store: first }),
    );
    await (await sendTurn(base, 'first question')).text();
    const sessionId = first.listSessions()[0]?.id ?? '';
    first.close();

    const second = freshStore(dir);
    const { run, calls } = fakeRunner(A_TURN);
    const restarted = await serve(createApp({ workspaceDir: dir, runTurn: run, store: second }));

    await (await sendTurn(restarted, 'second question', sessionId)).text();

    // The whole point: after a restart the next turn still resumes the provider
    // conversation rather than silently starting a new one.
    expect(calls[0]?.sessionId).toBe('prov-1');
    expect(second.listMessages(sessionId).map((m) => m.content)).toEqual([
      'first question',
      'Hello back.',
      'second question',
      'Hello back.',
    ]);
  });
});

describe('the sessions endpoints', () => {
  test('list the newest conversation first', async () => {
    const dir = scratch();
    const store = freshStore(dir);
    const base = await serve(
      createApp({ workspaceDir: dir, runTurn: fakeRunner(A_TURN).run, store }),
    );

    await (await sendTurn(base, 'the older one')).text();
    await (await fetch(`${base}/api/session`, { method: 'DELETE' })).text();
    await (await sendTurn(base, 'the newer one')).text();

    const listed = (await (await fetch(`${base}/api/sessions`)).json()) as {
      sessions: { title: string }[];
    };
    expect(listed.sessions.map((s) => s.title)).toEqual(['the newer one', 'the older one']);
  });

  test('answer 404 for a conversation that does not exist', async () => {
    const dir = scratch();
    const store = freshStore(dir);
    const base = await serve(
      createApp({ workspaceDir: dir, runTurn: fakeRunner(A_TURN).run, store }),
    );
    const response = await fetch(`${base}/api/sessions/nope`);
    expect(response.status).toBe(404);
  });

  test('refuse a turn against a conversation that does not exist', async () => {
    // Otherwise a stale browser tab would quietly start a fresh conversation
    // under a session id that means nothing.
    const dir = scratch();
    const store = freshStore(dir);
    const { run, calls } = fakeRunner(A_TURN);
    const base = await serve(createApp({ workspaceDir: dir, runTurn: run, store }));

    const response = await sendTurn(base, 'hello', 'not-a-real-session');
    expect(response.status).toBe(404);
    expect(calls).toHaveLength(0);
  });
});

describe('without a store', () => {
  test('the server still runs, and says it is not saving anything', async () => {
    // The in-memory mode stays supported so a test or a throwaway run needs no
    // database on disk.
    const dir = scratch();
    const base = await serve(createApp({ workspaceDir: dir, runTurn: fakeRunner(A_TURN).run }));
    await (await sendTurn(base, 'hello')).text();

    const health = (await (await fetch(`${base}/api/health`)).json()) as { persistent: boolean };
    expect(health.persistent).toBe(false);

    const listed = (await (await fetch(`${base}/api/sessions`)).json()) as { sessions: unknown[] };
    expect(listed.sessions).toEqual([]);
  });
});
