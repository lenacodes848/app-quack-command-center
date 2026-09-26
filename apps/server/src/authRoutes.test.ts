import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, test } from 'vitest';
import type { ClaudeEvent, ClaudeTurnOptions } from '@quack/adapter';
import { openStore, type Store } from '@quack/storage';
import { createApp, type TurnRunner } from './app.js';
import {
  createPairingMode,
  CSRF_COOKIE,
  CSRF_HEADER,
  IDLE_TTL_MS,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  type PairingMode,
} from './auth.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'quack-auth-'));
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

interface Harness {
  base: string;
  store: Store;
  pairing: PairingMode;
  calls: ClaudeTurnOptions[];
  /** Move the app's clock, so expiry needs no waiting. */
  advance: (ms: number) => void;
  /** The cookies a paired browser would hold. Empty until `pair()`. */
  jar: Map<string, string>;
  pair: () => Promise<Response>;
  /** A request carrying whatever cookies the jar holds, and the CSRF header. */
  call: (path: string, init?: RequestInit & { csrf?: boolean }) => Promise<Response>;
}

async function harness(options: { events?: ClaudeEvent[] } = {}): Promise<Harness> {
  const dir = scratch();

  // One clock for both the app and the store. In production they are both the
  // system clock; wiring only the app to a fake one made the idle-window test
  // compare `last_used_at` written in real time against a cutoff computed in
  // fake time, so nothing ever looked idle.
  let clock = Date.parse('2026-09-25T12:00:00.000Z');
  const now = (): number => clock;

  const store = openStore(join(dir, 'quack.db'), {
    now: () => new Date(now()).toISOString(),
  });
  cleanups.push(() => {
    store.close();
  });
  const pairing = createPairingMode({ now });
  const { run, calls } = fakeRunner(options.events);

  const server: Server = createServer(
    createApp({ workspaceDir: dir, runTurn: run, store, pairing, now }),
  );
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', r);
  });
  cleanups.push(() => {
    server.close();
  });
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  const jar = new Map<string, string>();

  /** Record whatever the server set, the way a browser would. */
  const remember = (response: Response): void => {
    for (const raw of response.headers.getSetCookie()) {
      const [pair] = raw.split(';');
      const at = pair?.indexOf('=') ?? -1;
      if (pair === undefined || at < 1) continue;
      jar.set(pair.slice(0, at), pair.slice(at + 1));
    }
  };

  const call: Harness['call'] = async (path, init = {}) => {
    const headers = new Headers(init.headers);
    if (jar.size > 0) {
      headers.set('cookie', [...jar].map(([name, value]) => `${name}=${value}`).join('; '));
    }
    // A real browser sends this on a same-origin fetch; the server requires
    // proof of origin on anything that changes state.
    headers.set('origin', base);
    if (init.csrf !== false && jar.has(CSRF_COOKIE)) {
      headers.set(CSRF_HEADER, jar.get(CSRF_COOKIE) ?? '');
    }
    const response = await fetch(`${base}${path}`, { ...init, headers });
    remember(response);
    return response;
  };

  return {
    base,
    store,
    pairing,
    calls,
    advance: (ms) => {
      clock += ms;
    },
    jar,
    pair: async () => {
      const code = pairing.open();
      return call('/api/pair', {
        method: 'POST',
        body: JSON.stringify({ code }),
        headers: { 'content-type': 'application/json' },
      });
    },
    call,
  };
}

