/**
 * Test-only helpers for talking to an authenticated dashboard.
 *
 * Every route that does anything now needs a paired session, so a test that
 * wants to exercise a turn has to pair first. Rather than repeat the cookie
 * bookkeeping in each file, it lives here.
 *
 * Not part of the shipped server: excluded from the build in
 * `apps/server/tsconfig.json` and from coverage in `vitest.config.ts`.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { openStore, type Store } from '@quack/storage';
import { createApp, type AppOptions } from './app.js';
import { createPairingMode, CSRF_COOKIE, CSRF_HEADER, type PairingMode } from './auth.js';

export interface PairedServer {
  base: string;
  store: Store;
  pairing: PairingMode;
  /** Cookies the client holds, as a browser would. */
  jar: Map<string, string>;
  /** Exchange a fresh pairing code for a session. */
  pair: () => Promise<void>;
  /** Request carrying the jar's cookies, a same-origin Origin and the CSRF header. */
  call: (path: string, init?: RequestInit & { csrf?: boolean }) => Promise<Response>;
  close: () => void;
}

export interface StartPairedOptions extends Omit<AppOptions, 'store'> {
  /** Where to keep the database. A directory, not a file. */
  dataDir: string;
  /** Reuse an existing store, for instance to simulate a restart. */
  store?: Store | undefined;
  /** Pair immediately. Pass false to test the unauthenticated case. */
  paired?: boolean | undefined;
}

/**
 * Start a server and, by default, pair with it.
 *
 * The store shares the app's clock so the two cannot disagree about time, which
 * is what made the first idle-expiry test silently vacuous.
 */
export async function startPaired(options: StartPairedOptions): Promise<PairedServer> {
  // Captured now, because a caller may later replace the global `fetch` with a
  // wrapper that routes back through this helper. Using the global at call time
  // would then recurse until the stack ran out, which it did.
  const nativeFetch = globalThis.fetch;
  const now = options.now ?? (() => Date.now());
  const store =
    options.store ??
    openStore(`${options.dataDir}/quack.db`, { now: () => new Date(now()).toISOString() });
  const pairing = options.pairing ?? createPairingMode({ now });

  const server: Server = createServer(createApp({ ...options, store, pairing, now }));
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  const jar = new Map<string, string>();

  const remember = (response: Response): void => {
    for (const raw of response.headers.getSetCookie()) {
      const [first] = raw.split(';');
      const at = first?.indexOf('=') ?? -1;
      if (first === undefined || at < 1) continue;
      jar.set(first.slice(0, at), first.slice(at + 1));
    }
  };

  const call: PairedServer['call'] = async (path, init = {}) => {
    const headers = new Headers(init.headers);
    if (jar.size > 0) {
      headers.set('cookie', [...jar].map(([name, value]) => `${name}=${value}`).join('; '));
    }
    headers.set('origin', base);
    if (init.csrf !== false && jar.has(CSRF_COOKIE)) {
      headers.set(CSRF_HEADER, jar.get(CSRF_COOKIE) ?? '');
    }
    const response = await nativeFetch(`${base}${path}`, { ...init, headers });
    remember(response);
    return response;
  };

  const pair = async (): Promise<void> => {
    const code = pairing.open();
    const response = await call('/api/pair', {
      method: 'POST',
      body: JSON.stringify({ code }),
      headers: { 'content-type': 'application/json' },
    });
    if (!response.ok) throw new Error(`pairing failed with ${String(response.status)}`);
  };

  if (options.paired !== false) await pair();

  return {
    base,
    store,
    pairing,
    jar,
    pair,
    call,
    close: () => {
      server.close();
      // Only close a store this helper opened; a caller's store is theirs.
      if (options.store === undefined) store.close();
    },
  };
}
