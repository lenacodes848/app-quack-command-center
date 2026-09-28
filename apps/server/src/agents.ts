import { basename } from 'node:path';
import type { ClaudeEvent, ClaudeTurnOptions } from '@quack/adapter';
import type { RunState, SessionRecord, Store } from '@quack/storage';
import type { EventHub } from './events.js';

export type TurnRunner = (options: ClaudeTurnOptions) => AsyncGenerator<ClaudeEvent>;

/** Stored in place of an answer the owner stopped. */
export const STOPPED_NOTE = '[Stopped.]';

/** Stored when the server stopped, or died, before an answer finished. */
export const INTERRUPTED_NOTE =
  '[The server stopped before this answer finished. Send another message to continue.]';

/** An agent as the list and the event stream describe it. */
export interface AgentSummary {
  id: string;
  name: string;
  projectDir: string | null;
  /** The project folder's own name, for display. */
  projectName: string | null;
  branch: string | null;
  model: string | null;
  runState: RunState;
  createdAt: string;
  updatedAt: string;
}

export function summarize(record: SessionRecord): AgentSummary {
  return {
    id: record.id,
    name: record.title ?? 'Untitled agent',
    projectDir: record.projectDir ?? null,
    projectName: record.projectDir === undefined ? null : basename(record.projectDir),
    branch: record.branch ?? null,
    model: record.model ?? null,
    runState: record.runState,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export type SendOutcome = { ok: true } | { ok: false; status: 404 | 409; error: string };

export interface AgentRegistry {
  /**
   * Start a turn in the background. Every check happens before anything is
   * written, and nothing here awaits, so two sends cannot both pass a check.
   */
  send(agentId: string, text: string): SendOutcome;
  /** Stop an agent's turn. False when it is not running. */
  stop(agentId: string): boolean;
  isRunning(agentId: string): boolean;
  /** The events of the turn in progress, for a client that arrives part-way. */
  live(agentId: string): ClaudeEvent[];
  /** Tell every client about an agent's current state. */
  announce(agentId: string): void;
  /** Stop every turn, recording each as interrupted, and wait for them to be written down. */
  shutdown(): Promise<void>;
}

export interface AgentRegistryOptions {
  store: Store;
  hub: EventHub;
  runTurn: TurnRunner;
  /** How many agents may be working at once. */
  maxRunning: number;
}

interface Turn {
  workspaceDir: string;
  controller: AbortController;
  events: ClaudeEvent[];
  stopped: boolean;
  done: Promise<void>;
}

/**
 * The agents the server is running.
 *
 * A turn belongs to the server, not to the request that started it: sending a
 * message answers straight away, the turn carries on with nobody watching, and
 * whoever is watching hears about it through the event hub. That is what lets
 * the owner start several agents and walk away.
 */
export function createAgentRegistry(options: AgentRegistryOptions): AgentRegistry {
  const { store, hub, runTurn, maxRunning } = options;
  const turns = new Map<string, Turn>();
  let shuttingDown = false;

  const announce = (agentId: string): void => {
    const record = store.getSession(agentId);
    if (record !== undefined) hub.publish('agent', summarize(record));
  };

  const append = (agentId: string, role: 'user' | 'agent', content: string): void => {
    const message = store.appendMessage(agentId, { role, content });
    hub.publish('message', { agentId, message });
  };

  // A running row left by a previous process describes a turn nobody is running.
  for (const agentId of store.markInterrupted()) append(agentId, 'agent', INTERRUPTED_NOTE);

  const runOne = async (agent: SessionRecord, text: string, turn: Turn): Promise<void> => {
    const spoken: string[] = [];
    let failure: string | undefined;
    let resultText: string | undefined;
    let failed = false;

    try {
      for await (const event of runTurn({
        prompt: text,
        cwd: agent.workspaceDir,
        sessionId: agent.providerSessionId,
        model: agent.model,
        signal: turn.controller.signal,
      })) {
        // The abort's own complaint is how a stop looks from inside the
        // process. It is not the agent failing, so it is not shown as one.
        if (event.type === 'error' && turn.controller.signal.aborted) continue;

        if (event.type === 'session') {
          store.recordProviderSession(agent.id, {
            providerSessionId: event.sessionId,
            model: event.model,
          });
        }
        if (event.type === 'text') spoken.push(event.text);
        if (event.type === 'error') {
          failure = event.message;
          failed = true;
        }
        if (event.type === 'result') {
          resultText = event.text;
          if (event.isError) failed = true;
        }
        turn.events.push(event);
        hub.publish('turn', { agentId: agent.id, event });
      }
    } catch (thrown) {
      if (!turn.controller.signal.aborted) {
        failure = thrown instanceof Error ? thrown.message : 'The turn failed.';
        failed = true;
      }
    }

    // One stored message per turn: what the agent said, or else its result,
    // or else what went wrong. A turn cut short says so, because a bare partial
    // answer reads as a complete one.
    let reply = spoken.join('');
    if (reply.trim() === '') reply = resultText ?? failure ?? '';
    const interrupted = turn.stopped ? false : turn.controller.signal.aborted;
    const note = turn.stopped ? STOPPED_NOTE : interrupted ? INTERRUPTED_NOTE : undefined;
    if (note !== undefined) reply = reply.trim() === '' ? note : `${reply}\n\n${note}`;
    if (reply !== '') append(agent.id, 'agent', reply);

    const state: RunState = turn.stopped
      ? 'stopped'
      : interrupted
        ? 'interrupted'
        : failed
          ? 'failed'
          : 'idle';
    store.setRunState(agent.id, state);
    turns.delete(agent.id);
    announce(agent.id);
  };

  return {
    send(agentId, text) {
      const agent = store.getSession(agentId);
      if (agent === undefined) return { ok: false, status: 404, error: 'No such agent.' };
      if (shuttingDown) return { ok: false, status: 409, error: 'The server is stopping.' };
      if (turns.has(agentId)) {
        return {
          ok: false,
          status: 409,
          error: 'This agent is already working. Wait for it to finish, or stop it.',
        };
      }
      if (turns.size >= maxRunning) {
        return {
          ok: false,
          status: 409,
          error: `${String(maxRunning)} agents are already working, which is the limit (QUACK_MAX_AGENTS). Wait for one to finish, or stop one.`,
        };
      }
      // A worktree is the agent's own. Any other folder is shared with every
      // agent launched in it, so only one of them may be working there.
      const isolated = agent.branch !== undefined;
      if (!isolated) {
        for (const turn of turns.values()) {
          if (turn.workspaceDir === agent.workspaceDir) {
            return {
              ok: false,
              status: 409,
              error:
                'Another agent is working in this folder. It is not a git repository, so agents there take turns.',
            };
          }
        }
      }

      append(agentId, 'user', text);
      store.setRunState(agentId, 'running');

      const turn: Turn = {
        workspaceDir: agent.workspaceDir,
        controller: new AbortController(),
        events: [],
        stopped: false,
        done: Promise.resolve(),
      };
      turns.set(agentId, turn);
      announce(agentId);
      turn.done = runOne(agent, text, turn);
      return { ok: true };
    },

    stop(agentId) {
      const turn = turns.get(agentId);
      if (turn === undefined) return false;
      turn.stopped = true;
      turn.controller.abort();
      return true;
    },

    isRunning: (agentId) => turns.has(agentId),

    live: (agentId) => [...(turns.get(agentId)?.events ?? [])],

    announce,

    async shutdown() {
      shuttingDown = true;
      const pending = [...turns.values()];
      for (const turn of pending) turn.controller.abort();
      await Promise.all(pending.map((turn) => turn.done));
    },
  };
}
