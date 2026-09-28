import { describe, expect, test } from 'vitest';
import {
  applyTurnEvent,
  EMPTY_LIVE,
  initialState,
  notificationFor,
  reduce,
  RECENT_LIMIT,
  type AgentSummary,
  type State,
  type StoredMessage,
} from './agentState.js';

function agent(id: string, overrides: Partial<AgentSummary> = {}): AgentSummary {
  return {
    id,
    name: `Agent ${id}`,
    projectDir: '/p/app',
    projectName: 'app',
    branch: `quack/${id}`,
    model: null,
    runState: 'idle',
    createdAt: '2026-09-28T10:00:00.000Z',
    updatedAt: '2026-09-28T10:00:00.000Z',
    ...overrides,
  };
}

function message(
  id: string,
  agentId: string,
  role: 'user' | 'agent',
  content: string,
): StoredMessage {
  return { id, sessionId: agentId, seq: 1, role, content, createdAt: '' };
}

const event = (seq: number, name: 'agent' | 'message' | 'turn', data: unknown) =>
  ({ type: 'event', seq, name, data }) as const;

describe('applyTurnEvent', () => {
  test('gathers streamed text and the tools used', () => {
    let live = EMPTY_LIVE;
    live = applyTurnEvent(live, { type: 'tool', name: 'Read' });
    live = applyTurnEvent(live, { type: 'text', text: 'Hello ' });
    live = applyTurnEvent(live, { type: 'text', text: 'there' });
    expect(live).toEqual({ text: 'Hello there', tools: ['Read'], failed: false });
  });

  test('uses the result text only when nothing streamed, so an answer is not doubled', () => {
    expect(
      applyTurnEvent(
        { ...EMPTY_LIVE, text: 'streamed' },
        { type: 'result', text: 'streamed', isError: false },
      ).text,
    ).toBe('streamed');
    expect(
      applyTurnEvent(EMPTY_LIVE, { type: 'result', text: 'only result', isError: false }).text,
    ).toBe('only result');
  });

  test('marks a failure', () => {
    expect(applyTurnEvent(EMPTY_LIVE, { type: 'error', message: 'boom' })).toEqual({
      text: 'boom',
      tools: [],
      failed: true,
    });
  });
});

describe('the agent list', () => {
  test('a snapshot replaces the list', () => {
    const state = reduce(initialState, { type: 'listLoaded', agents: [agent('a')], seq: 3 });
    expect(state.agents.map((a) => a.id)).toEqual(['a']);
    expect(state.listSeq).toBe(3);
  });

  test('an agent event adds a new agent and updates a known one, newest first', () => {
    let state = reduce(initialState, { type: 'listLoaded', agents: [agent('a')], seq: 1 });
    state = reduce(state, event(2, 'agent', agent('b', { updatedAt: '2026-09-28T11:00:00.000Z' })));
    state = reduce(
      state,
      event(3, 'agent', agent('a', { runState: 'running', updatedAt: '2026-09-28T12:00:00.000Z' })),
    );
    expect(state.agents.map((a) => [a.id, a.runState])).toEqual([
      ['a', 'running'],
      ['b', 'idle'],
    ]);
  });

  test('ignores an event the snapshot already reflects', () => {
    let state = reduce(initialState, {
      type: 'listLoaded',
      agents: [agent('a', { runState: 'idle' })],
      seq: 5,
    });
    state = reduce(state, event(4, 'agent', agent('a', { runState: 'running' })));
    expect(state.agents[0]?.runState).toBe('idle');
  });

  test('applies events that arrived while the snapshot was loading', () => {
    // The stream is open before the list is fetched, so an event can land
    // first. It must not be lost, nor applied twice.
    let state = reduce(initialState, event(7, 'agent', agent('a', { runState: 'running' })));
    state = reduce(state, {
      type: 'listLoaded',
      agents: [agent('a', { runState: 'idle' })],
      seq: 6,
    });
    expect(state.agents[0]?.runState).toBe('running');
  });

  test('keeps only a bounded number of recent events', () => {
    let state: State = initialState;
    for (let seq = 1; seq <= RECENT_LIMIT + 10; seq += 1) {
      state = reduce(state, event(seq, 'agent', agent('a')));
    }
    expect(state.recent).toHaveLength(RECENT_LIMIT);
    expect(state.recent[0]?.seq).toBe(11);
  });
});

