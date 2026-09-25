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

