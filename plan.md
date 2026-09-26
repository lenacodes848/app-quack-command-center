# Plan

Last updated: 2026-09-25

Full phase plan: `docs/superpowers/plans/2026-09-24-personal-ai-command-center.md`

Active goal: **a working minimum viable product, not the PRD phase order.** See the direction change below. TASK_001 and TASK_002 are merged, every `bug` issue is closed, and TASK_003 landed except criterion 6.

Current task: TASK_003

## Direction change, 2026-09-25 — read before following the task graph

The owner stopped the infrastructure work mid-flight: *"stop fixing linting errors and issues that aren't core to building a functioning product... we are going for the minimal viable product."* They then chose a **thin vertical slice** over the PRD phase order, and **light review** over the subagent review loop: no per-task plan documents, no per-task reviewer subagents, no mutation-checking every guard. Build, run the checks, be honest when something breaks, keep moving.

**The slice lives on branch `feat/mvp-claude-adapter`** (pushed to `origin`, not merged as of 2026-09-25). `main` is merged into it and `npm run validate` exits 0.

- `packages/adapter` drives Claude Code non-interactively with `claude --print --output-format stream-json --verbose`, parsing NDJSON into normalized events and resuming by the `session_id` from the init event. **No pseudo-terminal and no process supervisor** — that is what collapses most of the PRD's Phase 2 for the first version.
- `apps/server` streams a turn to the browser as newline-delimited JSON over a plain `POST /api/turn`. A turn is request-shaped, so a streaming response fits it without a WebSocket dependency. One in-memory session, one turn at a time. Sessions run in `$DATA_DIR/workspace`, never a path a request chooses.
- `apps/web` is the chat UI: message list, composer, tool chips, streaming text, error states.

**Deliberately absent:** authentication, attachments, per-tool permission prompts, and deleting saved conversations. Persistence landed on 2026-09-25 and is no longer absent. The PRD's 34-task graph below is background, not the plan of record. Do not restart the ceremony unless the owner asks.

**Done 2026-09-25: the slice has been run against the real CLI** with the owner's approval, in a scratch directory. It works, and it found two defects that no test against a fake could have found — the agent could not write a file, and it inherited the owner's own connectors. Both are fixed; see the last entry of `progress.md` and "Verified provider behaviour" in `research.md`. Persistence is now the next increment, because "sessions survive a restart" is the PRD's headline promise and the slice does not have it.

## Next steps (resume here)

State on 2026-09-25, end of the live-run session. The product is the MVP vertical slice on `feat/mvp-claude-adapter`: the Claude Code adapter, the streaming HTTP server and the chat UI. `npm run validate` exits 0 on it, all eleven checks, 87 unit tests, 8 integration, 84 repository tests, branch coverage 81.63 percent, both scans clean over 56 commits. To confirm before starting, run `nvm use`, `git pull`, `npm run validate`. The working rules and shell pitfalls are in `research.md`. Read the last entry of `progress.md` first.

**The slice is live-verified.** The owner approved the first live provider gate and the real CLI has now been driven end to end: streaming, `--resume` continuity, workspace isolation, tool events and the browser UI. That gate is closed. Two defects it found are fixed, and the verified provider behaviour behind them is in `research.md` under "Verified provider behaviour" — read it before touching adapter flags, because three plausible-looking approaches there are wrong.

**Done 2026-09-25: persistence.** Conversations survive a restart, proved by killing the server with `kill -9` and watching a new process replay the transcript and resume the provider conversation. `packages/storage` holds `agent_sessions` and `normalized_messages` (PRD 3.6 names), at `$DATA_DIR/quack.db`, WAL on, `0700`/`0600`, schema version in `user_version`. The web app has a sidebar of saved conversations.

**The next increment is an owner decision.** The strongest candidates, roughly in order of how much they add per unit of work:

1. **Authentication.** The dashboard is currently open to anything that can reach the port. This is the hard blocker before the Phase 6 public hostname, and TASK_013 needs a written device-pairing design approved before any code.
2. **Per-tool permission prompts in the browser**, so the agent can run commands with the owner's approval instead of being unable to run them at all. Needs `--permission-prompts host` with `--input-format stream-json`.
3. **Renaming and deleting saved conversations.** Deleting is a destructive action and an owner gate; the schema already cascades.
4. **Search across conversations**, which is what the PRD's FTS5 verification was for.

**Deliberately not done, and worth an owner decision when it comes up:** per-tool permission prompts in the browser. The dashboard currently allows file edits and forbids commands outright. Bridging a real prompt needs `--permission-prompts host` with `--input-format stream-json`, which is a substantially larger change than the slice and was declined for the MVP.

**Earlier state, kept for context:** on 2026-09-25 `main` was the only branch and clean, passing 28 Vitest tests and 47 repository tests. Stale local branches `docs/session-wrap-up` and `phase-1/task-003-ci-validation` still exist though their pull requests merged; delete them at the next cleanup.

