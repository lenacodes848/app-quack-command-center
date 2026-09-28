import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { PRODUCT_NAME } from '@quack/contracts';
import { AgentList } from './AgentList.js';
import { AgentView } from './AgentView.js';
import {
  initialState,
  notificationFor,
  reduce,
  type AgentSummary,
  type RunState,
  type StreamEvent,
} from './agentState.js';
import {
  listAgents,
  logout,
  openAgent,
  renameAgent,
  sendMessage,
  stopAgent,
  whoAmI,
} from './api.js';
import { LaunchForm } from './LaunchForm.js';
import { PairingScreen } from './PairingScreen.js';

/** What the main panel shows. */
type View = { kind: 'none' } | { kind: 'new' } | { kind: 'agent'; id: string };

const STREAM_EVENTS: StreamEvent['name'][] = ['agent', 'message', 'turn'];

function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function App() {
  const [state, dispatch] = useReducer(reduce, initialState);
  const [view, setView] = useState<View>({ kind: 'none' });
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    notificationsSupported() ? Notification.permission : 'unsupported',
  );
  /**
   * Whether this browser is paired. Undefined while that is still unknown.
   *
   * Three states rather than a boolean, because rendering the login screen
   * before the answer arrives would flash it at an owner who is already paired.
   */
  const [paired, setPaired] = useState<boolean | undefined>(undefined);

  // Read from inside the event stream's handlers, which are set up once and
  // must not capture a stale view.
  const openIdRef = useRef<string | undefined>(undefined);
  openIdRef.current = view.kind === 'agent' ? view.id : undefined;
  /** Each agent's last known state, to tell when a turn ends. */
  const lastStates = useRef(new Map<string, RunState>());

  const loadList = useCallback(async () => {
    const listed = await listAgents();
    if (listed === undefined) return;
    for (const agent of listed.agents) lastStates.current.set(agent.id, agent.runState);
    dispatch({ type: 'listLoaded', agents: listed.agents, seq: listed.seq });
  }, []);

  const loadOpen = useCallback(async (id: string) => {
    const opened = await openAgent(id);
    // The owner may have moved on while this was loading.
    if (openIdRef.current !== id) return;
    if (opened === undefined) {
      setView({ kind: 'none' });
      return;
    }
    dispatch({ type: 'opened', ...opened });
  }, []);

  useEffect(() => {
    void (async () => {
      const me = await whoAmI();
      setPaired(me !== undefined);
    })();
  }, []);

  // One stream for every agent, open for as long as the browser is paired. The
  // list and the open agent are fetched whenever the stream starts or says it
  // cannot replay what was missed; the reducer reconciles the two by sequence.
  useEffect(() => {
    if (paired !== true) return;
    void loadList();

    const source = new EventSource('/api/events');
    const refresh = (): void => {
      void loadList();
      if (openIdRef.current !== undefined) void loadOpen(openIdRef.current);
    };
    source.addEventListener('hello', refresh);
    source.addEventListener('resync', refresh);

    for (const name of STREAM_EVENTS) {
      source.addEventListener(name, (raw) => {
        const message = raw as MessageEvent<string>;
        const data: unknown = JSON.parse(message.data);
        if (name === 'agent') {
          const summary = data as AgentSummary;
          const note = notificationFor(lastStates.current.get(summary.id), summary);
          lastStates.current.set(summary.id, summary.runState);
          const watching = !document.hidden && openIdRef.current === summary.id;
          if (
            note !== undefined &&
            !watching &&
            notificationsSupported() &&
            Notification.permission === 'granted'
          ) {
            new Notification(note.title, { body: note.body, tag: summary.id });
          }
        }
        dispatch({ type: 'event', seq: Number(message.lastEventId), name, data });
      });
    }
    return () => {
      source.close();
    };
  }, [paired, loadList, loadOpen]);

  const select = useCallback(
    (id: string) => {
      setNotice(undefined);
      setView({ kind: 'agent', id });
      dispatch({ type: 'closed' });
      openIdRef.current = id;
      void loadOpen(id);
    },
    [loadOpen],
  );

  const signOut = useCallback(async (everywhere: boolean) => {
    await logout(everywhere);
    // Drop everything on screen: a transcript left visible after logging out
    // would suggest the session is still live.
    setPaired(false);
    setView({ kind: 'none' });
    dispatch({ type: 'closed' });
    dispatch({ type: 'listLoaded', agents: [], seq: 0 });
  }, []);

  if (paired === undefined) {
    return <div className="h-dvh bg-neutral-950" aria-busy="true" />;
  }

  if (!paired) {
    return (
      <PairingScreen
        onPaired={() => {
          setPaired(true);
        }}
      />
    );
  }

  const open = view.kind === 'agent' && state.open?.agent.id === view.id ? state.open : undefined;
  const showingPanel = view.kind !== 'none';

  return (
    <div className="flex h-dvh flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center gap-3 border-b border-neutral-800 px-4 py-3">
        <span aria-hidden className="text-xl">
          🦆
        </span>
        <h1 className="text-sm font-semibold tracking-wide">{PRODUCT_NAME}</h1>
        <span className="ml-auto flex items-center gap-3 text-xs text-neutral-500">
          {permission === 'default' && (
            <button
              type="button"
              onClick={() => {
                void Notification.requestPermission().then(setPermission);
              }}
              title="Be told when an agent finishes or fails"
              className="rounded border border-neutral-700 px-2 py-1 text-neutral-300 hover:border-neutral-500"
            >
              Turn on notifications
            </button>
          )}
          <button
            type="button"
            onClick={() => void signOut(false)}
            className="rounded border border-neutral-700 px-2 py-1 text-neutral-300 hover:border-neutral-500"
          >
            Log out
          </button>
          <button
            type="button"
            // The control for a device you no longer have. It ends every session,
            // including this one, so the next start prints a fresh pairing code.
            onClick={() => void signOut(true)}
            title="End every paired session, on every device"
            className="hidden rounded border border-neutral-800 px-2 py-1 text-neutral-500 hover:border-red-500 hover:text-red-400 sm:inline"
          >
            Log out everywhere
          </button>
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* On a phone the list and the agent are separate screens; side by side from md up. */}
        <AgentList
          agents={state.agents}
          selectedId={view.kind === 'agent' ? view.id : undefined}
          onSelect={select}
          onNew={() => {
            setView({ kind: 'new' });
          }}
          className={`${showingPanel ? 'hidden md:flex' : 'flex'} w-full shrink-0 md:w-72 md:border-r`}
        />

        <main className={`${showingPanel ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
          {view.kind === 'new' && (
            <div className="overflow-y-auto">
              <LaunchForm
                onLaunched={(id, launchNotice) => {
                  select(id);
                  setNotice(launchNotice);
                }}
                onCancel={() => {
                  setView({ kind: 'none' });
                }}
              />
            </div>
          )}
          {view.kind === 'agent' && open !== undefined && (
            <AgentView
              open={open}
              notice={notice}
              onSend={(text) => sendMessage(open.agent.id, text)}
              onStop={() => stopAgent(open.agent.id)}
              onRename={(name) => renameAgent(open.agent.id, name)}
              onBack={() => {
                setView({ kind: 'none' });
              }}
            />
          )}
          {view.kind === 'agent' && open === undefined && (
            <p className="mt-16 text-center text-sm text-neutral-500">Loading…</p>
          )}
          {view.kind === 'none' && (
            <p className="mt-16 px-4 text-center text-sm text-neutral-500">
              Choose an agent, or launch a new one. Agents keep working when you close this tab.
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
