import { connect } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { ClaudeEvent, ClaudeTurnOptions } from '@quack/adapter';
import { MAX_BODY_BYTES } from './app.js';
import { CSRF_COOKIE, CSRF_HEADER } from './auth.js';
import { startPaired, type PairedServer } from './testkit.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'quack-failures-'));
  cleanups.push(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

async function dashboard(
  runTurn?: (o: ClaudeTurnOptions) => AsyncGenerator<ClaudeEvent>,
): Promise<PairedServer> {
  const server = await startPaired({
    dataDir: scratch(),
    workspaceDir: scratch(),
    runTurn:
      runTurn ??
      // eslint-disable-next-line @typescript-eslint/require-await -- a fixed script needs no await
      async function* run() {
        yield { type: 'result', text: 'ok', isError: false };
      },
  });
  cleanups.push(server.close);
  return server;
}

describe('a body larger than the limit', () => {
  test('says so, and names the limit, instead of blaming the JSON', async () => {
    // The body is valid JSON. Reporting "Body must be JSON." sends the owner
    // looking for a syntax error that is not there, and never tells them a limit
    // exists — so the natural next move is to retry the same paste.
    const server = await dashboard();
    const response = await server.call('/api/turn', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'x'.repeat(MAX_BODY_BYTES + 1000) }),
    });

    expect(response.status).toBe(413);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/too large/i);
    expect(body.error).toContain(String(MAX_BODY_BYTES));
    expect(body.error).not.toMatch(/must be JSON/i);
  });

  test('still blames the JSON when the JSON really is broken', async () => {
    const server = await dashboard();
    const response = await server.call('/api/turn', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json at all',
    });

    expect(response.status).toBe(400);
    expect((await response.json()) as { error: string }).toEqual({
      error: 'Body must be JSON.',
    });
  });

  test('applies to pairing too, which reads a body the same way', async () => {
    const server = await startPaired({
      dataDir: scratch(),
      workspaceDir: scratch(),
      paired: false,
    });
    cleanups.push(server.close);

    const response = await server.call('/api/pair', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'x'.repeat(MAX_BODY_BYTES + 1000) }),
    });
    expect(response.status).toBe(413);
  });

  test('does not spend the turn slot on a body it refused', async () => {
    // The slot is claimed before the body is read, so an oversized body has to
    // release it on the way out like any other early return.
    const server = await dashboard();
    await server
      .call('/api/turn', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'x'.repeat(MAX_BODY_BYTES + 1000) }),
      })
      .then((r) => r.text());

    const next = await server.call('/api/turn', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'a reasonable question' }),
    });
    expect(next.status).toBe(200);
    await next.text();
  });
});

describe('a turn cut short by a hangup', () => {
  test('is stored saying the connection was lost, not as a finished answer', async () => {
    // Otherwise the sidebar shows a conversation whose last message is a
    // confident half-sentence, indistinguishable from a complete short answer —
    // and the agent's own context and the transcript then disagree about what
    // was said, because the next turn resumes by provider session id.
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const server = await dashboard(async function* run() {
      yield { type: 'session', sessionId: 'prov-1', model: 'm' };
      yield { type: 'text', text: 'The first half of the answer.' };
      await gate;
      yield { type: 'text', text: ' The second half nobody saw.' };
      yield { type: 'result', text: 'whole', isError: false };
    });

    const url = new URL(server.base);
    const body = JSON.stringify({ text: 'a long question' });
    const socket = connect(Number(url.port), url.hostname);
    cleanups.push(() => {
      socket.destroy();
    });
    socket.write(
      [
        'POST /api/turn HTTP/1.1',
        `Host: ${url.host}`,
        `Origin: ${server.base}`,
        `Cookie: ${[...server.jar].map(([n, v]) => `${n}=${v}`).join('; ')}`,
        `${CSRF_HEADER}: ${server.jar.get(CSRF_COOKIE) ?? ''}`,
        'Content-Type: application/json',
        `Content-Length: ${String(Buffer.byteLength(body))}`,
        '',
        '',
      ].join('\r\n'),
    );
    socket.write(body);

    // Wait for the first half to be on its way, then vanish.
    await new Promise<void>((resolve) => {
      socket.once('data', () => {
        resolve();
      });
    });
    socket.destroy();
    await new Promise((r) => setTimeout(r, 150));
    release();
    await new Promise((r) => setTimeout(r, 150));

    const session = server.store.listSessions()[0];
    const messages = server.store.listMessages(session?.id ?? '');
    const agentSaid = messages.filter((m) => m.role === 'agent').map((m) => m.content);

    expect(agentSaid).toHaveLength(1);
    // What did stream is kept — it is a real part of the conversation — but the
    // record says plainly that it stopped early.
    expect(agentSaid[0]).toContain('The first half of the answer.');
    expect(agentSaid[0]).toMatch(/connection was lost/i);
    expect(agentSaid[0]).not.toContain('The second half nobody saw.');
  });

  test('says so even when nothing had streamed yet', async () => {
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const server = await dashboard(async function* run() {
      yield { type: 'session', sessionId: 'prov-2', model: 'm' };
      await gate;
      yield { type: 'result', text: 'never seen', isError: false };
    });

    const url = new URL(server.base);
    const body = JSON.stringify({ text: 'another question' });
    const socket = connect(Number(url.port), url.hostname);
    cleanups.push(() => {
      socket.destroy();
    });
    socket.write(
      [
        'POST /api/turn HTTP/1.1',
        `Host: ${url.host}`,
        `Origin: ${server.base}`,
        `Cookie: ${[...server.jar].map(([n, v]) => `${n}=${v}`).join('; ')}`,
        `${CSRF_HEADER}: ${server.jar.get(CSRF_COOKIE) ?? ''}`,
        'Content-Type: application/json',
        `Content-Length: ${String(Buffer.byteLength(body))}`,
        '',
        '',
      ].join('\r\n'),
    );
    socket.write(body);
    await new Promise((r) => setTimeout(r, 80));
    socket.destroy();
    await new Promise((r) => setTimeout(r, 150));
    release();
    await new Promise((r) => setTimeout(r, 150));

    const session = server.store.listSessions()[0];
    const agentSaid = server.store
      .listMessages(session?.id ?? '')
      .filter((m) => m.role === 'agent');
    expect(agentSaid).toHaveLength(1);
    expect(agentSaid[0]?.content).toMatch(/connection was lost/i);
  });

  test('a turn that finishes normally is stored with no such note', async () => {
    const server = await dashboard(async function* run() {
      await Promise.resolve();
      yield { type: 'text', text: 'A complete answer.' };
      yield { type: 'result', text: 'A complete answer.', isError: false };
    });

    await server
      .call('/api/turn', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'a question' }),
      })
      .then((r) => r.text());

    const session = server.store.listSessions()[0];
    const agentSaid = server.store
      .listMessages(session?.id ?? '')
      .filter((m) => m.role === 'agent');
    expect(agentSaid[0]?.content).toBe('A complete answer.');
    expect(agentSaid[0]?.content).not.toMatch(/connection was lost/i);
  });
});
