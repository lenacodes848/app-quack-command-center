import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** A folder an agent may be launched in. */
export interface Project {
  name: string;
  path: string;
  /** Whether it is a git repository, and so gets a worktree per agent. */
  git: boolean;
}

/** A launch that cannot go ahead, with a message fit to show the owner. */
export class WorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceError';
  }
}

function realpathOrUndefined(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
}

/**
 * The folders directly under each root, in name order.
 *
 * One level only: a project is something the owner put in a projects folder,
 * not every directory in it. A root that is missing is skipped rather than
 * failing the list, so one stale entry in the configuration does not hide the
 * rest.
 */
export function listProjects(roots: readonly string[]): Project[] {
  const projects: Project[] = [];
  for (const root of roots) {
    const real = realpathOrUndefined(root);
    if (real === undefined) continue;
    for (const entry of readdirSync(real, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const path = join(real, entry.name);
      projects.push({ name: entry.name, path, git: existsSync(join(path, '.git')) });
    }
  }
  return projects.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
}

/**
 * The real path of a requested project, or a {@link WorkspaceError}.
 *
 * The browser names the folder, so nothing about the request is trusted: the
 * path is resolved through every symlink first and only then compared against
 * the roots, also resolved. Comparing the spelling instead would let a link
 * inside a root lead anywhere on the disk.
 */
export function resolveProject(roots: readonly string[], requested: string): string {
  if (roots.length === 0) {
    throw new WorkspaceError(
      'No project folders are configured. Set QUACK_PROJECT_ROOTS and restart the server.',
    );
  }
  const real = realpathOrUndefined(requested);
  if (real === undefined) throw new WorkspaceError('That project folder does not exist.');

  const inside = roots.some((root) => {
    const realRoot = realpathOrUndefined(root);
    // Strictly inside: the root itself is a collection of projects, not one.
    return realRoot !== undefined && real.startsWith(realRoot + sep);
  });
  if (!inside) throw new WorkspaceError('That folder is not inside an approved project root.');
  if (!statSync(real).isDirectory()) throw new WorkspaceError('That project is not a folder.');
  return real;
}

/** Longest slug taken from an agent's name. */
const SLUG_LIMIT = 40;

/**
 * The branch an agent's worktree is created on: `quack/<slug>-<id prefix>`.
 *
 * The slug makes the branch recognisable in `git branch`; the id prefix makes
 * it unique, so two agents with the same name never contend for one branch.
 */
export function branchName(name: string, agentId: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-+|-+$/gu, '')
      .slice(0, SLUG_LIMIT)
      .replace(/-+$/u, '') || 'agent';
  const suffix = agentId
    .replace(/[^a-z0-9]/giu, '')
    .slice(0, 6)
    .toLowerCase();
  return `quack/${slug}-${suffix}`;
}

/**
 * Git's environment, less anything that would point it at another repository.
 *
 * The server may itself be started from a git hook or a shell that exported
 * these, and git obeys them over `-C`.
 */
function gitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR']) {
    Reflect.deleteProperty(env, key);
  }
  return env;
}

export interface PrepareWorkspaceInput {
  /** A path already through {@link resolveProject}. */
  projectDir: string;
  /** Where worktrees are kept, under the data directory. */
  worktreesDir: string;
  agentId: string;
  name: string;
}

export interface PreparedWorkspace {
  /** Where the agent runs. */
  workspaceDir: string;
  /** The worktree's branch, when there is one. */
  branch: string | undefined;
}

/**
 * Where a new agent will run.
 *
 * A git repository gets a worktree of its own on a new branch taken from the
 * current commit, so agents working on one project never edit the same files.
 * Anything else runs in place, and the registry allows only one agent at a time
 * there. Nothing here ever removes a worktree: that is the owner's decision.
 */
export async function prepareWorkspace(input: PrepareWorkspaceInput): Promise<PreparedWorkspace> {
  if (!existsSync(join(input.projectDir, '.git'))) {
    return { workspaceDir: input.projectDir, branch: undefined };
  }

  const branch = branchName(input.name, input.agentId);
  const workspaceDir = join(input.worktreesDir, input.agentId);
  mkdirSync(input.worktreesDir, { recursive: true, mode: 0o700 });

  try {
    await run(
      'git',
      ['-C', input.projectDir, 'worktree', 'add', '-b', branch, workspaceDir, 'HEAD'],
      {
        env: gitEnv(),
        timeout: 30_000,
      },
    );
  } catch (failure) {
    const raw = (failure as { stderr?: unknown }).stderr;
    const stderr = typeof raw === 'string' ? raw : '';
    if (/invalid reference: HEAD/u.test(stderr)) {
      throw new WorkspaceError(
        'That repository has no commits yet, so there is nothing to branch from. Make a first commit, then launch again.',
      );
    }
    const detail = stderr.trim().split('\n').at(-1) ?? '';
    throw new WorkspaceError(
      detail === ''
        ? 'Creating a git worktree failed.'
        : `Creating a git worktree failed: ${detail}`,
    );
  }

  return { workspaceDir, branch };
}
