import { connect } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { canHoldSecureCookie } from './auth.js';
import { startPaired } from './testkit.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'quack-reach-'));
  cleanups.push(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

describe('canHoldSecureCookie', () => {
  test.each([
    ['127.0.0.1:4317', true],
    ['localhost:4317', true],
    ['[::1]:4317', true],
    ['127.0.0.1', true],
    // A bare IPv6 literal with no brackets and no port. The port strip used to
    // run before the bracket strip, so `::1` had `:1` taken off it as though it
    // were a port, leaving `:` — and a loopback address was refused.
    ['::1', true],
    ['[::1]', true],
    // Other legitimate spellings of loopback. A browser normalises to `[::1]`,
    // so these arrive only from something hand-rolled, but refusing them would
    // be wrong.
    ['[0:0:0:0:0:0:0:1]', true],
    ['[::ffff:127.0.0.1]', true],
    ['127.0.0.2:4317', true],
  ])('accepts loopback: %s', (host, expected) => {
    // Verified in a real browser: a loopback address counts as a trustworthy
    // origin, so a Secure cookie is honoured over plain HTTP there.
    expect(canHoldSecureCookie({ host, forwardedProto: undefined })).toBe(expected);
  });

  test.each([
    ['192.168.1.20:4317'],
    ['10.0.0.5:4317'],
    ['172.16.4.9:4317'],
    ['quack.example'],
    ['my-mac.local:4317'],
    // Not loopback, however much they look like an address the server owns.
    ['0.0.0.0:4317'],
    ['[::]:4317'],
    ['[2001:db8::1]:4317'],
    ['[fe80::1%25en0]:4317'],
    // Near-misses for the 127/8 and ::1 patterns.
    ['1270.0.0.1'],
    ['127.0.0.1.evil.example'],
    ['[::2]:4317'],
  ])('rejects %s over plain HTTP, because the cookie would be discarded', (host) => {
    expect(canHoldSecureCookie({ host, forwardedProto: undefined })).toBe(false);
  });

  test('accepts any host once a proxy says the request arrived over HTTPS', () => {
    // The tunnel is the intended path, and it is HTTPS end to end.
    expect(canHoldSecureCookie({ host: '192.168.1.20', forwardedProto: 'https' })).toBe(true);
    expect(canHoldSecureCookie({ host: 'quack.example', forwardedProto: 'https' })).toBe(true);
  });

  test('treats a missing host as unusable rather than assuming', () => {
    expect(canHoldSecureCookie({ host: undefined, forwardedProto: undefined })).toBe(false);
  });
});

/**
 * POST a pairing code with a chosen `Host`, over a raw socket.
 *
 * `fetch` forbids setting `Host`, so it cannot express the case this is about:
 * a phone reaching the server on a LAN address. Writing the request by hand can.
 */
async function pairWithHost(
  base: string,
  host: string,
  code: string,
  options: { omitOrigin?: boolean; origin?: string } = {},
): Promise<{ status: number; body: string; raw: string }> {
  const url = new URL(base);
  const payload = JSON.stringify({ code });
  const socket = connect(Number(url.port), url.hostname);
  cleanups.push(() => {
    socket.destroy();
  });

  const answer = new Promise<string>((resolve, reject) => {
    let seen = '';
    const timer = setTimeout(() => {
      reject(new Error(`no response; saw: ${seen}`));
    }, 10_000);
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      seen += chunk;
    });
    socket.once('close', () => {
      clearTimeout(timer);
      resolve(seen);
    });
    socket.once('error', (failure) => {
      clearTimeout(timer);
      reject(failure);
    });
  });

  socket.write(
    [
      'POST /api/pair HTTP/1.1',
      `Host: ${host}`,
      ...(options.omitOrigin === true ? [] : [`Origin: ${options.origin ?? `http://${host}`}`]),
      'Content-Type: application/json',
      `Content-Length: ${String(Buffer.byteLength(payload))}`,
      'Connection: close',
      '',
      payload,
    ].join('\r\n'),
  );

  const raw = await answer;
  const status = Number(/^HTTP\/1\.1 (\d+)/u.exec(raw)?.[1] ?? '0');
  const body = raw.slice(raw.indexOf('\r\n\r\n') + 4);
  return { status, body, raw };
}

describe('pairing from an address that cannot hold the cookie', () => {
  test('is refused with an explanation, rather than a 200 that cannot stick', async () => {
    // The phone case. The browser accepts the response and discards the Secure
    // cookie, so the dashboard renders, the next request has no cookie, and the
    // phone bounces back to the login screen — with the code already spent.
    const server = await startPaired({
      dataDir: scratch(),
      workspaceDir: scratch(),
      paired: false,
    });
    cleanups.push(server.close);

    const code = server.pairing.open();
    const response = await pairWithHost(server.base, '192.168.1.20:4317', code);

    expect(response.status).toBe(421);
    const body = JSON.parse(response.body) as { error: string };
    expect(body.error).toMatch(/127\.0\.0\.1|loopback/i);
    expect(body.error).toMatch(/https/i);
    // No port: the message cannot know it (createApp is not told), and naming
    // 4317 was simply wrong for anyone running PORT=5000.
    expect(body.error).not.toMatch(/:\d{4}/u);
    expect(response.raw).not.toContain('quack_session');
  });

  test('does not spend the code, so the same one still works from loopback', async () => {
    // Spending a single-use code on a request that provably cannot succeed is
    // the worst outcome: the obvious retry fails too, and pairing looks broken.
    const server = await startPaired({
      dataDir: scratch(),
      workspaceDir: scratch(),
      paired: false,
    });
    cleanups.push(server.close);

    const code = server.pairing.open();
    await pairWithHost(server.base, '192.168.1.20:4317', code);

    expect(server.pairing.isOpen()).toBe(true);
    const second = await server.call('/api/pair', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    expect(second.status).toBe(200);
  });

  test('a wrong code over loopback is still refused as a wrong code', async () => {
    // The reachability check must not become a way to probe codes for free: it
    // happens before verification, so nothing is learned about the code either
    // way, and a caller on loopback still gets the ordinary failure.
    const server = await startPaired({
      dataDir: scratch(),
      workspaceDir: scratch(),
      paired: false,
    });
    cleanups.push(server.close);
    server.pairing.open();

    const response = await server.call('/api/pair', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'ZZZZ-ZZZZ-ZZ' }),
    });
    expect(response.status).toBe(401);
  });

  test('pairing still works normally over loopback', async () => {
    const server = await startPaired({
      dataDir: scratch(),
      workspaceDir: scratch(),
    });
    cleanups.push(server.close);
    expect((await server.call('/api/me')).status).toBe(200);
  });
});

