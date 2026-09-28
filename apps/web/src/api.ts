import type { AgentSummary, StoredMessage, TurnEvent } from './agentState.js';

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

/** Log out. `everywhere` also ends sessions on devices you no longer have. */
export async function logout(everywhere = false): Promise<void> {
  const token = csrfToken();
  await fetch(everywhere ? '/api/logout-all' : '/api/logout', {
    method: 'POST',
    headers: token === undefined ? {} : { 'x-csrf-token': token },
  }).catch(() => undefined);
}

/** The server's explanation of a refusal, or a fallback naming the status. */
async function errorFrom(response: Response): Promise<string> {
  const fallback = `The server returned ${String(response.status)}.`;
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'error' in body) {
      return String(body.error);
    }
    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * A state-changing request, carrying the CSRF token.
 *
 * Every POST and PATCH goes through here: without the header the server refuses
 * the request, which is the layer that does not depend on the browser
 * honouring SameSite.
 */
async function mutate(
  url: string,
  method: 'POST' | 'PATCH',
  body: unknown,
  csrf: string | undefined = csrfToken(),
): Promise<Response> {
  return fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(csrf === undefined ? {} : { 'x-csrf-token': csrf }),
    },
    body: JSON.stringify(body),
  });
}

/** A folder an agent may be launched in. */
export interface Project {
  name: string;
  path: string;
  git: boolean;
}

export interface ProjectList {
  /** False when the server has no project roots, which the launch form explains. */
  configured: boolean;
  projects: Project[];
}

/** The folders agents may be launched in, or undefined when they could not be read. */
export async function listProjects(): Promise<ProjectList | undefined> {
  try {
    const response = await fetch('/api/projects');
    return response.ok ? ((await response.json()) as ProjectList) : undefined;
  } catch {
    return undefined;
  }
}

/** Every agent, with the stream sequence the list reflects. */
export async function listAgents(): Promise<{ agents: AgentSummary[]; seq: number } | undefined> {
  try {
    const response = await fetch('/api/agents');
    if (!response.ok) return undefined;
    return (await response.json()) as { agents: AgentSummary[]; seq: number };
  } catch {
    return undefined;
  }
}

export interface OpenedAgent {
  agent: AgentSummary;
  messages: StoredMessage[];
  /** The events of the turn in progress, if one is. */
  live: TurnEvent[];
  seq: number;
}

/** One agent with its transcript, or undefined if it is gone. */
export async function openAgent(id: string): Promise<OpenedAgent | undefined> {
  try {
    const response = await fetch(`/api/agents/${encodeURIComponent(id)}`);
    return response.ok ? ((await response.json()) as OpenedAgent) : undefined;
  } catch {
    return undefined;
  }
}

export interface LaunchInput {
  name: string;
  project: string;
  /** An alias, or empty for the CLI's default. */
  model: string;
  /** The first message. May be empty, to launch an agent without starting it. */
  text: string;
}

/**
 * Launch an agent.
 *
 * The agent can exist with an error beside it: its first message may be
 * refused, for instance at the limit on working agents, after it was created.
 */
export async function launchAgent(
  input: LaunchInput,
  csrf?: string,
): Promise<{ agent?: AgentSummary; error?: string }> {
  try {
    const response = await mutate('/api/agents', 'POST', input, csrf);
    if (!response.ok) return { error: await errorFrom(response) };
    const body = (await response.json()) as { agent: AgentSummary; error?: string };
    return body.error === undefined ? { agent: body.agent } : body;
  } catch {
    return { error: 'Could not reach the server. Is it still running?' };
  }
}

/** Send a message. Undefined on success, or the reason it was refused. */
export async function sendMessage(
  id: string,
  text: string,
  csrf?: string,
): Promise<string | undefined> {
  try {
    const response = await mutate(
      `/api/agents/${encodeURIComponent(id)}/messages`,
      'POST',
      { text },
      csrf,
    );
    return response.ok ? undefined : await errorFrom(response);
  } catch {
    return 'Could not reach the server. Is it still running?';
  }
}

/** Stop an agent's turn. Undefined on success, or the reason it could not. */
export async function stopAgent(id: string, csrf?: string): Promise<string | undefined> {
  try {
    const response = await mutate(`/api/agents/${encodeURIComponent(id)}/stop`, 'POST', {}, csrf);
    return response.ok ? undefined : await errorFrom(response);
  } catch {
    return 'Could not reach the server. Is it still running?';
  }
}

/** Rename an agent. Undefined on success, or the reason it was refused. */
export async function renameAgent(
  id: string,
  name: string,
  csrf?: string,
): Promise<string | undefined> {
  try {
    const response = await mutate(`/api/agents/${encodeURIComponent(id)}`, 'PATCH', { name }, csrf);
    return response.ok ? undefined : await errorFrom(response);
  } catch {
    return 'Could not reach the server. Is it still running?';
  }
}
