import { connect, type Socket } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { ClaudeEvent, ClaudeTurnOptions } from '@quack/adapter';
import { CSRF_COOKIE, CSRF_HEADER } from './auth.js';
import { startPaired, type PairedServer } from './testkit.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'quack-slot-'));
  cleanups.push(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

/**
 * A raw HTTP client, because this is about the timing of a request's parts.
 *
 * `fetch` sends the headers and the body together, which is exactly the case
 * that hides both of these defects. Writing the two separately is what a slow
 * link does on its own — a phone over a tunnel, for instance.
 */
function rawClient(server: PairedServer): {
  sendHeaders: (body: string) => Socket;
  readStatus: (socket: Socket) => Promise<string>;
} {
  const url = new URL(server.base);
  const cookies = [...server.jar].map(([name, value]) => `${name}=${value}`).join('; ');

  return {
    sendHeaders: (body) => {
      const socket = connect(Number(url.port), url.hostname);
      cleanups.push(() => {
        socket.destroy();
      });
      socket.write(
        [
          'POST /api/turn HTTP/1.1',
          `Host: ${url.host}`,
          `Origin: ${server.base}`,
          `Cookie: ${cookies}`,
          `${CSRF_HEADER}: ${server.jar.get(CSRF_COOKIE) ?? ''}`,
          'Content-Type: application/json',
          `Content-Length: ${String(Buffer.byteLength(body))}`,
          'Connection: close',
          '',
          '',
        ].join('\r\n'),
      );
      return socket;
    },

    readStatus: (socket) =>
      new Promise<string>((resolve, reject) => {
        let seen = '';
        const timer = setTimeout(() => {
          reject(new Error(`no status line; saw: ${seen}`));
        }, 10_000);
        socket.setEncoding('utf8');
        socket.on('data', (chunk: string) => {
          seen += chunk;
          const end = seen.indexOf('\r\n');
          if (end !== -1) {
            clearTimeout(timer);
            resolve(seen.slice(0, end));
          }
        });
        socket.once('error', (failure) => {
          clearTimeout(timer);
          reject(failure);
        });
      }),
  };
}

/** A runner whose turn does not finish until the test lets it. */
function gatedRunner(): {
  run: (o: ClaudeTurnOptions) => AsyncGenerator<ClaudeEvent>;
  started: () => number;
  release: () => void;
  aborted: () => number;
} {
  let starts = 0;
  let aborts = 0;
  let release = (): void => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    started: () => starts,
    aborted: () => aborts,
    release: () => {
      release();
    },
    run: async function* run(options: ClaudeTurnOptions) {
      starts += 1;
      options.signal?.addEventListener('abort', () => {
        aborts += 1;
      });
      yield { type: 'session', sessionId: `prov-${String(starts)}`, model: 'm' };
      await gate;
      yield { type: 'result', text: 'done', isError: false };
    },
  };
}

describe('the single turn slot', () => {
  test('admits one turn when two arrive together, with no sleep between them', async () => {
    // The slot is claimed before the body is read. Checking it first and setting
    // it later leaves a window across an await, and two requests whose bodies
    // arrive in a second segment both pass the check. The consequence is two
    // `claude` processes in one workspace, two interleaved streams, and both
    // turns racing on the session ids and on the transcript.
    const runner = gatedRunner();
    const server = await startPaired({
      dataDir: scratch(),
      workspaceDir: scratch(),
      runTurn: runner.run,
    });
    cleanups.push(server.close);
    const raw = rawClient(server);

    const body = JSON.stringify({ text: 'hello' });
    // Headers first, both requests, before either body exists.
    const first = raw.sendHeaders(body);
    const second = raw.sendHeaders(body);
    await new Promise((r) => setTimeout(r, 30));

    // Now the bodies, together. No sleep between the two requests: the previous
    // test only passed because it waited 50ms for the first to claim the slot.
    first.write(body);
    second.write(body);

    const statuses = await Promise.all([raw.readStatus(first), raw.readStatus(second)]);
    runner.release();

    expect(statuses.filter((line) => line.includes('200'))).toHaveLength(1);
    expect(statuses.filter((line) => line.includes('409'))).toHaveLength(1);
    expect(runner.started()).toBe(1);
  });

  test('records only one question when two turns arrive together', async () => {
    // The user message was written to the transcript before the slot was
    // claimed, so a race duplicated the question as well as the process.
    const runner = gatedRunner();
    const server = await startPaired({
      dataDir: scratch(),
      workspaceDir: scratch(),
      runTurn: runner.run,
    });
    cleanups.push(server.close);
    const raw = rawClient(server);

    const body = JSON.stringify({ text: 'only once please' });
    const first = raw.sendHeaders(body);
    const second = raw.sendHeaders(body);
    await new Promise((r) => setTimeout(r, 30));
    first.write(body);
    second.write(body);
    await Promise.all([raw.readStatus(first), raw.readStatus(second)]);
    runner.release();
    await new Promise((r) => setTimeout(r, 50));

    const stored = server.store
      .listSessions()
      .flatMap((session) => server.store.listMessages(session.id))
      .filter((message) => message.role === 'user');
    expect(stored).toHaveLength(1);
  });
});

