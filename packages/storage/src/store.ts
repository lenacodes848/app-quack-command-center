import { randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

/**
 * The schema version this build expects.
 *
 * Kept in SQLite's own `user_version` rather than a table of our own, so the
 * version travels with the file and cannot disagree with it.
 */
export const SCHEMA_VERSION = 2;

/**
 * Ordered migrations. Index 0 takes an empty database to version 1.
 *
 * Append only, and never edit one that has shipped: a database in the field has
 * already run it. Each runs in a single transaction, so a failure leaves the
 * version where it was rather than half-applied.
 *
 * The table and column names follow the PRD's durable data model (3.6) even
 * though only two of its eleven records exist yet, so the rest can be added
 * without renaming what conversations are already stored in.
 */
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE agent_sessions (
    id                  TEXT PRIMARY KEY,
    provider            TEXT NOT NULL,
    provider_session_id TEXT,
    workspace_dir       TEXT NOT NULL,
    title               TEXT,
    model               TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
  ) STRICT;

  CREATE TABLE normalized_messages (
    id         TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
    seq        INTEGER NOT NULL,
    role       TEXT NOT NULL CHECK (role IN ('user', 'agent')),
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (session_id, seq)
  ) STRICT;

  CREATE INDEX normalized_messages_by_session
    ON normalized_messages (session_id, seq);
  `,

  // Version 2: application sessions, for device pairing. The PRD's data model
  // (3.6) has no table for these, so TASK_013 adds one. It holds no credential:
  // only the SHA-256 hash of a session token, so reading this file yields
  // nothing that can be replayed as a cookie.
  `
  CREATE TABLE app_sessions (
    id           TEXT PRIMARY KEY,
    token_hash   TEXT NOT NULL UNIQUE,
    label        TEXT,
    created_at   TEXT NOT NULL,
    last_used_at TEXT NOT NULL,
    expires_at   TEXT NOT NULL,
    revoked_at   TEXT
  ) STRICT;

  CREATE INDEX app_sessions_by_token ON app_sessions (token_hash);
  `,
];

/** One stored conversation. */
export interface SessionRecord {
  id: string;
  provider: string;
  /** The provider's own conversation id, which `--resume` needs. */
  providerSessionId: string | undefined;
  workspaceDir: string;
  title: string | undefined;
  model: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSessionInput {
  workspaceDir: string;
  provider?: string | undefined;
  title?: string | undefined;
}

interface SessionRow {
  id: string;
  provider: string;
  provider_session_id: string | null;
  workspace_dir: string;
  title: string | null;
  model: string | null;
  created_at: string;
  updated_at: string;
}

function toSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    provider: row.provider,
    providerSessionId: row.provider_session_id ?? undefined,
    workspaceDir: row.workspace_dir,
    title: row.title ?? undefined,
    model: row.model ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** One stored message. */
export interface MessageRecord {
  id: string;
  sessionId: string;
  /** Position within the conversation, from 1. Ordering never uses timestamps. */
  seq: number;
  role: MessageRole;
  content: string;
  createdAt: string;
}

export type MessageRole = 'user' | 'agent';

export interface AppendMessageInput {
  role: MessageRole;
  content: string;
}

export interface RecordProviderSessionInput {
  providerSessionId: string;
  model?: string | undefined;
}

/** Longest stored conversation title, including the ellipsis. */
export const TITLE_LIMIT = 80;

interface MessageRow {
  id: string;
  session_id: string;
  seq: number;
  role: MessageRole;
  content: string;
  created_at: string;
}

function toMessage(row: MessageRow): MessageRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    seq: row.seq,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
}

/**
 * A one-line name for a conversation, taken from its first message.
 *
 * Collapses whitespace so a pasted block does not become a ragged title, and
 * truncates on a word boundary where there is one close enough to the limit.
 */
export function titleFrom(content: string): string {
  const flat = content.replace(/\s+/gu, ' ').trim();
  if (flat.length <= TITLE_LIMIT) return flat;

  const clipped = flat.slice(0, TITLE_LIMIT - 1);
  const lastSpace = clipped.lastIndexOf(' ');
  const body = lastSpace > TITLE_LIMIT / 2 ? clipped.slice(0, lastSpace) : clipped;
  return `${body.trimEnd()}…`;
}

/** One paired browser. Holds no credential, only the hash of one. */
export interface AppSessionRecord {
  id: string;
  /** SHA-256 of the session token. The token itself is never stored. */
  tokenHash: string;
  label: string | undefined;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
}

export interface CreateAppSessionInput {
  tokenHash: string;
  /** A short, sanitised hint about the device, for the owner's own benefit. */
  label: string | null;
  expiresAt: string;
}

interface AppSessionRow {
  id: string;
  token_hash: string;
  label: string | null;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  revoked_at: string | null;
}

function toAppSession(row: AppSessionRow): AppSessionRecord {
  return {
    id: row.id,
    tokenHash: row.token_hash,
    label: row.label ?? undefined,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
  };
}

export interface Store {
  schemaVersion(): number;
  pragma(name: string): unknown;
  /** Set a pragma. Present so tests can forge a database from the future. */
  pragmaSet(statement: string): void;
  createSession(input: CreateSessionInput): SessionRecord;
  listSessions(): SessionRecord[];
  getSession(id: string): SessionRecord | undefined;
  /** Record the provider's conversation id, which `--resume` needs after a restart. */
  recordProviderSession(id: string, input: RecordProviderSessionInput): void;
  appendMessage(sessionId: string, input: AppendMessageInput): MessageRecord;
  listMessages(sessionId: string): MessageRecord[];

  /** Store a paired browser. `tokenHash` is a hash; never pass a token. */
  createAppSession(input: CreateAppSessionInput): AppSessionRecord;
  /**
   * Look up a live session by token hash.
   *
   * Returns nothing when the session is unknown, revoked, past `expires_at`, or
   * — when `idleCutoff` is given — last used before that moment.
   */
  findAppSession(tokenHash: string, now: string, idleCutoff?: string): AppSessionRecord | undefined;
  /** Move a session's idle deadline forward. */
  touchAppSession(id: string, at: string): void;
  revokeAppSession(id: string, at: string): void;
  /** Revoke every session. The control for a lost device. */
  revokeAllAppSessions(at: string): void;
  /** How many sessions could still log in, which decides whether to offer pairing. */
  countActiveAppSessions(now: string): number;

  /** Every stored value as text. For tests that assert a secret is absent. */
  debugDump(): string;

  close(): void;
}

/**
 * Open the conversation store, creating and migrating it if needed.
 *
 * The directory is created `0700` and the database `0600`: this file holds the
 * whole of the owner's conversation history, and the same directory is where a
 * credential would later live.
 */
export interface OpenStoreOptions {
  /**
   * Source of timestamps, as an ISO 8601 string. Defaults to the system clock.
   *
   * Injected so the ordering rules can be tested. Real timestamps tie inside a
   * millisecond, which hides whether a conversation is ordered by its sequence
   * or merely by the order rows happen to come back in.
   */
  now?: (() => string) | undefined;
}

export function openStore(path: string, options: OpenStoreOptions = {}): Store {
  const now = options.now ?? (() => new Date().toISOString());
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  // mkdir's mode is masked by the process umask, so set it explicitly.
  chmodSync(dirname(path), 0o700);

  const db = new Database(path);
  chmodSync(path, 0o600);

  db.pragma('journal_mode = WAL');
  // better-sqlite3 already enables foreign keys, so this is belt and braces
  // rather than the thing that makes them work: removing it breaks no test,
  // which was verified by removing it. It stays because the setting is
  // per-connection rather than stored in the file, so a future change of driver
  // or a raw connection would otherwise silently drop enforcement.
  db.pragma('foreign_keys = ON');

  migrate(db);

  const insertSession = db.prepare<[string, string, string, string | null, string, string]>(
    `INSERT INTO agent_sessions
       (id, provider, workspace_dir, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const selectSessions = db.prepare(
    `SELECT * FROM agent_sessions ORDER BY updated_at DESC, created_at DESC`,
  );
  const selectSession = db.prepare<[string]>(`SELECT * FROM agent_sessions WHERE id = ?`);
  const updateProviderSession = db.prepare<[string, string | null, string, string]>(
    `UPDATE agent_sessions
        SET provider_session_id = ?,
            model = COALESCE(?, model),
            updated_at = ?
      WHERE id = ?`,
  );
  const insertMessage = db.prepare<[string, string, number, string, string, string]>(
    `INSERT INTO normalized_messages (id, session_id, seq, role, content, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const selectMessages = db.prepare<[string]>(
    `SELECT * FROM normalized_messages WHERE session_id = ? ORDER BY seq`,
  );
  const nextSeq = db.prepare<[string]>(
    `SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM normalized_messages WHERE session_id = ?`,
  );
  const touchSession = db.prepare<[string, string]>(
    `UPDATE agent_sessions SET updated_at = ? WHERE id = ?`,
  );
  const titleSession = db.prepare<[string, string]>(
    `UPDATE agent_sessions SET title = ? WHERE id = ? AND title IS NULL`,
  );

  const insertAppSession = db.prepare<[string, string, string | null, string, string, string]>(
    `INSERT INTO app_sessions (id, token_hash, label, created_at, last_used_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  // Revoked and expired sessions are filtered in SQL, so a caller cannot forget
  // to check either one.
  const selectAppSession = db.prepare<[string, string]>(
    `SELECT * FROM app_sessions
      WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?`,
  );
  const touchAppSession = db.prepare<[string, string]>(
    `UPDATE app_sessions SET last_used_at = ? WHERE id = ?`,
  );
  const revokeAppSession = db.prepare<[string, string]>(
    `UPDATE app_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`,
  );
  const revokeAllAppSessions = db.prepare<[string]>(
    `UPDATE app_sessions SET revoked_at = ? WHERE revoked_at IS NULL`,
  );
  const countAppSessions = db.prepare<[string]>(
    `SELECT COUNT(*) AS count FROM app_sessions
      WHERE revoked_at IS NULL AND expires_at > ?`,
  );

  /**
   * Append a message, bump the session and name it if it has no name yet.
   *
   * All of it in one transaction: a stored message whose session still looks
   * untouched would sort to the bottom of the conversation list and be lost to
   * the owner even though it is on disk.
   */
  const appendMessage = db.transaction(
    (sessionId: string, input: AppendMessageInput): MessageRecord => {
      const { seq } = nextSeq.get(sessionId) as { seq: number };
      const stamp = now();
      const id = randomUUID();

      insertMessage.run(id, sessionId, seq, input.role, input.content, stamp);
      touchSession.run(stamp, sessionId);
      // Only the opening message of a conversation names it, and only a message
      // the owner wrote. `AND title IS NULL` in the statement keeps a title
      // chosen at creation, and stops a later message renaming the thread.
      if (input.role === 'user') titleSession.run(titleFrom(input.content), sessionId);

      return { id, sessionId, seq, role: input.role, content: input.content, createdAt: stamp };
    },
  );

  return {
    schemaVersion: () => Number(db.pragma('user_version', { simple: true })),
    pragma: (name) => db.pragma(name, { simple: true }),
    pragmaSet: (statement) => {
      db.pragma(statement);
    },

    createSession(input) {
      const stamp = now();
      const id = randomUUID();
      const provider = input.provider ?? 'claude-code';
      insertSession.run(id, provider, input.workspaceDir, input.title ?? null, stamp, stamp);
      return {
        id,
        provider,
        providerSessionId: undefined,
        workspaceDir: input.workspaceDir,
        title: input.title,
        model: undefined,
        createdAt: stamp,
        updatedAt: stamp,
      };
    },

    listSessions: () => (selectSessions.all() as SessionRow[]).map(toSession),

    getSession(id) {
      const row = selectSession.get(id) as SessionRow | undefined;
      return row === undefined ? undefined : toSession(row);
    },

    recordProviderSession(id, input) {
      updateProviderSession.run(input.providerSessionId, input.model ?? null, now(), id);
    },

    appendMessage: (sessionId, input) => appendMessage(sessionId, input),

    listMessages: (sessionId) => (selectMessages.all(sessionId) as MessageRow[]).map(toMessage),

    createAppSession(input) {
      const stamp = now();
      const id = randomUUID();
      insertAppSession.run(id, input.tokenHash, input.label, stamp, stamp, input.expiresAt);
      return {
        id,
        tokenHash: input.tokenHash,
        label: input.label ?? undefined,
        createdAt: stamp,
        lastUsedAt: stamp,
        expiresAt: input.expiresAt,
      };
    },

    findAppSession(tokenHash, at, idleCutoff) {
      const row = selectAppSession.get(tokenHash, at) as AppSessionRow | undefined;
      if (row === undefined) return undefined;
      // The idle rule is applied here rather than in SQL so that "no idle limit"
      // is expressible without a second query.
      if (idleCutoff !== undefined && row.last_used_at < idleCutoff) return undefined;
      return toAppSession(row);
    },

    touchAppSession(id, at) {
      touchAppSession.run(at, id);
    },

    revokeAppSession(id, at) {
      revokeAppSession.run(at, id);
    },

    revokeAllAppSessions(at) {
      revokeAllAppSessions.run(at);
    },

    countActiveAppSessions(at) {
      const row = countAppSessions.get(at) as { count: number };
      return row.count;
    },

    debugDump: () =>
      JSON.stringify([
        selectSessions.all(),
        db.prepare('SELECT * FROM normalized_messages').all(),
        db.prepare('SELECT * FROM app_sessions').all(),
      ]),

    close: () => {
      db.close();
    },
  };
}

/**
 * Bring the database up to {@link SCHEMA_VERSION}.
 *
 * A database newer than this build is refused rather than used: running an old
 * build against a new schema would be a silent wrong-answer machine, and the
 * honest failure is the one that says to upgrade.
 */
function migrate(db: Database.Database): void {
  const current = Number(db.pragma('user_version', { simple: true }));

  if (current > MIGRATIONS.length) {
    throw new Error(
      `This database is at schema version ${String(current)}, but this build only understands ${String(MIGRATIONS.length)}. Upgrade Quack Command Center, or point DATA_DIR at a different directory.`,
    );
  }

  for (let version = current; version < MIGRATIONS.length; version += 1) {
    const sql = MIGRATIONS[version];
    if (sql === undefined) continue;
    // One transaction per migration, with the version bump inside it, so the
    // file is never left claiming a version it did not finish applying.
    db.exec(`BEGIN; ${sql}; PRAGMA user_version = ${String(version + 1)}; COMMIT;`);
  }
}
