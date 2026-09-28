import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { ClaudeEvent, ClaudeTurnOptions } from '@quack/adapter';
import { openStore, type Store } from '@quack/storage';
import {
  createAgentRegistry,
  INTERRUPTED_NOTE,
  STOPPED_NOTE,
  type AgentRegistry,
} from './agents.js';
import { createEventHub, type EventHub } from './events.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function scratchStore(): { store: Store; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'quack-reg-'));
  const path = join(dir, 'quack.db');
  const store = openStore(path);
  cleanups.push(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { store, path };
}

/**
 * A runner whose turns the test finishes by hand.
 *
 * Each call parks until the test releases it, which is what lets two turns be
 * genuinely in flight at once without a single sleep.
 */
function heldRunner() {
  const calls: ClaudeTurnOptions[] = [];
  const pending: ((events: ClaudeEvent[]) => void)[] = [];
  const run = async function* run(options: ClaudeTurnOptions): AsyncGenerator<ClaudeEvent> {
    calls.push(options);
    yield { type: 'session', sessionId: `p-${String(calls.length)}`, model: 'claude-test' };
    const events = await new Promise<ClaudeEvent[]>((resolve) => {
      pending.push(resolve);
      options.signal?.addEventListener('abort', () => {
        resolve([{ type: 'error', message: 'The operation was aborted' }]);
      });
    });
    for (const event of events) yield event;
  };
  return {
    run,
    calls,
    /** Finish the oldest parked turn with these events. */
    finish: (events: ClaudeEvent[]): void => {
      pending.shift()?.(events);
    },
    parked: (): number => pending.length,
  };
}

interface Published {
  type: string;
  data: unknown;
}

function recordingHub(): { hub: EventHub; seen: Published[] } {
  const hub = createEventHub();
  const seen: Published[] = [];
  const publish = hub.publish.bind(hub);
  hub.publish = (type, data) => {
    seen.push({ type, data });
    return publish(type, data);
  };
  return { hub, seen };
}

