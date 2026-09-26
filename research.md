# Research

Last updated: 2026-09-24

## Installed versions (recorded 2026-09-24)

- macOS 15.7.9, arm64
- Node.js 24.21.0 LTS (via nvm, pinned in `.nvmrc`), npm 11.19.0
- git 2.55.0
- tmux 3.7c
- gitleaks 8.30.1 (installed with Homebrew)
- Claude Code 2.1.282, logged in through a claude.ai subscription
- Codex CLI: not installed. Hermes: not installed. cloudflared: not installed.

## Dependency verification (2026-09-24)

The PRD pins were observed on 2026-07-28. The npm registry on 2026-09-24 reports the versions below. The PRD requires the whole set to be reverified together before installation. The whole set was installed, type checked, built and tested together on 2026-09-24, see the spike below.

| Package | PRD pin | Registry latest | Plan |
|---|---|---|---|
| Node.js | 24.18.0 | 24.21.0 (LTS) | Use 24.21.0, same LTS line |
| TypeScript | 6.0.2 | 7.0.2 | New major. Staying on 6.0.2: typescript-eslint does not support 7 (see spike below) |
| React | 19.2.8 | 19.3.0 | Use the PRD pin (verified together, see spike below) |
| Vite | 8.1.5 | 8.3.1 | Use the PRD pin. A root override keeps a single copy, see Failed approaches |
| @vitejs/plugin-react | 6.0.4 | 6.1.1 | Use the PRD pin (verified together, see spike below) |
| Fastify | 5.10.0 | 5.12.5 | Use the PRD pin (verified together, see spike below) |
| Zod | 4.4.3 | 4.6.5 | Use the PRD pin (verified together, see spike below) |
| Tailwind CSS | 4.3.3 | 4.3.3 | Matches |
| Vitest | 4.1.10 | 5.0.1 | New major. Using 4.1.11, the patched release of the 4.1 line (4.1.10 has an advisory), see decisions below |
| Playwright | 1.62.0 | 1.63.0 | **Deviation: using 1.63.0.** 1.62.0 cannot load this repository's tsconfig (see below) |
| better-sqlite3 | 13.0.1 | 13.0.3 | Use the PRD pin 13.0.1 (loads, FTS5, backup verified). 13.0.3 also verified |

Rule: exact versions in the lockfile, and any choice that differs from the PRD pin is recorded here with the reason.

### better-sqlite3 check (passed)

In a throwaway directory on Node.js 24.21.0 arm64, better-sqlite3 13.0.3 installed from a prebuilt binary with no compile step. It reported SQLite 3.53.4, a working FTS5 virtual table and MATCH query, WAL mode, and a `backup()` function. This covers the FTS5 search (Task 031) and online backup (Task 005) requirements. Its declared engine range is Node 22 or later.

### Whole-toolchain compatibility spike (2026-09-24, for TASK_002)

Two throwaway projects on Node.js 24.21.0 arm64, each with a Fastify + Zod + better-sqlite3 server test (via `inject`), a React 19 + Tailwind page built by Vite, Vitest with v8 coverage, and Playwright installed.

| Variant | Versions | type-check | Vite build | Vitest + coverage | Native module |
|---|---|---|---|---|---|
| A: PRD pins | TypeScript 6.0.2, React 19.2.8, Vite 8.1.5, plugin-react 6.0.4, Fastify 5.10.0, Zod 4.4.3, Tailwind 4.3.3, Vitest 4.1.10, Playwright 1.62.0, better-sqlite3 13.0.1 | pass | pass | pass (1 test, 100%) | loads, FTS5 match, `backup()` present |
| B: registry latest | TypeScript 7.0.2, React 19.3.0, Vite 8.3.1, plugin-react 6.1.1, Fastify 5.12.5, Zod 4.6.5, Vitest 5.0.1, Playwright 1.63.0, better-sqlite3 13.0.3 | pass | pass | pass | loads |

Lint and format on variant A: ESLint 10.11.0, `@eslint/js` 10.0.1, typescript-eslint 8.70.1 and Prettier 3.9.9 work with type-aware strict rules on TypeScript 6.0.2. Mutation check: a floating promise, an async function with no await and an unused variable each raised the expected errors, so type-aware linting is really running.

