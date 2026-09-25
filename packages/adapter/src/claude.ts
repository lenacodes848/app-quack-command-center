import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

/**
 * A normalized event from one Claude Code turn.
 *
 * The CLI's stream-json output carries more than this, and its exact shape is
 * not a stable contract. Everything here is deliberately the smallest set the
 * dashboard needs to render a conversation, so an unrecognized upstream event
 * is ignored rather than crashing a session.
 */
export type ClaudeEvent =
  | { type: 'session'; sessionId: string; model: string | undefined }
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'result'; text: string; isError: boolean }
  | { type: 'error'; message: string };

export interface ClaudeTurnOptions {
  /** What to say to Claude this turn. */
  prompt: string;
  /** Working directory for the session. Never the dashboard's own directory. */
  cwd: string;
  /** Continue an existing conversation. Omit to start a new one. */
  sessionId?: string | undefined;
  /** Override the executable, which the tests use to run a fake. */
  binary?: string | undefined;
  /**
   * Remove the built-in tools that run commands or code, and ignore the
   * machine's user-level Claude configuration. Defaults to true; see
   * {@link DEFAULT_PERMISSION_MODE} for why the safe posture is the default.
   */
  restricted?: boolean | undefined;
  /** How much the agent may do without being asked. */
  permissionMode?: PermissionMode | undefined;
  /** Abort the turn early. */
  signal?: AbortSignal | undefined;
  /** The environment to derive the child's from. Defaults to this process's. */
  parentEnv?: NodeJS.ProcessEnv | undefined;
}

/** The permission modes the CLI accepts, as of 2.1.282. */
export type PermissionMode =
  'acceptEdits' | 'auto' | 'bypassPermissions' | 'manual' | 'dontAsk' | 'plan';

export const DEFAULT_BINARY = 'claude';

/**
 * Why edits are accepted rather than prompted.
 *
 * With `--print` there is no terminal to answer a permission prompt, and the
 * CLI's `--permission-prompts` defaults to `none`, which denies anything that
 * would ask. Left at the default the dashboard can hold a conversation and
 * cannot change a single file, which was confirmed against the real CLI: it
 * announced the Write tool and then reported the write refused.
 *
 * `acceptEdits` lets it edit files in the workspace it was given. It cannot
 * run commands, because restricted mode removes those tools entirely.
 */
export const DEFAULT_PERMISSION_MODE: PermissionMode = 'acceptEdits';

/**
 * Build the argv for one turn.
 *
 * Split out from the spawn so the flag contract can be tested without running
 * anything: an argv mistake here is the difference between a streaming session
 * and a hung process, and it costs real quota to discover at runtime.
 */
export function buildArgs(options: ClaudeTurnOptions): string[] {
  const args = ['--print', options.prompt, '--output-format', 'stream-json', '--verbose'];
  args.push('--permission-mode', options.permissionMode ?? DEFAULT_PERMISSION_MODE);
  // Opt out, not in. A dashboard turn that silently inherited the owner's own
  // configuration would arrive holding their personal skills and every
  // connector they have authorized, which is far more authority than asking a
  // question in a scratch workspace should carry.
  if (options.restricted !== false) {
    args.push('--restricted');
    // Restricted mode does not reach the connectors that belong to the
    // signed-in account, only the ones named in configuration files. Denying
    // the namespace is what actually removes them.
    args.push('--disallowedTools', DENY_ACCOUNT_CONNECTORS);
  }
  if (options.sessionId !== undefined) args.push('--resume', options.sessionId);
  return args;
}

/**
 * The tool pattern that removes the signed-in account's connectors.
 *
 * Measured against CLI 2.1.282, restricted mode alone still handed a turn 114
 * tools, among them the owner's Gmail, Google Drive, Google Calendar and
 * Blotato. Denying this namespace brought the same turn down to 21 tools with
 * Read and Write intact. Without it the dashboard would be able to read the
 * owner's mail, which is far more authority than a question typed into a
 * scratch workspace should carry — and it becomes a much sharper problem once
 * the dashboard is reachable from anywhere.
 */
export const DENY_ACCOUNT_CONNECTORS = 'mcp__*';

