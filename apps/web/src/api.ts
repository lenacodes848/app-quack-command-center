/**
 * Events the server streams for one turn.
 *
 * Structurally the adapter's `ClaudeEvent`. Declared again here rather than
 * imported so the browser bundle does not pull in a Node package for the sake
 * of a type; the server's tests pin the wire shape.
 */
export type TurnEvent =
  | { type: 'session'; sessionId: string; model?: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'result'; text: string; isError: boolean }
  | { type: 'error'; message: string };

/**
 * Split a stream of text chunks into whole lines.
 *
 * A chunk boundary can land mid-line, so a partial line is held back until the
 * rest arrives. Dropping that buffer is the classic way a streaming client
 * silently loses the last message of a turn.
 */
export async function* toLines(chunks: AsyncIterable<string>): AsyncGenerator<string> {
  let buffer = '';
  for await (const chunk of chunks) {
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      yield buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
  }
  if (buffer.trim() !== '') yield buffer;
}

/** Parse one NDJSON line, ignoring anything that is not a usable event. */
export function parseTurnEvent(line: string): TurnEvent | undefined {
  const trimmed = line.trim();
  if (trimmed === '') return undefined;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const type = (parsed as { type?: unknown }).type;
    if (typeof type !== 'string') return undefined;
    return parsed as TurnEvent;
  } catch {
    return undefined;
  }
}

async function* decode(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value, { stream: true });
    }
    const tail = decoder.decode();
    if (tail !== '') yield tail;
  } finally {
    reader.releaseLock();
  }
}

/** A saved conversation, as the sidebar shows it. */
export interface SavedSession {
  id: string;
  title: string;
  model: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A stored message, as the transcript replays it. */
export interface SavedMessage {
  role: 'user' | 'agent';
  content: string;
  seq: number;
}

export interface OpenedSession {
  id: string;
  title: string;
  messages: SavedMessage[];
}

/**
 * The saved conversations, newest first.
 *
 * A failure reads as an empty list rather than throwing: the sidebar is a
 * convenience, and it must not be able to take the conversation on screen down
 * with it.
 */
export async function listSessions(): Promise<SavedSession[]> {
  try {
    const response = await fetch('/api/sessions');
    if (!response.ok) return [];
    const parsed = (await response.json()) as { sessions?: SavedSession[] };
    return parsed.sessions ?? [];
  } catch {
    return [];
  }
}

/** One saved conversation with its messages, or undefined if it is gone. */
export async function openSession(id: string): Promise<OpenedSession | undefined> {
  try {
    const response = await fetch(`/api/sessions/${encodeURIComponent(id)}`);
    if (!response.ok) return undefined;
    return (await response.json()) as OpenedSession;
  } catch {
    return undefined;
  }
}

export interface SendTurnOptions {
  /** The stored conversation to continue. Omit to start a new one. */
  sessionId?: string | undefined;
  signal?: AbortSignal | undefined;
}

/** Send a message and stream the turn's events as they arrive. */
export async function* sendTurn(
  text: string,
  options: SendTurnOptions = {},
): AsyncGenerator<TurnEvent> {
  const response = await fetch('/api/turn', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(
      options.sessionId === undefined ? { text } : { text, sessionId: options.sessionId },
    ),
    signal: options.signal ?? null,
  });

  if (!response.ok || response.body === null) {
    const detail = await response.text().catch(() => '');
    let message = `The server returned ${String(response.status)}.`;
    try {
      const parsed: unknown = JSON.parse(detail);
      if (typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
        message = String(parsed.error);
      }
    } catch {
      // Keep the status-code message.
    }
    yield { type: 'error', message };
    return;
  }

  for await (const line of toLines(decode(response.body))) {
    const event = parseTurnEvent(line);
    if (event !== undefined) yield event;
  }
}
