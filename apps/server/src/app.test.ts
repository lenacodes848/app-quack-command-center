import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { resolveStaticPath } from './app.js';
import { startPaired, type StartPairedOptions } from './testkit.js';

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

/**
 * Start a paired server and make this suite's `fetch` authenticated.
 *
 * Every route that does anything now needs a session, and these tests are about
 * the routes rather than about authentication — that is `authRoutes.test.ts`.
 * So the helper pairs, then wraps `fetch` to attach the session cookie, the CSRF
 * header and a same-origin `Origin` for requests to this server. Requests
 * anywhere else pass through untouched, and the original is restored afterwards.
 *
 * The wrapper is deliberately narrow: it adds credentials and nothing else, so a
 * test that checks a status code is still checking the real route.
 */
async function serve(options: Omit<StartPairedOptions, 'dataDir'>): Promise<string> {
  const paired = await startPaired({ ...options, dataDir: scratch() });
  cleanups.push(paired.close);

  const original = globalThis.fetch;
  cleanups.push(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url;
    if (!url.startsWith(paired.base)) return original(input, init);
    return paired.call(url.slice(paired.base.length), init);
  };

  return paired.base;
}

describe('health', () => {
  test('answers liveness only, because it answers before authentication', async () => {
    // It used to report the open session and whether anything was being saved.
    // Now that it is reachable unauthenticated, saying any of that would tell an
    // unpaired caller about the owner's state; `/api/me` carries it instead.
    const base = await serve({});
    expect(await (await fetch(`${base}/api/health`)).json()).toEqual({ ok: true });
  });
});

describe('serving the built web app', () => {
  test('serves index.html at the root and falls back for client routes', async () => {
    const webDir = scratch();
    writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Quack</title>', 'utf8');
    const base = await serve({ webDir });

    for (const path of ['/', '/some/client/route']) {
      const response = await fetch(`${base}${path}`);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('Quack');
    }
  });

  test('an api path is never served from disk', async () => {
    const webDir = scratch();
    writeFileSync(join(webDir, 'index.html'), 'page', 'utf8');
    const base = await serve({ webDir });
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