async function settle(registry: AgentRegistry, id: string): Promise<void> {
  for (let i = 0; i < 200 && registry.isRunning(id); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  if (registry.isRunning(id)) throw new Error('turn never finished');
}

async function until(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !condition(); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  if (!condition()) throw new Error('condition never became true');
}

function setup(maxRunning = 4) {
  const { store, path } = scratchStore();
  const { hub, seen } = recordingHub();
  const runner = heldRunner();
  const registry = createAgentRegistry({ store, hub, runTurn: runner.run, maxRunning });
  return { store, path, hub, seen, runner, registry };
}

describe('a turn', () => {
  test('starts in the background: send returns before the agent answers', async () => {
    const { store, runner, registry } = setup();
    const agent = store.createSession({ workspaceDir: '/w/a', branch: 'quack/a' });

    expect(registry.send(agent.id, 'hello')).toEqual({ ok: true });
    expect(registry.isRunning(agent.id)).toBe(true);
    expect(store.getSession(agent.id)?.runState).toBe('running');

    await until(() => runner.parked() === 1);
    runner.finish([
      { type: 'text', text: 'hi back' },
      { type: 'result', text: 'hi back', isError: false },
    ]);
    await settle(registry, agent.id);

    expect(store.getSession(agent.id)?.runState).toBe('idle');
    expect(store.listMessages(agent.id).map((m) => [m.role, m.content])).toEqual([
      ['user', 'hello'],
      ['agent', 'hi back'],
    ]);
  });

  test('runs in the agent workspace, resuming its provider session with its model', async () => {
    const { store, runner, registry } = setup();
    const agent = store.createSession({ workspaceDir: '/w/a', model: 'sonnet' });

    registry.send(agent.id, 'one');
    await until(() => runner.parked() === 1);
    runner.finish([{ type: 'result', text: 'ok', isError: false }]);
    await settle(registry, agent.id);

    registry.send(agent.id, 'two');
    await until(() => runner.parked() === 1);
    runner.finish([{ type: 'result', text: 'ok', isError: false }]);
    await settle(registry, agent.id);

    expect(runner.calls[0]).toMatchObject({ cwd: '/w/a', model: 'sonnet', sessionId: undefined });
    // The second turn resumes the provider session the first one reported, with
    // the model the provider said it ran rather than the alias asked for.
    expect(runner.calls[1]).toMatchObject({ cwd: '/w/a', model: 'claude-test', sessionId: 'p-1' });
  });

  test('keeps running with nobody watching, and nothing about it depends on a request', async () => {
    const { store, hub, runner, registry } = setup();
    const agent = store.createSession({ workspaceDir: '/w/a', branch: 'b' });
    expect(hub.subscriberCount()).toBe(0);

    registry.send(agent.id, 'work while I am away');
    await until(() => runner.parked() === 1);
    runner.finish([{ type: 'text', text: 'done' }]);
    await settle(registry, agent.id);
    expect(store.listMessages(agent.id).at(-1)?.content).toBe('done');
  });

  test('publishes the question, the live events, the answer and each state change', async () => {
    const { store, seen, runner, registry } = setup();
    const agent = store.createSession({ workspaceDir: '/w/a', branch: 'b' });

    registry.send(agent.id, 'hello');
    await until(() => runner.parked() === 1);
    runner.finish([
      { type: 'tool', name: 'Read' },
      { type: 'text', text: 'hi' },
    ]);
    await settle(registry, agent.id);

    const shape = seen.map(({ type, data }) => {
      const d = data as Record<string, unknown>;
      if (type === 'agent') return `agent:${String(d['runState'])}`;
      if (type === 'message') return `message:${(d['message'] as { role: string }).role}`;
      return `turn:${(d['event'] as { type: string }).type}`;
    });
    expect(shape).toEqual([
      'message:user',
      'agent:running',
      'turn:session',
      'turn:tool',
      'turn:text',
      'message:agent',
      'agent:idle',
    ]);
  });

  test('offers the events of a turn in progress to a client that arrives late', async () => {
    const { store, runner, registry } = setup();
    const agent = store.createSession({ workspaceDir: '/w/a', branch: 'b' });

    registry.send(agent.id, 'hello');
    await until(() => runner.parked() === 1);
    expect(registry.live(agent.id)).toEqual([
      { type: 'session', sessionId: 'p-1', model: 'claude-test' },
    ]);

    runner.finish([{ type: 'text', text: 'hi' }]);
    await settle(registry, agent.id);
    // Once the answer is stored there is nothing live left to offer.
    expect(registry.live(agent.id)).toEqual([]);
  });

  test('a failed turn is recorded as failed, with the failure in the transcript', async () => {
    const { store, runner, registry } = setup();
    const agent = store.createSession({ workspaceDir: '/w/a', branch: 'b' });

    registry.send(agent.id, 'hello');
    await until(() => runner.parked() === 1);
    runner.finish([{ type: 'error', message: 'Claude Code exited with status 1.' }]);
    await settle(registry, agent.id);

    expect(store.getSession(agent.id)?.runState).toBe('failed');
    expect(store.listMessages(agent.id).at(-1)?.content).toBe('Claude Code exited with status 1.');
  });

  test('a result marked as an error is a failure too', async () => {
    const { store, runner, registry } = setup();
    const agent = store.createSession({ workspaceDir: '/w/a', branch: 'b' });

    registry.send(agent.id, 'hello');
    await until(() => runner.parked() === 1);
    runner.finish([{ type: 'result', text: 'Credit balance is too low', isError: true }]);
    await settle(registry, agent.id);

    expect(store.getSession(agent.id)?.runState).toBe('failed');
    expect(store.listMessages(agent.id).at(-1)?.content).toBe('Credit balance is too low');
  });

  test('a runner that throws is recorded as a failure, and frees the agent', async () => {
    const { store } = setup();
    const { hub } = recordingHub();
    // A runner that fails before its first event.
    // eslint-disable-next-line require-yield -- it never gets as far as yielding
    const throwing = async function* run(): AsyncGenerator<ClaudeEvent> {
      await Promise.resolve();
      throw new Error('spawn exploded');
    };
    const registry = createAgentRegistry({ store, hub, runTurn: throwing, maxRunning: 4 });
    const agent = store.createSession({ workspaceDir: '/w/a', branch: 'b' });

    registry.send(agent.id, 'hello');
    await settle(registry, agent.id);
    expect(store.getSession(agent.id)?.runState).toBe('failed');
    expect(store.listMessages(agent.id).at(-1)?.content).toBe('spawn exploded');
  });
});

describe('several agents', () => {
  test('run at the same time', async () => {
    const { store, runner, registry } = setup();
    const a = store.createSession({ workspaceDir: '/w/a', branch: 'a' });
    const b = store.createSession({ workspaceDir: '/w/b', branch: 'b' });

    expect(registry.send(a.id, 'first')).toEqual({ ok: true });
    expect(registry.send(b.id, 'second')).toEqual({ ok: true });
    await until(() => runner.parked() === 2);
    expect(registry.isRunning(a.id) && registry.isRunning(b.id)).toBe(true);

    runner.finish([{ type: 'text', text: 'A' }]);
    runner.finish([{ type: 'text', text: 'B' }]);
    await settle(registry, a.id);
    await settle(registry, b.id);
    expect(store.listMessages(a.id).at(-1)?.content).toBe('A');
    expect(store.listMessages(b.id).at(-1)?.content).toBe('B');
  });

  test('one agent takes one turn at a time', () => {
    const { store, registry } = setup();
    const a = store.createSession({ workspaceDir: '/w/a', branch: 'a' });

    registry.send(a.id, 'first');
    expect(registry.send(a.id, 'second')).toEqual({
      ok: false,
      status: 409,
      error: 'This agent is already working. Wait for it to finish, or stop it.',
    });
    // The refused message was not written down.
    expect(store.listMessages(a.id).map((m) => m.content)).toEqual(['first']);
  });

  test('no more than the limit run at once, and the refusal names the limit', () => {
    const { store, registry } = setup(2);
    const ids = ['a', 'b', 'c'].map(
      (name) => store.createSession({ workspaceDir: `/w/${name}`, branch: name }).id,
    );

    expect(registry.send(ids[0] ?? '', 'x')).toEqual({ ok: true });
    expect(registry.send(ids[1] ?? '', 'x')).toEqual({ ok: true });
    expect(registry.send(ids[2] ?? '', 'x')).toEqual({
      ok: false,
      status: 409,
      error:
        '2 agents are already working, which is the limit (QUACK_MAX_AGENTS). Wait for one to finish, or stop one.',
    });
  });

  test('two agents cannot work in one folder that has no worktrees', () => {
    // A folder that is not a git repository runs agents in place, so a second
    // agent there would edit the same files as the first.
    const { store, registry } = setup();
    const a = store.createSession({ workspaceDir: '/srv/projects/notes' });
    const b = store.createSession({ workspaceDir: '/srv/projects/notes' });

    registry.send(a.id, 'x');
    const refused = registry.send(b.id, 'x');
    expect(refused).toMatchObject({ ok: false, status: 409 });
    expect(refused.ok ? '' : refused.error).toMatch(/folder/);
  });

  test('an unknown agent is a 404, not a crash', () => {
    const { registry } = setup();
    expect(registry.send('nope', 'x')).toEqual({
      ok: false,
      status: 404,
      error: 'No such agent.',
    });
  });
});

describe('stopping', () => {
  test('ends the turn, keeps what was said, and records that it was stopped', async () => {
    const { store, runner, registry } = setup();
    const agent = store.createSession({ workspaceDir: '/w/a', branch: 'b' });

    registry.send(agent.id, 'long job');
    await until(() => runner.parked() === 1);
    expect(registry.stop(agent.id)).toBe(true);
    await settle(registry, agent.id);

    expect(runner.calls[0]?.signal?.aborted).toBe(true);
    expect(store.getSession(agent.id)?.runState).toBe('stopped');
    // The abort's own error is not presented as the agent failing.
    expect(store.listMessages(agent.id).at(-1)?.content).toBe(STOPPED_NOTE);
  });

  test('an agent that is not running has nothing to stop', () => {
    const { store, registry } = setup();
    const agent = store.createSession({ workspaceDir: '/w/a' });
    expect(registry.stop(agent.id)).toBe(false);
  });

  test('a stopped agent frees its place under the limit', async () => {
    const { store, runner, registry } = setup(1);
    const a = store.createSession({ workspaceDir: '/w/a', branch: 'a' });
    const b = store.createSession({ workspaceDir: '/w/b', branch: 'b' });

    registry.send(a.id, 'x');
    await until(() => runner.parked() === 1);
    registry.stop(a.id);
    await settle(registry, a.id);
    expect(registry.send(b.id, 'x')).toEqual({ ok: true });
  });
});

describe('a server that stops', () => {
  test('on shutdown, stores what was said so far and marks the turn interrupted', async () => {
    const { store, runner, registry } = setup();
    const agent = store.createSession({ workspaceDir: '/w/a', branch: 'b' });

    registry.send(agent.id, 'long job');
    await until(() => runner.parked() === 1);
    await registry.shutdown();

    expect(store.getSession(agent.id)?.runState).toBe('interrupted');
    expect(store.listMessages(agent.id).at(-1)?.content).toBe(INTERRUPTED_NOTE);
  });

  test('after a crash, the next start marks the agents it left running as interrupted', () => {
    const { store, hub } = setup();
    const agent = store.createSession({ workspaceDir: '/w/a', branch: 'b' });
    // What a killed process leaves behind: a running row and no answer.
    store.setRunState(agent.id, 'running');
    store.appendMessage(agent.id, { role: 'user', content: 'long job' });

    const registry = createAgentRegistry({ store, hub, runTurn: heldRunner().run, maxRunning: 4 });
    expect(registry.isRunning(agent.id)).toBe(false);
    expect(store.getSession(agent.id)?.runState).toBe('interrupted');
    expect(store.listMessages(agent.id).at(-1)?.content).toBe(INTERRUPTED_NOTE);
  });

  test('an interrupted agent can be sent another message', async () => {
    const { store, runner, registry } = setup();
    const agent = store.createSession({ workspaceDir: '/w/a', branch: 'b' });
    store.setRunState(agent.id, 'interrupted');
    expect(registry.send(agent.id, 'carry on')).toEqual({ ok: true });
    await until(() => runner.parked() === 1);
    runner.finish([]);
    await settle(registry, agent.id);
  });
});