**Decisions:**
- **Use the PRD pins exactly** (variant A) plus the lint stack above and `@types/node` 24.13.6 (the Node 24 line).
- **TypeScript stays on 6.0.2.** typescript-eslint 8.70.1 declares `typescript >=4.8.4 <6.1.0`, so TypeScript 7 would leave the required lint stack unsupported, even though the toy project compiled. Revisit when typescript-eslint supports 7.
- **Vitest stays on the 4.1 line, at 4.1.11 (a deviation from the PRD pin 4.1.10).** `npm audit` on the real repository reported a moderate advisory (path traversal or arbitrary file read through `@vitest/mocker`, GHSA-82fw-gwwq-j7x9) affecting Vitest and `@vitest/coverage-v8` up to 4.1.10. 4.1.11 fixes it and `npm audit` reports 0 vulnerabilities after the bump. Vitest 5.0.1 also passed the toy project, but nothing needs it. Upgrade to 5 deliberately later.
- Variant B passing means the newer minors are a low-risk future upgrade. It is not a reason to deviate now.
- **Playwright is 1.63.0, a deviation from the PRD pin 1.62.0 (decided 2026-09-25, on evidence).** The pin was originally 1.63.0 by accident. A review caught the mismatch between the lockfile and this table, so 1.62.0 was installed to correct it — and it does not work here. `npx playwright test` fails before running anything:

  ```
  Error: Failed to load tsconfig file at ./tsconfig.json:
  Failed to resolve "references" path "packages/contracts"
  ```

  1.62.0's tsconfig loader cannot follow this repository's project references, which exist because the monorepo is built with `tsc -b`. 1.63.0 loads the same file and the smoke test passes in 3.3s. The toy project in variant A never hit this because it had no project references. Deviating deliberately, with the evidence, rather than pinning back to a version that cannot run.

**Native module and npm 11 install scripts.** npm 11.19 reports better-sqlite3's `node-gyp rebuild` install script as "not yet covered by allowScripts" and does not run it. The module still loads because the package ships prebuilt binaries for darwin arm64 and x64, linux x64 and arm64 (glibc and musl) and win32, and no compile is needed. Keep the script unapproved: it is unnecessary and install scripts run arbitrary code. **Confirmed on Linux CI 2026-09-25** (runs 36203418984, both the `validate` and `e2e` jobs): `npm ci` on ubuntu-latest reported the same "install scripts not yet covered by allowScripts" warning for better-sqlite3 13.0.1 and never ran `node-gyp rebuild`, and every storage test passed, so the runner loads the prebuilt binary exactly as macOS does. No compiler is needed in CI.

## Architecture decisions

| ID | Decision | Date | Notes |
|---|---|---|---|
| D3 | Level One provider is Claude Code | 2026-09-24 | Only installed provider |
| D4 | Second provider decided at the Phase 6 gate | 2026-09-24 | Codex, Hermes and hosted tasks are pending_decision |
| D5 | Application authentication is owner device pairing | 2026-09-24 | Written design must be approved before TASK_013 |
| D6 | Remote access is Cloudflare Tunnel with Access, built in Phase 6 | 2026-09-24 | Loopback only until then |
| D7 | Permission policy: ask before important actions | 2026-09-24 | No browser bypass |
| D11 | Orchestration and review loop excluded | 2026-09-24 | TASK_033 and TASK_034 not_applicable |
| D13 | tmux compatibility mode (modals, seeds, reattach) stays in scope, decided at the Phase 7 gate | 2026-09-24 | Structured Claude Code adapter is built first |
| D-root | Allowed working directory root is ~/Downloads/1-git for now | 2026-09-24 | Revisit before Phase 7 (macOS protects Downloads, which may affect a background service) |

## Security decisions

