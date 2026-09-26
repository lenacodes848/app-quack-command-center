# Progress

Append only. Never rewrite historical entries.

## 2026-09-24

### Phase 0 discovery and TASK_001

Environment discovery (read only): macOS 15.7.9 arm64, zsh, default Node 22.21.1, Claude Code 2.1.282 logged in through a claude.ai subscription, tmux present, git present. Codex, Hermes, cloudflared and gitleaks were not installed.

Actions:
- Installed Node 24.21.0 LTS through nvm and gitleaks 8.30.1 through Homebrew.
- Checked registry versions against the PRD pins. TypeScript and Vitest have new majors, so the PRD pins are kept until Task 002 tests the set together. Details in `research.md`.
- Verified better-sqlite3 13.0.3 on Node 24 arm64 in a throwaway directory: prebuilt install, SQLite 3.53.4, FTS5 match, WAL, `backup()`.
- Owner decisions recorded in `STUDENT_DECISIONS.md`: Claude Code first, second provider at the Phase 6 gate, local first with Cloudflare in Phase 6, device pairing authentication, tmux compatibility mode kept in scope until the Phase 7 gate, orchestration and review loop excluded, name Quack Command Center, amber, duck emoji, allowed root ~/Downloads/1-git for now.
- Created the four memory files, `.nvmrc`, `.gitignore`, a minimal `package.json`, the source protection scanner, and a secrets scanning workflow.

