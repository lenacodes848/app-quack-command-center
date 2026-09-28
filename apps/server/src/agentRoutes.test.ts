import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { ClaudeEvent, ClaudeTurnOptions } from '@quack/adapter';
import { INTERRUPTED_NOTE } from './agents.js';
import { MAX_BODY_BYTES, NAME_LIMIT, type TurnRunner } from './app.js';
import { startPaired, type PairedServer } from './testkit.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

function scratch(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'quack-routes-')));
  cleanups.push(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function makeRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', HOME: '/nonexistent' };
  execFileSync('git', ['-C', dir, 'init', '-q'], { env });
  execFileSync(
    'git',
    [
      '-C',
      dir,
      '-c',
      'user.name=quack',
      '-c',
      'user.email=',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'init',
    ],
    { env },
  );
}

const A_TURN: ClaudeEvent[] = [
  { type: 'session', sessionId: 'prov-1', model: 'claude-test' },
  { type: 'text', text: 'Hello back.' },
  { type: 'result', text: 'Hello back.', isError: false },
];

/** A runner that answers at once, or parks every turn until `release` when `held`. */
function fakeRunner(events: ClaudeEvent[] = A_TURN, held = false) {
  const calls: ClaudeTurnOptions[] = [];
  const parked: (() => void)[] = [];
  const run: TurnRunner = async function* run(options) {
    calls.push(options);
    if (held) {
      await new Promise<void>((resolve) => {
        parked.push(resolve);
        options.signal?.addEventListener('abort', () => {
          resolve();
        });
      });
    } else {
      await Promise.resolve();
    }
    for (const event of events) yield event;
  };
  return { run, calls, release: () => parked.shift()?.(), parkedCount: () => parked.length };
}

interface Dashboard extends PairedServer {
  root: string;
  calls: ClaudeTurnOptions[];
  runner: ReturnType<typeof fakeRunner>;
}

async function dashboard(
  options: {
    events?: ClaudeEvent[];
    held?: boolean;
    maxAgents?: number;
    roots?: 'configured' | 'none';
    dataDir?: string;
    store?: PairedServer['store'];
  } = {},
): Promise<Dashboard> {
  const root = scratch();
  const runner = fakeRunner(options.events, options.held);
  const server = await startPaired({
    dataDir: options.dataDir ?? scratch(),
    projectRoots: options.roots === 'none' ? [] : [root],
    worktreesDir: join(scratch(), 'worktrees'),
    runTurn: runner.run,
    maxAgents: options.maxAgents,
    ...(options.store === undefined ? {} : { store: options.store }),
  });
  cleanups.push(server.close);
  return { ...server, root, calls: runner.calls, runner };
}

