import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { runClaudeTurn } from '@quack/adapter';
import type { AppSessionRecord, Store } from '@quack/storage';
import { createAgentRegistry, summarize, type TurnRunner } from './agents.js';
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
import { createEventHub } from './events.js';
import { listProjects, prepareWorkspace, resolveProject, WorkspaceError } from './workspaces.js';

export type { TurnRunner } from './agents.js';

export interface AppOptions {
  /** The folders whose subdirectories agents may be launched in. */
  projectRoots: readonly string[];
  /** Where agents' git worktrees are created, under the data directory. */
  worktreesDir: string;
  /** How many agents may be working at once. Defaults to 4. */
  maxAgents?: number | undefined;
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

/** The models an agent may be launched with, besides the CLI's default. */
export const MODEL_CHOICES = ['opus', 'sonnet', 'haiku'] as const;

/** Longest agent name accepted. */
export const NAME_LIMIT = 80;

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
 * Read a JSON object body, answering the request itself when it cannot.
 *
 * Returns undefined once a 413 or 400 has been sent, so a caller only has to
 * stop. An oversized body is told apart from bad JSON, because "Body must be
 * JSON." sends the owner looking for a syntax error that is not there.
 */
async function readJsonObject(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<Record<string, unknown> | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readBody(request));
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    sendJson(response, 400, { error: 'Body must be a JSON object.' });
    return undefined;
  } catch (thrown) {
    if (thrown instanceof BodyTooLargeError) sendTooLarge(response);
    else sendJson(response, 400, { error: 'Body must be JSON.' });
    return undefined;
  }
}

/** An agent name from a request, whitespace collapsed, or an error to send. */
function readName(value: unknown): { name: string | undefined } | { error: string } {
  if (value === undefined || value === null) return { name: undefined };
  if (typeof value !== 'string') return { error: 'The name must be text.' };
  const name = value.replace(/\s+/gu, ' ').trim();
  if (name.length > NAME_LIMIT) {
    return { error: `The name is too long. The limit is ${String(NAME_LIMIT)} characters.` };
  }
  return { name: name === '' ? undefined : name };
}

/** The request handler, plus a way to stop the agents it is running. */
export type AppHandler = ((request: IncomingMessage, response: ServerResponse) => void) & {
  /** Stop every turn, record each as interrupted, and end every event stream. */
  shutdown: () => Promise<void>;
};

/**
 * The dashboard's HTTP surface.
 *
 * Agents belong to the registry, not to requests: a message starts a turn and
 * answers straight away, and everything that happens after reaches browsers
 * through the event stream.
 */