- Server binds to loopback. Remote access, when built, is Cloudflare Access at the edge plus an application session at the origin.
- Working directories are restricted to configured roots, resolved through symlinks. Roots are changed locally only, and no API route edits them.
- Device pairing design: not yet written. It is written here and approved by the owner before TASK_013 starts. The planned shape is a single use, short lived pairing code written to a file with owner-only permissions at startup, exchanged for an HTTP only, secure, same site, expiring and revocable cookie backed by an `app_sessions` table.
- Secret scanning: CI installs a pinned gitleaks (version and SHA-256 in `.github/workflows/secrets.yml`, checksum taken from the official release and matched against a separate download, and the version must equal the one recorded above) and runs `npm run scan:secrets` (full working tree) and `npm run scan:secrets:history` (full history) with the same scripts a developer runs. The history script fails when gitleaks reports zero commits scanned. The workflow token is read only (`contents: read`). The `gitleaks/gitleaks-action` action is not used, see Failed approaches.
- Source protection: `scripts/source-protection-scan.mjs` fails on absolute macOS or Linux home directory paths that include a user name (with or without a trailing slash), on email addresses other than the reserved example domains, GitHub's noreply forms and the SSH remote form (user `git` at a host), and on any entry in the local, gitignored `.source-protection-denylist`. Tilde paths such as `~/Downloads/1-git` are deliberately allowed because they name no user, so the worksheet can name the projects directory. It prints file, line and rule, never the matched text.
- Source protection also scans **commit metadata** — author and committer name and email — not only file content. Added 2026-09-25 after the repository was made public with a personal name and address sitting in the author field of 30 of 36 commits while every check was green.
  - **Scope is `HEAD`, not `--all`.** `--all` walks every ref in a checkout, so a stale local branch or a leftover `refs/remotes/pr/*` fails the scan with a finding unrelated to the code under review — and since the scanner prints no matched text by design, that finding is near-undiagnosable. Findings name the ref alongside the commit. Override with `SOURCE_PROTECTION_REF`.
  - **Policy consequence of being public (recorded 2026-09-25).** The identity rule applies to whatever history is scanned, so an outside contributor whose commits carry an ordinary personal address will fail `scan:source` on their own pull request. That is intended for a single-owner project, and it is written down here rather than left to be discovered: this repository is public to get required status checks, not to invite contributions. If that ever changes, the rule has to be scoped to the owner's own commits instead of dropped.

## Known provider limitations and unknowns

- Claude Code flags, structured stream formats, permission prompt handling, config-directory isolation, attachment support and transcript layout have not been verified yet. Task 010 step 0 records them here from the official documentation and `claude --help` on the installed version before any adapter code is written.
- Whether headless Claude Code can bridge permission prompts is the highest risk item. If it cannot, the adapter reports questions as unsupported and the tmux compatibility mode is the fallback.

## Verified provider behaviour (CLI 2.1.282, live, 2026-09-25)

Measured by running the real binary, not read from documentation. The reliable instrument is the CLI's own `system/init` event under `--output-format stream-json --verbose`, which lists the tools and MCP servers a turn actually holds. Do not ask the model what tools it has: asked the same question twice it gave contradictory answers, once denying connectors it demonstrably held.

- **`--print` denies anything that would prompt.** `--permission-prompts` defaults to `none` there, so with no permission mode the agent announces a tool and then reports the action refused. A headless turn therefore cannot write a file unless told otherwise. `--permission-mode acceptEdits` allows edits in the working directory; the accepted modes are `acceptEdits`, `auto`, `bypassPermissions`, `manual`, `dontAsk` and `plan`.
- **`CLAUDE_CONFIG_DIR` isolates the credentials along with everything else.** Pointed at an empty scratch directory the turn answers `Not logged in, please run /login`. It is therefore not usable as a config-isolation mechanism while the product depends on the owner's subscription. This answers the "config-directory isolation" unknown above.
- **`--restricted` does not remove the signed-in account's connectors.** It removes the tools that run commands or code, and the MCP servers that come from configuration files: with it, chrome-devtools and playwright (both `"source":"user"`) disappear and `Bash` is absent. Every connector with `"source":"claudeai"` survives. A restricted turn still held 114 tools including the owner's Gmail, Google Drive, Google Calendar and Blotato. Those arrive with the account, not with a config file, which is why no config isolation reaches them.
- **`--tools` governs only the built-in set.** An allowlist of six built-in tools still left 93 `mcp__*` tools in place. It is not a way to exclude connectors.
- **`--disallowedTools mcp__*` is what removes them.** The same turn went from 114 tools to 21, with `Read` and `Write` intact and `Bash` absent. This is the flag the adapter relies on.
- **A plain `spawn` leaks the parent's session.** A dashboard started from inside a Claude Code session passed the child `CLAUDECODE`, `AI_AGENT` and six `CLAUDE_CODE_` variables including the session id and the messaging token. A child holding those is a participant in a conversation it knows nothing about, and it also changes how connectors load, which confounded an earlier measurement. The adapter strips them.
- **The posture the adapter sends** is therefore `--print <prompt> --output-format stream-json --verbose --permission-mode acceptEdits --restricted --disallowedTools mcp__*`, with restricted the default rather than an opt-in, plus `--resume <id>` on later turns. Sessions resume correctly: a second turn answered from the first turn's context in a workspace holding nothing else.
- **Still unverified:** attachments, transcript layout on disk, and bridging a real permission prompt to a browser (`--permission-prompts host` with `--input-format stream-json`), which remains the route to per-tool approval if that is wanted later.