function json(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

interface AgentJson {
  id: string;
  name: string;
  projectDir: string | null;
  projectName: string | null;
  branch: string | null;
  model: string | null;
  runState: string;
}

async function launch(
  h: Dashboard,
  body: Record<string, unknown>,
): Promise<{ status: number; agent: AgentJson; error?: string }> {
  const response = await h.call('/api/agents', json(body));
  const parsed = (await response.json()) as { agent: AgentJson; error?: string };
  return { status: response.status, ...parsed };
}

async function until(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 300 && !condition(); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  if (!condition()) throw new Error('condition never became true');
}

async function idle(h: Dashboard, id: string): Promise<void> {
  await until(() => h.store.getSession(id)?.runState !== 'running');
}

describe('projects', () => {
  test('lists the folders under the configured roots', async () => {
    const h = await dashboard();
    makeRepo(join(h.root, 'app'));
    mkdirSync(join(h.root, 'notes'));

    const listed = (await (await h.call('/api/projects')).json()) as unknown;
    expect(listed).toEqual({
      configured: true,
      projects: [
        { name: 'app', path: join(h.root, 'app'), git: true },
        { name: 'notes', path: join(h.root, 'notes'), git: false },
      ],
    });
  });

  test('says when no roots are configured, so the interface can explain it', async () => {
    const h = await dashboard({ roots: 'none' });
    expect(await (await h.call('/api/projects')).json()).toEqual({
      configured: false,
      projects: [],
    });
  });
});

describe('launching an agent', () => {
  test('in a git project gives it a worktree and a branch, and runs its first message', async () => {
    const h = await dashboard();
    makeRepo(join(h.root, 'app'));

    const launched = await launch(h, {
      name: 'Fix login',
      project: join(h.root, 'app'),
      model: 'sonnet',
      text: 'Please fix the login bug',
    });

    expect(launched.status).toBe(201);
    expect(launched.agent).toMatchObject({
      name: 'Fix login',
      projectDir: join(h.root, 'app'),
      projectName: 'app',
      model: 'sonnet',
    });
    expect(launched.agent.branch).toMatch(/^quack\/fix-login-[0-9a-f]{6}$/u);

    await idle(h, launched.agent.id);
    const stored = h.store.getSession(launched.agent.id);
    expect(stored?.workspaceDir).not.toBe(join(h.root, 'app'));
    expect(existsSync(stored?.workspaceDir ?? '')).toBe(true);
    expect(h.calls[0]).toMatchObject({ prompt: 'Please fix the login bug', model: 'sonnet' });
    expect(h.calls[0]?.cwd).toBe(stored?.workspaceDir);
    expect(h.store.listMessages(launched.agent.id).map((m) => m.content)).toEqual([
      'Please fix the login bug',
      'Hello back.',
    ]);
  });

  test('in a folder that is not a repository runs it in place, with no branch', async () => {
    const h = await dashboard();
    mkdirSync(join(h.root, 'notes'));
    const launched = await launch(h, { project: join(h.root, 'notes') });
    expect(launched.status).toBe(201);
    expect(launched.agent.branch).toBeNull();
    expect(h.store.getSession(launched.agent.id)?.workspaceDir).toBe(join(h.root, 'notes'));
    // No message, so nothing ran.
    expect(h.calls).toHaveLength(0);
  });

  test.each([
    ['a folder outside the roots', (h: Dashboard) => ({ project: join(h.root, '..') }), /approved/],
    ['no project at all', () => ({ name: 'x' }), /Choose a project/],
    [
      'a model not on the list',
      (h: Dashboard) => ({ project: join(h.root, 'notes'), model: 'gpt-4' }),
      /opus, sonnet, haiku/,
    ],
    [
      'a name that is too long',
      (h: Dashboard) => ({ project: join(h.root, 'notes'), name: 'x'.repeat(NAME_LIMIT + 1) }),
      /too long/,
    ],
  ])('refuses %s', async (_label, body, message) => {
    const h = await dashboard();
    mkdirSync(join(h.root, 'notes'));
    const response = await h.call('/api/agents', json(body(h)));
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toMatch(message);
    expect(h.store.listSessions()).toHaveLength(0);
  });

  test('explains that no roots are configured', async () => {
    const h = await dashboard({ roots: 'none' });
    const response = await h.call('/api/agents', json({ project: h.root }));
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toMatch(/QUACK_PROJECT_ROOTS/);
  });

  test('still creates the agent when its first message is refused, and says why', async () => {
    const h = await dashboard({ held: true, maxAgents: 1 });
    mkdirSync(join(h.root, 'a'));
    mkdirSync(join(h.root, 'b'));

    const first = await launch(h, { project: join(h.root, 'a'), text: 'busy work' });
    const second = await launch(h, { project: join(h.root, 'b'), text: 'more work' });

    expect(second.status).toBe(201);
    expect(second.agent.runState).toBe('idle');
    expect(second.error).toMatch(/limit/);
    h.runner.release();
    await idle(h, first.agent.id);
  });
});

describe('an agent', () => {
  test('is listed with the sequence the list reflects', async () => {
    const h = await dashboard();
    mkdirSync(join(h.root, 'notes'));
    const launched = await launch(h, { name: 'Notes', project: join(h.root, 'notes') });

    const listed = (await (await h.call('/api/agents')).json()) as {
      agents: AgentJson[];
      seq: number;
    };
    expect(listed.agents.map((a) => a.id)).toEqual([launched.agent.id]);
    expect(listed.seq).toBeGreaterThan(0);
  });

  test('opens with its transcript, the turn in progress, and a sequence', async () => {
    const h = await dashboard({ held: true });
    mkdirSync(join(h.root, 'notes'));
    const { agent } = await launch(h, { project: join(h.root, 'notes'), text: 'hello' });
    await until(() => h.runner.parkedCount() === 1);

    const opened = (await (await h.call(`/api/agents/${agent.id}`)).json()) as {
      agent: AgentJson;
      messages: { role: string; content: string }[];
      live: ClaudeEvent[];
      seq: number;
    };
    expect(opened.agent.runState).toBe('running');
    expect(opened.messages.map((m) => m.content)).toEqual(['hello']);
    expect(opened.live).toEqual([]);
    expect(opened.seq).toBeGreaterThan(0);

    h.runner.release();
    await idle(h, agent.id);
  });

  test('that does not exist is a 404 on every route', async () => {
    const h = await dashboard();
    expect((await h.call('/api/agents/nope')).status).toBe(404);
    expect((await h.call('/api/agents/nope/messages', json({ text: 'x' }))).status).toBe(404);
    expect((await h.call('/api/agents/nope/stop', { method: 'POST' })).status).toBe(404);
  });

  test('can be renamed, and an empty name is refused', async () => {
    const h = await dashboard();
    mkdirSync(join(h.root, 'notes'));
    const { agent } = await launch(h, { project: join(h.root, 'notes') });

    const renamed = await h.call(`/api/agents/${agent.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Better name' }),
    });
    expect(renamed.status).toBe(200);
    expect(h.store.getSession(agent.id)?.title).toBe('Better name');

    const empty = await h.call(`/api/agents/${agent.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '   ' }),
    });
    expect(empty.status).toBe(400);
  });
});

