import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, test } from 'vitest';
import type { ClaudeEvent, ClaudeTurnOptions } from '@quack/adapter';
import { createApp, resolveStaticPath, type TurnRunner } from './app.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'quack-server-'));
  cleanups.push(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
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

/** A runner that emits a fixed script and records how it was called. */
function fakeRunner(events: ClaudeEvent[]): { run: TurnRunner; calls: ClaudeTurnOptions[] } {
  const calls: ClaudeTurnOptions[] = [];
  return {
    calls,
    run: async function* run(options: ClaudeTurnOptions) {
      calls.push(options);
      // Yield to the event loop so the fake behaves like a real streaming
      // turn rather than delivering everything in one synchronous burst.
      await Promise.resolve();
      for (const event of events) yield event;
    },
  };
}

async function readNdjson(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as unknown);
}

describe('health', () => {
  test('reports no session before anything has run', async () => {
    const base = await serve(createApp({ workspaceDir: scratch() }));
    expect(await (await fetch(`${base}/api/health`)).json()).toEqual({ ok: true, session: null });
  });
});

describe('a turn', () => {
  test('streams every event to the client as NDJSON', async () => {
    const { run } = fakeRunner([
      { type: 'session', sessionId: 's-1', model: 'm' },
      { type: 'text', text: 'Quack.' },
      { type: 'result', text: 'Quack.', isError: false },
    ]);
    const base = await serve(createApp({ workspaceDir: scratch(), runTurn: run }));

    const response = await fetch(`${base}/api/turn`, {
      method: 'POST',
      body: JSON.stringify({ text: 'hello' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/x-ndjson');
    expect(await readNdjson(response)).toEqual([
      { type: 'session', sessionId: 's-1', model: 'm' },
      { type: 'text', text: 'Quack.' },
      { type: 'result', text: 'Quack.', isError: false },
    ]);
  });

  test('remembers the session id and resumes it on the next turn', async () => {
    const { run, calls } = fakeRunner([
      { type: 'session', sessionId: 'keep-me', model: undefined },
      { type: 'result', text: 'ok', isError: false },
    ]);
    const base = await serve(createApp({ workspaceDir: scratch(), runTurn: run }));

    const send = async (text: string): Promise<void> => {
      const r = await fetch(`${base}/api/turn`, { method: 'POST', body: JSON.stringify({ text }) });
      await r.text();
    };

    await send('first');
    await send('second');

    expect(calls[0]?.sessionId).toBeUndefined();
    expect(calls[1]?.sessionId).toBe('keep-me');
    expect(await (await fetch(`${base}/api/health`)).json()).toMatchObject({ session: 'keep-me' });
  });

  test('runs the agent in the configured workspace, not the server directory', async () => {
    const workspace = scratch();
    const { run, calls } = fakeRunner([{ type: 'result', text: 'ok', isError: false }]);
    const base = await serve(createApp({ workspaceDir: workspace, runTurn: run }));

    await (
      await fetch(`${base}/api/turn`, { method: 'POST', body: JSON.stringify({ text: 'hi' }) })
    ).text();

    expect(calls[0]?.cwd).toBe(workspace);
  });

  test('refuses a second turn while one is running', async () => {
    let release = (): void => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const run: TurnRunner = async function* run() {
      await gate;
      yield { type: 'result', text: 'done', isError: false };
    };
    const base = await serve(createApp({ workspaceDir: scratch(), runTurn: run }));

    const first = fetch(`${base}/api/turn`, {
      method: 'POST',
      body: JSON.stringify({ text: 'one' }),
    });
    // Give the first request time to claim the slot.
    await new Promise((r) => setTimeout(r, 50));
    const second = await fetch(`${base}/api/turn`, {
      method: 'POST',
      body: JSON.stringify({ text: 'two' }),
    });

    expect(second.status).toBe(409);
    release();
    await (await first).text();
  });

  test('frees the slot once a turn finishes, so the next one is accepted', async () => {
    const { run } = fakeRunner([{ type: 'result', text: 'ok', isError: false }]);
    const base = await serve(createApp({ workspaceDir: scratch(), runTurn: run }));

    for (const text of ['one', 'two']) {
      const r = await fetch(`${base}/api/turn`, { method: 'POST', body: JSON.stringify({ text }) });
      expect(r.status).toBe(200);
      await r.text();
    }
  });

  test.each([
    ['an empty message', JSON.stringify({ text: '   ' })],
    ['a missing field', JSON.stringify({})],
    ['a non-string message', JSON.stringify({ text: 42 })],
    ['a body that is not JSON', 'nonsense'],
  ])('rejects %s with 400', async (_label, body) => {
    const base = await serve(createApp({ workspaceDir: scratch() }));
    const response = await fetch(`${base}/api/turn`, { method: 'POST', body });
    expect(response.status).toBe(400);
  });

  test('rejects a GET with 405', async () => {
    const base = await serve(createApp({ workspaceDir: scratch() }));
    expect((await fetch(`${base}/api/turn`)).status).toBe(405);
  });
});

describe('clearing the session', () => {
  test('forgets the session id so the next turn starts fresh', async () => {
    const { run, calls } = fakeRunner([
      { type: 'session', sessionId: 'old', model: undefined },
      { type: 'result', text: 'ok', isError: false },
    ]);
    const base = await serve(createApp({ workspaceDir: scratch(), runTurn: run }));

    await (
      await fetch(`${base}/api/turn`, { method: 'POST', body: JSON.stringify({ text: 'a' }) })
    ).text();
    await fetch(`${base}/api/session`, { method: 'DELETE' });
    await (
      await fetch(`${base}/api/turn`, { method: 'POST', body: JSON.stringify({ text: 'b' }) })
    ).text();

    expect(calls[1]?.sessionId).toBeUndefined();
  });
});

describe('serving the built web app', () => {
  test('serves index.html at the root and falls back for client routes', async () => {
    const webDir = scratch();
    writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Quack</title>', 'utf8');
    const base = await serve(createApp({ workspaceDir: scratch(), webDir }));

    for (const path of ['/', '/some/client/route']) {
      const response = await fetch(`${base}${path}`);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('Quack');
    }
  });

  test('an api path is never served from disk', async () => {
    const webDir = scratch();
    writeFileSync(join(webDir, 'index.html'), 'page', 'utf8');
    const base = await serve(createApp({ workspaceDir: scratch(), webDir }));
    expect((await fetch(`${base}/api/unknown`)).status).toBe(404);
  });
});

describe('resolveStaticPath', () => {
  test('resolves a normal file inside the root', () => {
    expect(resolveStaticPath('/srv/web', '/assets/app.js')).toBe('/srv/web/assets/app.js');
  });

  test.each([
    ['a parent traversal', '/../../etc/passwd'],
    ['an encoded traversal', '/%2e%2e%2f%2e%2e%2fetc/passwd'],
    ['a nested traversal', '/assets/../../etc/passwd'],
    ['a sibling sharing a name prefix', '/../web-secrets/key.txt'],
    ['a deep climb', '/a/b/c/../../../../../../etc/shadow'],
  ])('clamps %s inside the served root instead of escaping it', (_label, urlPath) => {
    // A leading `..` on an absolute path is dropped by normalize, so these
    // resolve to a harmless path under the root rather than being rejected.
    // What matters is the invariant: the result never leaves the root.
    const resolved = resolveStaticPath('/srv/web', urlPath);
    expect(resolved).toBeDefined();
    expect(resolved?.startsWith('/srv/web/')).toBe(true);
    expect(resolved).not.toContain('..');
  });

  test('refuses a null byte outright', () => {
    expect(resolveStaticPath('/srv/web', '/app%00.js')).toBeUndefined();
  });

  test('refuses a malformed percent escape', () => {
    expect(resolveStaticPath('/srv/web', '/%zz')).toBeUndefined();
  });
});

describe('when a turn fails mid-stream', () => {
  test('reports the failure as an event instead of truncating the response', async () => {
    // The client has already received a 200 and some events by the time this
    // happens, so the only way to tell it something went wrong is in-band.
    const run: TurnRunner = async function* run() {
      yield { type: 'text', text: 'partial' };
      await Promise.resolve();
      throw new Error('the provider died');
    };
    const base = await serve(createApp({ workspaceDir: scratch(), runTurn: run }));

    const response = await fetch(`${base}/api/turn`, {
      method: 'POST',
      body: JSON.stringify({ text: 'hi' }),
    });

    expect(response.status).toBe(200);
    expect(await readNdjson(response)).toEqual([
      { type: 'text', text: 'partial' },
      { type: 'error', message: 'the provider died' },
    ]);
  });

  test('a non-Error thrown mid-stream still produces a usable message', async () => {
    /* eslint-disable require-yield, @typescript-eslint/only-throw-error --
       The thing under test IS a generator that throws a non-Error before
       yielding anything. Both rules are right in general and describe exactly
       the fixture this test needs. */
    const run: TurnRunner = async function* run() {
      await Promise.resolve();
      throw 'just a string';
    };
    /* eslint-enable require-yield, @typescript-eslint/only-throw-error */
    const base = await serve(createApp({ workspaceDir: scratch(), runTurn: run }));
    const response = await fetch(`${base}/api/turn`, {
      method: 'POST',
      body: JSON.stringify({ text: 'hi' }),
    });
    expect(await readNdjson(response)).toEqual([{ type: 'error', message: 'The turn failed.' }]);
  });

  test('the slot is released after a mid-stream failure, not left stuck busy', async () => {
    let calls = 0;
    const run: TurnRunner = async function* run() {
      calls += 1;
      await Promise.resolve();
      if (calls === 1) throw new Error('boom');
      yield { type: 'result', text: 'recovered', isError: false };
    };
    const base = await serve(createApp({ workspaceDir: scratch(), runTurn: run }));

    await (
      await fetch(`${base}/api/turn`, { method: 'POST', body: JSON.stringify({ text: 'a' }) })
    ).text();
    const second = await fetch(`${base}/api/turn`, {
      method: 'POST',
      body: JSON.stringify({ text: 'b' }),
    });

    expect(second.status).toBe(200);
    expect(await readNdjson(second)).toEqual([
      { type: 'result', text: 'recovered', isError: false },
    ]);
  });
});
