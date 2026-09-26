import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { openStore, SCHEMA_VERSION } from './store.js';

const dirs: string[] = [];

/** A data directory that does not exist yet, so opening has to create it. */
function scratchPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'quack-storage-'));
  dirs.push(dir);
  return join(dir, 'nested', 'quack.db');
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe('openStore', () => {
  test('creates the database at the current schema version', () => {
    const store = openStore(scratchPath());
    expect(store.schemaVersion()).toBe(SCHEMA_VERSION);
    store.close();
  });

  test('turns on the settings that make a restart survivable', () => {
    // WAL so a crash mid-write does not lose the conversation, and foreign keys
    // so a message can never outlive the session it belongs to. WAL is off by
    // default in SQLite and this is what enables it. Foreign keys are already on
    // by default in better-sqlite3, so asserting it here pins the behaviour the
    // schema depends on rather than proving our own pragma does the work.
    const store = openStore(scratchPath());
    expect(store.pragma('journal_mode')).toBe('wal');
    expect(store.pragma('foreign_keys')).toBe(1);
    store.close();
  });

  test('keeps the database private to its owner', () => {
    // The conversation history is the owner's. It sits in a data directory that
    // may later hold a token, so the directory is 0700 and the file 0600.
    const path = scratchPath();
    const store = openStore(path);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(join(path, '..')).mode & 0o777).toBe(0o700);
    store.close();
  });

  test('refuses a database newer than this build understands', () => {
    // Downgrading and carrying on would read a schema this code does not know,
    // which is a silent wrong-answer machine. Failing loudly is the honest
    // outcome, and the message has to say what to do about it.
    const path = scratchPath();
    const store = openStore(path);
    store.pragmaSet(`user_version = ${String(SCHEMA_VERSION + 5)}`);
    store.close();

    expect(() => openStore(path)).toThrow(/schema version/i);
    expect(() => openStore(path)).toThrow(/Upgrade/i);
  });

  test('opening an existing database again does not lose its contents', () => {
    const path = scratchPath();
    const first = openStore(path);
    const session = first.createSession({ workspaceDir: '/tmp/w' });
    first.close();

    const second = openStore(path);
    expect(second.listSessions().map((s) => s.id)).toEqual([session.id]);
    expect(second.schemaVersion()).toBe(SCHEMA_VERSION);
    second.close();
  });
});