describe('sending a message', () => {
  test('is accepted at once and answered in the background', async () => {
    const h = await dashboard({ held: true });
    mkdirSync(join(h.root, 'notes'));
    const { agent } = await launch(h, { project: join(h.root, 'notes') });

    const response = await h.call(`/api/agents/${agent.id}/messages`, json({ text: 'hello' }));
    expect(response.status).toBe(202);
    expect(h.store.getSession(agent.id)?.runState).toBe('running');

    h.runner.release();
    await idle(h, agent.id);
    expect(h.store.listMessages(agent.id).at(-1)?.content).toBe('Hello back.');
  });

  test('admits one of two messages that arrive together, and records one question', async () => {
    const h = await dashboard({ held: true });
    mkdirSync(join(h.root, 'notes'));
    const { agent } = await launch(h, { project: join(h.root, 'notes') });

    const statuses = await Promise.all(
      ['one', 'two'].map(
        async (text) => (await h.call(`/api/agents/${agent.id}/messages`, json({ text }))).status,
      ),
    );
    expect(statuses.sort()).toEqual([202, 409]);
    expect(h.store.listMessages(agent.id)).toHaveLength(1);

    h.runner.release();
    await idle(h, agent.id);
  });

  test('refuses an empty message', async () => {
    const h = await dashboard();
    mkdirSync(join(h.root, 'notes'));
    const { agent } = await launch(h, { project: join(h.root, 'notes') });
    const response = await h.call(`/api/agents/${agent.id}/messages`, json({ text: '  ' }));
    expect(response.status).toBe(400);
    expect(h.calls).toHaveLength(0);
  });

  test('a body over the limit says so and names it, instead of blaming the JSON', async () => {
    const h = await dashboard();
    mkdirSync(join(h.root, 'notes'));
    const { agent } = await launch(h, { project: join(h.root, 'notes') });

    const response = await h.call(
      `/api/agents/${agent.id}/messages`,
      json({ text: 'x'.repeat(MAX_BODY_BYTES + 1000) }),
    );
    expect(response.status).toBe(413);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain(String(MAX_BODY_BYTES));
    expect(body.error).not.toMatch(/must be JSON/i);
  });

  test('broken JSON is still blamed on the JSON', async () => {
    const h = await dashboard();
    const response = await h.call('/api/agents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json at all',
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Body must be JSON.' });
  });

  test('a failed turn keeps the question and records the failure', async () => {
    const h = await dashboard({ events: [{ type: 'error', message: 'the CLI fell over' }] });
    mkdirSync(join(h.root, 'notes'));
    const { agent } = await launch(h, {
      project: join(h.root, 'notes'),
      text: 'a doomed question',
    });
    await idle(h, agent.id);

    expect(h.store.getSession(agent.id)?.runState).toBe('failed');
    expect(h.store.listMessages(agent.id).map((m) => m.content)).toEqual([
      'a doomed question',
      'the CLI fell over',
    ]);
  });
});

describe('stopping an agent', () => {
  test('ends its turn and records that it was stopped', async () => {
    const h = await dashboard({ held: true });
    mkdirSync(join(h.root, 'notes'));
    const { agent } = await launch(h, { project: join(h.root, 'notes'), text: 'long job' });
    await until(() => h.runner.parkedCount() === 1);

    expect((await h.call(`/api/agents/${agent.id}/stop`, { method: 'POST' })).status).toBe(200);
    await idle(h, agent.id);
    expect(h.store.getSession(agent.id)?.runState).toBe('stopped');
  });

  test('is a 409 when the agent is not working', async () => {
    const h = await dashboard();
    mkdirSync(join(h.root, 'notes'));
    const { agent } = await launch(h, { project: join(h.root, 'notes') });
    expect((await h.call(`/api/agents/${agent.id}/stop`, { method: 'POST' })).status).toBe(409);
  });
});

/** Read an event stream until `count` named events arrive. */
async function readEvents(
  response: Response,
  count: number,
): Promise<{ event: string; data: unknown }[]> {
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  const events: { event: string; data: unknown }[] = [];
  let buffer = '';
  while (events.length < count) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end = buffer.indexOf('\n\n');
    while (end !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      end = buffer.indexOf('\n\n');
      const event = /^event: (.*)$/mu.exec(block)?.[1];
      const data = /^data: (.*)$/mu.exec(block)?.[1];
      if (event !== undefined) events.push({ event, data: JSON.parse(data ?? 'null') });
    }
  }
  reader.releaseLock();
  return events;
}