## PRD defects noted

- Section 9.2 numbers items 16 to 20 twice. Cosmetic.
- The PRD data model (3.6) has no table for application sessions. Task 013 adds an `app_sessions` migration.
- Story 8 (stop a turn) is in the owner's second wave, but Task 017 bundles interrupt with the composer, so basic stop ships in Phase 4.

## Environment notes

- Always run `nvm use` in this repository. The machine default is Node 22, the project needs Node 24.
- `.source-protection-denylist` is gitignored and exists only on this machine. It holds the owner's name. To recreate it, copy `.source-protection-denylist.example` to that name and add the owner's name and any private identifiers, one per line. Never commit it.
- `gh` is authenticated and pushing over HTTPS works. The repository is private, default branch `main`, and work goes through pull requests, one independent branch off `main` per pull request. Stacked pull requests do not retarget automatically when the parent merges: GitHub only retargets when the base branch is deleted. After merging a parent, either delete its branch or run `gh pr edit <child> --base main`, then confirm with `gh pr view <child> --json baseRefName` before merging the child.
- Not installed: Codex CLI, Hermes, `cloudflared`, Playwright browsers.
- The original starter-kit folder in the owner's Downloads folder is reference only. Everything needed is in this repository.
- Node 24's test runner needs a quoted glob: `node --test "tests/repo/*.test.mjs"`.

## Shell and workflow pitfalls

Each of these cost time in this project. Apply them from the start.

- The shell is zsh, which does not word-split unquoted variables. A `for x in $LIST` loop sees one item. Use explicit lists or `${=LIST}`.
- macOS has no `timeout` command. To put a time limit on something, use `perl -e 'alarm 60; exec @ARGV' <command>`.
- Git operations that need authentication over HTTPS (`git push`, `git fetch --prune`, `git ls-remote`) can hang indefinitely here, and stuck `git-remote-https` processes pile up. `gh` keeps working throughout. The configured credential helper is `osxkeychain`, which is the probable cause (a stalled keychain prompt). Workaround that does not modify any git config: `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push -u origin <branch>`, with `GIT_TERMINAL_PROMPT=0` and a perl alarm. Kill leftovers with `pkill -f "git-remote-https origin"`. For listing and deleting remote branches skip git entirely: `gh api repos/{owner}/{repo}/branches` to list, `gh api -X DELETE repos/{owner}/{repo}/git/refs/heads/<branch>` to delete, and `git update-ref -d refs/remotes/origin/<branch>` to clear a stale tracking ref.
- Chain a multi-step edit, the checks and the commit with `&&` (or `set -e`). A script that fails partway must not be followed by a commit. Twice a failed edit script was followed by a commit and push anyway.
- Commit before mutation-testing. A stray `git checkout <file>` after a mutation silently discarded an uncommitted fix. Restore from a backup copy, or commit first.
- Run lint, type-check, format check and the tests before every commit, chained. One commit went in with lint failing.
- Inside a quoted heredoc, write a single backslash for a newline escape in Python. A doubled backslash writes a literal backslash and n into the file. A repository test now fails if a memory file contains one.
- `nvm use` with no argument fails in a directory that has no `.nvmrc`. Chained with `&&` it silently skips everything after it, which for a while looked like the CLI producing no output at all. Use `nvm use 24.21.0` when the working directory is outside the repository.
- The source-protection scan rejects a literal home-directory path anywhere in the tree, test fixtures included. A fake `HOME` in a test must be assembled from parts, the same rule the email fixtures already follow.
- **ESLint does not read `.gitignore`.** `playwright-report/` and `test-results/` are git-ignored, so one failing browser test used to leave behind bundled trace JavaScript that `npm run lint` then tried to type-check, dying with "you have used a rule which requires type information". It stayed broken on every later run until the directory was deleted by hand. Both are now in the ESLint ignores. Any new generated directory needs adding in both places.
- **Timestamps tie, so never assert ordering with a real clock.** Two writes in the same millisecond make an ordering assertion pass whatever the code does, and mutation testing caught two such tests here. `openStore` takes an injectable `now`; the ordering test runs it backwards, which is the only way to prove the code sorts on the sequence and not on the time.
- **better-sqlite3 enables foreign keys by default.** Removing our explicit `PRAGMA foreign_keys = ON` breaks no test. The pragma stays because the setting is per-connection rather than stored in the file, but it is belt and braces, not the thing that makes enforcement work.
- A green CI tick is evidence only for the commit it ran on. Compare the run's `headSha` with the pull request head, and read what the scanner actually scanned.
- Read the whole issue, reproduce it, and test the suggested fix before adopting it. The suggested fix for issue 10 would not have worked.
- CI runs two workflows. `secrets-and-source-protection` runs the repository tests and the three scans; `validate` runs `npm ci`, format check, lint, type-check, unit tests with coverage, the builds, the integration project and the browser smoke test, in a `validate` job and an `e2e` job. Coverage and Playwright artifacts are retained and upload even when the run fails. Landed 2026-09-25.
- `npm run test:repo` deliberately runs in the secrets workflow only. Some of its tests shell out to gitleaks, which only that workflow installs, so running it in `validate` too would fail on a missing binary.
- **What CI still does not enforce:** merging. No branch-protection ruleset exists yet, so a red check does not block a merge. TASK_003 acceptance criterion 6 and test requirement 1 remain unmet for that reason, and the ruleset waits until the open pull requests have landed — one requiring the `validate` and `e2e` checks would block any branch whose workflows do not produce them.

