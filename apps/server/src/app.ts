import { createReadStream, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { runClaudeTurn, type ClaudeEvent, type ClaudeTurnOptions } from '@quack/adapter';

export type TurnRunner = (options: ClaudeTurnOptions) => AsyncGenerator<ClaudeEvent>;

export interface AppOptions {
  /** Directory the agent runs in. Never the dashboard's own source tree. */
  workspaceDir: string;
  /** Built web application to serve, when it exists. */
  webDir?: string | undefined;
  /** Injected so tests can drive a fake CLI instead of spending quota. */
  runTurn?: TurnRunner | undefined;
}

/** Largest prompt accepted, so a stray request cannot exhaust memory. */
const MAX_PROMPT_BYTES = 100_000;

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
    if (size > MAX_PROMPT_BYTES) throw new Error('Request body is too large.');
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
  onSession: (sessionId: string) => void,
): Promise<void> {
  response.writeHead(200, {
    'content-type': 'application/x-ndjson; charset=utf-8',
    'cache-control': 'no-store',
    'x-accel-buffering': 'no',
  });

  try {
    for await (const event of events) {
      if (event.type === 'session') onSession(event.sessionId);
      if (!response.write(`${JSON.stringify(event)}\n`)) {
        await new Promise((r) => response.once('drain', r));
      }
    }
  } catch (failure) {
    const message = failure instanceof Error ? failure.message : 'The turn failed.';
    response.write(`${JSON.stringify({ type: 'error', message })}\n`);
  }
  response.end();
}

/**
 * One in-memory conversation, no persistence.
 *
 * Deliberate for the first working version: restarting the server loses the
 * thread. Durable sessions are the job of the storage task.
 */
export function createApp(options: AppOptions) {
  const runTurn = options.runTurn ?? runClaudeTurn;
  let sessionId: string | undefined;
  let busy = false;

  return function handle(request: IncomingMessage, response: ServerResponse): void {
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const path = url.pathname;

      if (path === '/api/health') {
        sendJson(response, 200, { ok: true, session: sessionId ?? null });
        return;
      }

      if (path === '/api/session' && request.method === 'DELETE') {
        sessionId = undefined;
        sendJson(response, 200, { ok: true });
        return;
      }

      if (path === '/api/turn') {
        if (request.method !== 'POST') {
          sendJson(response, 405, { error: 'Use POST.' });
          return;
        }
        // One turn at a time. Two concurrent turns would interleave their
        // output and race on the session id.
        if (busy) {
          sendJson(response, 409, { error: 'A turn is already running.' });
          return;
        }

        let prompt: string;
        try {
          const parsed: unknown = JSON.parse(await readBody(request));
          const text =
            typeof parsed === 'object' && parsed !== null
              ? (parsed as Record<string, unknown>)['text']
              : undefined;
          if (typeof text !== 'string' || text.trim() === '') {
            sendJson(response, 400, { error: 'Send { "text": "..." } with a non-empty message.' });
            return;
          }
          prompt = text;
        } catch {
          sendJson(response, 400, { error: 'Body must be JSON.' });
          return;
        }

        busy = true;
        try {
          await streamTurn(
            response,
            runTurn({ prompt, cwd: options.workspaceDir, sessionId }),
            (id) => {
              sessionId = id;
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