describe('the event stream', () => {
  test('carries a launched agent from its first message to its answer', async () => {
    const h = await dashboard();
    mkdirSync(join(h.root, 'notes'));
    const controller = new AbortController();
    cleanups.push(() => {
      controller.abort();
    });
    const stream = await h.call('/api/events', { signal: controller.signal });
    expect(stream.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');

    const { agent } = await launch(h, { project: join(h.root, 'notes'), text: 'hello' });
    const events = await readEvents(stream, 9);

    expect(events.map((e) => e.event)).toEqual([
      'hello',
      'agent',
      'message',
      'agent',
      'turn',
      'turn',
      'turn',
      'message',
      'agent',
    ]);
    expect(events.at(-1)?.data).toMatchObject({ id: agent.id, runState: 'idle' });
  });

  test('ends when the browser logs out', async () => {
    const h = await dashboard();
    const stream = await h.call('/api/events');
    const reading = readEvents(stream, 2);
    await h.call('/api/logout', { method: 'POST' });
    // The stream closes instead of waiting for a second event.
    expect((await reading).map((e) => e.event)).toEqual(['hello']);
  });
});

describe('a restart', () => {
  test('keeps the agents, and resumes one with the provider session it saved', async () => {
    const dataDir = scratch();
    const first = await dashboard({ dataDir });
    mkdirSync(join(first.root, 'notes'));
    const { agent } = await launch(first, { project: join(first.root, 'notes'), text: 'before' });
    await idle(first, agent.id);

    const restarted = await dashboard({ dataDir, store: first.store });
    const listed = (await (await restarted.call('/api/agents')).json()) as { agents: AgentJson[] };
    expect(listed.agents.map((a) => a.id)).toEqual([agent.id]);

    await restarted.call(`/api/agents/${agent.id}/messages`, json({ text: 'after' }));
    await idle(restarted, agent.id);
    expect(restarted.calls[0]?.sessionId).toBe('prov-1');
  });

  test('marks a turn the previous process was running as interrupted', async () => {
    const dataDir = scratch();
    const first = await dashboard({ dataDir });
    const agent = first.store.createSession({ workspaceDir: first.root, branch: 'b' });
    // What a process killed mid-turn leaves behind.
    first.store.setRunState(agent.id, 'running');

    const restarted = await dashboard({ dataDir, store: first.store });
    expect(restarted.store.getSession(agent.id)?.runState).toBe('interrupted');
    expect(restarted.store.listMessages(agent.id).at(-1)?.content).toBe(INTERRUPTED_NOTE);
  });
});