## Follow-ups and known gaps

- **Branch protection: decided 2026-09-25.** Classic branch protection refused with HTTP 403 on the old private plan. The owner's answer was to make the repository **public**, specifically so that required status checks become available. No longer an open question.
  - Use the **repository rulesets** endpoint, not classic protection: `repos/{owner}/{repo}/rulesets` answers `200` on this repository while `branches/main/protection` still answers `403`.
  - The ruleset is deliberately **not created yet**. A ruleset that requires a check a branch's workflows do not produce blocks that branch from merging at all, so it must wait until the open pull requests have landed. Until then, TASK_003 criterion 6 and test requirement 1 are **unmet**, and their PRD boxes stay unticked.
- **CI hardening, deferred to TASK_003:** pin the first-party actions (`actions/checkout`, `actions/setup-node`) to commit SHAs. The rest of this item is done: `npm ci`, type-check, lint, Vitest and the builds all run in CI, full-tree and full-history secret scanning works (issue 3), and the Linux runner was confirmed on 2026-09-25 to load better-sqlite3 from its prebuilt binary.
- **Scanner rule gaps:** the email and home-directory gaps are fixed (issues 4 and 5). One remains: `package-lock.json` is excluded from the scanner by exact path at the repository root only (issue 6). Fix it with a test first, and never loosen a rule to make a build pass.
- **Tests built from fragments:** the scanner tests assemble their fixtures from string fragments so the test source does not match its own rules. Keep that pattern.

## Official documentation links

Recheck before each adapter. All are listed in PRD section 16.

- Node.js releases: https://nodejs.org/en/about/previous-releases
- Fastify TypeScript and testing: https://fastify.dev/docs/latest/Reference/TypeScript/ and https://fastify.dev/docs/latest/Guides/Testing/
- React useSyncExternalStore: https://react.dev/reference/react/useSyncExternalStore
- Vite: https://vite.dev/guide/
- Codex app server, CLI, auth: https://developers.openai.com/codex/app-server, https://developers.openai.com/codex/cli/reference, https://developers.openai.com/codex/auth
- Claude Code CLI: https://code.claude.com/docs/en/cli-usage
- Hermes API server, sessions, CLI: https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server/
- Cloudflare Tunnel: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/
- Cloudflare Access self hosted app: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/

## Failed approaches