describe('a client that hangs up mid-answer', () => {
  test('releases the turn slot instead of wedging it until a restart', async () => {
    // A phone changing networks mid-answer. The backpressure wait had no close
    // or error path, so when the socket died the drain event never came, the
    // await never settled, and the finally that frees the slot never ran —
    // making every later turn answer 409 until the server was restarted.
    const runner = gatedRunner();
    const server = await startPaired({
      dataDir: scratch(),
      workspaceDir: scratch(),
      runTurn: runner.run,
    });
    cleanups.push(server.close);
    const raw = rawClient(server);

    const body = JSON.stringify({ text: 'answer at length' });
    const socket = raw.sendHeaders(body);
    socket.write(body);
    await raw.readStatus(socket);

    // Gone, mid-turn, without reading the rest.
    socket.destroy();
    await new Promise((r) => setTimeout(r, 100));
    runner.release();
    await new Promise((r) => setTimeout(r, 100));

    const next = await server.call('/api/turn', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'after the hangup' }),
    });
    expect(next.status).not.toBe(409);
    await next.text();
  });

  test('releases the slot when the socket dies while the write buffer is full', async () => {
    // The specific shape of the original defect, which the test above does not
    // reach: `response.write` has to return false, so the handler waits on
    // 'drain', and the socket has to die while it waits. Small payloads never
    // fill the buffer, so this one streams megabytes at a client that reads
    // nothing. Without the close and error events in that wait, the await never
    // settles even though the agent has stopped, and the slot is held forever.
    // Each backpressure cycle attaches drain, close and error handlers. `once`
    // only removes the one that fires, so the other two accumulate — which Node
    // reports as a possible memory leak after ten. The first version of this fix
    // did exactly that, and only the flood below reaches enough cycles to show
    // it, so the warning is asserted on rather than left in the output.
    const warnings: string[] = [];
    const onWarning = (warning: Error): void => {
      warnings.push(warning.name);
    };
    process.on('warning', onWarning);
    cleanups.push(() => {
      process.off('warning', onWarning);
    });

    const chunk = 'x'.repeat(256 * 1024);
    const server = await startPaired({
      dataDir: scratch(),
      workspaceDir: scratch(),
      runTurn: async function* run() {
        await Promise.resolve();
        yield { type: 'session', sessionId: 'prov-big', model: 'm' };
        for (let i = 0; i < 60; i += 1) yield { type: 'text', text: chunk };
        yield { type: 'result', text: 'done', isError: false };
      },
    });
    cleanups.push(server.close);
    const raw = rawClient(server);

    const body = JSON.stringify({ text: 'flood me' });
    const socket = raw.sendHeaders(body);
    socket.write(body);
    // Deliberately no reader: the kernel and the stream buffer fill up, which is
    // what makes write() return false.
    await new Promise((r) => setTimeout(r, 150));
    socket.destroy();
    await new Promise((r) => setTimeout(r, 250));

    const next = await server.call('/api/turn', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'after the flood' }),
    });
    expect(next.status).not.toBe(409);
    await next.text();
    expect(warnings).not.toContain('MaxListenersExceededWarning');
  });

  test('does not tell the agent to stop when the turn simply finishes', async () => {
    // The first version of the fix listened for 'close' on the request, which
    // fires as soon as the body has been read — the normal path. That aborted
    // every turn the instant it started, which would have killed the real
    // `claude` process each time while every fake-runner test still passed.
    const runner = gatedRunner();
    runner.release();
    const server = await startPaired({
      dataDir: scratch(),
      workspaceDir: scratch(),
      runTurn: runner.run,
    });
    cleanups.push(server.close);

    const response = await server.call('/api/turn', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'an ordinary question' }),
    });
    await response.text();
    await new Promise((r) => setTimeout(r, 50));

    expect(response.status).toBe(200);
    expect(runner.started()).toBe(1);
    expect(runner.aborted()).toBe(0);
  });

  test('tells the agent to stop, so an orphaned process stops spending quota', async () => {
    // Without the signal the `claude` process keeps running with nobody reading
    // it. The adapter already accepts one; it simply was not being passed.
    const runner = gatedRunner();
    const server = await startPaired({
      dataDir: scratch(),
      workspaceDir: scratch(),
      runTurn: runner.run,
    });
    cleanups.push(server.close);
    const raw = rawClient(server);

    const body = JSON.stringify({ text: 'answer at length' });
    const socket = raw.sendHeaders(body);
    socket.write(body);
    await raw.readStatus(socket);
    socket.destroy();
    await new Promise((r) => setTimeout(r, 150));

    expect(runner.aborted()).toBe(1);
    runner.release();
  });
});