export function createApp(options: AppOptions): AppHandler {
  const store = options.store;
  const now = options.now ?? (() => Date.now());
  const pairing = options.pairing ?? createPairingMode({ now });
  const randomBytes = options.randomBytes;
  const hub = createEventHub();
  const registry = createAgentRegistry({
    store,
    hub,
    runTurn: options.runTurn ?? runClaudeTurn,
    maxRunning: options.maxAgents ?? 4,
  });

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

  const handle = function handle(request: IncomingMessage, response: ServerResponse): void {
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

        // Pairing is handled before the block that guards every other
        // state-changing request, which made it the only POST on the port that
        // never proved where it came from. It stays exempt from the CSRF *token*
        // half — there is no session yet to have issued one — but not from the
        // origin half, or any page the owner happens to have open can post
        // guesses at the loopback port and burn their pairing window.
        //
        // Checked before the address and before the code, so a refused caller
        // learns nothing about either.
        if (
          !isSameOrigin({
            origin: request.headers.origin,
            host: request.headers.host,
            secFetchSite: request.headers['sec-fetch-site'],
          })
        ) {
          sendJson(response, 403, { error: 'Request rejected.' });
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
          // No port in this message. It used to name 4317, which is simply wrong
          // under `PORT=5000`, and `createApp` is not told the port — threading
          // it through solely to compose an error string would be a poor trade.
          // The startup line already prints the exact address, so point there.
          sendJson(response, 421, {
            error:
              'This address cannot keep the session cookie, so pairing here would look like it worked and then fail. Open the dashboard on this machine at a 127.0.0.1 address — the server printed the exact one at startup — or reach it over HTTPS. Your code is unused.',
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
        sendJson(response, 200, { paired: true, device: session?.label ?? null });
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
        if (session !== undefined) {
          store.revokeAppSession(session.id, new Date(now()).toISOString());
          // A revoked session must stop hearing about agents at once, not at
          // its next reconnect.
          hub.closeOwner(session.id);
        }
        response.setHeader('set-cookie', [
          buildSessionCookie('', 0),
          buildSessionCookie('', 0, { name: CSRF_COOKIE, httpOnly: false }),
        ]);
        sendJson(response, 200, { ok: true });
        return;
      }

      if (path === '/api/logout-all' && request.method === 'POST') {
        store.revokeAllAppSessions(new Date(now()).toISOString());
        hub.closeAll();
        response.setHeader('set-cookie', [
          buildSessionCookie('', 0),
          buildSessionCookie('', 0, { name: CSRF_COOKIE, httpOnly: false }),
        ]);
        sendJson(response, 200, { ok: true });
        return;
      }

      if (path === '/api/events' && request.method === 'GET') {
        const last = request.headers['last-event-id'];
        hub.subscribe(response, {
          owner: session?.id ?? '',
          lastEventId: typeof last === 'string' ? last : undefined,
        });
        return;
      }

      if (path === '/api/projects' && request.method === 'GET') {
        sendJson(response, 200, {
          configured: options.projectRoots.length > 0,
          projects: listProjects(options.projectRoots),
        });
        return;
      }

      if (path === '/api/agents' && request.method === 'GET') {
        // The sequence is read in the same synchronous step as the list, so a
        // client knows exactly which later events the list already reflects.
        sendJson(response, 200, {
          agents: store.listSessions().map(summarize),
          seq: hub.currentSeq(),
        });
        return;
      }

      if (path === '/api/agents' && request.method === 'POST') {
        const body = await readJsonObject(request, response);
        if (body === undefined) return;

        const named = readName(body['name']);
        if ('error' in named) {
          sendJson(response, 400, { error: named.error });
          return;
        }
        const model = body['model'];
        if (
          model !== undefined &&
          model !== null &&
          model !== '' &&
          !(MODEL_CHOICES as readonly unknown[]).includes(model)
        ) {
          sendJson(response, 400, {
            error: `The model must be one of ${MODEL_CHOICES.join(', ')}, or left as the default.`,
          });
          return;
        }
        const text = body['text'];
        if (text !== undefined && typeof text !== 'string') {
          sendJson(response, 400, { error: 'The first message must be text.' });
          return;
        }
        const project = body['project'];
        if (typeof project !== 'string') {
          sendJson(response, 400, { error: 'Choose a project for the agent.' });
          return;
        }

        let agentId: string;
        try {
          const projectDir = resolveProject(options.projectRoots, project);
          const prepared = await prepareWorkspace({
            projectDir,
            worktreesDir: options.worktreesDir,
            agentId: randomUUID(),
            name: named.name ?? text ?? '',
          });
          agentId = store.createSession({
            workspaceDir: prepared.workspaceDir,
            projectDir,
            branch: prepared.branch,
            title: named.name,
            model: typeof model === 'string' && model !== '' ? model : undefined,
          }).id;
        } catch (thrown) {
          if (!(thrown instanceof WorkspaceError)) throw thrown;
          sendJson(response, 400, { error: thrown.message });
          return;
        }

        registry.announce(agentId);
        // The agent exists whether or not its first message could start, so a
        // refusal comes back beside it rather than instead of it.
        const outcome =
          text !== undefined && text.trim() !== ''
            ? registry.send(agentId, text)
            : ({ ok: true } as const);
        const created = store.getSession(agentId);
        sendJson(response, 201, {
          agent: created === undefined ? null : summarize(created),
          ...(outcome.ok ? {} : { error: outcome.error }),
        });
        return;
      }

      const agentMatch = /^\/api\/agents\/([\w-]+)(\/messages|\/stop)?$/u.exec(path);
      if (agentMatch !== null) {
        const agentId = agentMatch[1] ?? '';
        const action = agentMatch[2];
        const agent = store.getSession(agentId);
        if (agent === undefined) {
          sendJson(response, 404, { error: 'No such agent.' });
          return;
        }

        if (action === undefined && request.method === 'GET') {
          // Transcript, the turn in progress, and the sequence both reflect, read
          // together so a late client joins mid-turn without gaps or repeats.
          sendJson(response, 200, {
            agent: summarize(agent),
            messages: store.listMessages(agentId),
            live: registry.live(agentId),
            seq: hub.currentSeq(),
          });
          return;
        }

        if (action === undefined && request.method === 'PATCH') {
          const body = await readJsonObject(request, response);
          if (body === undefined) return;
          const named = readName(body['name']);
          if ('error' in named || named.name === undefined) {
            sendJson(response, 400, {
              error: 'error' in named ? named.error : 'The name cannot be empty.',
            });
            return;
          }
          store.renameSession(agentId, named.name);
          registry.announce(agentId);
          const renamed = store.getSession(agentId);
          sendJson(response, 200, { agent: renamed === undefined ? null : summarize(renamed) });
          return;
        }

        if (action === '/messages' && request.method === 'POST') {
          const body = await readJsonObject(request, response);
          if (body === undefined) return;
          const text = body['text'];
          if (typeof text !== 'string' || text.trim() === '') {
            sendJson(response, 400, {
              error: 'Send { "text": "..." } with a non-empty message.',
            });
            return;
          }
          const outcome = registry.send(agentId, text);
          if (outcome.ok) sendJson(response, 202, { ok: true });
          else sendJson(response, outcome.status, { error: outcome.error });
          return;
        }

        if (action === '/stop' && request.method === 'POST') {
          if (registry.stop(agentId)) sendJson(response, 200, { ok: true });
          else sendJson(response, 409, { error: 'This agent is not working.' });
          return;
        }

        sendJson(response, 405, { error: 'Method not allowed.' });
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

  return Object.assign(handle, {
    shutdown: async () => {
      await registry.shutdown();
      hub.closeAll();
    },
  });
}