Tests (Node's built in runner, since Vitest arrives in Task 002):
- Red first: the suites failed because the scanner module and the project files did not exist.
- Failure recorded: `node --test tests/repo/` with a directory argument fails on Node 24. The glob form works.
- Green: `npm run test:repo` passes. `npm run scan:source` passes. `npm run scan:secrets` finds no leaks in the working tree.

Result: TASK_001 acceptance criteria 1 to 6 and test requirements 1 to 3 are met. Open items for the owner are listed in `discovery.md`.

### Correction after PR review (same day)

The entry above said the gitleaks scan was clean. That was the local `npm run scan:secrets` only. The first CI run on the pull request failed: `gitleaks/gitleaks-action` returned HTTP 403 because the workflow's `permissions: contents: read` block dropped the `pull-requests` scope the action needs on `pull_request` events. The push run passed only because that code path never calls the pull request API, so it was not evidence that PR scanning worked. TASK_001 test requirement 3 (a secrets scanner runs in CI) was therefore not yet true when it was ticked.

Fix, test first: four new tests in `tests/repo/repo-structure.test.mjs` failed against the old workflow (permissions scope, PR comments, npm script names, push trigger), then passed after the change. The workflow now grants `contents: read` and `pull-requests: read`, disables gitleaks PR comments (`GITLEAKS_ENABLE_COMMENTS: "false"`, so no write scope is needed), calls `npm run test:repo` and `npm run scan:source` by name, and runs on `push` to `main` only. `npm run test:repo` is 28 of 28 locally. CI on the pull request is the evidence for requirement 3 and is recorded below once it is green.

CI evidence: after the fix, the `scan` job on the pull request passed in 9 seconds (workflow run 36080015555). Repository tests, the source protection scan and gitleaks all ran on the `pull_request` event, which is the path that failed before. TASK_001 test requirement 3 is now backed by CI.

Not done, deferred to TASK_003 (CI and validation commands): full-tree and full-history gitleaks in CI so a merge to `main` is scanned, and pinning third party actions to commit SHAs.

### Handoff written (same day, after the Phase 0 pull requests merged)

Both Phase 0 pull requests were merged. CI on `main` succeeded and `npm run test:repo` passed 28 of 28 there. `HANDOFF.md` was written for the next coding agent: state, decisions, environment, working method, owner gates, ordered next steps, gotchas and open items. `plan.md` now shows TASK_002 as unblocked.

Tests, written first: three new checks in `tests/repo/repo-structure.test.mjs` (HANDOFF.md exists with the required sections, names the task `plan.md` says is current, and links only to files that exist). They failed before the document existed. After writing it, two checks failed for real reasons: the source protection scan flagged a literal SSH-style git remote quoted in the document (the known email-rule false positive), and the link check flagged a kit file that is deliberately not in this repository. Both were fixed by rewording the document, not by loosening a rule or a test. `npm run test:repo` is 31 of 31, `npm run scan:source` and `npm run scan:secrets` are clean locally. CI on the handoff pull request is the evidence for the workflow, recorded when it runs.

Finding recorded for TASK_003: branch protection is unavailable on this private repository's plan (the API returns HTTP 403), so "CI blocks merging" needs an owner decision.

CI evidence for the handoff pull request: the `scan` job passed in 12 seconds (workflow run 36082314683) on the `pull_request` event, covering the repository tests, the source protection scan and gitleaks.

## 2026-09-24 (Phase 1)

### TASK_002 Monorepo scaffold and pinned toolchain

Branch `phase-1/foundation`, stacked on the handoff pull request. Detailed plan: `docs/superpowers/plans/2026-09-24-task-002-monorepo-scaffold.md`.

Before planning, a toolchain compatibility spike (two scratch projects, results in `research.md`) settled the versions: the PRD pins work together and TypeScript stays on 6.0.2 because typescript-eslint does not support 7. Then, test first, one task at a time:
- Workspace skeleton and toolchain config, with a smoke test. Red: the test failed on the missing module. Green after adding the source.
- Environment schema (`@quack/config`). Red: module missing. Green: 9 tests. Mutation check: allowing `0.0.0.0` failed 2 tests.
- Secret guard for `VITE_` variables. Red, then green. Mutation check: disabling the pattern failed 7 tests.
- Server entry point. Built output exits 1 with an actionable message on a bad environment and starts on loopback with a good one.
- Web scaffold (React, Tailwind, Vite). Build worked at once but type-check failed on duplicate Vite copies. Fixed with a root override, see `research.md`.
- Integration tests: a canary server-only variable never reaches the web bundle, and a secret-looking `VITE_` variable fails the build without printing its value. Mutation checks: leaking the canary through `define` failed the canary test only, and removing the guard call failed the guard test only.

Findings recorded as data:
- `npm audit` reported an advisory in Vitest 4.1.10, the PRD pin. Moved to 4.1.11, audit reports 0 vulnerabilities. Deviation recorded in `research.md`.
- Two `tsc -b` and lint setup slips: the type-check script named `apps/web` before it existed, and package tsconfigs exclude tests so ESLint needed its own `tsconfig.eslint.json`. `tsbuildinfo` files needed a `.gitignore` entry.
- Prettier is scoped to code and config (`*.md` ignored). It reformatted the Phase 0 scripts and workflow, and one repo test had to accept single or double quotes.

Evidence (all local, run after the last commit):
- Clean clone of the branch: `npm ci`, `npm run typecheck`, `npm test` (24 tests in 5 files), `npm run build` all exit 0.
- In the repository: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm audit` (0 vulnerabilities) all pass. `npm test` 24 of 24, `npm run test:repo` 31 of 31, `npm run scan:source` and `npm run scan:secrets` clean.

Result: TASK_002 acceptance criteria 1 to 7 and test requirements 1 to 4 are met locally. CI evidence for the pull request is recorded below once the run finishes.


CI evidence for the TASK_002 pull request: the `scan` job passed in 9 seconds (workflow run 36083979890) on the `pull_request` event. That run covers only the repository tests, the source protection scan and gitleaks. It does not run `npm ci`, type-check, lint, Vitest or the builds, so it is not evidence for the TASK_002 code. That evidence is the local and clean-clone runs above. CI for the toolchain arrives with TASK_003.

### Handoff abandoned, knowledge folded in (same day)

The owner decided not to hand the build to another agent, so the handoff pull request (#8) was closed unmerged and `HANDOFF.md` is not part of the repository. The durable parts of it moved to where the project memory belongs: the owner gates and open items are now sections of `plan.md`, and the environment notes, the branch protection finding, the deferred CI hardening and the scanner rule gaps are sections of `research.md`. Earlier entries in this file that mention the handoff document are history and are left as written.

Test first: the three handoff tests were replaced by three tests requiring those sections and forbidding any stale reference to a handoff document. They failed against the old files (3 failures), then passed after the move. `npm run test:repo` is 31 of 31.

## 2026-09-24 (bug fixes from the issue tracker)

Five open issues carry the `bug` label: #3, #4, #5, #10 and #11. Each was reproduced before any fix. Plan: three independent pull requests off `main`, not stacked. (1) scanner rules, #4 and #5, which share one script and one test file. (2) CI gitleaks, #3. (3) build tooling, #10 and #11, which share one integration test file.

### Pull request 1: scanner rules (#4, #5)

Reproduced: an SSH-style git remote was flagged as an email address, a bare absolute home path with no trailing slash was missed, and a tilde path was not flagged. Owner decision: tilde paths stay allowed because they name no user.

Test first: six new cases in `tests/repo/source-protection.test.mjs`. Three failed (SSH remote allowed, a `package.json` repository field passes, bare home path flagged) and three were regression guards that already passed (a personal address whose local part merely resembles git is still flagged, tilde paths allowed, a bare prefix with no user name is not flagged). After the fix, `npm run test:repo` is 37 of 37 and `npm run scan:source` passes. Mutation checks: removing the `git` exemption failed the two SSH tests, restoring the trailing-slash requirement failed the bare-path test, and allowing every local part failed the two personal-address tests.

Slip recorded as data: after the mutation checks I ran `git checkout` on the script before the fix was committed, which restored the old version and discarded the fix. It was re-applied from the same edit and committed immediately. Lesson: commit before mutation-testing, or keep a backup until the work is committed.

`research.md` now describes the rule exactly as implemented and lists only the remaining lockfile gap (issue 6).

### Pull request 2: CI gitleaks (#3)

Reproduced from the CI logs of the pushes to `main` for the merges of pull requests 2 and 9: `0 commits scanned`, then a green "No leaks detected". Root cause confirmed: the action's push range is `--no-merges --first-parent`, which is empty after a merge-commit merge. Owner decisions: replace the action with a pinned CLI, and prove failure on a throwaway branch.

Design: install gitleaks 8.30.1 in CI with its SHA-256 verified (checksum from the official release, matched against my own download), scan the full tree with `npm run scan:secrets` and the full history with a new `npm run scan:secrets:history`. The history script parses gitleaks' own "N commits scanned" line and fails on zero, which also covers an empty repository (gitleaks prints "0 commits scanned" and exits 0 there). Dropping the action also removes the `pull-requests: read` scope, so the token is `contents: read` only.

Test first: workflow-shape tests in `tests/repo/repo-structure.test.mjs` and a new `tests/repo/scan-history.test.mjs` that runs the real gitleaks against temporary repositories. Red: 3 workflow tests failed and the script module was missing. One new test passed vacuously (install-before-tests order, because a missing step compares as -1), so it was tightened to require both steps. Green: `npm run test:repo` 40 of 40. Those tests need gitleaks, so locally they skip without it and in CI (`CI` set) a missing gitleaks fails them. Mutation checks: dropping the zero guard failed the zero-commits test, swallowing gitleaks' exit code failed the leak test, and restoring the action failed the no-action test.

Backfill: `gitleaks git` over the full local history scanned 19 commits with no leaks (20 once this branch's first commit is included), and the full-tree scan is clean. That covers the earlier specification commit that CI never scanned.

Slip recorded as data: my first docs commit on this branch was pushed incomplete. A script edited `research.md` and then failed on a `plan.md` anchor that differs on this branch, and my shell command chain went on to commit and push anyway. This entry and the `plan.md` change landed in the next commit. Lesson: run multi-file edit scripts inside a `&&` chain so a failure stops the commit.


Real-CI evidence for issue 3, recorded on the pull request run and a throwaway branch:
- The passing run on this branch (workflow run 36089706173) verified the gitleaks checksum (`OK`), scanned the working tree (~322 KB, no leaks) and scanned **22 commits** of history (no leaks). It ran the repo tests too, including the ones that call the real gitleaks.
- A throwaway pull request with one fake credential-shaped value made CI fail (workflow run 36089769556): the `Secrets scan (full working tree)` step reported `leaks found: 1` and the history step was skipped. That pull request was closed and its branch deleted, and no remote branch remains.
- Still to check after merge: the push-to-`main` run must report more than zero commits scanned. That check is recorded when the pull request is merged.
### Pull request 3: Build tooling (#10, #11)

Both reproduced. #11: `rm -rf` of every `dist`, then `npm test`, gave 4 failed and 20 passed with "Failed to resolve entry for package", and deleting only the three `tsbuildinfo` files restored 24 of 24. #10: with `envPrefix` widened to include `QUACK_` and the guard call removed, the canary test still passed.

**Correction to earlier wording (issue 10 acceptance).** The TASK_002 entry and pull request 9 said the canary test proves a server-only value never reaches the web bundle. It does not. While no source file reads `import.meta.env`, Vite inlines no environment value under any configuration, so the test could only catch a leak through `define`, which is what its mutation exercised. The guard test (a secret-looking `VITE_` variable fails the build) was and is load-bearing, so TASK_002 criterion 7 stands.

I also checked the issue's suggested fix before using it: a keyed reference such as `import.meta.env.MODE` inlines only that key, and widening `envPrefix` stayed invisible (canary count 0). A bare `import.meta.env` reference inlines everything exposed (canary count 1). So the fix is a probe entry that reads the whole object, built with the real config.

Test first. For #11 the two new rebuild tests failed on the old config (a rebuild after deleting `dist`, and `npm run clean`, which did not exist). For #10 the probe tests were run against the deliberately broken config: the old canary test passed, the new probe test failed on the leaked canary, and on the restored config the probes pass. The probe has a positive control so it cannot pass vacuously. The fixes: `tsBuildInfoFile` set to `${configDir}/dist/.tsbuildinfo` in `tsconfig.base.json`, and a `clean` script.

After the fix, the issue's literal reproduction (`rm -rf` of every `dist`, then `npm test`) passes 28 of 28 with no build info left behind. `npm run clean` works from the previously broken state.

Slip recorded as data: the fix commit was made while lint was failing, because my check and my commit were not chained. Typed lint rules were being applied to the plain JavaScript probe fixture, which is not in the ESLint tsconfig. A follow-up commit ignores that fixture directory. Lint, type-check, format, all tests, both repository scans and audit pass.

Second slip recorded as data: the docs script for this pull request wrote a literal backslash and n at the end of this file instead of a newline (an escaped sequence inside a quoted heredoc). It was caught by inspecting the bytes after the push, repaired, and a new repository test now fails if any memory file contains a literal backslash-n. That test was mutation-checked against the same damage.

## 2026-09-25 (wrap-up after the bug-fix pull requests)

Pull requests 17, 18 and 20 were reviewed and merged, and issues 3, 4, 5, 10 and 11 are closed. Nothing labelled `bug` is open.

Post-merge evidence for issue 3, the check promised in the pull request: the push-to-`main` runs after the merges (workflow runs 36092471615 and 36092657738) each verified the gitleaks checksum, scanned the working tree (about 330 KB) and scanned 26 commits of history, all with no leaks. The earlier failure mode, "0 commits scanned" reported as green, is gone.

Health of `main` after the three merges, all run locally: no conflict markers, type-check, lint, format check, 28 Vitest tests, 47 repository tests, source protection scan, gitleaks tree and history (26 commits), `npm audit` with 0 vulnerabilities.

Cleanup done: all seven merged feature branches deleted locally and on the remote (this included the abandoned handoff branch, whose commits were already in `main` through the stacked pull request), stale remote-tracking references cleared, the 369 MB of scratch spike projects removed, and a duplicate copy of the phase plan that I had left in the original starter-kit folder removed after confirming it was identical to the repository copy. The original kit files were not touched. Only `main` exists now. gitleaks and Node 24 stay installed because the project needs them.

Fixed in this wrap-up (issue 16): `research.md` said stacked pull requests retarget automatically. They do not. The correct procedure is now in Environment notes and the mistake is recorded under Failed approaches. New tests pin both, and a resume section in `plan.md` is pinned too.

Where to resume: `plan.md`, section "Next steps (resume here)". In short: ask the owner about branch protection, then write and execute the TASK_003 plan, then TASK_004 and TASK_005. The workflow pitfalls I hit (unchained commands, mutating before committing, literal escapes in scripted edits, hanging git network commands on this machine) are in `research.md` under Shell and workflow pitfalls.


## 2026-09-25 (TASK_003, partial: criteria 1 to 5)

Landed in #25: `npm run validate` (eleven checks in one command, `&&`-chained so the first failure stops the run), a second CI workflow `validate.yml` with a `validate` job and an `e2e` job, the Vitest split into `unit` (5s timeout) and `integration` (180s) projects, a Playwright browser smoke test against the built app, 80 percent coverage thresholds, commit-metadata scanning in the source-protection scan, and workflow guards covering every workflow file. Closes #7, #13 and #23.

Evidence, local: `npm run validate` exits 0, all eleven steps, roughly 25 seconds. Coverage measured on the run rather than quoted from an earlier commit: 100 statements, 93.33 branches, 100 functions, 100 lines. `npm run test:repo` 79, unit 22, integration 8 in about 18 seconds, browser smoke 1.

Evidence, CI on `b0dee7d`: `validate` green (run 36168143308), `e2e` green (same run), `scan` green (run 36168143302). Earlier on this branch, the first real CI run failed twice for reasons no local run could show, and both are worth remembering: `lint` ran before `typecheck` so type-aware rules could not resolve `@quack/config` on a clean runner where nothing had been built yet, and `test:repo` ran in the `validate` job where gitleaks is not installed. Both are fixed; the first is the same family as bug #11.

**Not done, and the PRD boxes are left unticked to say so:** acceptance criterion 6 ("CI blocks merging when any required check fails") and test requirement 1 (a deliberately failing fixture proving it). Both need a branch-protection ruleset. It is deferred on purpose: a ruleset requiring the `validate` and `e2e` checks would block any branch whose workflows do not produce them, which at the time of writing included #22. Create it once the open pull requests have landed.

Defects found and fixed while building this, both of which had shipped green: the source-protection scanner used `\x1f` as a field separator on the false belief that git forbids it in an ident, so a crafted author name shifted every field and a commit carrying a real personal address produced zero findings; and the first version of the CI guards matched the whole workflow file rather than each job, so deleting `cache: npm` or the failure-artifact condition from one job still passed because the sibling job matched — two of five mutations caught, now six of six.

Review changed three things on evidence. Playwright stays at 1.63.0 as a deliberate, recorded deviation from the PRD's 1.62.0: pinning back was attempted and 1.62.0 cannot load this repository's tsconfig at all, failing on the project references that exist because the monorepo builds with `tsc -b`. The identity scan now walks `HEAD` rather than `--all`, because scanning every ref made a stale local branch fail the build with an unrelated and, since findings print no matched text, near-undiagnosable finding. And the browser artifact upload is split so the always-written report gets `if-no-files-found: error` while only `test-results` ignores a missing path.

Where to resume: `plan.md`, "Next steps (resume here)". TASK_003 is done bar the ruleset; the next substantive work is TASK_004.

## 2026-09-25 (direction change and the MVP vertical slice)

The owner stopped the infrastructure work mid-flight — *"stop fixing linting errors and issues that aren't core to building a functioning product... we are going for the minimal viable product"* — and chose a thin vertical slice over the PRD phase order, with light review instead of the subagent review loop. TASK_003's remaining items (the branch-protection ruleset and the failing-fixture proof) were dropped rather than finished, and their PRD boxes are left unticked to say so.

Built on `feat/mvp-claude-adapter`: a Claude Code adapter that drives the CLI with `--print --output-format stream-json` and resumes by session id, needing no pseudo-terminal and no process supervisor; an HTTP server that streams a turn to the browser as newline-delimited JSON over `POST /api/turn`, holding one in-memory session; and a chat UI with a message list, composer, tool chips, streaming text and error states. Deliberately absent: persistence, authentication, multiple sessions, attachments, permission prompts.

Nothing has yet called the real CLI. Every test runs against a fake binary written to a temp directory, so no subscription quota has been spent. The first live run is an owner gate and had not been approved when this was written.

Merging `main` into that branch surfaced two semantic conflicts a clean auto-merge could not see, both from tests that assumed the old placeholder server which printed a line and exited: the CLI bootstrap unit test, and the build integration test that ran the server with `execFileSync` and waited for it to exit. The server now binds a port, so both were rewritten to start it, assert, and shut it down — the integration one on its own port so it cannot collide with a dashboard already running. Fixing them exposed a third thing: `start()` had no `error` handler, so a port clash surfaced as an unhandled event and a raw Node stack trace. It now explains itself, and both branches of that handler are tested.

Branch coverage fell under the 80 percent floor once the slice's code counted. Raised back to 80.43 by testing the paths that were missing — a turn failing mid-stream, a non-Error thrown mid-stream, the busy slot being released after a failure, and the two startup-failure branches — rather than by lowering the threshold. `npm run validate` exits 0: 80 unit tests, 8 integration, 84 repository tests, both scans clean.

## 2026-09-25 (the first live run, and what it found)

The owner approved the live provider gate. The slice had never called the real CLI; everything until now ran against a fake binary in a temp directory. It works, and it was wrong in two ways that only a live run could show.

Setup: `DATA_DIR=/tmp/quack-live`, the built server on port 4317, CLI 2.1.282, model reported as `claude-opus-5-5`.

What worked on the first try. A turn streams as normalized events, `{"type":"session"}` carrying the id and model, then `text`, then `result`. A second turn with `--resume` came back on the same session id and answered a question that could only be answered from the first turn, in a workspace holding no other context, so continuity is real and not a coincidence. The agent ran in `/tmp/quack-live/workspace`, not in the repository. The browser UI worked too, and the strongest evidence there is unplanned: the owner was using the dashboard themselves while this was being tested, in a session of their own, which is why the transcript on screen was not the one being driven from here.

**Defect one: the agent could talk but could not act.** Asked to create a file, it emitted a `tool` event for Write and then reported the write refused. Cause: with `--print` the CLI's `--permission-prompts` defaults to `none`, so anything that would prompt is denied outright, and there is no terminal to answer a prompt anyway. Fixed by sending `--permission-mode acceptEdits`, which the owner chose from four options: edits proceed inside the workspace, and nothing may run a command.

**Defect two: a dashboard turn inherited the owner's own authority.** Unprompted, the agent's first reply listed the owner's personal skills and their connected Gmail, Calendar, Drive and Blotato tools. The workspace was isolated; the configuration and the account were not. The owner chose to fix it rather than defer it.

Two false starts on that fix, both worth keeping because each looked like a solution.

`CLAUDE_CONFIG_DIR` pointed at a scratch directory does isolate the configuration completely, and that is the problem: it isolates the credentials too. The turn answered `Not logged in, please run /login`. Full config isolation ships a product that cannot authenticate.

`--restricted` looked like the answer next, and a direct run of it reported no connectors at all. That measurement was confounded twice over. It was run from inside a Claude Code session, so the child inherited `CLAUDECODE` and the rest, and a nested child does not load connectors the same way; and the instrument itself was the model's own account of its tools, which contradicted itself between two runs of the same prompt.

The reliable instrument is the CLI's own `system/init` event, which lists the tools and MCP servers the turn actually has. Read that way, with the environment scrubbed: `--restricted` removes Bash and the MCP servers that come from configuration files, chrome-devtools and playwright among them, but leaves every connector attached to the signed-in account. A restricted turn still held 114 tools including Gmail, Drive, Calendar and Blotato, because those arrive with the account rather than with a config file, which is also why no amount of config isolation reaches them. `--tools` does not touch them either: an allowlist of six built-in tools still left 93 MCP tools in place, because that flag governs only the built-in set. `--disallowedTools mcp__*` is what removes them, taking the same turn from 114 tools to 21 with Read and Write intact and Bash absent.

So the posture the adapter now sends is `--permission-mode acceptEdits --restricted --disallowedTools mcp__*`, and restricted is the default rather than an opt-in, on the argument that a turn should have to be given authority rather than inherit it.

One more leak fixed while in there, found by the test rather than by the live run: the spawn inherited the whole environment, so a dashboard started from inside a Claude Code session handed the child its parent's session id and messaging token. The child environment now drops `CLAUDECODE`, `AI_AGENT` and every `CLAUDE_CODE_` variable. The test asserted eight such variables reaching the child before the fix.

Verified live through the server after the fix, on a second instance on port 4318 so the owner's own session was left alone: the file was written, and the agent reported no Gmail, Drive, Calendar or Blotato tools and no shell.

Evidence: the three new guards were each mutation-checked, and each break failed exactly its own test and nothing else. `npm run validate` exits 0, all eleven checks, 87 unit tests, 8 integration, 84 repository tests, branch coverage 81.63 percent against the 80 percent floor, both scans clean over 56 commits.

Two smaller things worth not rediscovering. `nvm use` with no argument fails in a directory with no `.nvmrc`, and chained with `&&` that silently skips the command after it, which looked for a while like the CLI producing no output. And the source-protection scan rejects a literal home-directory path anywhere in the tree, including inside a test fixture, so the fake HOME in the new test is assembled from parts.

Where to resume: `plan.md`, "Next steps (resume here)". The slice is now live-verified and the next increment is persistence, so a restart stops losing the conversation.

## 2026-09-25 (persistence: conversations survive a restart)

The owner chose the saved-conversation-list scope over restoring only the current thread or building the PRD's full eleven-table TASK_005, and chose to keep the cheap durability hardening now. So: two tables, the PRD's own names, and the parts of TASK_005 that are painful to retrofit.

New package `packages/storage`, wrapping better-sqlite3 13.0.1. It loads from its prebuilt binary with the install script still unapproved, as `research.md` said it would. The database is `$DATA_DIR/quack.db`, beside the workspace, so `DATA_DIR` remains the single thing the owner points at. WAL on, directory `0700`, database `0600`, and the schema version in SQLite's `user_version` rather than a table of our own so the version cannot disagree with the file it describes. A database from a newer build is refused with a message saying what to do, rather than read with a schema this code does not understand.

Tables are `agent_sessions` and `normalized_messages`, named after PRD 3.6 so the other nine records can arrive later without renaming what conversations are already stored in. Messages carry an explicit per-session sequence; ordering never uses a timestamp. Appending a message, bumping the session and naming it happen in one transaction, because a stored message whose session still looks untouched sorts to the bottom of the list and is effectively lost.

The server now takes an optional store. It writes the question down before the turn runs, records the provider session id when the init event arrives, and writes the reply when the turn ends. A failed turn still records the question and the error: a transcript that omits what the owner said reads as though they never said it. New endpoints `GET /api/sessions` and `GET /api/sessions/:id`; `DELETE /api/session` starts a new conversation and deliberately does not delete the stored one, because removing saved conversations is a destructive act the owner has to ask for. With no store the old in-memory behaviour remains and `/api/health` reports `persistent: false` rather than letting the browser imply the history is safe. The web app gained a sidebar of saved conversations, and continuing one sends its id so the server resumes from what it stored.

**Live proof, which is the point of the whole increment.** A turn was run against the real CLI on port 4318 in a scratch data directory, then the server was killed with `kill -9` — no clean shutdown, no checkpoint, an 82 KB write-ahead log against a 4 KB database. A new process recovered it, listed the conversation with its title and model, and replayed the transcript. Continuing it reused the stored provider session id `a16e6464` and the agent answered `pelican`, the word it had been told before the restart. The browser showed both saved conversations, replayed a transcript on click, and logged nothing to the console.

**Mutation testing found three of my own tests to be worthless, which is the useful part of this entry.** Ordering by timestamp instead of sequence, not bumping the session on append, and leaving foreign keys off all survived their first mutation. The first two survived for the same reason: real timestamps tie inside a millisecond, so the assertions could not tell correct ordering from the order SQLite happened to return rows in. The store now takes an injectable clock, and the ordering test runs it *backwards* — no real clock does that, but it is the only way to prove the code never sorts on time. Both mutations now fail. The third is different and is recorded rather than fixed: better-sqlite3 enables foreign keys by default, so removing our own pragma breaks nothing. The pragma stays as belt and braces and the comment now says so instead of claiming to be the thing that makes them work.

One further mutation is not observable and is recorded as such: removing the `return` after the 404 for an unknown conversation still answers 404 and still never runs the turn, so the HTTP contract holds; it only leaves an unhandled rejection behind. Ten of twelve mutations across this work failed their own test and nothing else.

**A latent defect found on the way through, unrelated to persistence.** The new page fetches its conversation list on load, which made the Playwright smoke test fail: it serves the built app with no dashboard behind it, so the request answered 404 and the browser logged a console error the test correctly rejects. Fixed by stubbing the route so the sidebar is exercised against a known response instead of merely tolerated. That failure then exposed a second, worse one: `playwright-report/` and `test-results/` are git-ignored but ESLint does not read `.gitignore`, so the artifacts left by one failing browser test made `npm run lint` die on bundled trace JavaScript, and would have stayed broken across every later run until the directory was deleted by hand. Both are now in the ESLint ignores, verified against the live reproduction rather than in theory.

Evidence: `npm run validate` exits 0, all eleven checks. 119 unit tests, 8 integration, 84 repository, 1 browser. Branch coverage 84.61 percent, up from 81.63, measured on this run. Source scan and both gitleaks scans clean over 57 commits.

Still absent: authentication, attachments, per-tool permission prompts, and the other nine PRD tables. Deleting a saved conversation is deliberately not built.

## 2026-09-25 (README, revised session lifetimes, and a defect the README found)

The owner revised the pairing design's session lifetimes to **90 days absolute and 14 days idle**, up from 30 and 7, and asked for a README written for someone completely new, with step-by-step setup and usage and the reasoning behind the design. The authentication design itself is still unapproved and no authentication code exists.

`README.md` was a one-line stub. It now covers what the thing is in plain terms, an honest list of what it cannot do yet (with the missing authentication first), the four-piece architecture, prerequisites with a check command and a reason for each, five numbered setup steps, running and stopping, a usage walkthrough, the configuration table, where data lives, a "why it is built this way" section explaining each design decision, what the agent is allowed to do, troubleshooting built from errors actually hit, and the development commands.

**The setup instructions were verified by following them**, not by believing them: a fresh clone into a scratch directory, `nvm use`, `npm install`, `npm run build`, a data directory, and a start on port 4320. Every documented output matched, including the three startup lines, the exact `/api/health` response, the file layout, and the `0700` directory and `0600` database permissions the README claims.

Two corrections came out of that verification. The source-protection scan rejected the README's own example paths, because an absolute macOS home path with a placeholder user name in it still matches the home-directory rule — they are now tilde form, which the scanner deliberately allows. And the `npm install` warning lists two packages on a fresh clone, not one.

**A real defect, found by testing a sentence I had written.** The README claimed the write-ahead log is folded back in when the server stops cleanly. It was not: nothing handled `SIGINT` or `SIGTERM`, so a Ctrl+C or a plain `kill` terminated the process without ever closing the database, leaving the log to grow across every restart. Recoverable, never data loss, but the claim was false and the tidy-up never happened. Fixed with a bounded graceful shutdown: signal handlers close the server, the store closes on the server's `close` event and checkpoints the log, and a five-second timer forces the exit anyway because a streaming turn can hold a connection open for minutes — closing the store even on that forced path, since checkpointing matters more than the socket. Two integration tests now spawn the built server, signal it, and assert both a zero exit code and the disappearance of the `-wal` file.

Mutation results on that work: removing the `SIGTERM` handler fails the `SIGTERM` test and leaves the `SIGINT` one passing, which is as precise as it gets. A second mutation survived and was useful — closing the store inside the `server.close` callback is redundant, because the server's own `close` event already does it. Rather than leave code no test can tell apart, the duplicate call was deleted; the remaining single mechanism is now detected, since removing the `close` listener fails both tests.

Evidence: `npm run validate` exits 0, all eleven checks. 119 unit tests, 10 integration (two new), 84 repository, 1 browser. Branch coverage 83.61 percent against the 80 percent floor — lower than the previous 84.61 because the new shutdown branches are only partly exercised by an out-of-process test. Scans clean over 59 commits.

## 2026-09-25 (authentication: device pairing, TASK_013 auth core)

The owner approved the device pairing design, revising the session lifetimes to 90 days absolute and 14 days idle. The approval is recorded on the design's status line in `research.md`, which is what the gate asked for. Scope was the auth core only: pairing, cookie, middleware, CSRF, rate limit, security headers, the `app_sessions` migration, logout and logout-all, plus a login screen.

**What exists now.** A pairing code exists only while pairing is open, so there is never a permanently guessable secret on the port. It is ten characters of Crockford base32, about 50 bits, with I, L, O and U left out because those are the ones misread between two screens; typing is forgiving of case, spaces, dashes and the omitted letters. It is written to `$DATA_DIR/pairing-code` at `0600` and printed **only when stdout is a TTY**, so a background service writes the file and never the log. The file is removed the moment the code stops being usable. Five wrong guesses destroy the code and lock attempts for fifteen minutes, on the argument that a delay leaves a 50-bit secret guessable whereas removing the target ends the attempt.

Pairing exchanges the code for a 256-bit session token in an `HttpOnly; Secure; SameSite=Strict` cookie. `app_sessions` (migration 2) stores only the SHA-256 hash, so reading the database yields nothing replayable. Ninety-day absolute expiry, fourteen-day idle, `last_used_at` refreshed at most once a minute. Every route but `/api/health` and `/api/pair` requires a session; health was reduced to `{"ok":true}` because it answers before authentication and used to report the open session and whether anything was being saved. CSRF is three layers: `SameSite=Strict`, an origin check, and a double-submit token compared in constant time. `/api/logout` and `/api/logout-all` revoke immediately, and deliberately delete no conversations.

**Live verification, end to end, against the real CLI.** Started on a fresh data directory with stdout redirected: the code went to the `0600` file and **not** to the log, which is the TTY gating working. Unauthenticated `POST /api/turn`, `/api/sessions` and `/api/me` all answered 401 and the agent was never started. A wrong code answered `{"error":"Pairing failed."}`. The browser showed the login screen, refused a wrong code with a readable message, then accepted the real one **typed in lower case**, proving normalisation. A real turn streamed back through the CSRF-protected route. The pairing-code file was gone, and the database held the label `Mac` with a hash and a 90-day expiry rather than a user agent or a token. A clean stop checkpointed the log; the restart printed `1 paired device(s)` and issued no new code; the browser was still paired and the conversation intact. `Log out everywhere` returned to the login screen, set `revoked_at`, left the conversation stored, and the API answered 401.

**The CSP risk was resolved rather than assumed.** The design flagged that a strict `script-src 'self'` might block a Vite inline module preload. The built page has no inline script at all, and the page loads under the real server's policy with no violation — checked against the running server, because the browser test runs against `vite preview` which does not send our headers. That gap is worth remembering: the browser suite cannot see a CSP mistake.

**Test migration, as predicted.** Auth broke 24 existing tests in two files. Rather than adding a bypass flag — refused on the grounds that a development bypass is exactly what survives into production — a shared `testkit.ts` starts a paired server and, in `app.test.ts`, wraps `fetch` so the existing assertions keep testing routes rather than authentication. It is excluded from the build and from coverage. Two bugs came out of that work: the helper used the global `fetch` it was about to replace and recursed until the stack ran out, and giving the app a fake clock while the store kept the real one made the idle-expiry test compare timestamps from two different times, so nothing ever looked idle. Both are now commented where they happened.

**Mutation testing, 20 mutations this session.** Caught: revoked sessions still found, expiry ignored, idle window ignored, logout-all revoking one row, expired sessions counted as active, a pairing code reusable, failures never locking out, a lockout not destroying the code, pairing never expiring, a cookie losing `Secure` and `HttpOnly`, an unknown origin allowed, the pairing-code file surviving expiry, and its permissions left to the umask. Two survived and both were genuine redundancy rather than missing coverage: spelling out `'ok'` and `'locked'` before reconciling the code file, and the earlier `closeStore` duplicate. Both lines were deleted, and with them gone the remaining single mechanism is detected.

Also found and fixed while wiring the browser: `reset()` sent `DELETE /api/session` with no CSRF header, which the server now refuses, so "New session" would have silently stopped working. It goes through a function that attaches the token.

Evidence: `npm run validate` exits 0, all eleven checks. 214 unit tests, 10 integration, 84 repository, 2 browser.

Deliberately not built, and not to be mistaken for done: a button to pair a second device (the endpoint exists and is authenticated, but nothing calls it, so adding a phone means `QUACK_PAIR=1`), a list of paired devices with per-device revocation, Zod schemas on every route, structured logging with redaction, and the `audit_events` table.

## 2026-09-25 (review of #26: two merge blockers fixed)

The review found two defects in `apps/server/src/app.ts`, both with reproductions attached, and filed everything else as issues #27–#34 rather than holding them against the PR. Both blockers were verified against the code, reproduced with a failing test, then fixed.

**The `busy` guard was checked before the body was read.** The check sat above `await readBody(request)` and the set sat far below it, after parsing, the session lookup and the first `appendMessage`. A check on one side of an await with the set on the other is a race: two requests whose bodies arrive in a second segment — which is what any slow link does on its own — both passed it. The consequence is two `claude` processes in one workspace, two interleaved NDJSON streams, and both turns racing on `providerSessionId`, `storedSessionId` and the transcript. Worse than the review described: because the user's message was written before the slot was claimed, a race duplicated the question too, and there is now a test for that specifically. Fixed by claiming the slot immediately after the 409 check and releasing it in a `finally` that covers every early return.

The existing test passed only because it slept 50ms between the two requests. Its comment now says so and points at the new test, which fires both concurrently with no sleep, sending each body in a second write through a raw socket — `fetch` sends headers and body together, which is exactly what hid this.

**A client that hung up mid-answer wedged the single turn slot until a restart.** The backpressure wait listened for `drain` only, so when the socket died the event never came, the await never settled, and the `finally` that frees the slot never ran: every later turn answered 409 forever. `runTurn` was also called without the `signal` the adapter has always accepted, so the orphaned `claude` process kept running and kept spending quota with nobody reading it. Fixed by racing the wait against the connection closing, breaking out when the response is destroyed, and passing an abort signal.

**Two defects came out of writing that second fix**, both found here rather than in production.

The first version listened for `close` on the **request**. That fires as soon as the body has been read — the normal path — so it aborted every turn the instant it started. With the real adapter that kills the `claude` process immediately, and every fake-runner test still passed, because the fakes ignore the signal. It now listens to the response closing and checks `writableFinished` to tell a connection that died early from one that simply finished. A regression test asserts that an ordinary turn is not aborted.

The backpressure race attached `drain`, `close` and `error` handlers per cycle, and `once` removes only the handler that fires, so two leaked every time. A long answer tripped Node's `MaxListenersExceededWarning`, which `npm run validate` printed. All three are now removed when the race settles, and the flood test asserts that warning never appears — the test output has to be pristine, not merely green.

Mutation results on the fixes: claiming the slot late again fails two tests, removing the abort signal fails one, aborting without the `writableFinished` check fails one, and removing the close and error events from the backpressure wait fails one. That last mutation **survived at first**, which was the useful finding: none of the original tests forced `response.write` to return false, so the wait was never reached. A test that floods 15 MB at a client which reads nothing now covers it.

Also corrected, both statements of mine that had become false rather than new work: the README still justified the loopback restriction with "there is no login yet" (#33), and `AppOptions.store` still described a no-store mode as supported and `/api/health` as reporting `persistent: false` (#30). The PR description still said "Deliberately absent: persistence, authentication", which was true of its first three commits and not of the branch; it has been rewritten.

Evidence: `npm run validate` exits 0 with no warnings. 220 unit tests, 10 integration, 84 repository, 2 browser. Branch coverage 84.57 percent. Scans clean over 61 commits.

Not addressed here, deliberately: issues #27, #28, #29, #31, #32, #34. #31 (the pairing route is exempt from the same-origin check) and #29 (a `Secure` cookie cannot work over plain HTTP on a non-loopback address) are the two worth reading first, because both touch the authentication that just landed.

## 2026-09-26 (four reported bugs, plus two stale-documentation issues)

#26 merged. Of the fourteen open issues, four were labelled `bug`; those plus the two documentation issues that asserted false things are fixed here. The remaining eight are enhancements and were deliberately left.

**Grouping decision: one pull request, one commit per issue where that was possible.** All four bugs touch `apps/server/src/app.ts` and three touch the same handler, so separate branches off `main` would have conflicted with each other — and `research.md` already records that stacked pull requests do not retarget when the parent merges, which bit this project once. The owner reviews commit by commit, which is the reviewability that actually matters here.

One deviation from that, stated rather than hidden: #32 and #35 landed in a single commit. Both change the same handler and their tests share one file, so splitting them would have left an intermediate commit whose own tests fail, which is worse than a slightly wider commit.

**#32 — an oversized body blamed the JSON.** `readBody` threw a plain `Error`, and both call sites read the body inside the `try` whose `catch` exists for `JSON.parse`. A valid body over 100 kB — a pasted log, a stack trace — came back as *"Body must be JSON."*, sending the owner after a syntax error that was not there and never mentioning that a limit exists. A distinct `BodyTooLargeError` separates them and an oversized body answers 413 naming the limit; the constant is exported so the test asserts the real number rather than restating it. Both routes read bodies this way, and a test pins that the refusal still releases the turn slot.

**#35 — a turn cut short was stored as though complete.** After the client vanished, `streamTurn` broke out of the loop and fell through to the same tail as a normal turn, so whatever had streamed was appended as an ordinary agent message. Reopening a conversation showed a confident half-sentence indistinguishable from a complete short answer, and the agent's own context and the stored transcript disagreed about what was said, because the next turn resumes by provider session id. What streamed is still kept — it is a real part of the conversation — but the message now ends with a note that the connection was lost. Taken over a schema column because `normalized_messages` would need a migration and the UI a new state; the comment says where the column goes if interrupted turns later need rendering differently.

**#30 — a mode that could not work.** `AppOptions.store` was optional and documented as a way to run without persistence. That stopped being true when authentication landed: sessions live in the store, so `authenticate()` returned undefined without one and the guard refused every `/api` path — a server that served the static page and a liveness probe and nothing else, with no route to a turn, which is the only thing the mode existed for. Requiring it removed the undefined check, an unreachable 503 branch, the store half of the auth guard, and six optional-chain call sites. It also removed `persistent` from `/api/me`, which reported whether a store existed and was unobservable in exactly the mode it described, and the web client's `Me` field that nothing rendered. The refactor then exposed a guard TypeScript could prove redundant, which became `??=`.

**#29 — pairing from a LAN address appeared to work and then failed.** The session cookie is `Secure`, right for the tunnel and free on loopback, which browsers count as trustworthy. The case in between is the one a phone hits first: on `http://192.168.x.x:4317` the browser accepts the response and silently discards the cookie, so pairing answered 200, the dashboard rendered, the next request carried nothing, and the phone bounced back to the login screen — with the single-use code already spent, so the obvious retry failed too. `canHoldSecureCookie` now decides whether the arriving address can hold it, and the pairing route checks that **before** verifying, so such a request never spends a code, and answers 421 saying where to go instead. A test pins the ordering: moving the check after `verify` fails it.

**#33 and #34 — documentation that was wrong.** The README told the owner to pair a phone as though it merely lacked a button; it has two blockers and both now say so. And the coverage comment claimed `apps/web` had no tests, which stopped being true when `api.test.ts` arrived — so the streaming client, the code that decides whether a turn's last message reaches the screen, was tested but excluded from the thresholds. It is now included; all four global thresholds still clear (branches 84.95 percent against a floor of 80). The integration test's comment claiming a health check created the write-ahead log was wrong too: `openStore` creates it at startup by setting the journal mode and migrating.

Mutation results: ten mutations across the four fixes, all caught — blaming the JSON again, dropping the truncation note, never setting the flag, removing the reachability check, moving it after `verify`, treating a LAN address as trustworthy, and ignoring forwarded HTTPS.

Evidence: `npm run validate` exits 0 with no warnings. 242 unit tests, 10 integration, 84 repository, 2 browser. Branch coverage 84.95 percent. Scans clean over 65 commits.

Left alone on purpose: #31 (the pairing route is exempt from the same-origin check), #28, #27, #24, #15, #14, #12, #6. #31 is the one to read first — it is labelled an enhancement but it is the only state-changing route without that check, and it sits in the authentication that just landed.

## 2026-09-26 (review of #36: the 421 never reached the owner)

One blocker, and it was the right one to catch: **#29's fix stopped at the server.** The 421 and the check-before-verify ordering were both correct, but `pair()` in the browser classified anything unrecognised as `'unavailable'`, whose message is *"Could not reach the server. Is it still running?"* So the owner was told to check whether the server was running — by a server that was running, had answered them, and knew exactly what was wrong. The same confusion #29 was filed about, one layer up: the explanation was written and then discarded. Both this PR's description and the README claimed the server "says so", and neither was true end to end.

Verified before implementing rather than taken on faith: `pair()` really did fall through to `'unavailable'` for 421, and `createApp` really is never told the port, so the message's hardcoded `http://127.0.0.1:4317` was wrong for anyone running `PORT=5000`.

Two deliberate deviations from the suggested fix, both checked with the owner:

**The server's text is read only for the 421 case, not for every failure.** The suggestion was to prefer `detail` whenever present. Applied to every status that would have been a regression: the server answers a deliberately vague "Pairing failed." for a wrong code — vague on purpose, so a caller learns nothing — while the screen says "That code was not accepted. Check it and try again."; and for a lockout the screen says more than the server does about getting a new code. The server knows more than the interface can work out in exactly one case, which is the address. So `detail` is populated only there, which also makes "prefer detail when present" safe. A test pins that 401 and 429 carry no detail.

**`pair()` returns one uniform `PairResult { outcome, detail? }`** rather than the proposed `PairFailure` with `Exclude<PairOutcome, 'paired'>`. Success comes back through the same function, so one shape is simpler than two.

On the port: no port is named at all now, and the message points at the startup line, which prints the exact address. Threading `PORT` into `createApp` solely to compose an error string was the alternative and is not worth an option. A test asserts the message contains no four-digit port, so the hardcoded one cannot come back.

The important evidence is the browser test: a real page against a 421 now renders the server's sentence, contains `127.0.0.1`, and does **not** say "Is it still running?". That is the assertion that would have caught the original defect, and none of the existing unit tests could have.

Mutation results: letting 421 fall through to `'unavailable'` fails three tests, dropping `detail` fails one, and leaking `detail` into the 401 and 429 paths fails one. One of those appeared to survive at first and had not actually been applied — prettier had wrapped the target across three lines, so the single-line pattern never matched. Checking that a mutation applied before believing it survived is already a note in memory; this is the second time it has earned its place.

Also taken from the review's non-blocking notes: a test named "a wrong code from such an address" sent its request over loopback, so the name misread its own intent. Renamed.

Evidence: `npm run validate` exits 0 with no warnings. 247 unit tests, 10 integration, 84 repository, 3 browser. Branch coverage 85.24 percent. Scans clean over 66 commits.

Left alone: #37, filed by the review for two unreachable edge cases in `canHoldSecureCookie` and the `x-forwarded-proto` trust boundary, which matters once a tunnel terminates TLS in front of the server. Neither is reachable while the server binds loopback only.

## 2026-09-26 (issue triage, and the two fixes worth doing now)

#36 merged. Nine issues remained; the owner's priority is getting the command center usable, so each was judged on whether it blocks that. Three premises turned out to be stale or never realised, which only checking showed:

- **#6** — the lockfile exclusion was predicted to break when the repo became a workspace monorepo. It did not: there is still one lockfile, at the root, and the literal path still matches it.
- **#12** — the `VITE_` secret-name guard rejects legitimate names. There are **zero** `VITE_` variables anywhere in the tree, so nothing is being rejected.
- **#15** — `PORT=0` was wanted because "TASK_013 integration tests will want it". TASK_013 shipped without needing it: the test kit calls `server.listen(0, …)` directly and bypasses `loadServerEnv` entirely.

All three are left open with that recorded, rather than fixed against a motivation that has not arrived.

**The honest summary of the nine: none of them makes the dashboard more usable.** They are hardening and hygiene. What is actually missing is a button to pair a second device, remote access from a phone, and letting the agent do more than edit files in a scratch directory — and none of those has an issue. So the work here was deliberately small.

**Done: #31.** `/api/pair` was handled before the block that guards every other state-changing request, making it the only POST on the port that never proved where it came from. It stays exempt from the CSRF *token* half — no session exists yet to have issued one — but not from the origin half. Without it, any page the owner happens to have open can post guesses at the loopback port and burn their ten-minute pairing window, from a request the server cannot attribute; there is also a DNS-rebinding shape where reading the response stops being blocked. The check is applied before the address check and before the code, so a refused caller learns nothing about either — a test pins that ordering.

**Done: #37 part 1.** In `canHoldSecureCookie` the port strip ran before the bracket strip, so a bare `::1` had `:1` removed as though it were a port, leaving `:`, and a loopback address was refused. Fixed by deciding the shape first: a bracketed literal may carry a port, a bare IPv6 literal cannot and its colons must be left alone, and a name or IPv4 address may. Telling the second from the third by counting colons is what stops `::1` losing its tail. Loopback now also covers the whole 127/8 block, the uncompressed `0:0:0:0:0:0:0:1`, the IPv4-mapped `::ffff:127.0.0.1`, and zone indices. Verified the refusals still hold — LAN, public, link-local, `0.0.0.0` and `[::]` are all refused, and near-misses like `1270.0.0.1` and `127.0.0.1.evil.example` too, which are now in the table.

**Decided: product scope (#27).** This is the dashboard the PRD describes; browser-tab control and operating macOS are explicitly out of scope for now, recorded in `plan.md` so it stops being ambiguous. That decision is what defers **#28**: an allowlist is the better shape than a blanket `mcp__*` deny, and the argument in that issue is sound, but the only capability the deny forecloses is chrome-devtools and playwright, which are out of scope — so the deny costs nothing today and the allowlist buys nothing yet.

**Deferred with reasons recorded:** #37 part 2 (`x-forwarded-proto: https` is accepted from anyone — a real trust boundary, but it needs the tunnel design to say who is trusted, and nothing but local clients can reach the port today), #14 (web tsconfig does not extend the base config, so web code misses `noImplicitOverride` — the strongest of the hygiene set), #24 (scanner gaps, one of which needs a policy decision because this repo mandates a `Co-Authored-By` trailer on every commit).

Mutation results: removing the pairing origin check fails three tests, moving it after the address check fails one, and restoring the old replace ordering fails one.

Evidence: `npm run validate` exits 0 with no warnings. 263 unit tests, 10 integration, 84 repository, 3 browser. Branch coverage 85.41 percent. Scans clean over 67 commits.
