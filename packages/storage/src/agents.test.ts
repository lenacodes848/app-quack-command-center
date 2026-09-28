import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, describe, expect, test } from 'vitest';
import { MIGRATIONS, openStore, SCHEMA_VERSION } from './store.js';

const dirs: string[] = [];

function scratchPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'quack-agents-'));
  dirs.push(dir);
  return join(dir, 'quack.db');
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe('an agent', () => {
  test('is created with its project, branch and requested model, and starts idle', () => {
    const store = openStore(scratchPath());
    const agent = store.createSession({
      workspaceDir: '/data/worktrees/a1',
      projectDir: '/Users/me/Projects/app',
      branch: 'quack/fix-login-a1b2c3',
      model: 'sonnet',
      title: 'Fix login',
    });

    expect(store.getSession(agent.id)).toMatchObject({
      workspaceDir: '/data/worktrees/a1',
      projectDir: '/Users/me/Projects/app',
      branch: 'quack/fix-login-a1b2c3',
      model: 'sonnet',
      title: 'Fix login',
      runState: 'idle',
    });
    store.close();
  });

  test('keeps the model the provider reports over the one that was requested', () => {
    // The requested value is an alias; the provider's init event names the model
    // that actually ran, which is the one worth showing and resuming with.
    const store = openStore(scratchPath());
    const agent = store.createSession({ workspaceDir: '/w', model: 'opus' });
    store.recordProviderSession(agent.id, { providerSessionId: 'p1', model: 'claude-opus-5-5' });
    expect(store.getSession(agent.id)?.model).toBe('claude-opus-5-5');
    store.close();
  });

  test('records its run state', () => {
    const store = openStore(scratchPath());
    const agent = store.createSession({ workspaceDir: '/w' });
    store.setRunState(agent.id, 'running');
    expect(store.getSession(agent.id)?.runState).toBe('running');
    store.setRunState(agent.id, 'failed');
    expect(store.getSession(agent.id)?.runState).toBe('failed');
    store.close();
  });

  test('refuses a run state the schema does not know', () => {
    const store = openStore(scratchPath());
    const agent = store.createSession({ workspaceDir: '/w' });
    // Cast deliberately: this is the guard for a caller that bypasses the type.
    expect(() => {
      store.setRunState(agent.id, 'paused' as 'idle');
    }).toThrow();
    store.close();
  });

  test('can be renamed, and a later message does not rename it back', () => {
    const store = openStore(scratchPath());
    const agent = store.createSession({ workspaceDir: '/w' });
    store.appendMessage(agent.id, { role: 'user', content: 'first question' });
    expect(store.renameSession(agent.id, '  Login bug  ')).toBe(true);
    store.appendMessage(agent.id, { role: 'user', content: 'second question' });
    expect(store.getSession(agent.id)?.title).toBe('Login bug');
    store.close();
  });

  test('rename reports an agent that does not exist', () => {
    const store = openStore(scratchPath());
    expect(store.renameSession('nope', 'x')).toBe(false);
    store.close();
  });
});

describe('agents left running by a server that stopped', () => {
  test('are marked interrupted when the store is next asked, and only those', () => {
    const path = scratchPath();
    const first = openStore(path);
    const running = first.createSession({ workspaceDir: '/a' });
    const idle = first.createSession({ workspaceDir: '/b' });
    first.setRunState(running.id, 'running');
    first.close();

    const second = openStore(path);
    expect(second.markInterrupted()).toEqual([running.id]);
    expect(second.getSession(running.id)?.runState).toBe('interrupted');
    expect(second.getSession(idle.id)?.runState).toBe('idle');
    // Nothing is left to interrupt the second time.
    expect(second.markInterrupted()).toEqual([]);
    second.close();
  });
});

describe('migration 3', () => {
  test('upgrades a version 2 database without losing its conversations', () => {
    const path = scratchPath();
    const raw = new Database(path);
    for (const [index, sql] of MIGRATIONS.slice(0, 2).entries()) {
      raw.exec(`BEGIN; ${sql}; PRAGMA user_version = ${String(index + 1)}; COMMIT;`);
    }
    raw
      .prepare(
        `INSERT INTO agent_sessions (id, provider, workspace_dir, title, created_at, updated_at)
         VALUES ('old', 'claude-code', '/data/workspace', 'An old chat', 't', 't')`,
      )
      .run();
    raw.close();

    const store = openStore(path);
    expect(store.schemaVersion()).toBe(SCHEMA_VERSION);
    expect(store.getSession('old')).toMatchObject({
      workspaceDir: '/data/workspace',
      title: 'An old chat',
      projectDir: undefined,
      branch: undefined,
      runState: 'idle',
    });
    store.close();
  });
});
