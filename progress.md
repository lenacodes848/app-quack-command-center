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
