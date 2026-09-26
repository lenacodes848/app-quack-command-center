import { useCallback, useEffect, useRef, useState } from 'react';
import { PRODUCT_NAME } from '@quack/contracts';
import {
  listSessions,
  logout,
  openSession,
  sendTurn,
  startNewSession,
  whoAmI,
  type SavedSession,
} from './api.js';
import { PairingScreen } from './PairingScreen.js';

interface Message {
  id: number;
  role: 'you' | 'agent';
  text: string;
  tools: string[];
  failed: boolean;
}

let nextId = 0;

export function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<string | undefined>(undefined);
  /** The stored conversation on screen, which survives a restart. */
  const [storedId, setStoredId] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState<SavedSession[]>([]);
  /**
   * Whether this browser is paired. Undefined while that is still unknown.
   *
   * Three states rather than a boolean, because rendering the login screen
   * before the answer arrives would flash it at an owner who is already paired.
   */
  const [paired, setPaired] = useState<boolean | undefined>(undefined);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const refreshSaved = useCallback(async () => {
    setSaved(await listSessions());
  }, []);

  // Ask who we are first. The conversation list is only loaded once the answer
  // is yes, so an unpaired browser makes one request and gets one answer rather
  // than a page of refusals.
  useEffect(() => {
    void (async () => {
      const me = await whoAmI();
      setPaired(me !== undefined);
      if (me !== undefined) await refreshSaved();
    })();
  }, [refreshSaved]);

  const signOut = useCallback(async (everywhere: boolean) => {
    await logout(everywhere);
    // Drop everything on screen: a transcript left visible after logging out
    // would suggest the session is still live.
    setPaired(false);
    setMessages([]);
    setSaved([]);
    setSession(undefined);
    setStoredId(undefined);
  }, []);

  /** Replay a saved conversation into the transcript. */
  const open = useCallback(
    async (id: string) => {
      if (busy) return;
      const opened = await openSession(id);
      if (opened === undefined) {
        // It was in the list and is not there now. Reload the list rather than
        // leaving a row that does nothing when clicked.
        void refreshSaved();
        return;
      }
      setStoredId(opened.id);
      setSession(undefined);
      setMessages(
        opened.messages.map((message) => ({
          id: nextId++,
          role: message.role === 'user' ? 'you' : 'agent',
          text: message.content,
          tools: [],
          failed: false,
        })),
      );
    },
    [busy, refreshSaved],
  );

  const send = useCallback(async () => {
    const text = draft.trim();
    if (text === '' || busy) return;

    setDraft('');
    setBusy(true);

    const replyId = nextId++;
    setMessages((prior) => [
      ...prior,
      { id: nextId++, role: 'you', text, tools: [], failed: false },
      { id: replyId, role: 'agent', text: '', tools: [], failed: false },
    ]);

    const amend = (change: (message: Message) => Message): void => {
      setMessages((prior) => prior.map((m) => (m.id === replyId ? change(m) : m)));
    };

    try {
      for await (const event of sendTurn(text, { sessionId: storedId })) {
        switch (event.type) {
          case 'session':
            setSession(event.sessionId);
            break;
          case 'text':
            amend((m) => ({ ...m, text: m.text + event.text }));
            break;
          case 'tool':
            amend((m) => ({ ...m, tools: [...m.tools, event.name] }));
            break;
          case 'result':
            // Only fall back to the result text if nothing streamed, so a
            // normal turn is not duplicated at the end.
            amend((m) => ({
              ...m,
              text: m.text === '' ? event.text : m.text,
              failed: event.isError,
            }));
            break;
          case 'error':
            amend((m) => ({ ...m, text: event.message, failed: true }));
            break;
        }
      }
    } finally {
      setBusy(false);
      // The turn may have created the conversation or renamed nothing at all;
      // either way the sidebar is refreshed so the new thread appears and the
      // order reflects what was just said.
      void refreshSaved();
    }
  }, [draft, busy, storedId, refreshSaved]);

  const reset = useCallback(async () => {
    await startNewSession();
    setSession(undefined);
    setStoredId(undefined);
    setMessages([]);
    void refreshSaved();
  }, [refreshSaved]);

  // Nothing is rendered until the server has said whether this browser is
  // paired, so the login screen never flashes past an owner who already is.
  if (paired === undefined) {
    return <div className="h-dvh bg-neutral-950" aria-busy="true" />;
  }

  if (!paired) {
    return (
      <PairingScreen
        onPaired={() => {
          setPaired(true);
          void refreshSaved();
        }}
      />
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center gap-3 border-b border-neutral-800 px-4 py-3">
        <span aria-hidden className="text-xl">
          🦆
        </span>
        <h1 className="text-sm font-semibold tracking-wide">{PRODUCT_NAME}</h1>
        <span className="ml-auto flex items-center gap-3 text-xs text-neutral-500">
          {session !== undefined && (
            <span title={session} className="hidden sm:inline">
              session {session.slice(0, 8)}
            </span>
          )}
          <button
            type="button"
            onClick={() => void reset()}
            disabled={busy || messages.length === 0}
            className="rounded border border-neutral-700 px-2 py-1 text-neutral-300 enabled:hover:border-neutral-500 disabled:opacity-40"
          >
            New session
          </button>
          <button
            type="button"
            onClick={() => void signOut(false)}
            disabled={busy}
            className="rounded border border-neutral-700 px-2 py-1 text-neutral-300 enabled:hover:border-neutral-500 disabled:opacity-40"
          >
            Log out
          </button>
          <button
            type="button"
            // The control for a device you no longer have. It ends every session,
            // including this one, so the next start prints a fresh pairing code.
            onClick={() => void signOut(true)}
            disabled={busy}
            title="End every paired session, on every device"
            className="rounded border border-neutral-800 px-2 py-1 text-neutral-500 enabled:hover:border-red-500 enabled:hover:text-red-400 disabled:opacity-40"
          >
            Log out everywhere
          </button>
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Saved conversations"
          className="hidden w-64 shrink-0 flex-col overflow-y-auto border-r border-neutral-800 md:flex"
        >
          {saved.length === 0 ? (
            <p className="px-3 py-4 text-xs text-neutral-600">No saved conversations yet.</p>
          ) : (
            <ul className="flex flex-col py-2">
              {saved.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void open(item.id)}
                    disabled={busy}
                    aria-current={item.id === storedId ? 'true' : undefined}
                    className={`w-full px-3 py-2 text-left text-xs leading-snug disabled:opacity-40 ${
                      item.id === storedId
                        ? 'bg-neutral-800 text-neutral-100'
                        : 'text-neutral-400 enabled:hover:bg-neutral-900'
                    }`}
                  >
                    <span className="line-clamp-2">{item.title}</span>
                    <time
                      dateTime={item.updatedAt}
                      className="mt-0.5 block text-[10px] text-neutral-600"
                    >
                      {new Date(item.updatedAt).toLocaleString()}
                    </time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>

        <main className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {messages.length === 0 && (
              <p className="mt-16 text-center text-sm text-neutral-500">
                Ask Claude Code something. It runs in the workspace directory the server printed at
                startup.
              </p>
            )}

            {messages.map((message) => (
              <article key={message.id} className="flex flex-col gap-1">
                <span
                  className={`text-xs font-medium ${
                    message.role === 'you' ? 'text-neutral-500' : 'text-[#F5B301]'
                  }`}
                >
                  {message.role}
                </span>

                {message.tools.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5 py-0.5">
                    {message.tools.map((tool, index) => (
                      <li
                        key={`${tool}-${String(index)}`}
                        className="rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-400"
                      >
                        {tool}
                      </li>
                    ))}
                  </ul>
                )}

                <p
                  className={`whitespace-pre-wrap text-sm leading-relaxed ${
                    message.failed ? 'text-red-400' : 'text-neutral-100'
                  }`}
                >
                  {message.text === '' && busy ? (
                    <span className="text-neutral-500">thinking…</span>
                  ) : (
                    message.text
                  )}
                </p>
              </article>
            ))}
            <div ref={endRef} />
          </div>
        </main>
      </div>

      <form
        className="border-t border-neutral-800 px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <div className="mx-auto flex max-w-3xl gap-2">
          <textarea
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder={busy ? 'Working…' : 'Message Claude Code'}
            aria-label="Message"
            className="min-h-[2.5rem] flex-1 resize-none rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none placeholder:text-neutral-600 focus:border-[#F5B301]"
          />
          <button
            type="submit"
            disabled={busy || draft.trim() === ''}
            className="rounded bg-[#F5B301] px-4 text-sm font-medium text-neutral-950 disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
