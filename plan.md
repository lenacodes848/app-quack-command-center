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

**Deliberately absent:** attachments, per-tool permission prompts, and deleting saved conversations. Authentication landed on 2026-09-25. Persistence landed on 2026-09-25 and is no longer absent. The PRD's 34-task graph below is background, not the plan of record. Do not restart the ceremony unless the owner asks.

**Done 2026-09-25: the slice has been run against the real CLI** with the owner's approval, in a scratch directory. It works, and it found two defects that no test against a fake could have found — the agent could not write a file, and it inherited the owner's own connectors. Both are fixed; see the last entry of `progress.md` and "Verified provider behaviour" in `research.md`.

## Product scope — decided 2026-09-26, do not re-litigate

**This is a dashboard for managing local coding agents.** Issue #27 raised the ambiguity: a goal recorded there described agents driving Chrome tabs and completing operations on a Mac from a phone, and nothing in the PRD, the task graph or any memory file mentioned it. The owner settled it. But the two halves of that goal have **different** standing against the PRD, and an earlier version of this section wrongly attributed both to it:

- **Browser-tab control is out of scope, and the PRD never contemplated it.** Zero mentions of Chrome. Deferring it is faithful to the spec.
- **Operating the owner's Mac IS in the PRD, and is deferred rather than dropped.** The PRD specifies it in its own vocabulary: the agent runs in the owner's real directories (line 127, line 331, line 1081 "Restrict working directories to configured roots", TASK_006, TASK_016 criterion 2); it runs shell commands, with line 207 listing only *automatic approval* of destructive shell actions as the non-goal, not the actions themselves; and approvals are answered from the phone (line 133, line 351, line 505, TASK_018). Choosing not to build that yet is a decision that goes **beyond** the PRD, not one the PRD already made.

What follows, so the reasoning is not lost:

- **`--disallowedTools mcp__*` — deferred, and that part is decided.** #28 proposes replacing the blanket deny with an allowlist plus `--strict-mcp-config`. The argument is sound: an allowlist is the better shape, and a namespace deny cannot tell the owner's Gmail from a server this product installed deliberately. But the only capability that deny forecloses is chrome-devtools and playwright, now out of scope, so it costs nothing today and the allowlist buys nothing yet. Revisit when a tool genuinely needs granting, verifying with the `system/init` event as `research.md` requires — baseline to beat: 21 tools, Read and Write present, Bash and every `mcp__*` absent.
- **`--restricted` removing `Bash` — NOT decided, and it is a prerequisite for the PRD's own shell-with-approvals path.** This is a separate fact from the bullet above and was previously folded into it. `research.md` records that `--restricted` removes Bash along with the config-file MCP servers. So the shipped posture forecloses running any command at all, which is the capability TASK_016 and TASK_018 are built around. It needs its own answer when that work is picked up.
- **TASK_018 has nothing to approve today.** `--permission-mode acceptEdits` applies edits without asking and there is no `Bash` to ask about, so "render permission requests as actionable cards" has no input until the tool posture changes. Worth knowing before starting that task rather than after.
- **`$DATA_DIR/workspace` is not a "configured root"** in the sense of PRD line 1081. It is a single fixed scratch directory — the MVP stand-in for that feature, not an implementation of it.
- **The PRD's own headline promise is still unbuilt:** reaching the dashboard from a phone through an authenticated tunnel. That, not browser control, is the product goal.

## Next steps (resume here)

### Checkpoint — 2026-09-26

**Where this is.** `main` is at the merge of PR #38. Everything below is merged and working: an adapter that drives Claude Code, persistence, device-pairing authentication, and a browser UI. `npm run validate` exits 0 with no warnings — 263 unit tests, 10 integration, 84 repository, 3 browser, branch coverage 85.41 percent, scans clean.

**To confirm before starting anything:**

```
cd ~/Downloads/1-git/app-quack-command-center && nvm use && git pull && npm run validate
```

**What the product does today.** Open `http://127.0.0.1:4317`, pair the browser once with a code printed in the terminal, and hold a conversation with Claude Code. Conversations are saved and listed in a sidebar; reopening one resumes the same provider session, so the agent still has its context. Restarting the server loses nothing. The agent may read and write files in `$DATA_DIR/workspace` and has no shell, no access to the owner's connectors, and none of their personal skills.

**To run it:**

```
nvm use && npm run build
DATA_DIR=~/quack-data node apps/server/dist/index.js
```

First start prints a pairing code; later starts say how many devices are paired and print no code. `README.md` is accurate and was verified by following its own setup steps into a fresh clone.

### The three things that would make this genuinely useful, in order

None of these has a GitHub issue. They are the actual product gaps.

1. **A button to pair a second device, and a list of paired devices.** `POST /api/pairing-code` already exists and is authenticated, but nothing in the interface calls it, so adding a device means restarting with `QUACK_PAIR=1`. A device list also gives per-device revocation, where today only "log out everywhere" exists. Smallest of the three and it finishes what authentication started.
2. **Remote access through an authenticated tunnel** (Phase 6, TASK_023). This is the PRD's headline promise and the reason the product exists. Now unblocked by authentication. **Order is fixed and is an owner gate:** Cloudflare Access application and policy first, tunnel route second, and no public hostname without explicit approval. Two known items land here: `x-forwarded-proto` is currently trusted from anyone (see the open issue), and a `Secure` cookie needs HTTPS end to end — which the tunnel provides and a bare LAN address does not.
3. **Shell with approvals** — the PRD's own path, needing `--permission-prompts host` with `--input-format stream-json`, and a decision about `--restricted` removing `Bash`. Read the scope section above first: TASK_018 has nothing to approve until this changes.