describe('before pairing', () => {
  test('every route that does anything refuses', async () => {
    const h = await harness();
    for (const path of ['/api/sessions', '/api/sessions/anything', '/api/me']) {
      expect((await h.call(path)).status, path).toBe(401);
    }
  });

  test('a turn is refused and the agent is never started', async () => {
    // The point of the whole exercise: an unauthenticated caller must not be
    // able to run anything on the owner's machine.
    const h = await harness();
    const response = await h.call('/api/turn', {
      method: 'POST',
      body: JSON.stringify({ text: 'do something' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(response.status).toBe(401);
    expect(h.calls).toHaveLength(0);
  });

  test('health still answers, and says nothing about the owner', async () => {
    // Liveness checking has to work unauthenticated, so it must leak no state:
    // not whether anyone is paired, not whether a conversation is open.
    const h = await harness();
    const response = await h.call('/api/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test('security headers are set even on a refusal', async () => {
    const h = await harness();
    const response = await h.call('/api/sessions');
    expect(response.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('pairing', () => {
  test('the right code pairs the browser and lets it in', async () => {
    const h = await harness();
    expect((await h.pair()).status).toBe(200);
    expect((await h.call('/api/me')).status).toBe(200);
    expect((await h.call('/api/sessions')).status).toBe(200);
  });

  test('issues a session cookie that scripts cannot read', async () => {
    const h = await harness();
    const response = await h.pair();
    const cookies = response.headers.getSetCookie().join('\n');
    expect(cookies).toContain(`${SESSION_COOKIE}=`);
    expect(cookies).toMatch(new RegExp(`${SESSION_COOKIE}=[^;]+;[^\\n]*HttpOnly`, 'u'));
    expect(cookies).toContain('SameSite=Strict');
    expect(cookies).toContain('Secure');
  });

  test('issues a CSRF cookie the page can read', async () => {
    const h = await harness();
    await h.pair();
    expect(h.jar.get(CSRF_COOKIE)).toBeDefined();
  });

  test('a wrong code is refused with nothing to learn from', async () => {
    const h = await harness();
    h.pairing.open();
    const response = await h.call('/api/pair', {
      method: 'POST',
      body: JSON.stringify({ code: 'ZZZZ-ZZZZ-ZZ' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: string };
    // One generic message. Nothing about whether pairing was even open, which
    // would otherwise tell an attacker when to start guessing.
    expect(body.error).toBe('Pairing failed.');
    expect(response.headers.getSetCookie().join()).not.toContain(SESSION_COOKIE);
  });

  test('a code offered when pairing is closed fails the same way', async () => {
    const h = await harness();
    const response = await h.call('/api/pair', {
      method: 'POST',
      body: JSON.stringify({ code: 'ZZZZ-ZZZZ-ZZ' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(response.status).toBe(401);
    expect((await response.json()) as { error: string }).toEqual({ error: 'Pairing failed.' });
  });

  test('too many wrong guesses are refused with a different status', async () => {
    // 429 rather than 401, because this one is worth telling the owner about:
    // it means someone was guessing.
    const h = await harness();
    h.pairing.open();
    let status = 0;
    for (let i = 0; i < 6; i += 1) {
      status = (
        await h.call('/api/pair', {
          method: 'POST',
          body: JSON.stringify({ code: 'ZZZZ-ZZZZ-ZZ' }),
          headers: { 'content-type': 'application/json' },
        })
      ).status;
    }
    expect(status).toBe(429);
  });

  test('a malformed body is rejected before any comparison happens', async () => {
    const h = await harness();
    h.pairing.open();
    const response = await h.call('/api/pair', {
      method: 'POST',
      body: 'not json',
      headers: { 'content-type': 'application/json' },
    });
    expect(response.status).toBe(400);
  });

  test('pairing twice creates two sessions, rotating rather than reusing', async () => {
    // PRD 5.2: rotate on login. A second pairing must not revive the first
    // token or hand out the same one.
    const h = await harness();
    await h.pair();
    const first = h.jar.get(SESSION_COOKIE);
    await h.pair();
    const second = h.jar.get(SESSION_COOKIE);
    expect(second).not.toBe(first);
    expect(h.store.countActiveAppSessions(new Date().toISOString())).toBe(2);
  });

  test('records a readable device label without storing the raw user agent', async () => {
    const h = await harness();
    const code = h.pairing.open();
    await h.call('/api/pair', {
      method: 'POST',
      body: JSON.stringify({ code }),
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/604.1',
      },
    });
    expect(h.store.debugDump()).toContain('iPhone');
    expect(h.store.debugDump()).not.toContain('Mozilla');
  });
});

describe('a paired browser', () => {
  test('can run a turn', async () => {
    const h = await harness();
    await h.pair();
    const response = await h.call('/api/turn', {
      method: 'POST',
      body: JSON.stringify({ text: 'hello' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(response.status).toBe(200);
    await response.text();
    expect(h.calls).toHaveLength(1);
  });

  test('is refused once its session is past the absolute limit', async () => {
    const h = await harness();
    await h.pair();
    h.advance(SESSION_TTL_MS + 1000);
    expect((await h.call('/api/sessions')).status).toBe(401);
  });

  test('is refused after sitting unused for longer than the idle window', async () => {
    const h = await harness();
    await h.pair();
    h.advance(IDLE_TTL_MS + 1000);
    expect((await h.call('/api/sessions')).status).toBe(401);
  });

  test('stays paired while it keeps being used', async () => {
    // The idle window must slide, or an actively used browser would be logged
    // out on a fixed schedule.
    const h = await harness();
    await h.pair();
    for (let i = 0; i < 4; i += 1) {
      h.advance(IDLE_TTL_MS - 60_000);
      expect((await h.call('/api/sessions')).status).toBe(200);
    }
  });

  test('survives a restart, because the session is on disk', async () => {
    const h = await harness();
    await h.pair();
    const token = h.jar.get(SESSION_COOKIE) ?? '';

    // A second app over the same database is what a restart looks like.
    const server = createServer(
      createApp({
        workspaceDir: scratch(),
        runTurn: fakeRunner().run,
        store: h.store,
        pairing: createPairingMode({ now: () => Date.now() }),
      }),
    );
    await new Promise<void>((r) => {
      server.listen(0, '127.0.0.1', r);
    });
    cleanups.push(() => {
      server.close();
    });
    const restarted = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;

    const response = await fetch(`${restarted}/api/me`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}`, origin: restarted },
    });
    expect(response.status).toBe(200);
  });
});

describe('CSRF protection', () => {
  test('a state-changing request without the token header is refused', async () => {
    const h = await harness();
    await h.pair();
    const response = await h.call('/api/turn', {
      method: 'POST',
      csrf: false,
      body: JSON.stringify({ text: 'hello' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(response.status).toBe(403);
    expect(h.calls).toHaveLength(0);
  });

  test('a wrong token is refused', async () => {
    const h = await harness();
    await h.pair();
    const response = await h.call('/api/turn', {
      method: 'POST',
      csrf: false,
      body: JSON.stringify({ text: 'hello' }),
      headers: { 'content-type': 'application/json', [CSRF_HEADER]: 'not-the-token' },
    });
    expect(response.status).toBe(403);
  });

  test('a request from another site is refused even with the right cookies', async () => {
    // The cookie is SameSite=Strict, so a browser would not send it. This is the
    // layer that does not depend on the browser getting that right.
    const h = await harness();
    await h.pair();
    const response = await fetch(`${h.base}/api/turn`, {
      method: 'POST',
      headers: {
        cookie: [...h.jar].map(([n, v]) => `${n}=${v}`).join('; '),
        [CSRF_HEADER]: h.jar.get(CSRF_COOKIE) ?? '',
        origin: 'https://evil.example',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: 'hello' }),
    });
    expect(response.status).toBe(403);
    expect(h.calls).toHaveLength(0);
  });

  test('reading does not need the token', async () => {
    const h = await harness();
    await h.pair();
    expect((await h.call('/api/sessions', { csrf: false })).status).toBe(200);
  });
});

describe('logging out', () => {
  test('revokes this session immediately', async () => {
    const h = await harness();
    await h.pair();
    expect((await h.call('/api/logout', { method: 'POST' })).status).toBe(200);
    expect((await h.call('/api/me')).status).toBe(401);
  });

  test('clears the cookie as well as revoking it', async () => {
    const h = await harness();
    await h.pair();
    const response = await h.call('/api/logout', { method: 'POST' });
    expect(response.headers.getSetCookie().join('\n')).toContain('Max-Age=0');
  });

  test('logging out everywhere ends a session on a device you no longer hold', async () => {
    // The lost-phone case, which is the reason this control exists. Pairing twice
    // gives two live sessions; the first token stands in for the device that is
    // gone, and revoking from the second must kill it without needing it present.
    const h = await harness();
    await h.pair();
    const lostDevice = h.jar.get(SESSION_COOKIE) ?? '';
    await h.pair();
    const thisDevice = h.jar.get(SESSION_COOKIE) ?? '';
    expect(lostDevice).not.toBe(thisDevice);
    expect(h.store.countActiveAppSessions(new Date(Date.now()).toISOString())).toBe(2);

    expect((await h.call('/api/logout-all', { method: 'POST' })).status).toBe(200);

    const lost = await fetch(`${h.base}/api/me`, {
      headers: { cookie: `${SESSION_COOKIE}=${lostDevice}`, origin: h.base },
    });
    expect(lost.status).toBe(401);
    // And this device too: logging out everywhere includes the one you are on.
    expect((await h.call('/api/me')).status).toBe(401);
  });

  test('needs the CSRF token, so another site cannot log you out', async () => {
    const h = await harness();
    await h.pair();
    expect((await h.call('/api/logout', { method: 'POST', csrf: false })).status).toBe(403);
  });
});

describe('adding another device', () => {
  test('an authenticated browser can open pairing for a new one', async () => {
    // How the phone gets paired without restarting the server.
    const h = await harness();
    await h.pair();
    const response = await h.call('/api/pairing-code', { method: 'POST' });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { code: string };
    expect(body.code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{2}$/u);
    expect(h.pairing.isOpen()).toBe(true);
  });

  test('an unauthenticated caller cannot ask for a code', async () => {
    // Otherwise the lock would open itself on request.
    const h = await harness();
    const response = await h.call('/api/pairing-code', { method: 'POST' });
    expect(response.status).toBe(401);
    expect(h.pairing.isOpen()).toBe(false);
  });
});
