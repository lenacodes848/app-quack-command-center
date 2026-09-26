import { createReadStream, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { runClaudeTurn, type ClaudeEvent, type ClaudeTurnOptions } from '@quack/adapter';
import type { AppSessionRecord, Store } from '@quack/storage';
import {
  buildSessionCookie,
  canHoldSecureCookie,
  constantTimeEquals,
  createPairingMode,
  CSRF_COOKIE,
  CSRF_HEADER,
  deviceLabel,
  generateToken,
  hashToken,
  IDLE_TTL_MS,
  isSameOrigin,
  parseCookies,
  securityHeaders,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  TOUCH_INTERVAL_MS,
  type PairingMode,
  type RandomBytes,
} from './auth.js';

export type TurnRunner = (options: ClaudeTurnOptions) => AsyncGenerator<ClaudeEvent>;

export interface AppOptions {
  /** Directory the agent runs in. Never the dashboard's own source tree. */
  workspaceDir: string;
  /** Built web application to serve, when it exists. */
  webDir?: string | undefined;
  /** Injected so tests can drive a fake CLI instead of spending quota. */
  runTurn?: TurnRunner | undefined;
  /**
   * Where conversations and paired devices are kept. Required.
   *
   * It used to be optional, documented as a way to run "without persistence".
   * That mode never worked once authentication landed: sessions live in the
   * store, so without one nothing could pair and every `/api` route answered
   * 401 — a server that served the static page and a liveness probe and nothing
   * else. Requiring it deletes that dead path along with six optional-chain
   * call sites and a 503 branch no caller could reach.
   */
  store: Store;
  /**
   * The pairing window. Injected so tests can open it without reading a file.
   * One is created with the real clock when this is omitted.
   */
  pairing?: PairingMode | undefined;
  /** Injected so expiry can be tested without waiting for ninety days. */
  now?: (() => number) | undefined;
  /** Injected so a test can predict a token. */
  randomBytes?: RandomBytes | undefined;
}

/** Largest request body accepted, so a stray request cannot exhaust memory. */
export const MAX_BODY_BYTES = 100_000;

/**
 * Thrown when a body exceeds {@link MAX_BODY_BYTES}.
 *
 * A distinct type because the alternative was indistinguishable from a parse
 * failure: both call sites read the body inside the `try` whose `catch` exists
 * for `JSON.parse`, so an oversized — but perfectly valid — body came back as
 * "Body must be JSON." That sends the owner hunting for a syntax error that is
 * not there and never mentions that a limit exists.
 */
export class BodyTooLargeError extends Error {
  constructor() {
    super(`Request body exceeds ${String(MAX_BODY_BYTES)} bytes.`);
    this.name = 'BodyTooLargeError';
  }
}

/**
 * Appended to a stored answer that the client stopped reading part-way through.
 *
 * Chosen over a schema column for now: `normalized_messages` would need a
 * migration and the UI a new state, whereas the transcript already exists to
 * record what went wrong. If interrupted turns later need rendering differently,
 * that is the point to add the column.
 */
export const TRUNCATED_NOTE = '[The connection was lost before this answer finished.]';

/** The 413 body, with the limit named so the owner can act on it. */
function sendTooLarge(response: ServerResponse): void {
  sendJson(response, 413, {
    error: `That message is too large. The limit is ${String(MAX_BODY_BYTES)} bytes.`,
  });
}

const CONTENT_TYPES = new Map<string, string>([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.ico', 'image/x-icon'],
  ['.woff2', 'font/woff2'],
]);

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new BodyTooLargeError();
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Resolve a URL path inside the served directory.
 *
 * Returns undefined for anything that escapes the root. Serving a built
 * front-end is the one place this server touches the filesystem on behalf of
 * a request, so traversal is checked here rather than trusted from the URL.
 */
export function resolveStaticPath(webDir: string, urlPath: string): string | undefined {
  const decoded = (() => {
    try {
      return decodeURIComponent(urlPath);
    } catch {
      return undefined;
    }
  })();
  if (decoded === undefined || decoded.includes('\0')) return undefined;

  const root = resolve(webDir);
  const candidate = resolve(join(root, normalize(decoded)));
  if (candidate !== root && !candidate.startsWith(root + sep)) return undefined;
  return candidate;
}

function serveStatic(webDir: string, urlPath: string, response: ServerResponse): boolean {
  const target = resolveStaticPath(webDir, urlPath === '/' ? '/index.html' : urlPath);
  if (target === undefined) return false;

  const file =
    existsSync(target) && statSync(target).isFile() ? target : join(resolve(webDir), 'index.html');
  if (!existsSync(file)) return false;

  response.writeHead(200, {
    'content-type': CONTENT_TYPES.get(extname(file)) ?? 'application/octet-stream',
  });
  createReadStream(file).pipe(response);
  return true;
}

/**
 * Stream one turn to the client as newline-delimited JSON.
 *
 * NDJSON rather than a single JSON response because the whole point is that
 * text appears while the agent is still working. Headers are flushed before
 * the first event so the browser starts reading immediately.
 */
async function streamTurn(
  response: ServerResponse,
  events: AsyncGenerator<ClaudeEvent>,
  onSession: (sessionId: string, model: string | undefined) => void,
  onReply: (text: string) => void,
): Promise<void> {
  response.writeHead(200, {
    'content-type': 'application/x-ndjson; charset=utf-8',
    'cache-control': 'no-store',
    'x-accel-buffering': 'no',
  });

  // The transcript keeps one message per turn rather than one per streamed
  // chunk, so the pieces are gathered here and written down once the turn ends.
  const spoken: string[] = [];
  let failure: string | undefined;
  /** Set when the loop stopped because the client vanished, not because the turn ended. */
  let truncated = false;

  // Writing to a destroyed response emits 'error', and with no listener that
  // surfaces as an unhandled stream error and takes the process down. There is
  // nothing to do about it here beyond not dying: the client is gone.
  response.on('error', () => {
    // Deliberately empty. The loop below notices via `destroyed`.
  });

  // Read through a function rather than the property directly. TypeScript
  // narrows `response.destroyed` to false after the first check and does not
  // widen it again across an await, so a second direct check is reported as
  // always-falsy dead code — when in fact the await is exactly when it changes.
  const clientGone = (): boolean => response.destroyed;

  try {
    for await (const event of events) {
      if (clientGone()) {
        truncated = true;
        break;
      }
      if (event.type === 'session') onSession(event.sessionId, event.model);
      if (event.type === 'text') spoken.push(event.text);
      if (event.type === 'error') failure = event.message;
      if (!response.write(`${JSON.stringify(event)}\n`)) {
        // Waiting on 'drain' alone never settles when the socket has died, and
        // the caller's `finally` — the one that frees the single turn slot —
        // then never runs, so every later turn answers 409 until a restart.
        // Racing the close and error events is what bounds this wait to the
        // life of the connection.
        await new Promise<void>((resolve) => {
          const done = (): void => {
            // All three come off, not just the one that fired. `once` removes
            // only the handler it invoked, so leaving the others attached leaks
            // two listeners per backpressure cycle — which Node reports as a
            // possible memory leak once a long answer passes ten of them.
            response.off('drain', done);
            response.off('close', done);
            response.off('error', done);
            resolve();
          };
          response.once('drain', done);
          response.once('close', done);
          response.once('error', done);
        });
        if (clientGone()) {
          truncated = true;
          break;
        }
      }
    }
  } catch (thrown) {
    const message = thrown instanceof Error ? thrown.message : 'The turn failed.';
    failure = message;
    response.write(`${JSON.stringify({ type: 'error', message })}\n`);
  }

  // A failed turn is still recorded. The owner asked a question; a transcript
  // that omits what went wrong reads as though it was never asked.
  //
  // A turn cut short by a hangup is recorded too, but it has to say so. Stored
  // bare, whatever streamed before the disconnect is indistinguishable from a
  // complete short answer, so reopening the conversation shows a confident
  // half-sentence — and the agent's own context and the transcript then disagree
  // about what was said, because the next turn resumes by provider session id.
  let reply = spoken.join('').trim() === '' ? (failure ?? '') : spoken.join('');
  if (truncated) {
    reply = reply === '' ? TRUNCATED_NOTE : `${reply}\n\n${TRUNCATED_NOTE}`;
  }
  if (reply !== '') onReply(reply);

  response.end();
}

/**
 * The dashboard's HTTP surface.
 *
 * Holds which conversation is currently open, and writes every turn to the
 * store as it happens so a restart resumes rather than forgets. With no store
 * it keeps the old in-memory behaviour, where a restart loses the thread.
 */
export function createApp(options: AppOptions) {
  const runTurn = options.runTurn ?? runClaudeTurn;
  const store = options.store;
  const now = options.now ?? (() => Date.now());
  const pairing = options.pairing ?? createPairingMode({ now });
  const randomBytes = options.randomBytes;
  /** The provider's conversation id for the open conversation. */
  let providerSessionId: string | undefined;
  /** Our own id for the open conversation, when there is a store. */
  let storedSessionId: string | undefined;
  let busy = false;

  /**
   * The session this request belongs to, or undefined.
   *
   * Looked up by the hash of the presented token, so nothing here compares
   * secrets, and both expiry rules are applied by the store.
   */
  const authenticate = (request: IncomingMessage): AppSessionRecord | undefined => {
    const token = parseCookies(request.headers.cookie).get(SESSION_COOKIE);
    if (token === undefined || token === '') return undefined;

    const at = now();
    const session = store.findAppSession(
      hashToken(token),
      new Date(at).toISOString(),
      new Date(at - IDLE_TTL_MS).toISOString(),
    );
    if (session === undefined) return undefined;

    // Slide the idle window, but not on every single request: a busy session
    // would otherwise cause a write per request for no benefit.
    if (at - Date.parse(session.lastUsedAt) > TOUCH_INTERVAL_MS) {
      store.touchAppSession(session.id, new Date(at).toISOString());
    }
    return session;
  };

  return function handle(request: IncomingMessage, response: ServerResponse): void {
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const path = url.pathname;

      // Set on everything, including refusals and static files: a header that
      // only appears on success protects only the pages that did not need it.
      // A proxy may send this more than once; take the first, since that is the
      // hop nearest the client.
      const rawProto = request.headers['x-forwarded-proto'];
      const forwardedProto = Array.isArray(rawProto) ? rawProto[0] : rawProto;
      for (const [name, value] of Object.entries(
        securityHeaders({ https: forwardedProto === 'https' }),
      )) {
        response.setHeader(name, value);
      }

      // Liveness only. Deliberately says nothing about whether anyone is paired
      // or what is running, because it answers before authentication.
      if (path === '/api/health') {
        sendJson(response, 200, { ok: true });
        return;
      }

      if (path === '/api/pair') {
        if (request.method !== 'POST') {
          sendJson(response, 405, { error: 'Use POST.' });
          return;
        }
        let code: string;
        try {
          const parsed: unknown = JSON.parse(await readBody(request));
          const value =
            typeof parsed === 'object' && parsed !== null
              ? (parsed as Record<string, unknown>)['code']
              : undefined;
          if (typeof value !== 'string') {
            sendJson(response, 400, { error: 'Send { "code": "..." }.' });
            return;
          }
          code = value;
        } catch (thrown) {
          if (thrown instanceof BodyTooLargeError) sendTooLarge(response);
          else sendJson(response, 400, { error: 'Body must be JSON.' });
          return;
        }

        // Checked BEFORE verifying, so a code is never spent on a request that
        // provably cannot succeed. 421 Misdirected Request: the code may be
        // perfectly good, it just arrived somewhere the session cannot live.
        if (!canHoldSecureCookie({ host: request.headers.host, forwardedProto })) {
          sendJson(response, 421, {
            error:
              'Open the dashboard at http://127.0.0.1:4317 or over HTTPS. This address cannot keep the session cookie, so pairing here would appear to work and then fail. Your code is unused.',
          });
          return;
        }

        const outcome = pairing.verify(code);
        if (outcome === 'locked') {
          sendJson(response, 429, { error: 'Too many attempts. Wait, then pair again.' });
          return;
        }
        if (outcome !== 'ok') {
          // One message for a wrong code and for pairing not being open, so a
          // caller learns nothing about when to start guessing.
          sendJson(response, 401, { error: 'Pairing failed.' });
          return;
        }

        const at = now();
        const token = generateToken(randomBytes);
        const csrf = generateToken(randomBytes);
        store.createAppSession({
          tokenHash: hashToken(token),
          label: deviceLabel(request.headers['user-agent']),
          expiresAt: new Date(at + SESSION_TTL_MS).toISOString(),
        });
        // The CSRF token is not stored: it only ever has to match itself between
        // a readable cookie and a header, which is what makes the pair useless
        // to a site that can send neither.
        response.setHeader('set-cookie', [
          buildSessionCookie(token, SESSION_TTL_MS),
          buildSessionCookie(csrf, SESSION_TTL_MS, { name: CSRF_COOKIE, httpOnly: false }),
        ]);
        sendJson(response, 200, { ok: true });
        return;
      }

      // Everything past here needs a session.
      const session = authenticate(request);
      const isApi = path.startsWith('/api/');

      if (isApi && session === undefined) {
        sendJson(response, 401, { error: 'Not paired.' });
        return;
      }

      // Anything that changes state must prove it came from the dashboard. The
      // cookie is SameSite=Strict already; this is the layer that does not rely
      // on the browser honouring that.
      if (isApi && request.method !== 'GET' && request.method !== 'HEAD') {
        const sameOrigin = isSameOrigin({
          origin: request.headers.origin,
          host: request.headers.host,
          secFetchSite: request.headers['sec-fetch-site'],
        });
        const presented = request.headers[CSRF_HEADER];
        const expected = parseCookies(request.headers.cookie).get(CSRF_COOKIE);
        const tokenOk =
          typeof presented === 'string' &&
          expected !== undefined &&
          expected !== '' &&
          constantTimeEquals(presented, expected);

        if (!sameOrigin || !tokenOk) {
          sendJson(response, 403, { error: 'Request rejected.' });
          return;
        }
      }

      if (path === '/api/me' && request.method === 'GET') {
        sendJson(response, 200, {
          paired: true,
          device: session?.label ?? null,
          session: providerSessionId ?? null,
          storedSession: storedSessionId ?? null,
        });
        return;
      }

      if (path === '/api/pairing-code' && request.method === 'POST') {
        const code = pairing.open();
        sendJson(response, 200, {
          code,
          expiresAt: new Date(pairing.expiresAt() ?? now()).toISOString(),
        });
        return;
      }

      if (path === '/api/logout' && request.method === 'POST') {
        if (session !== undefined)
          store.revokeAppSession(session.id, new Date(now()).toISOString());
        response.setHeader('set-cookie', [
          buildSessionCookie('', 0),
          buildSessionCookie('', 0, { name: CSRF_COOKIE, httpOnly: false }),
        ]);
        sendJson(response, 200, { ok: true });
        return;
      }

      if (path === '/api/logout-all' && request.method === 'POST') {
        store.revokeAllAppSessions(new Date(now()).toISOString());
        response.setHeader('set-cookie', [
          buildSessionCookie('', 0),
          buildSessionCookie('', 0, { name: CSRF_COOKIE, httpOnly: false }),
        ]);
        sendJson(response, 200, { ok: true });
        return;
      }

      if (path === '/api/session' && request.method === 'DELETE') {
        // Starts a new conversation. It does not delete the stored one: removing
        // saved conversations is a destructive act the owner has to ask for.
        providerSessionId = undefined;
        storedSessionId = undefined;
        sendJson(response, 200, { ok: true });
        return;
      }

      if (path === '/api/sessions' && request.method === 'GET') {
        const sessions = store.listSessions().map((session) => ({
          id: session.id,
          title: session.title ?? 'Untitled conversation',
          model: session.model ?? null,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        }));
        sendJson(response, 200, { sessions });
        return;
      }

      const openMatch = /^\/api\/sessions\/([\w-]+)$/u.exec(path);
      if (openMatch !== null && request.method === 'GET') {
        const wanted = openMatch[1] ?? '';
        const session = store.getSession(wanted);
        if (session === undefined) {
          sendJson(response, 404, { error: 'No such conversation.' });
          return;
        }
        sendJson(response, 200, {
          id: session.id,
          title: session.title ?? 'Untitled conversation',
          model: session.model ?? null,
          messages: store.listMessages(session.id),
        });
        return;
      }

      if (path === '/api/turn') {
        if (request.method !== 'POST') {
          sendJson(response, 405, { error: 'Use POST.' });
          return;
        }
        // One turn at a time, and the slot is claimed HERE — before the body is
        // read, not after. Reading the body is an await, and a check on one side
        // of an await with the set on the other is a race: two requests whose
        // bodies arrive in a second segment, which is what any slow link does,
        // both pass the check. That admitted two `claude` processes into one
        // workspace, interleaved their streams, and raced on both session ids
        // and on the transcript. Every early return below therefore has to
        // release the slot, which is what the `finally` is for.
        if (busy) {
          sendJson(response, 409, { error: 'A turn is already running.' });
          return;
        }
        busy = true;

        // If the client goes away mid-answer, stop the agent rather than leaving
        // it to finish for nobody and spend quota doing it.
        //
        // This listens to the RESPONSE closing, not the request. The request
        // stream emits 'close' as soon as its body has been read, which is the
        // normal path — listening there aborted every turn the moment the body
        // arrived, killing the real `claude` process immediately. The fake
        // runners in the tests ignore the signal, so only the live product would
        // have shown it. `writableFinished` is what distinguishes a connection
        // that died early from a response that simply finished.
        const aborter = new AbortController();
        response.once('close', () => {
          if (!response.writableFinished) aborter.abort();
        });

        try {
          let prompt: string;
          let wantedSession: string | undefined;
          try {
            const parsed: unknown = JSON.parse(await readBody(request));
            const body =
              typeof parsed === 'object' && parsed !== null
                ? (parsed as Record<string, unknown>)
                : {};
            const text = body['text'];
            if (typeof text !== 'string' || text.trim() === '') {
              sendJson(response, 400, {
                error: 'Send { "text": "..." } with a non-empty message.',
              });
              return;
            }
            prompt = text;
            if (typeof body['sessionId'] === 'string') wantedSession = body['sessionId'];
          } catch (thrown) {
            if (thrown instanceof BodyTooLargeError) sendTooLarge(response);
            else sendJson(response, 400, { error: 'Body must be JSON.' });
            return;
          }

          // Continuing a stored conversation, perhaps one from before a restart.
          // Its provider id comes from the store rather than from memory, which is
          // the whole point of writing it down.
          if (wantedSession !== undefined && wantedSession !== storedSessionId) {
            const existing = store.getSession(wantedSession);
            if (existing === undefined) {
              sendJson(response, 404, { error: 'No such conversation.' });
              return;
            }
            storedSessionId = existing.id;
            providerSessionId = existing.providerSessionId;
          }

          // A conversation always exists from here on: either one was named and
          // found, or one is created now. That is what makes the write below
          // unconditional — it used to be guarded, which only looked necessary
          // while a store-less app was a possibility.
          storedSessionId ??= store.createSession({ workspaceDir: options.workspaceDir }).id;

          // Written before the turn runs. If the process dies mid-answer the
          // question is still in the transcript, which is the honest record.
          store.appendMessage(storedSessionId, { role: 'user', content: prompt });

          await streamTurn(
            response,
            runTurn({
              prompt,
              cwd: options.workspaceDir,
              sessionId: providerSessionId,
              signal: aborter.signal,
            }),
            (id, model) => {
              providerSessionId = id;
              if (storedSessionId !== undefined) {
                store.recordProviderSession(storedSessionId, {
                  providerSessionId: id,
                  model,
                });
              }
            },
            (text) => {
              if (storedSessionId !== undefined) {
                store.appendMessage(storedSessionId, { role: 'agent', content: text });
              }
            },
          );
        } finally {
          busy = false;
        }
        return;
      }

      // Anything under /api that got this far is an unknown endpoint. It must
      // not fall through to the single-page-app fallback, or a typo in a fetch
      // call comes back as 200 and a page of HTML instead of a clear 404.
      if (options.webDir !== undefined && request.method === 'GET' && !path.startsWith('/api/')) {
        if (serveStatic(options.webDir, path, response)) return;
      }

      sendJson(response, 404, { error: 'Not found.' });
    })().catch(() => {
      if (!response.headersSent) sendJson(response, 500, { error: 'Internal error.' });
      else response.end();
    });
  };
}
