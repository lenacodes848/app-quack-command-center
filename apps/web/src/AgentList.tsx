import type { AgentSummary, RunState } from './agentState.js';

const STATE_LABEL: Record<RunState, string> = {
  idle: 'Idle',
  running: 'Working',
  failed: 'Failed',
  stopped: 'Stopped',
  interrupted: 'Interrupted',
};

const STATE_STYLE: Record<RunState, string> = {
  idle: 'bg-neutral-800 text-neutral-400',
  running: 'bg-[#F5B301]/15 text-[#F5B301]',
  failed: 'bg-red-500/15 text-red-400',
  stopped: 'bg-neutral-800 text-neutral-400',
  interrupted: 'bg-orange-500/15 text-orange-300',
};

export function StateBadge({ state }: { state: RunState }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${STATE_STYLE[state]}`}
    >
      {state === 'running' && (
        <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#F5B301]" />
      )}
      {STATE_LABEL[state]}
    </span>
  );
}

export interface AgentListProps {
  agents: AgentSummary[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onNew: () => void;
  className?: string;
}

/** Every agent, newest activity first, with what each is doing. */
export function AgentList({ agents, selectedId, onSelect, onNew, className = '' }: AgentListProps) {
  const working = agents.filter((a) => a.runState === 'running').length;
  return (
    <nav aria-label="Agents" className={`flex-col overflow-y-auto border-neutral-800 ${className}`}>
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <span className="text-xs text-neutral-500">
          {agents.length === 0
            ? 'No agents yet'
            : `${String(agents.length)} agent${agents.length === 1 ? '' : 's'}, ${String(working)} working`}
        </span>
        <button
          type="button"
          onClick={onNew}
          className="rounded bg-[#F5B301] px-2.5 py-1 text-xs font-medium text-neutral-950"
        >
          New agent
        </button>
      </div>
      <ul className="flex flex-col pb-2">
        {agents.map((agent) => (
          <li key={agent.id}>
            <button
              type="button"
              onClick={() => {
                onSelect(agent.id);
              }}
              aria-current={agent.id === selectedId ? 'true' : undefined}
              className={`flex w-full flex-col gap-1 px-3 py-2 text-left ${
                agent.id === selectedId ? 'bg-neutral-800' : 'hover:bg-neutral-900'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="line-clamp-1 text-xs font-medium text-neutral-100">
                  {agent.name}
                </span>
                <StateBadge state={agent.runState} />
              </span>
              <span className="flex items-center justify-between gap-2 text-[10px] text-neutral-500">
                <span className="line-clamp-1">{agent.projectName ?? 'scratch workspace'}</span>
                <time dateTime={agent.updatedAt}>
                  {new Date(agent.updatedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
