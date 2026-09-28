/**
 * What the dashboard knows about agents, as a pure reducer.
 *
 * Kept free of React and the network so it can be tested without a browser.
 * The rules it enforces are the ones a live view gets wrong: an event that
 * arrives before the snapshot it belongs after must not be lost, and one the
 * snapshot already reflects must not be applied twice. Every snapshot carries
 * the stream sequence it was taken at, and every event carries its own, so the
 * comparison is exact.
 */

export type RunState = 'idle' | 'running' | 'failed' | 'stopped' | 'interrupted';

/** An agent as the server describes it. */
export interface AgentSummary {
  id: string;
  name: string;
  projectDir: string | null;
  projectName: string | null;
  branch: string | null;
  model: string | null;
  runState: RunState;
  createdAt: string;
  updatedAt: string;
}

/** A stored message. */
export interface StoredMessage {
  id: string;
  sessionId: string;
  seq: number;
  role: 'user' | 'agent';
  content: string;
  createdAt: string;
}

/**
 * Events the server streams for one turn.
 *
 * Structurally the adapter's `ClaudeEvent`, declared again so the browser
 * bundle does not import a Node package for a type.
 */
export type TurnEvent =
  | { type: 'session'; sessionId: string; model?: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'result'; text: string; isError: boolean }
  | { type: 'error'; message: string };

/** The answer being written, before it is stored. */
export interface LiveTurn {
  text: string;
  tools: string[];
  failed: boolean;
}

export const EMPTY_LIVE: LiveTurn = { text: '', tools: [], failed: false };

export interface StreamEvent {
  seq: number;
  name: 'agent' | 'message' | 'turn';
  data: unknown;
}

export interface OpenAgent {
  agent: AgentSummary;
  messages: StoredMessage[];
  /** Present while a turn is running. */
  live: LiveTurn | undefined;
  /** The stream sequence this view reflects. */
  seq: number;
}

export interface State {
  agents: AgentSummary[];
  listSeq: number;
  open: OpenAgent | undefined;
  /** Recent events, replayed over a snapshot that arrives after them. */
  recent: StreamEvent[];
}

export const initialState: State = { agents: [], listSeq: 0, open: undefined, recent: [] };

/** How many recent events are kept for replay over a late snapshot. */
export const RECENT_LIMIT = 500;

export type Action =
  | { type: 'listLoaded'; agents: AgentSummary[]; seq: number }
  | {
      type: 'opened';
      agent: AgentSummary;
      messages: StoredMessage[];
      live: TurnEvent[];
      seq: number;
    }
  | { type: 'closed' }
  | { type: 'event'; seq: number; name: StreamEvent['name']; data: unknown };

export function applyTurnEvent(live: LiveTurn, event: TurnEvent): LiveTurn {
  switch (event.type) {
    case 'text':
      return { ...live, text: live.text + event.text };
    case 'tool':
      return { ...live, tools: [...live.tools, event.name] };
    case 'result':
      return {
        ...live,
        text: live.text === '' ? event.text : live.text,
        failed: live.failed || event.isError,
      };
    case 'error':
      return { ...live, text: event.message, failed: true };
    default:
      return live;
  }
}

const newestFirst = (a: AgentSummary, b: AgentSummary): number =>
  b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt);

function upsert(agents: AgentSummary[], next: AgentSummary): AgentSummary[] {
  const others = agents.filter((a) => a.id !== next.id);
  return [...others, next].sort(newestFirst);
}

interface MessageData {
  agentId: string;
  message: StoredMessage;
}

interface TurnData {
  agentId: string;
  event: TurnEvent;
}

/** Apply one event to the list, if the list does not already reflect it. */
function applyToList(state: State, event: StreamEvent): State {
  if (event.name !== 'agent' || event.seq <= state.listSeq) return state;
  return { ...state, agents: upsert(state.agents, event.data as AgentSummary) };
}

/** Apply one event to the open agent, if it is about that agent and is new to it. */
function applyToOpen(open: OpenAgent | undefined, event: StreamEvent): OpenAgent | undefined {
  if (open === undefined || event.seq <= open.seq) return open;

  if (event.name === 'agent') {
    const summary = event.data as AgentSummary;
    return summary.id === open.agent.id ? { ...open, agent: summary, seq: event.seq } : open;
  }
  if (event.name === 'message') {
    const { agentId, message } = event.data as MessageData;
    if (agentId !== open.agent.id) return open;
    if (open.messages.some((m) => m.id === message.id)) return { ...open, seq: event.seq };
    return {
      ...open,
      messages: [...open.messages, message],
      // A question opens a turn; an answer closes it.
      live: message.role === 'user' ? EMPTY_LIVE : undefined,
      seq: event.seq,
    };
  }
  const { agentId, event: turnEvent } = event.data as TurnData;
  if (agentId !== open.agent.id) return open;
  return { ...open, live: applyTurnEvent(open.live ?? EMPTY_LIVE, turnEvent), seq: event.seq };
}

export function reduce(state: State, action: Action): State {
  switch (action.type) {
    case 'event': {
      const event: StreamEvent = { seq: action.seq, name: action.name, data: action.data };
      const recent = [...state.recent, event].slice(-RECENT_LIMIT);
      const listed = applyToList({ ...state, recent }, event);
      return { ...listed, open: applyToOpen(listed.open, event) };
    }

    case 'listLoaded': {
      let next: State = {
        ...state,
        agents: [...action.agents].sort(newestFirst),
        listSeq: action.seq,
      };
      for (const event of state.recent) next = applyToList(next, event);
      return next;
    }

    case 'opened': {
      let open: OpenAgent | undefined = {
        agent: action.agent,
        messages: action.messages,
        live:
          action.agent.runState === 'running'
            ? action.live.reduce(applyTurnEvent, EMPTY_LIVE)
            : undefined,
        seq: action.seq,
      };
      for (const event of state.recent) open = applyToOpen(open, event);
      return { ...state, open };
    }

    case 'closed':
      return { ...state, open: undefined };
  }
}

/**
 * The notification for an agent's change of state, if it deserves one.
 *
 * Only the end of a turn the owner did not end themselves: finishing, or
 * failing. A stop was their own doing, and starting is not news.
 */
export function notificationFor(
  previous: RunState | undefined,
  next: AgentSummary,
): { title: string; body: string } | undefined {
  if (previous !== 'running') return undefined;
  const body = next.projectName ?? 'Quack Command Center';
  if (next.runState === 'idle') return { title: `${next.name} finished`, body };
  if (next.runState === 'failed') return { title: `${next.name} failed`, body };
  return undefined;
}
