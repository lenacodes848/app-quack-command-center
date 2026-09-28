import { useEffect, useRef, useState } from 'react';
import type { OpenAgent } from './agentState.js';
import { StateBadge } from './AgentList.js';

export interface AgentViewProps {
  open: OpenAgent;
  /** Something to tell the owner that is not a message, such as a refused send. */
  notice: string | undefined;
  onSend: (text: string) => Promise<string | undefined>;
  onStop: () => Promise<string | undefined>;
  onRename: (name: string) => Promise<string | undefined>;
  onBack: () => void;
}

/** One agent: what it is, what it has said, and a way to talk to it. */
export function AgentView({ open, notice, onSend, onStop, onRename, onBack }: AgentViewProps) {
  const { agent, messages, live } = open;
  const running = agent.runState === 'running';
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | undefined>(notice);
  const [renaming, setRenaming] = useState<string | undefined>(undefined);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setError(notice);
  }, [notice, agent.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, live?.text]);

  const send = async (): Promise<void> => {
    const text = draft.trim();
    if (text === '' || running) return;
    setDraft('');
    const refused = await onSend(text);
    if (refused !== undefined) {
      // Put the words back: the owner should not have to retype a refused message.
      setDraft(text);
      setError(refused);
    } else {
      setError(undefined);
    }
  };

  const saveName = async (): Promise<void> => {
    if (renaming === undefined) return;
    const refused = await onRename(renaming);
    if (refused === undefined) setRenaming(undefined);
    else setError(refused);
  };

  return (
    <section aria-label={agent.name} className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-neutral-800 px-4 py-2">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-neutral-400 hover:text-neutral-200 md:hidden"
        >
          ← Agents
        </button>
        {renaming === undefined ? (
          <button
            type="button"
            onClick={() => {
              setRenaming(agent.name);
            }}
            title="Rename"
            className="text-sm font-semibold hover:underline"
          >
            {agent.name}
          </button>
        ) : (
          <form
            className="flex gap-1"
            onSubmit={(event) => {
              event.preventDefault();
              void saveName();
            }}
          >
            <input
              value={renaming}
              onChange={(event) => {
                setRenaming(event.target.value);
              }}
              maxLength={80}
              aria-label="Agent name"
              // The owner just asked to edit this field.
              autoFocus
              className="rounded border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-sm outline-none focus:border-[#F5B301]"
            />
            <button type="submit" className="text-xs text-[#F5B301]">
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setRenaming(undefined);
              }}
              className="text-xs text-neutral-500"
            >
              Cancel
            </button>
          </form>
        )}
        <StateBadge state={agent.runState} />
        <span className="text-[11px] text-neutral-500">
          {agent.projectName ?? 'scratch workspace'}
          {agent.branch !== null && <> · {agent.branch}</>}
          {agent.model !== null && <> · {agent.model}</>}
        </span>
        {running && (
          <button
            type="button"
            onClick={() => {
              void onStop().then((refused) => {
                if (refused !== undefined) setError(refused);
              });
            }}
            className="ml-auto rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-red-500 hover:text-red-400"
          >
            Stop
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          {messages.length === 0 && live === undefined && (
            <p className="mt-16 text-center text-sm text-neutral-500">
              Send this agent its first message.
            </p>
          )}
          {messages.map((message) => (
            <article key={message.id} className="flex flex-col gap-1">
              <span
                className={`text-xs font-medium ${
                  message.role === 'user' ? 'text-neutral-500' : 'text-[#F5B301]'
                }`}
              >
                {message.role === 'user' ? 'you' : 'agent'}
              </span>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-100">
                {message.content}
              </p>
            </article>
          ))}
          {live !== undefined && (
            <article className="flex flex-col gap-1" aria-live="polite">
              <span className="text-xs font-medium text-[#F5B301]">agent</span>
              {live.tools.length > 0 && (
                <ul className="flex flex-wrap gap-1.5 py-0.5">
                  {live.tools.map((tool, index) => (
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
                  live.failed ? 'text-red-400' : 'text-neutral-100'
                }`}
              >
                {live.text === '' ? <span className="text-neutral-500">thinking…</span> : live.text}
              </p>
            </article>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <form
        className="border-t border-neutral-800 px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        {error !== undefined && (
          <p role="alert" className="mx-auto mb-2 max-w-3xl text-xs text-red-400">
            {error}
          </p>
        )}
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
            placeholder={
              running ? 'Working… you can switch to another agent' : 'Message this agent'
            }
            aria-label="Message"
            className="min-h-[2.5rem] flex-1 resize-none rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none placeholder:text-neutral-600 focus:border-[#F5B301]"
          />
          <button
            type="submit"
            disabled={running || draft.trim() === ''}
            className="rounded bg-[#F5B301] px-4 text-sm font-medium text-neutral-950 disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </form>
    </section>
  );
}
