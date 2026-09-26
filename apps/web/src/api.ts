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

/**
 * The CSRF token the server issued, read from its cookie.
 *
 * That cookie is deliberately readable by scripts: the whole double-submit
 * scheme is that the page can echo it in a header while a site that is not this
 * page can do neither.
 */
export function csrfToken(
  cookies: string = typeof document === 'undefined' ? '' : document.cookie,
): string | undefined {
  for (const part of cookies.split(';')) {
    const at = part.indexOf('=');
    if (at < 1) continue;
    if (part.slice(0, at).trim() === 'quack_csrf') return part.slice(at + 1).trim();
  }
  return undefined;
}

export type PairOutcome = 'paired' | 'rejected' | 'locked' | 'wrongAddress' | 'unavailable';

export interface PairResult {
  outcome: PairOutcome;
  /**
   * The server's own explanation, when it sent one worth showing.
   *
   * Only populated for `wrongAddress`, and deliberately so. That is the one case
   * where the server knows something the interface cannot work out: which
   * address was used and why it cannot hold the cookie. For a wrong code the
   * server answers a deliberately vague "Pairing failed." — vague on purpose, so
   * a caller learns nothing — and for a lockout it says less than the screen
   * does about how to get a new code. Preferring server text there would make
   * both messages worse.
   */
  detail?: string | undefined;
}

/**
 * Exchange a pairing code for a session.
 *
 * The failures are kept apart because the advice differs: a wrong code means try
 * again, a lockout means wait, a bad address means open a different one, and an
 * unreachable server means none of those. Collapsing the third into the fourth
 * is what made the server's careful 421 come out as "is it still running?".
 */
export async function pair(code: string): Promise<PairResult> {
  try {
    const response = await fetch('/api/pair', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (response.ok) return { outcome: 'paired' };
    if (response.status === 429) return { outcome: 'locked' };
    if (response.status === 401) return { outcome: 'rejected' };
    if (response.status === 421) {
      // 421 Misdirected Request: the code may be fine, it arrived somewhere the
      // session cannot live. The server's text names the address, so show it —
      // falling back to the screen's own wording if the body is unreadable.
      const detail = await response
        .json()
        .then((body: unknown) =>
          typeof body === 'object' &&
          body !== null &&
          typeof (body as { error?: unknown }).error === 'string'
            ? (body as { error: string }).error
            : undefined,
        )
        .catch(() => undefined);
      return detail === undefined
        ? { outcome: 'wrongAddress' }
        : { outcome: 'wrongAddress', detail };
    }
    return { outcome: 'unavailable' };
  } catch {
    return { outcome: 'unavailable' };
  }
}

export interface Me {
  paired: boolean;
  /** A short label for this device, so paired devices can be told apart. */
  device: string | null;
}

/** Who the server thinks we are, or undefined when this browser is not paired. */
export async function whoAmI(): Promise<Me | undefined> {
  try {
    const response = await fetch('/api/me');
    if (!response.ok) return undefined;
    return (await response.json()) as Me;
  } catch {
    return undefined;
  }
}

/**
 * Start a new conversation.
 *
 * Goes through here rather than a bare `fetch` so it carries the CSRF token;
 * without it the server refuses the request, which is how this was found.
 */
export async function startNewSession(): Promise<void> {
  const token = csrfToken();
  await fetch('/api/session', {
    method: 'DELETE',
    headers: token === undefined ? {} : { 'x-csrf-token': token },
  });
}

/** Log out. `everywhere` also ends sessions on devices you no longer have. */
export async function logout(everywhere = false): Promise<void> {
  const token = csrfToken();
  await fetch(everywhere ? '/api/logout-all' : '/api/logout', {
    method: 'POST',
    headers: token === undefined ? {} : { 'x-csrf-token': token },
  }).catch(() => undefined);
}

export interface SendTurnOptions {
  /** The stored conversation to continue. Omit to start a new one. */
  sessionId?: string | undefined;
  signal?: AbortSignal | undefined;
  /** Overrides the token read from the cookie. For tests. */
  csrf?: string | undefined;
}

/** Send a message and stream the turn's events as they arrive. */
export async function* sendTurn(
  text: string,
  options: SendTurnOptions = {},
): AsyncGenerator<TurnEvent> {
  const token = options.csrf ?? csrfToken();
  const response = await fetch('/api/turn', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // Without this the server refuses the request: it is the layer that does
      // not depend on the browser honouring SameSite.
      ...(token === undefined ? {} : { 'x-csrf-token': token }),
    },
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
