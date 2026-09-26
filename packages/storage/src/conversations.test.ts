import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { openStore, type Store } from './store.js';

const dirs: string[] = [];

function scratchPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'quack-conv-'));
  dirs.push(dir);
  return join(dir, 'quack.db');
}

function freshStore(): Store {
  return openStore(scratchPath());
}

/**
 * A store whose clock this test drives.
 *
 * Real timestamps tie: several writes in one turn land in the same millisecond,
 * and a test that relies on them cannot tell correct ordering from the order
 * SQLite happens to return rows in. Driving the clock makes the ordering rules
 * testable — including by running it backwards, which no real clock does but
 * which is the only way to prove the code never sorts on time.
 */
function storeWithClock(times: readonly string[]): Store {
  let index = 0;
  return openStore(scratchPath(), {
    now: () => times[Math.min(index++, times.length - 1)] ?? times[times.length - 1] ?? '',
  });
}

const MINUTES = (n: number): string => `2026-09-25T12:${String(n).padStart(2, '0')}:00.000Z`;

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe('messages', () => {
  test('come back in the order they were written', () => {
    const store = freshStore();
    const session = store.createSession({ workspaceDir: '/tmp/w' });

    store.appendMessage(session.id, { role: 'user', content: 'first' });
    store.appendMessage(session.id, { role: 'agent', content: 'second' });
    store.appendMessage(session.id, { role: 'user', content: 'third' });

    expect(store.listMessages(session.id).map((m) => [m.role, m.content])).toEqual([
      ['user', 'first'],
      ['agent', 'second'],
      ['user', 'third'],
    ]);
    store.close();
  });

  test('are ordered by sequence even when the clock runs backwards', () => {
    // Several messages in one turn can share a millisecond, so a conversation
    // ordered by timestamp can come back scrambled. Running the clock backwards
    // proves the order comes from the sequence and never from the time: sorting
    // these by `created_at` would reverse the whole conversation.
    const store = storeWithClock([MINUTES(59), MINUTES(50), MINUTES(40), MINUTES(30)]);
    const session = store.createSession({ workspaceDir: '/tmp/w' });
    store.appendMessage(session.id, { role: 'user', content: 'first' });
    store.appendMessage(session.id, { role: 'agent', content: 'second' });
    store.appendMessage(session.id, { role: 'user', content: 'third' });

    const messages = store.listMessages(session.id);
    expect(messages.map((m) => m.content)).toEqual(['first', 'second', 'third']);
    expect(messages.map((m) => m.seq)).toEqual([1, 2, 3]);
    // The timestamps really are descending, so this is not a vacuous pass.
    expect(messages.map((m) => m.createdAt)).toEqual([MINUTES(50), MINUTES(40), MINUTES(30)]);
    store.close();
  });

  test('belong to their own session only', () => {
    const store = freshStore();
    const one = store.createSession({ workspaceDir: '/tmp/a' });
    const two = store.createSession({ workspaceDir: '/tmp/b' });
    store.appendMessage(one.id, { role: 'user', content: 'in one' });
    store.appendMessage(two.id, { role: 'user', content: 'in two' });

    expect(store.listMessages(one.id).map((m) => m.content)).toEqual(['in one']);
    expect(store.listMessages(two.id).map((m) => m.content)).toEqual(['in two']);
    store.close();
  });

  test('cannot be written against a session that does not exist', () => {
    // Without the foreign key this would silently create an orphan that no
    // conversation could ever show.
    const store = freshStore();
    expect(() => store.appendMessage('no-such-session', { role: 'user', content: 'hi' })).toThrow(
      /FOREIGN KEY/i,
    );
    store.close();
  });
});

