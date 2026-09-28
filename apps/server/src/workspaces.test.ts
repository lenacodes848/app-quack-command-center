import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  branchName,
  listProjects,
  prepareWorkspace,
  resolveProject,
  WorkspaceError,
} from './workspaces.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

/** A scratch directory, through realpath so macOS's /var -> /private/var link cannot confuse a comparison. */
function scratch(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'quack-ws-')));
  cleanups.push(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    // An identity with no address: a commit needs one, and a test file holding
    // an email address would trip the source-protection scan.
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', HOME: '/nonexistent' },
  });
}

function makeRepo(dir: string, withCommit = true): void {
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q');
  if (withCommit) {
    git(
      dir,
      '-c',
      'user.name=quack',
      '-c',
      'user.email=',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'init',
    );
  }
}

describe('listProjects', () => {
  test('lists the folders directly under each root, and which are git repositories', () => {
    const root = scratch();
    makeRepo(join(root, 'app'));
    mkdirSync(join(root, 'notes'));

    expect(listProjects([root])).toEqual([
      { name: 'app', path: join(root, 'app'), git: true },
      { name: 'notes', path: join(root, 'notes'), git: false },
    ]);
  });

  test('skips hidden folders and plain files', () => {
    const root = scratch();
    mkdirSync(join(root, '.cache'));
    execFileSync('touch', [join(root, 'README.md')]);
    mkdirSync(join(root, 'real'));
    expect(listProjects([root]).map((p) => p.name)).toEqual(['real']);
  });

  test('a root that does not exist lists nothing rather than failing the rest', () => {
    const root = scratch();
    mkdirSync(join(root, 'kept'));
    expect(listProjects([join(root, 'missing'), root]).map((p) => p.name)).toEqual(['kept']);
  });
});

describe('resolveProject', () => {
  test('accepts a folder inside a root and returns its real path', () => {
    const root = scratch();
    mkdirSync(join(root, 'app'));
    expect(resolveProject([root], join(root, 'app'))).toBe(join(root, 'app'));
  });

  test.each([
    ['the root itself', (root: string) => root],
    ['a folder outside every root', (root: string) => join(root, '..')],
    ['a path that climbs out with ..', (root: string) => join(root, 'app', '..', '..')],
    ['a folder that does not exist', (root: string) => join(root, 'nope')],
    ['a sibling whose name starts with the root', (root: string) => `${root}-evil`],
  ])('refuses %s', (_label, pick) => {
    const root = scratch();
    mkdirSync(join(root, 'app'));
    mkdirSync(`${root}-evil`, { recursive: true });
    cleanups.push(() => {
      rmSync(`${root}-evil`, { recursive: true, force: true });
    });
    expect(() => resolveProject([root], pick(root))).toThrow(WorkspaceError);
  });

  test('refuses a symlink inside a root that points outside it', () => {
    // The check is on where the path really leads, not on how it is spelled.
    const root = scratch();
    const outside = scratch();
    symlinkSync(outside, join(root, 'escape'));
    expect(() => resolveProject([root], join(root, 'escape'))).toThrow(WorkspaceError);
  });

  test('refuses a file', () => {
    const root = scratch();
    execFileSync('touch', [join(root, 'file')]);
    expect(() => resolveProject([root], join(root, 'file'))).toThrow(WorkspaceError);
  });

  test('refuses everything when no roots are configured', () => {
    const root = scratch();
    mkdirSync(join(root, 'app'));
    expect(() => resolveProject([], join(root, 'app'))).toThrow(/QUACK_PROJECT_ROOTS/);
  });
});

describe('branchName', () => {
  test('is a readable slug of the name, made unique by the agent id', () => {
    expect(branchName('Fix the Login bug!', 'a1b2c3d4-0000')).toBe(
      'quack/fix-the-login-bug-a1b2c3',
    );
  });

  test('falls back to "agent" when the name has nothing usable', () => {
    expect(branchName('???', 'ffffff00')).toBe('quack/agent-ffffff');
  });

  test('keeps the slug short', () => {
    expect(branchName('x'.repeat(200), 'abcdef12').length).toBeLessThanOrEqual(6 + 40 + 7);
  });
});

describe('prepareWorkspace', () => {
  test('gives an agent in a git repository its own worktree on a new branch', async () => {
    const root = scratch();
    const project = join(root, 'app');
    makeRepo(project);
    const worktrees = join(scratch(), 'worktrees');

    const prepared = await prepareWorkspace({
      projectDir: project,
      worktreesDir: worktrees,
      agentId: 'a1b2c3d4',
      name: 'Fix login',
    });

    expect(prepared).toEqual({
      workspaceDir: join(worktrees, 'a1b2c3d4'),
      branch: 'quack/fix-login-a1b2c3',
    });
    expect(git(prepared.workspaceDir, 'branch', '--show-current').trim()).toBe(
      'quack/fix-login-a1b2c3',
    );
    // The project's own checkout is untouched.
    expect(git(project, 'branch', '--show-current').trim()).not.toBe('quack/fix-login-a1b2c3');
  });

  test('two agents in one repository get two separate worktrees', async () => {
    const project = join(scratch(), 'app');
    makeRepo(project);
    const worktrees = join(scratch(), 'worktrees');

    const first = await prepareWorkspace({
      projectDir: project,
      worktreesDir: worktrees,
      agentId: 'aaaaaa01',
      name: 'x',
    });
    const second = await prepareWorkspace({
      projectDir: project,
      worktreesDir: worktrees,
      agentId: 'bbbbbb02',
      name: 'x',
    });

    expect(first.workspaceDir).not.toBe(second.workspaceDir);
    expect(first.branch).not.toBe(second.branch);
  });

  test('runs an agent in a folder that is not a repository in place, with no branch', async () => {
    const project = join(scratch(), 'notes');
    mkdirSync(project);
    const worktrees = join(scratch(), 'worktrees');

    expect(
      await prepareWorkspace({
        projectDir: project,
        worktreesDir: worktrees,
        agentId: 'a1',
        name: 'x',
      }),
    ).toEqual({ workspaceDir: project, branch: undefined });
    expect(existsSync(worktrees)).toBe(false);
  });

  test('explains a repository with no commits instead of passing on git', async () => {
    const project = join(scratch(), 'empty');
    makeRepo(project, false);
    await expect(
      prepareWorkspace({
        projectDir: project,
        worktreesDir: join(scratch(), 'w'),
        agentId: 'a1',
        name: 'x',
      }),
    ).rejects.toThrow(/no commits/);
  });
});