/**
 * Variables the child must not inherit.
 *
 * The dashboard may itself have been started from inside a Claude Code
 * session, and a plain spawn copies the whole environment. That would hand the
 * child its parent's session id and messaging socket, making it a participant
 * in a conversation it knows nothing about.
 */
function isOwnSessionVariable(key: string): boolean {
  return key === 'CLAUDECODE' || key === 'AI_AGENT' || key.startsWith('CLAUDE_CODE_');
}

/** The environment one turn runs with: the parent's, less the parent's session. */
export function childEnv(parentEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(parentEnv)) {
    if (!isOwnSessionVariable(key)) env[key] = value;
  }
  return env;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Translate one line of stream-json into zero or more normalized events.
 *
 * Returns an empty array for anything unrecognized — including a blank line or
 * malformed JSON — because a single odd line upstream must not take down a
 * live conversation. A caller that needs to see junk should log the raw line.
 */
export function parseEventLine(line: string): ClaudeEvent[] {
  const trimmed = line.trim();
  if (trimmed === '') return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }

  const event = asRecord(parsed);
  if (event === undefined) return [];

  switch (event['type']) {
    case 'system': {
      if (event['subtype'] !== 'init') return [];
      const sessionId = asString(event['session_id']);
      if (sessionId === undefined) return [];
      return [{ type: 'session', sessionId, model: asString(event['model']) }];
    }

    case 'assistant': {
      const message = asRecord(event['message']);
      const content = message?.['content'];
      if (!Array.isArray(content)) return [];
      const events: ClaudeEvent[] = [];
      for (const raw of content) {
        const block = asRecord(raw);
        if (block === undefined) continue;
        if (block['type'] === 'text') {
          const text = asString(block['text']);
          if (text !== undefined && text !== '') events.push({ type: 'text', text });
        } else if (block['type'] === 'tool_use') {
          const name = asString(block['name']);
          if (name !== undefined) events.push({ type: 'tool', name });
        }
      }
      return events;
    }

    case 'result': {
      const text = asString(event['result']) ?? '';
      return [{ type: 'result', text, isError: event['is_error'] === true }];
    }

    default:
      return [];
  }
}

/**
 * Run one turn and stream its normalized events.
 *
 * The process is spawned with stdin ignored and both output streams piped:
 * inheriting them would leak a session's content into the server's own logs.
 */
export async function* runClaudeTurn(options: ClaudeTurnOptions): AsyncGenerator<ClaudeEvent> {
  const child = spawn(options.binary ?? DEFAULT_BINARY, buildArgs(options), {
    cwd: options.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    signal: options.signal,
    env: childEnv(options.parentEnv ?? process.env),
  });

  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    // Bounded so a runaway process cannot grow this without limit.
    if (stderr.length < 64_000) stderr += chunk;
  });

  const exited = new Promise<{ code: number | null; failure: Error | undefined }>((resolve) => {
    child.once('error', (failure: Error) => {
      resolve({ code: null, failure });
    });
    child.once('close', (code) => {
      resolve({ code, failure: undefined });
    });
  });

  let sawResult = false;
  try {
    for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) {
      for (const event of parseEventLine(line)) {
        if (event.type === 'result') sawResult = true;
        yield event;
      }
    }
  } catch (failure) {
    yield {
      type: 'error',
      message: failure instanceof Error ? failure.message : 'Reading the turn failed.',
    };
    return;
  }

  const { code, failure } = await exited;

  if (failure !== undefined) {
    const missing = (failure as NodeJS.ErrnoException).code === 'ENOENT';
    yield {
      type: 'error',
      message: missing
        ? `Could not run "${options.binary ?? DEFAULT_BINARY}". Is Claude Code installed and on PATH?`
        : failure.message,
    };
    return;
  }

  // A non-zero exit with no result event means the turn produced nothing
  // usable. Surfacing stderr here is the difference between a debuggable
  // failure and a silent empty reply.
  if (code !== 0 && !sawResult) {
    const detail = stderr.trim();
    yield {
      type: 'error',
      message:
        detail === ''
          ? `Claude Code exited with status ${String(code)}.`
          : `Claude Code exited with status ${String(code)}: ${detail}`,
    };
  }
}