**Decided 2026-09-25, do not re-ask: branch protection.** Classic branch protection returned HTTP 403 on the old private plan, so the owner made the repository **public** specifically to get required status checks. Use the repository-rulesets endpoint, which answers `200` here while `branches/main/protection` still answers `403`. The ruleset is deliberately not created yet: one that requires a check a branch's workflows do not produce would block that branch from merging at all, so it waits until the open pull requests have landed. Until it exists, TASK_003 criterion 6 and test requirement 1 are unmet and their PRD boxes stay unticked.

1. **TASK_003 is mostly done — do not rebuild it.** Acceptance criteria 1 to 5 and test requirements 2 and 3 landed in #25 on 2026-09-25: `npm run validate` (eleven checks, one command), the `validate.yml` workflow with its `validate` and `e2e` jobs, the Vitest unit/integration split, the Playwright smoke test with retained failure artifacts, 80 percent coverage thresholds, commit-metadata scanning and the workflow-wide guards. Issues #7, #13 and #23 are closed by it.
   - **What remains:** criterion 6 ("CI blocks merging when any required check fails") and test requirement 1 (a deliberately failing fixture proving it). Both need a branch-protection ruleset, which is deliberately deferred until the open pull requests have landed, because a ruleset requiring the `validate` and `e2e` checks blocks any branch whose workflows do not produce them. Use the repository-rulesets endpoint, not classic protection. Their PRD boxes stay unticked until then.
   - **Deferred, not forgotten:** issue #24 holds the scanner follow-ups (commit messages unscanned, shallow-clone blindness, two smaller gaps). Still open and not urgent: #14, #12, #15, #6.
2. **TASK_004 and TASK_005 are NOT the next work.** See the direction change above. They return once the slice proves itself. Their notes are kept below for when they do: TASK_004's names and transition tables are in the Phase 1 section of `docs/superpowers/plans/2026-09-24-personal-ai-command-center.md`, and TASK_005's better-sqlite3 13.0.1 is verified (prebuilt binary, FTS5, WAL, online backup; do not approve its npm install script).
3. **Old step, superseded — TASK_004, shared contracts and state machines.** The exact names and the proposed transition tables are in the Phase 1 section of `docs/superpowers/plans/2026-09-24-personal-ai-command-center.md`. Table-driven tests must accept every valid transition and reject every other pair.
4. **Old step, superseded — TASK_005, SQLite storage.** better-sqlite3 13.0.1 is verified (prebuilt binary, FTS5, WAL, online backup). Do not approve its npm install script. Confirm the Linux CI runner loads it from the prebuilt binary.
5. **Then Phase 2 onward,** following the phase plan and the task graph below. At the start of each phase write a just-in-time bite-sized TDD plan file. Stop at every owner gate below.

## Recently completed

- Bug fixes from the issue tracker, merged 2026-09-25: #3 (CI gitleaks scanned zero commits), #4 and #5 (source protection scan rules), #10 (env exposure test could not see exposure), #11 (stale `tsc -b` state, plus a `clean` script). All closed.
- TASK_002 Monorepo scaffold and pinned toolchain (2026-09-24)
- TASK_001 Source separated repository and project memory (2026-09-24)

## Blocked work

- TASK_013 needs the owner's approval of the written device pairing design before any code.
- TASK_009, TASK_011, TASK_028 wait for the second provider decision at the Phase 6 gate.
- TASK_030 and TASK_032 wait for the tmux compatibility decision at the Phase 7 gate.

## Owner gates

Do not pass any of these without the owner's explicit approval.

| Gate | When | Rule |
|---|---|---|
| Application auth design | Before any TASK_013 code | Write the device pairing design into `research.md` (planned shape is there) and get explicit approval. It adds an `app_sessions` table the PRD data model lacks. |
| ~~First live provider smoke test~~ **CLOSED 2026-09-25** | Was end of Phase 3, taken early with the MVP slice | Approved and done. Ran in `/tmp/quack-live` against CLI 2.1.282. Further live runs in a scratch directory no longer need a fresh approval; a run touching the owner's own session, configuration or working directories still does. |
| Level One trial | End of Phase 4 | The owner uses it with Claude Code and gives feedback before Phase 5. |
| Second provider | Start of Phase 6 | Codex (needs the CLI and a subscription), a hosted model such as NanoGPT (pay per token, the largest task, 028), or Hermes. Needed for cross-provider handoff (021). |
| Public hostname | Phase 6, TASK_023 | Order is fixed: Access application and policy first, tunnel route second. No public hostname without explicit approval. A knowledgeable human reviews security before routine remote use. |
| tmux compatibility mode | Phase 7 | Decides whether 030 and 032 are built. If declined, record them as deferred with the reason and note that PRD success criteria 6 and 17 are then unmet. |
| Allowed root | Before Phase 7 installs the background service | `~/Downloads` is a macOS-protected folder and the service may hit permission errors there. Switching to `~/Projects` is a configuration change. |
| Destructive actions | Whenever they arise | Deleting saved conversations, enabling automatic cleanup, any permission bypass, changing an account login. |
| Final gate | Phase 8 | Full suite passes twice from a clean start, `RELEASE_CHECKLIST.md` complete, the owner restarts the computer and resumes a saved conversation. |

