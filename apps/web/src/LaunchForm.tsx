import { useEffect, useState } from 'react';
import { launchAgent, listProjects, type ProjectList } from './api.js';

const MODELS = [
  { value: '', label: 'Default model' },
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' },
];

const FIELD =
  'w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none placeholder:text-neutral-600 focus:border-[#F5B301]';

export interface LaunchFormProps {
  /** Called with the new agent, and the reason its first message was refused if it was. */
  onLaunched: (agentId: string, notice: string | undefined) => void;
  onCancel: () => void;
}

/** Name, project, model and first message for a new agent. */
export function LaunchForm({ onLaunched, onCancel }: LaunchFormProps) {
  const [projects, setProjects] = useState<ProjectList | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [name, setName] = useState('');
  const [project, setProject] = useState('');
  const [model, setModel] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    void listProjects().then((listed) => {
      if (listed === undefined) setLoadFailed(true);
      setProjects(listed);
      setProject(listed?.projects[0]?.path ?? '');
    });
  }, []);

  const submit = async (): Promise<void> => {
    if (busy || project === '') return;
    setBusy(true);
    setError(undefined);
    const result = await launchAgent({ name, project, model, text });
    setBusy(false);
    if (result.agent === undefined) {
      setError(result.error ?? 'The agent could not be launched.');
      return;
    }
    onLaunched(result.agent.id, result.error);
  };

  const chosen = projects?.projects.find((p) => p.path === project);

  return (
    <form
      className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h2 className="text-sm font-semibold">Launch an agent</h2>

      {loadFailed && (
        <p role="alert" className="text-sm text-red-400">
          Could not load your projects. Is the server still running?
        </p>
      )}
      {projects !== undefined && !projects.configured && (
        <p className="rounded border border-neutral-800 p-3 text-sm text-neutral-400">
          No project folders are configured. Set <code>QUACK_PROJECT_ROOTS</code> to the folder that
          holds your projects, for example <code>QUACK_PROJECT_ROOTS=~/Projects</code>, and restart
          the server.
        </p>
      )}
      {projects?.configured === true && projects.projects.length === 0 && (
        <p className="text-sm text-neutral-400">The configured project folders are empty.</p>
      )}

      <label className="flex flex-col gap-1 text-xs text-neutral-400">
        Project
        <select
          value={project}
          onChange={(event) => {
            setProject(event.target.value);
          }}
          className={FIELD}
          disabled={projects === undefined || projects.projects.length === 0}
        >
          {projects?.projects.map((p) => (
            <option key={p.path} value={p.path}>
              {p.name}
            </option>
          ))}
        </select>
        {chosen !== undefined && (
          <span className="text-[11px] text-neutral-500">
            {chosen.git
              ? 'A git repository: the agent works in its own worktree, on a new quack/ branch.'
              : 'Not a git repository: the agent works in the folder itself, and only one agent can work there at a time.'}
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1 text-xs text-neutral-400">
        Name <span className="text-neutral-600">(optional, used for the branch)</span>
        <input
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
          maxLength={80}
          placeholder="Fix the login bug"
          className={FIELD}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-neutral-400">
        Model
        <select
          value={model}
          onChange={(event) => {
            setModel(event.target.value);
          }}
          className={FIELD}
        >
          {MODELS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-neutral-400">
        First message <span className="text-neutral-600">(optional)</span>
        <textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
          rows={4}
          placeholder="What should this agent do?"
          className={`${FIELD} resize-y`}
        />
      </label>

      {error !== undefined && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || project === ''}
          className="rounded bg-[#F5B301] px-4 py-2 text-sm font-medium text-neutral-950 disabled:opacity-40"
        >
          {busy ? 'Launching…' : 'Launch'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:border-neutral-500"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
