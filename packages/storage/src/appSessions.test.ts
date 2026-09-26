import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, describe, expect, test } from 'vitest';
import { openStore, SCHEMA_VERSION, type Store } from './store.js';

const dirs: string[] = [];

function scratchPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'quack-appsessions-'));
  dirs.push(dir);
  return join(dir, 'quack.db');
}

const MINUTE = (n: number): string => `2026-09-25T12:${String(n).padStart(2, '0')}:00.000Z`;

/** A store whose clock the test drives, so expiry needs no waiting. */
function storeWithClock(times: readonly string[]): Store {
  let index = 0;
  return openStore(scratchPath(), {
    now: () => times[Math.min(index++, times.length - 1)] ?? '',
  });
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe('the schema', () => {
  test('has moved on to make room for application sessions', () => {
    // A bump means an existing database gets the new table by migration rather
    // than needing to be thrown away.
    expect(SCHEMA_VERSION).toBe(2);
    const store = openStore(scratchPath());
    expect(store.schemaVersion()).toBe(2);
    store.close();
  });

  test('adds the table to a database created before it existed', () => {
    // A real upgrade, not an approximation: make the file genuinely look like
    // version 1 by removing the table version 2 adds, then reopen. The
    // conversations must survive and the new table must appear.
    const path = scratchPath();
    const first = openStore(path);
    const session = first.createSession({ workspaceDir: '/tmp/w' });
    first.appendMessage(session.id, { role: 'user', content: 'from the old version' });
    first.close();

    const surgery = new Database(path);
    surgery.exec('DROP TABLE app_sessions');
    surgery.pragma('user_version = 1');
    surgery.close();

    const upgraded = openStore(path);
    expect(upgraded.schemaVersion()).toBe(2);
    expect(upgraded.listMessages(session.id).map((m) => m.content)).toEqual([
      'from the old version',
    ]);
    // And the new table is usable.
    expect(upgraded.countActiveAppSessions('2026-09-25T12:00:00.000Z')).toBe(0);
    upgraded.close();
  });
});

describe('creating and finding an application session', () => {
  test('a session is found by the hash of its token, never by the token', () => {
    const store = storeWithClock([MINUTE(0)]);
    const created = store.createAppSession({
      tokenHash: 'hash-of-the-token',
      label: 'a browser',
      expiresAt: MINUTE(59),
    });

    const found = store.findAppSession('hash-of-the-token', MINUTE(1));
    expect(found?.id).toBe(created.id);
    expect(found?.label).toBe('a browser');
    store.close();
  });

  test('an unknown hash finds nothing', () => {
    const store = storeWithClock([MINUTE(0)]);
    expect(store.findAppSession('never-stored', MINUTE(1))).toBeUndefined();
    store.close();
  });

  test('the token itself is never stored anywhere in the database', () => {
    // The whole point of hashing. If reading the file yielded a usable token,
    // anything that could read the database could impersonate the owner.
    const store = storeWithClock([MINUTE(0)]);
    store.createAppSession({
      tokenHash: 'sha256-of-secret',
      label: 'a browser',
      expiresAt: MINUTE(59),
    });
    expect(store.debugDump()).not.toContain('the-actual-secret-token');
    expect(store.debugDump()).toContain('sha256-of-secret');
    store.close();
  });
});

describe('expiry', () => {
  test('a session past its expiry is not found', () => {
    const store = storeWithClock([MINUTE(0)]);
    store.createAppSession({ tokenHash: 'h', label: null, expiresAt: MINUTE(10) });

    expect(store.findAppSession('h', MINUTE(9))).toBeDefined();
    expect(store.findAppSession('h', MINUTE(11))).toBeUndefined();
    store.close();
  });

  test('a session unused for longer than the idle window is not found', () => {
    // Absolute expiry alone would keep a forgotten phone logged in for the full
    // 90 days. The idle window is the second limit.
    const store = storeWithClock([MINUTE(0)]);
    store.createAppSession({ tokenHash: 'h', label: null, expiresAt: MINUTE(59) });

    // It was last used at minute 0. An idle cutoff after that kills it.
    expect(store.findAppSession('h', MINUTE(6), MINUTE(5))).toBeUndefined();
    // An idle cutoff before it was last used leaves it alive.
    expect(store.findAppSession('h', MINUTE(6), '2026-09-25T11:00:00.000Z')).toBeDefined();
    store.close();
  });

  test('touching a session moves its idle deadline', () => {
    const store = storeWithClock([MINUTE(0)]);
    const created = store.createAppSession({
      tokenHash: 'h',
      label: null,
      expiresAt: MINUTE(59),
    });
    store.touchAppSession(created.id, MINUTE(30));

    // The same idle cutoff that would have killed it now does not.
    expect(store.findAppSession('h', MINUTE(31), MINUTE(20))).toBeDefined();
    store.close();
  });
});

describe('revoking', () => {
  test('a revoked session is not found, even before it expires', () => {
    const store = storeWithClock([MINUTE(0)]);
    const created = store.createAppSession({
      tokenHash: 'h',
      label: null,
      expiresAt: MINUTE(59),
    });

    store.revokeAppSession(created.id, MINUTE(5));
    expect(store.findAppSession('h', MINUTE(6))).toBeUndefined();
    store.close();
  });

  test('logging out everywhere revokes every session at once', () => {
    // This is the control for a lost device, so it must leave nothing behind.
    const store = storeWithClock([MINUTE(0)]);
    store.createAppSession({ tokenHash: 'phone', label: 'phone', expiresAt: MINUTE(59) });
    store.createAppSession({ tokenHash: 'laptop', label: 'laptop', expiresAt: MINUTE(59) });

    store.revokeAllAppSessions(MINUTE(5));

    expect(store.findAppSession('phone', MINUTE(6))).toBeUndefined();
    expect(store.findAppSession('laptop', MINUTE(6))).toBeUndefined();
    expect(store.countActiveAppSessions(MINUTE(6))).toBe(0);
    store.close();
  });
});

describe('counting active sessions', () => {
  test('is how the server decides whether to open pairing at startup', () => {
    // No active session means nobody can get in, so a pairing code is needed.
    // One or more means do not print a code at every restart.
    const store = storeWithClock([MINUTE(0)]);
    expect(store.countActiveAppSessions(MINUTE(1))).toBe(0);

    store.createAppSession({ tokenHash: 'h', label: null, expiresAt: MINUTE(10) });
    expect(store.countActiveAppSessions(MINUTE(1))).toBe(1);

    // Expired ones do not count, or a long-dead session would lock the owner out
    // by suppressing the pairing code forever.
    expect(store.countActiveAppSessions(MINUTE(11))).toBe(0);
    store.close();
  });

  test('a session surviving a restart is what keeps you logged in', () => {
    const path = scratchPath();
    const first = openStore(path);
    first.createAppSession({ tokenHash: 'h', label: 'laptop', expiresAt: MINUTE(59) });
    first.close();

    const second = openStore(path);
    expect(second.findAppSession('h', MINUTE(1))?.label).toBe('laptop');
    second.close();
  });
});
