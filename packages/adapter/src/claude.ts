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
  /** Remove the built-in tools that run commands or code. */
  restricted?: boolean | undefined;
  /** Abort the turn early. */
  signal?: AbortSignal | undefined;
}

export const DEFAULT_BINARY = 'claude';

/**
 * Build the argv for one turn.
 *
 * Split out from the spawn so the flag contract can be tested without running
 * anything: an argv mistake here is the difference between a streaming session
 * and a hung process, and it costs real quota to discover at runtime.
 */
export function buildArgs(options: ClaudeTurnOptions): string[] {
  const args = ['--print', options.prompt, '--output-format', 'stream-json', '--verbose'];
  if (options.sessionId !== undefined) args.push('--resume', options.sessionId);
  if (options.restricted === true) args.push('--restricted');
  return args;
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