describe('an open agent', () => {
  function opened(): State {
    return reduce(initialState, {
      type: 'opened',
      agent: agent('a', { runState: 'running' }),
      messages: [message('m1', 'a', 'user', 'hello')],
      live: [{ type: 'text', text: 'Hi' }],
      seq: 10,
    });
  }

  test('shows its transcript and the turn in progress', () => {
    const state = opened();
    expect(state.open?.messages.map((m) => m.content)).toEqual(['hello']);
    expect(state.open?.live).toEqual({ text: 'Hi', tools: [], failed: false });
  });

  test('streams new turn events into the turn in progress', () => {
    const state = reduce(
      opened(),
      event(11, 'turn', { agentId: 'a', event: { type: 'text', text: ' there' } }),
    );
    expect(state.open?.live?.text).toBe('Hi there');
  });

  test('ignores turn events for other agents, and events it already has', () => {
    let state = reduce(
      opened(),
      event(11, 'turn', { agentId: 'b', event: { type: 'text', text: 'X' } }),
    );
    state = reduce(state, event(9, 'turn', { agentId: 'a', event: { type: 'text', text: 'old' } }));
    expect(state.open?.live?.text).toBe('Hi');
  });

  test('replaces the turn in progress with the stored answer when it arrives', () => {
    const state = reduce(
      opened(),
      event(11, 'message', { agentId: 'a', message: message('m2', 'a', 'agent', 'Hi there') }),
    );
    expect(state.open?.messages.map((m) => m.content)).toEqual(['hello', 'Hi there']);
    expect(state.open?.live).toBeUndefined();
  });

  test('a new question starts an empty turn in progress', () => {
    let state = reduce(
      opened(),
      event(11, 'message', { agentId: 'a', message: message('m2', 'a', 'agent', 'done') }),
    );
    state = reduce(
      state,
      event(12, 'message', { agentId: 'a', message: message('m3', 'a', 'user', 'again') }),
    );
    expect(state.open?.live).toEqual(EMPTY_LIVE);
  });

  test('does not add a message twice', () => {
    const add = event(11, 'message', {
      agentId: 'a',
      message: message('m1', 'a', 'user', 'hello'),
    });
    const state = reduce(opened(), add);
    expect(state.open?.messages).toHaveLength(1);
  });

  test('picks up events that arrived while it was being fetched', () => {
    let state = reduce(
      initialState,
      event(11, 'turn', { agentId: 'a', event: { type: 'text', text: ' there' } }),
    );
    state = reduce(state, {
      type: 'opened',
      agent: agent('a', { runState: 'running' }),
      messages: [],
      live: [{ type: 'text', text: 'Hi' }],
      seq: 10,
    });
    expect(state.open?.live?.text).toBe('Hi there');
  });

  test('follows the agent summary, so its state and name stay current', () => {
    const state = reduce(
      opened(),
      event(11, 'agent', agent('a', { name: 'Renamed', runState: 'idle' })),
    );
    expect(state.open?.agent).toMatchObject({ name: 'Renamed', runState: 'idle' });
  });

  test('closing forgets it', () => {
    expect(reduce(opened(), { type: 'closed' }).open).toBeUndefined();
  });
});

describe('notificationFor', () => {
  test('announces an agent that finished', () => {
    expect(notificationFor('running', agent('a', { runState: 'idle', name: 'Fix login' }))).toEqual(
      {
        title: 'Fix login finished',
        body: 'app',
      },
    );
  });

  test('announces an agent that failed', () => {
    expect(notificationFor('running', agent('a', { runState: 'failed' }))?.title).toMatch(/failed/);
  });

  test('stays quiet about a stop the owner asked for, and about anything not ending a turn', () => {
    expect(notificationFor('running', agent('a', { runState: 'stopped' }))).toBeUndefined();
    expect(notificationFor('idle', agent('a', { runState: 'running' }))).toBeUndefined();
    expect(notificationFor(undefined, agent('a', { runState: 'idle' }))).toBeUndefined();
  });
});
