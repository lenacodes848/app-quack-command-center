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
      `Origin: http://${host}`,
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