describe('pairing must prove where it came from', () => {
  test('a cross-origin POST is refused before the code is looked at', async () => {
    // `/api/pair` used to be the only POST on the port that never proved its
    // origin: it is handled before the block that checks every other
    // state-changing request. It has to stay exempt from the CSRF *token* half —
    // there is no session yet to have issued one — but not from the origin half.
    // What that left open: any page the owner happens to have open can post
    // guesses at the loopback port and burn the pairing window.
    const server = await startPaired({
      dataDir: scratch(),
      workspaceDir: scratch(),
      paired: false,
    });
    cleanups.push(server.close);
    const code = server.pairing.open();

    const response = await fetch(`${server.base}/api/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ code }),
    });

    expect(response.status).toBe(403);
    // And the code survives, because the refusal happens before `verify`.
    expect(server.pairing.isOpen()).toBe(true);
  });

  test('a request that proves nothing about its origin is refused', async () => {
    // No Origin and no Sec-Fetch-Site. Browsers send Origin on any POST, so this
    // is not a browser; refuse rather than assume.
    const server = await startPaired({
      dataDir: scratch(),
      workspaceDir: scratch(),
      paired: false,
    });
    cleanups.push(server.close);
    const code = server.pairing.open();

    const response = await pairWithHost(server.base, new URL(server.base).host, code, {
      omitOrigin: true,
    });
    expect(response.status).toBe(403);
    expect(server.pairing.isOpen()).toBe(true);
  });

  test('the ordinary same-origin POST from the pairing screen still works', async () => {
    const server = await startPaired({
      dataDir: scratch(),
      workspaceDir: scratch(),
      paired: false,
    });
    cleanups.push(server.close);
    const code = server.pairing.open();

    const response = await server.call('/api/pair', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    expect(response.status).toBe(200);
    expect((await server.call('/api/me')).status).toBe(200);
  });

  test('a cross-origin POST is refused even before the address check', async () => {
    // Order matters: origin first, so a hostile page learns nothing about
    // whether its address could have held a cookie either.
    const server = await startPaired({
      dataDir: scratch(),
      workspaceDir: scratch(),
      paired: false,
    });
    cleanups.push(server.close);
    const code = server.pairing.open();

    const response = await pairWithHost(server.base, '192.168.1.20:4317', code, {
      origin: 'https://evil.example',
    });
    expect(response.status).toBe(403);
  });
});