- 2026-09-25: Isolating the dashboard's Claude configuration with `CLAUDE_CONFIG_DIR`. It works, completely, including the authentication, so the turn came back `Not logged in`. The credentials live with the configuration, so there is no version of this that keeps the product working while starting from an empty config directory.
- 2026-09-25: Believing `--restricted` had removed the owner's connectors. A direct run of it reported none, and the finding was wrong twice over. The run happened inside a Claude Code session, so the child inherited `CLAUDECODE` and the rest, and a nested child does not load connectors the same way; and the evidence was the model's own account of its tools, which contradicted itself between two runs of the same prompt. The `system/init` event showed 114 tools including Gmail and Drive. Two lessons: scrub the environment before measuring anything about a child CLI, and never use the model's self-report as an instrument when the protocol states the fact directly.

- 2026-09-24: Stacked pull requests. This file once claimed that a child pull request follows its parent to `main` on its own. It does not: GitHub retargets only when the base branch is deleted. After #1 merged without its branch being deleted, #2 still pointed at the old parent and had to be retargeted by hand, and merging it as it stood would have looked merged while never reaching `main`. The correct procedure is in Environment notes. Prefer independent branches off `main`, and reserve stacking for work that genuinely depends on an unmerged parent.

- 2026-09-24: `gitleaks/gitleaks-action@v2` reported "No leaks detected" on the pushes to `main` from merging pull requests 2 and 9 while scanning zero commits. On a push it scans `--no-merges --first-parent <before>^..<after>`. After a merge-commit merge the first-parent line contains only merge commits, and `--no-merges` removes them, so the range is empty and gitleaks exits 0. Replaced by a pinned CLI that scans the full tree and full history, and the history script now fails on zero commits scanned. Never trust a scanner's green tick without seeing what it scanned.
- 2026-09-24: `tsc -b` kept its incremental state in `tsconfig.tsbuildinfo` next to each package's tsconfig, outside `dist`. Deleting `dist` the obvious way left that state behind, `tsc -b` judged every project up to date and emitted nothing, and the web build then failed with a misleading package-resolution error ("Failed to resolve entry for package"). Fix: `tsBuildInfoFile` is `${configDir}/dist/.tsbuildinfo` in `tsconfig.base.json`, so the state and the outputs live and die together, plus `npm run clean` (removes build output and any legacy build-info files). For CI caching in TASK_003: cache each `dist` as a unit, never the build info without its outputs.
- 2026-09-24: A canary test that builds the real web app cannot detect a widened `envPrefix` while no source file reads `import.meta.env`, because Vite inlines environment values only where the code references them. A keyed reference (`import.meta.env.MODE`) inlines only that key, so adding one would not have fixed it either. Only a reference to the whole `import.meta.env` object inlines everything exposed. The integration tests now build a probe entry that does exactly that, using the real `apps/web/vite.config.ts`, with a positive control (a `VITE_` variable must appear) so the probe cannot pass vacuously.

- 2026-09-24: With Vite pinned at 8.1.5 in the web workspace, Vitest 4.1.11 and both Vite plugins resolved 8.3.1 at the root, giving two copies of Vite. The web `vite.config.ts` then failed to type-check with "Excessive stack depth comparing types" because plugin types and config types came from different Vite versions, even though the build itself worked. Fix: a root `overrides` entry `"vite": "8.1.5"` so every consumer shares one copy (npm ls now shows a single version, marked overridden). Vitest accepts Vite ^6, ^7 or ^8, so it runs fine on 8.1.5. Revisit the override when the Vite pin is deliberately raised.
- 2026-09-24: npm 11 also reports `fsevents@2.3.3` (macOS-only optional file watcher pulled in by Vite) as an unapproved install script. Its prebuilt binary ships in the package, so the script is unnecessary. Left unapproved for the same reason as better-sqlite3.

- 2026-09-24: A workflow `permissions: contents: read` block makes `gitleaks/gitleaks-action@v2` crash with HTTP 403 on `pull_request` events, because a permissions block sets every unlisted scope to none and the action lists the PR's commits. The fix is `pull-requests: read`. A passing `push` run does not prove the pull request path works, because it never calls that API. The action's PR comments need `pull-requests: write`, so they are disabled with `GITLEAKS_ENABLE_COMMENTS: "false"` to keep the token read-only.

- 2026-09-24: `node --test tests/repo/` (a directory argument) fails on Node 24 with a module-not-found error. Use a quoted glob such as `node --test "tests/repo/*.test.mjs"`.