describe('resuming after a restart', () => {
  test('a stored session keeps the provider id that resume needs', () => {
    const path = scratchPath();
    const first = openStore(path);
    const session = first.createSession({ workspaceDir: '/tmp/w' });
    first.recordProviderSession(session.id, { providerSessionId: 'prov-42', model: 'opus' });
    first.appendMessage(session.id, { role: 'user', content: 'before the restart' });
    first.close();

    // A new process, a new connection: exactly what a restart is.
    const second = openStore(path);
    const restored = second.getSession(session.id);
    expect(restored?.providerSessionId).toBe('prov-42');
    expect(restored?.model).toBe('opus');
    expect(second.listMessages(session.id).map((m) => m.content)).toEqual(['before the restart']);
    second.close();
  });

  test('an unknown session id reads as absent rather than throwing', () => {
    const store = freshStore();
    expect(store.getSession('nope')).toBeUndefined();
    store.close();
  });
});

describe('the conversation list', () => {
  test('puts the most recently active conversation first', () => {
    // Activity, not creation, decides the order: the point of the list is to get
    // back to what you were last doing. The clock is driven so the two sessions
    // have genuinely different timestamps — with real ones they land in the same
    // millisecond and the assertion passes whatever the code does.
    const store = storeWithClock([MINUTES(1), MINUTES(2), MINUTES(3)]);
    const older = store.createSession({ workspaceDir: '/tmp/a' });
    const newer = store.createSession({ workspaceDir: '/tmp/b' });

    // Created first, but touched last, so it must sort to the top.
    store.appendMessage(older.id, { role: 'user', content: 'poke the older one' });

    expect(store.listSessions().map((s) => s.id)).toEqual([older.id, newer.id]);
    expect(store.getSession(older.id)?.updatedAt).toBe(MINUTES(3));
    store.close();
  });

  test('names a conversation after its first message, so the list is readable', () => {
    const store = freshStore();
    const session = store.createSession({ workspaceDir: '/tmp/w' });
    store.appendMessage(session.id, {
      role: 'user',
      content: 'Explain how the adapter parses events',
    });
    store.appendMessage(session.id, { role: 'user', content: 'and now something else entirely' });

    // The first message only. A title that followed the latest message would
    // rename the conversation under the owner as they worked.
    expect(store.getSession(session.id)?.title).toBe('Explain how the adapter parses events');
    store.close();
  });

  test('shortens a long first message instead of storing a wall of text', () => {
    const store = freshStore();
    const session = store.createSession({ workspaceDir: '/tmp/w' });
    store.appendMessage(session.id, { role: 'user', content: 'x'.repeat(500) });

    const title = store.getSession(session.id)?.title ?? '';
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith('…')).toBe(true);
    store.close();
  });

  test('does not let an agent message name the conversation', () => {
    const store = freshStore();
    const session = store.createSession({ workspaceDir: '/tmp/w' });
    store.appendMessage(session.id, { role: 'agent', content: 'I am ready to help' });
    expect(store.getSession(session.id)?.title).toBeUndefined();
    store.close();
  });

  test('keeps a title it was given at creation', () => {
    const store = freshStore();
    const session = store.createSession({ workspaceDir: '/tmp/w', title: 'Chosen by the owner' });
    store.appendMessage(session.id, { role: 'user', content: 'a first message' });
    expect(store.getSession(session.id)?.title).toBe('Chosen by the owner');
    store.close();
  });
});

describe('two connections to one database', () => {
  test('one connection sees what the other committed', () => {
    // The dashboard will not be the only reader for long, and WAL makes this
    // work. Proving it now means a second reader is not a surprise later.
    const path = scratchPath();
    const writer = openStore(path);
    const reader = openStore(path);

    const session = writer.createSession({ workspaceDir: '/tmp/w' });
    writer.appendMessage(session.id, { role: 'user', content: 'written by the writer' });

    expect(reader.listSessions().map((s) => s.id)).toEqual([session.id]);
    expect(reader.listMessages(session.id).map((m) => m.content)).toEqual([
      'written by the writer',
    ]);
    writer.close();
    reader.close();
  });
});