### Open issues, all deliberately deferred

Every one has the reasoning recorded on the issue itself. None blocks using the dashboard.

| Issue | What it is | Why it waits |
|---|---|---|
| #37 pt 2 | `x-forwarded-proto: https` trusted from anyone | The right answer depends on the tunnel design. Do it at TASK_023. |
| #28 | Blanket `mcp__*` deny should be an allowlist | Scope decision above. Costs nothing while no MCP tool is wanted. |
| #24 | Scanner: commit messages, shallow clones | One part needs a policy decision — this repo mandates a `Co-Authored-By` trailer, so scanning messages flags every commit. |
| #14 | `apps/web/tsconfig.json` does not extend the base config | Web code misses `noImplicitOverride`. Strongest of the hygiene set; may surface errors in the `.tsx` files. |
| #15 | `PORT=0` rejected | Premise never materialised: the test kit calls `listen(0)` directly. |
| #12 | `VITE_` name guard has no allowlist | There are zero `VITE_` variables in the tree. |

### How to work here

Read `research.md` before touching provider flags or the reachability check — it records approaches that look right and are not. The working rules that cost real time are in its "Shell and workflow pitfalls" section. In short: write the failing test first, mutation-check every new guard **and confirm the mutation actually applied**, never claim a result before the evidence exists, and chain commands with `&&` because a pipe hides a failure.

**The slice is live-verified.** The owner approved the first live provider gate and the real CLI has now been driven end to end: streaming, `--resume` continuity, workspace isolation, tool events and the browser UI. That gate is closed. Two defects it found are fixed, and the verified provider behaviour behind them is in `research.md` under "Verified provider behaviour" — read it before touching adapter flags, because three plausible-looking approaches there are wrong.

**Done 2026-09-25: persistence.** Conversations survive a restart, proved by killing the server with `kill -9` and watching a new process replay the transcript and resume the provider conversation. `packages/storage` holds `agent_sessions` and `normalized_messages` (PRD 3.6 names), at `$DATA_DIR/quack.db`, WAL on, `0700`/`0600`, schema version in `user_version`. The web app has a sidebar of saved conversations.

**Done 2026-09-25: authentication (TASK_013 auth core).** The design was approved with the lifetimes revised to 90 days absolute and 14 days idle, and the approval is recorded in `research.md` on the design's status line. Device pairing: a single-use ten-minute code, written `0600` and printed only to a TTY, exchanged for a 256-bit session token whose SHA-256 hash alone is stored in `app_sessions` (migration 2). Every route but `/api/health` and `/api/pair` needs a session; health is reduced to `{"ok":true}` because it answers before authentication. CSRF is `SameSite=Strict` plus an origin check plus a double-submit token. Logout and logout-all revoke immediately and delete no conversations. Verified live end to end, including that the code never reaches a log when stdout is redirected.

**The CSP question from the design is settled:** the built page has no inline script and loads clean under the real policy. Note the browser suite runs against `vite preview`, which does not send our headers, so it cannot catch a CSP mistake — check that against the real server.

**The next increment is an owner decision.** Roughly in order of value per unit of work:

1. **A button to pair another device, and a list of paired devices.** `POST /api/pairing-code` exists and is authenticated, but nothing in the interface calls it, so adding a phone means restarting with `QUACK_PAIR=1`. Per-device revocation needs the list. Small, and it finishes what authentication started.
2. **Per-tool permission prompts in the browser**, so the agent can run commands with the owner's approval instead of being unable to run them at all. Needs `--permission-prompts host` with `--input-format stream-json`.
3. **The rest of TASK_013**, none of which is authentication: Zod request and response schemas on every route, structured logging with redaction of authorization, cookies and message content, request IDs, per-action rate limits, and the `audit_events` table.
4. **Renaming and deleting saved conversations.** Deleting is a destructive action and an owner gate; the schema already cascades.
5. **Search across conversations**, which is what the PRD's FTS5 verification was for.
6. **Remote access** (Phase 6). Now unblocked by authentication, but still gated: Access application and policy first, tunnel second, and no public hostname without explicit approval.

**Earlier state, kept for context:** on 2026-09-25 `main` was the only branch and clean, passing 28 Vitest tests and 47 repository tests. Only `main` and `feat/mvp-claude-adapter` exist now; the two stale merged branches were deleted after verifying every commit was contained in `main`.

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

- TASK_013: the auth core is done (2026-09-25). What remains is Zod schemas on every route, structured logging with redaction, request IDs, per-action rate limits and the audit_events table.
- TASK_009, TASK_011, TASK_028 wait for the second provider decision at the Phase 6 gate.
- TASK_030 and TASK_032 wait for the tmux compatibility decision at the Phase 7 gate.

## Owner gates

Do not pass any of these without the owner's explicit approval.

| Gate | When | Rule |
|---|---|---|
| ~~Application auth design~~ **CLOSED 2026-09-25** | Was before any TASK_013 code | The **device pairing design** was written into `research.md` and approved, with lifetimes revised to 90 days absolute and 14 days idle. The approval is recorded on that section's status line. The `app_sessions` table the PRD data model lacks is migration 2. Reopen this gate if the authentication design changes materially. |
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
4. Pairing a second device has no button yet; the endpoint exists. Adding a phone currently needs QUACK_PAIR=1.
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
