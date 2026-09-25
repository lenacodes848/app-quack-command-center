import { useCallback, useEffect, useRef, useState } from 'react';
import { PRODUCT_NAME } from '@quack/contracts';
import { sendTurn } from './api.js';

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
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      for await (const event of sendTurn(text)) {
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
    }
  }, [draft, busy]);

  const reset = useCallback(async () => {
    await fetch('/api/session', { method: 'DELETE' });
    setSession(undefined);
    setMessages([]);
  }, []);

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
        </span>
      </header>

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