## Open items

1. The owner has not yet edited the proposed product subtitle or the drafted first-release paragraph in `STUDENT_DECISIONS.md`. Treat them as accepted unless told otherwise and mention them again at the Level One trial.
2. Cloudflare hostname and allowed login email are deferred to Phase 6. The email is never committed.
3. Second provider and tmux compatibility decisions: Phase 6 and Phase 7 gates.
4. Device pairing design approval before TASK_013.
5. Remaining CI hardening (pin first-party actions, run the toolchain checks in CI) and the one remaining scanner gap (lockfile exclusion), listed in `research.md` under Follow-ups and known gaps. Open enhancement issues are listed in Next steps.
6. The `~/Downloads/1-git` allowed root is temporary.
7. Claude Code behavior is unverified. Flags, streaming, permission prompts, isolation, attachments and transcripts come from the TASK_010 documentation spike.

## Task graph

Status values: pending, completed, pending_decision, not_applicable. Excluded tasks count as satisfied dependencies.

| Task | Name | Depends on | Phase | Status |
|---|---|---|---|---|
| TASK_001 | Source separated repository and project memory | none | 0 | completed |
| TASK_002 | Monorepo scaffold and pinned toolchain | 001 | 1 | completed |
| TASK_003 | Continuous integration and validation commands | 002 | 1 | pending (criteria 1 to 5 and test requirements 2 to 3 landed in #25; criterion 6 and test requirement 1 need the ruleset) |
| TASK_004 | Shared contracts and state machines | 002 | 1 | pending |
| TASK_005 | SQLite storage and migrations | 004 | 1 | pending |
| TASK_006 | Provider profile configuration and account isolation | 004, 005 | 2 | pending |
| TASK_007 | Process supervisor | 004, 005, 006 | 2 | pending |
| TASK_008 | Provider adapter test harness | 004, 007 | 2 | pending |
| TASK_009 | Codex adapter | 006, 007, 008 | 6 | pending_decision (second provider, Phase 6 gate) |
| TASK_010 | Claude Code adapter | 006, 007, 008 | 3 | pending |
| TASK_011 | Hermes adapter | 006, 007, 008 | 6 | pending_decision (second provider, Phase 6 gate) |
| TASK_012 | Session aggregation and recovery catalog | 005, 007, 009, 010, 011 | 3 | pending |
| TASK_013 | Authenticated local API | 004, 005, 006, 012 | 3 | pending (owner design approval required first) |
| TASK_014 | Browser event stream and external store | 013 | 3 | pending |
| TASK_015 | Responsive command center shell | 014 | 4 | pending |
| TASK_016 | Create session launch flow | 012, 013, 015 | 4 | pending |
| TASK_017 | Conversation history and composer | 012, 014, 015 | 4 | pending |
| TASK_018 | Questions, permissions, and approvals | 014, 015, 017 | 4 | pending |
| TASK_019 | Attachments and safe file delivery | 007, 013, 015, 017 | 5 | pending |
| TASK_020 | Session controls and provider settings | 012, 015, 017, 018 | 5 | pending |
| TASK_021 | Cross provider handoff | 009, 010, 011, 016, 017 | 6 | pending (needs the second provider) |
| TASK_022 | Health, diagnostics, and audit activity | 009, 010, 011, 013, 014 | 5 | pending |
| TASK_023 | Secure mobile URL with Cloudflare Tunnel and Access | 013, 014, 015, 017, 018, 019 | 6 | pending (remote access selected, built at Phase 6) |
| TASK_024 | Service lifecycle, recovery, backup, and update | 005, 007, 012, 022 | 7 | pending |
| TASK_025 | Accessibility, performance, and adversarial QA | 016 to 024 | 8 | pending |
| TASK_026 | Student documentation and release package | 025 | 8 | pending |
| TASK_027 | Provider registry | 006 | 2 | pending |
| TASK_028 | Hosted model provider adapter | 027, 008, 012 | 6 | pending_decision (second provider, Phase 6 gate) |
| TASK_029 | Command palette and invocable registry | 015, 017 | 7 | pending |
| TASK_030 | Interactive modal parity | 018 | 7 | pending (tmux compatibility decision, Phase 7 gate) |
| TASK_031 | Conversation content search | 012, 015 | 7 | pending |
| TASK_032 | Launch seeds | 016 | 7 | pending (tmux compatibility decision, Phase 7 gate) |
| TASK_033 | Orchestration session type | 016, 017, 020 | 9 | not_applicable (STUDENT_DECISIONS section 12: left out of the first release) |
| TASK_034 | Two provider review loop | 032, 020 | 9 | not_applicable (STUDENT_DECISIONS section 13: left out of the first release) |
