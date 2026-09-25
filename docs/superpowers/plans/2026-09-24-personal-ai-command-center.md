# Personal AI Command Center Implementation Plan (for owner review)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Status of this document:** Phase-level plan for owner review. It deliberately stops short of the bite-sized TDD steps and code blocks the writing-plans skill normally requires. Those are generated one phase at a time, after you approve this plan, so they are written against real installed versions and real provider output. No code has been written and no repository has been created.

**Goal:** Build a local-first, single-owner web command center that lists live and saved coding-agent sessions from one screen, launches and resumes them, tracks message delivery from evidence, and lets the owner answer provider questions from a phone.

**Architecture:** One Node/TypeScript npm-workspaces monorepo. Each provider sits behind a versioned adapter contract and a single provider registry. A supervisor owns child processes, and a SQLite store owns everything durable. A Fastify API on loopback exposes a secret-safe view plus one SSE event stream, and a mobile-first React app consumes it through an external store. Cloudflare Tunnel plus Access is the only external component and is optional.

**Tech Stack:** Node.js 24 LTS, TypeScript (strict), Fastify, Zod, better-sqlite3 (WAL, FTS5), React 19 + Vite + Tailwind, Vitest, Playwright, axe-core, GitHub Actions, launchd (macOS).

**Spec:** `PERSONAL_AI_COMMAND_CENTER_PRD.md` (source of truth), `MASTER_BUILD_PROMPT.md`, `RELEASE_CHECKLIST.md`, `PATCH_NOTES.md`, `STUDENT_DECISIONS.md` (currently blank, see section 1). Task IDs below are the PRD's `TASK_001` to `TASK_034`, unchanged.

## Global Constraints

Copied from the spec. Every phase inherits them.

- One owner, one computer. No user table, sign-up, pricing, teammate login, billing, licensing, cloud relay, fleet or org administration, or remote access to another person's machine (PRD 0.2).
- Out of scope for release 1: browser editing of provider credential files, automatic permission bypass, automatic approval of destructive shell actions, native apps, voice, public share links, full terminal emulation when structured events exist (PRD 1.9).
- Server binds to loopback by default. Browser and server share one origin in production. No provider credential enters the bundle, browser storage, API response, analytics, or logs (PRD 2.3).
- Provider binaries are absolute paths. Commands use argument arrays, never shell strings. Explicit environment allowlist per profile (PRD 2.3, 5.5).
- Every important state comes from evidence. Timers may trigger checks and must never invent success (PRD 1.5). Unknown provider state is `needs_attention`, never `ready`.
- Provider conversation identity is minted by the provider and is authoritative. Resolve transcripts by exact match, never prefix (MASTER_BUILD_PROMPT rule 7).
- Structured provider interfaces first. Terminal screen parsing is a last resort and lives only inside the adapter (PRD 2.3, 6.1).
- Mobile first. Verify at 390x844 and 1440x900 (375 for palette and modal cards). Touch targets at least 44px. No horizontal scroll. Composer stays above the keyboard.
- Coverage: 80% overall, 85% provider adapters, 90% security modules and state-machine branches (PRD 7.4).
- Performance: health p95 under 100 ms (cached), session-list bootstrap p95 under 500 ms with 200 saved conversations, event-to-visible p95 under 150 ms, message submission accepted or failed within 2 s (PRD 10).
- Test first. No mocking of provider adapters in shared integration tests. Use fake provider processes (PRD 7.3, 7.6).
- Reference dependency pins (reverify all together before installing, record in `research.md`): Node 24.18.0, TypeScript 6.0.2, React 19.2.8, Vite 8.1.5, `@vitejs/plugin-react` 6.0.4, Fastify 5.10.0, Zod 4.4.3, Tailwind 4.3.3, Vitest 4.1.10, Playwright 1.62.0, better-sqlite3 13.0.1.
- Clean-room rules. New repository separate from the kit. Original branding. Invented fixture content. No personal name, email, home-directory path, or private hostname anywhere in the repo, including fixtures, screenshots, and commit messages (RELEASE_CHECKLIST 9.10).
- After every task: run its tests, the previous two task groups, affected integration tests, type-check, and build. Then update the PRD JSON block, `plan.md`, and `progress.md`.

---

## 1. Do the files have everything needed to plan? Yes, with these gaps

**The specification is complete enough to plan and build.** All 34 tasks have acceptance criteria, test requirements, and a dependency graph. The API surface, security model, adapter contract, state machines, data model, 60 edge cases, and release checklist are all specified. Your pasted writeup matches the PRD's boundary, five layers, and out-of-scope list with no contradictions.

**What is missing or needs your decision before Phase 1 code:**

| # | Gap | Why it matters | My recommendation |
|---|---|---|---|
| G1 | `STUDENT_DECISIONS.md` is entirely blank (all 14 sections). | The build prompt makes the student decisions win over the PRD. Provider selection, auth design, and remote access change which tasks apply. | I fill it from the defaults in section 2 after one batched question round. This is Phase 0. |
| G2 | Local machine: macOS 15.7.9 arm64, zsh, **Node 22.21.1** (PRD pins Node 24 LTS). Claude Code 2.1.282 and `tmux` are installed. `codex`, `hermes`, and `cloudflared` are not. `~/Downloads/...` is not a git repo. | Only Claude Code can be the Level One provider today. Node must be upgraded. The build needs a new sibling repo. | Level One = Claude Code. Install Node 24 through nvm and pin it. Create the repo outside the kit folder. |
| G3 | The PRD's provider pins (Node 24.18.0, Vite 8.1.5, better-sqlite3 13.0.1, and so on) come from a July 2026 research date and are unverified. | The PRD says to reverify before installing. `better-sqlite3` is a native module and the most likely install failure. | Phase 0 verifies all pins together and records them in `research.md`. |
| G4 | **Architecture tension in the PRD.** Slash-command modals (task 030), seeded launches waiting for a "drawn composer" (task 032), and durable process reattachment (success criterion 6) assume a terminal-hosted session. Section 6.1 says to prefer structured stream output, which has no terminal. | If Claude Code only runs headless, there are no TUI modals to drive and processes die with the service. | Decision D13 below: structured adapter first, then an optional tmux-backed compatibility mode in Phase 7. |
| G5 | Task 021 (cross-provider handoff) needs at least two providers. | With only Claude Code installed, handoff has no real target. | Schedule 021 after the second provider adapter (Phase 6). |
| G6 | Task 013 needs a `sessions` table for app authentication and revocation, which the PRD's data model (3.6) does not list. | Logout-all-devices needs server-side session records. | Add it as a migration in Task 013 and record it in `research.md`. |
| G7 | Minor PRD defects: section 9.2 numbers items 16 to 20 twice. Story 8 (stop) is in your "second wave" but Task 017 bundles interrupt with the composer. | Cosmetic. Stop ships early because it is the same turn-lifecycle code. | Note in `research.md`. |

**What I have not verified yet (Phase 0 does this):** current package versions, `claude --help` flags on 2.1.282, `claude auth status`, and whether `better-sqlite3` builds on Node 24 arm64. The PRD says not to trust remembered flags, and I have not relied on any.

---

## 2. Decisions to approve (defaults used to size this plan)

| ID | Decision | Recommended default | Needs you? |
|---|---|---|---|
| D1 | Product name, subtitle, color, icon | Yours. Original to you. I use the neutral working name `command-center` in code until you choose. | Yes |
| D2 | Host, shell, projects directory | macOS 15.7.9, zsh, projects dir of your choice | Yes (directory) |
| D3 | Level One provider | Claude Code | Confirm |
| D4 | Second provider (Phase 6) | Codex if you have a subscription. Otherwise a hosted OpenAI-compatible provider (NanoGPT). Hermes only if you use it. | Yes, at Phase 6 gate |
| D5 | Application auth | Owner device pairing with a secure, expiring, revocable HTTP-only cookie | Yes, **hard gate before Task 013** |
| D6 | Remote access | Local only through Phase 5. Cloudflare Tunnel + Access in Phase 6. | Yes (needs a domain on Cloudflare) |
| D7 | Permission policy | Ask before important actions. No browser bypass. | Confirm |
| D8 | Idle sessions | Never stop automatically. Cleanup preview only, disabled until you enable it. | Confirm |
| D9 | Attachments | 10 MB max. png, jpg, webp, gif, pdf, txt, md. Multi-image select on mobile. | Confirm |
| D10 | Launch seeds | None until Phase 7. You name them then. | Later |
| D11 | Orchestration (033) and two-provider review loop (034) | Leave out of release 1. | Confirm |
| D12 | Repository location and remote | New sibling repo. Private GitHub remote if you want CI to block merges (branch protection needs a remote). | Yes |
| D13 | Terminal-compat mode | Build the structured Claude Code adapter first. Add a tmux-hosted compat mode in Phase 7 for modals, seeds, and durable reattachment. | Yes, at Phase 7 gate |
| D14 | Provider accounts and cost | Live provider tests spend your subscription quota. Each live smoke test is announced first and never runs in your own live session. | Confirm |

---

## 3. Owner-story coverage

Your writeup splits the twelve stories into a first wave of six and a second wave of six. The PRD tasks do not split that cleanly, so this is the honest mapping.

| # | Story | Tasks | Ships in | Wave |
|---|---|---|---|---|
| 1 | One list of live sessions | 012, 014, 015 | Phase 4 | First |
| 2 | Saved conversations, shown separately | 012, 015 | Phase 4 | First |
| 3 | Launch with explicit context | 006, 027, 016 | Phase 4 | First |
| 4 | Trustworthy delivery state | 004, 010, 017 | Phase 4 | First |
| 6 | Answer questions from a phone | 018 | Phase 4 | First |
| 10 | Exact resume after restart | 010, 012 | Phase 3 (proven again in 8) | First |
| 5 | Watch progress live | 014, 017 | Streaming ships in Phase 3 and 4. The activity card (4.11) polish is Phase 7. | Second, but partly forced early because delivery confirmation and questions ride on the same events |
| 8 | Stop without losing the conversation | 017 (basic), 020 | Phase 4 basic, Phase 5 full | Second, but pulled early because it shares the turn-lifecycle code |
| 11 | Privacy mode | 015 | Phase 4 (a cheap 015 acceptance criterion) | Second |
| 7 | Attachments | 019 | Phase 5 | Second |
| 12 | Health of service, adapters, storage, tunnel | 022 | Phase 5 (tunnel in Phase 6) | Second |
| 9 | Switch provider with explicit context | 021 | Phase 6 (needs a second provider) | Second |

---

## 4. Phase overview and gates

| Phase | Name | Tasks | Milestone | Owner gate at exit |
|---|---|---|---|---|
| 0 | Discovery, decisions, repo | 001 | Memory files, decisions approved | Approve `STUDENT_DECISIONS.md` |
| 1 | Foundation | 002, 003, 004, 005 | Contracts, state machines, storage, CI green | Skim contracts and state table |
| 2 | Profiles, supervisor, harness, registry | 006, 007, 008, 027 | Fake provider passes contract suite | None (internal) |
| 3 | Claude Code + headless core | 010, 012, 013, 014 | Launch, send, stream, restart, resume through the API | **Approve auth design before 013.** Approve first live provider smoke test. |
| 4 | Level One UI | 015, 016, 017, 018 | Stories 1 to 4, 6, 10 and basic 5, 8, 11 work locally (Release A) | You use it. |
| 5 | Second wave | 019, 020, 022 | Attachments, controls, health (Release B, local) | Confirm destructive-action UX |
| 6 | Second provider, handoff, remote | second adapter (009, 011, or 028), 021, 023 | Handoff, phone access (Release B/C) | **Choose provider. Approve public hostname.** |
| 7 | Level Three daily-use | 024, 029, 031, then 030, 032 | Service, palette, search, modals, seeds | Decide D13 |
| 8 | Hardening and release | 025, 026, checklist | Full suite twice, checklist, human security review | Final sign-off |
| 9 | Optional | 033, 034 | Only if you selected them | Per feature |

Phases 0 to 4 are the critical path to something you can use.

---

## 5. Repository layout (target, from PRD 3.8)

```text
apps/
  server/          Fastify app: buildApp(deps), routes, static delivery
  web/             React app: store, components, routes
packages/
  contracts/       Zod schemas, state machines, capabilities, errors, event envelope
  config/          Env schema, directory resolution, typed settings
  storage/         Migrations, repositories, backup, corruption handling
  events/          Event log, replay cursors, bounded queues, SSE framing
  supervisor/      Spawn, process groups, readiness, stop, reconcile
  provider-core/   Adapter interface, contract suite, registry reader
  provider-claude/ Claude Code adapter (+ terminal-compat mode in Phase 7)
  provider-codex/  Only if selected
  provider-hermes/ Only if selected
  security/        Sessions, CSRF, origin, path policy, redaction, Access JWT
  test-fixtures/   Fake provider executable and invented fixtures
config/providers.registry.json   The single provider registry (Task 027)
scripts/service/  scripts/diagnostics/
tests/{contracts,integration,security,browser}/
discovery.md research.md plan.md progress.md PERSONAL_AI_COMMAND_CENTER_PRD.md
```

Provider packages stay independent so a broken provider cannot force shared code to learn its internals.

---

## Phase 0: Discovery, decisions, repository (TASK_001)

**Goal:** Turn the blank kit into an approved configuration and an empty, clean repository with project memory.

**Implementation details**
1. Run read-only discovery: OS, shell, Node, npm, git, tmux, `claude --version`, `claude auth status`. Check for `codex`, `hermes`, and `cloudflared`. Record results in `discovery.md`.
2. Run one batched question round covering D1 to D14, each with a plain-language explanation and the default above. Write the answers into `STUDENT_DECISIONS.md`. Never record credentials, only labels.
3. Install Node 24 LTS through nvm and write `.nvmrc` plus `engines`. Verify the full dependency set together (versions and peer ranges) and record it in `research.md`. Confirm `better-sqlite3` installs on Node 24 arm64 (prebuilt binary or Xcode CLT compile) before committing to it. If it fails, record it and use the PRD-permitted alternative only with your approval.
4. Create the new repo as a sibling of the kit. `git init`, then commit the PRD, `STUDENT_DECISIONS.md`, `RELEASE_CHECKLIST.md`, and the four memory files. The kit folder stays as read-only reference.
5. Convert the PRD into the task graph in `plan.md`. Mark exactly one task current. Mark excluded tasks `not_applicable` with the governing decision. Excluded tasks count as satisfied dependencies.
6. Source protection. Add a local deny-list file (gitignored) of private domains and paths. Add a scan test that fails on a match. Add a rule that rejects `/Users/`, email-address patterns, and the owner's name.
7. Secrets baseline with gitleaks, run in CI. Verify it is installable first.

**Tests:** repository-structure test for the required files (uses `node --test` because Vitest is not installed yet). Source-protection deny-list test. Secrets scan passes.

**Exit evidence:** all six Task 001 acceptance criteria checked and `progress.md` has the first dated entry.

---

## Phase 1: Foundation (TASK_002 to 005)

**Goal:** A validated, provider-neutral core with nothing provider-specific in it.

### TASK_002: Monorepo scaffold and pinned toolchain
- npm workspaces per the layout above. `tsconfig.base.json` with `strict`, `noUncheckedIndexedAccess`, and project references. Exact versions (`save-exact=true`) and a committed lockfile.
- `packages/config`: a Zod env schema. Invalid input fails at boot with a message naming the variable and the fix. Only names prefixed `VITE_` reach the web build, and a test scans the built bundle for any secret variable name.
- Separate `build` scripts for server and web from the repo root.

### TASK_003: CI and validation
- One command, `npm run validate`, runs: format check, lint, type-check, unit tests, integration tests, coverage thresholds, build, Playwright smoke, gitleaks.
- GitHub Actions on Node 24 LTS. It caches `node_modules` only (no secrets, no database). It uploads coverage, reports, and Playwright screenshots and traces on failure. It requires a remote for merge blocking (D12). Without a remote, a local pre-push hook runs `validate`.
- A deliberately failing fixture proves the gate blocks. A test asserts the CI files contain no credential literal.

### TASK_004: Shared contracts and state machines
Locks the names every later task depends on.

```ts
export type SessionState =
  'starting'|'ready'|'working'|'waiting_for_user'|'stopping'|'stopped'|
  'crashed'|'unreachable'|'saved'|'resuming'|'needs_attention';
export type DeliveryState =
  'queued'|'submitting'|'accepted'|'confirmed'|'failed'|'retrying'|'cancelled';
export type ErrorCategory =
  'authentication'|'startup'|'protocol'|'timeout'|'permission'|'validation'|'storage'|'unknown';
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: { category: ErrorCategory; message: string; requestId?: string } }
  | { ok: 'unsupported'; capability: keyof ProviderCapabilities };
export interface EventEnvelope<P = unknown> {
  id: number; v: 1; type: string; at: string;
  sessionId?: string; sessionSeq?: number; payload: P;
}
```

- `ProviderCapabilities` holds one boolean or object per optional action from PRD 3.3 (steer, interrupt, resume, modelChange, reasoningChange, attachments, questions, modal, inventory, models, activity, launchState). The UI hides or disables controls only from this object.
- Provider identifiers are branded opaque strings.
- **Proposed session transition table**, finalized by the table-driven tests:

| From | To |
|---|---|
| starting | ready, crashed, needs_attention, stopping |
| ready | working, waiting_for_user, stopping, crashed, unreachable, needs_attention |
| working | ready, waiting_for_user, stopping, crashed, unreachable, needs_attention |
| waiting_for_user | working, ready, stopping, crashed, unreachable, needs_attention |
| stopping | stopped, crashed |
| stopped | saved, resuming |
| saved | resuming |
| resuming | ready, working, crashed, needs_attention |
| crashed | saved, resuming, stopped |
| unreachable | ready, working, crashed, saved, needs_attention |
| needs_attention | ready, working, waiting_for_user, stopping, crashed, saved |

Delivery: `queued → submitting → accepted → confirmed`. `failed → retrying → submitting`. `queued|submitting → cancelled`. `accepted` may go straight to `failed` only from a provider rejection. `confirmed` is terminal.
- Tests: every valid transition passes, every other pair is rejected, and every schema round-trips.

### TASK_005: SQLite storage
- Migrations are ordered `NNNN_name.sql` files, each in one transaction, with the version in `PRAGMA user_version`. The 11 logical records from PRD 3.6 become tables, with UUID primary keys, foreign keys on, and WAL on.
- The data directory is `0700` and the database and backup files are `0600`.
- On open, run `PRAGMA integrity_check`. On failure, move the file aside, record a visible `storage_recovery` state in service state, and refuse to start silently on an empty store.
- Backups use better-sqlite3's online `backup()` API, so active sessions are not stopped.
- Repositories use prepared statements only. Multi-row writes (message plus delivery attempt) are atomic.
- Tests: empty-database migrate, upgrade from every retained version, rollback, corruption fallback, concurrent-repository consistency.

**Phase 1 exit:** `npm run validate` is green in CI and the transition tables are reviewed.

---

## Phase 2: Profiles, supervisor, test harness, registry (TASK_006, 007, 008, 027)

**Goal:** Everything an adapter needs, proven against a fake provider before any real CLI is touched.

### TASK_006: Profiles and account isolation
- A profile holds `{id, provider, label, binPath, configRoot, envAllow[], defaultModel, defaultReasoning, allowedRoots[]}` and no credentials. `binPath` and `configRoot` are canonicalized at save time. `binPath` must be absolute and executable.
- The child environment is built from an empty object plus an explicit allowlist. Nothing is inherited from the server's environment, so tests can prove that a stray variable is rejected.
- Authentication status comes only from provider commands such as `claude auth status`. Calls have a hard timeout and cached results. Credential files are never opened.
- The isolation mechanism (for example a per-profile config-directory variable) must be **verified against the installed Claude Code version**, not assumed. If it is unsupported, isolation falls back to a separate OS user, and I stop and tell you.
- Inventory returns names, kinds, sources, and health only, never instruction bodies.
- Tests: env-allowlist rejection, error redaction, two-profile isolation where logging out one leaves the other, auth timeout, inventory redaction.

### TASK_007: Process supervisor
- `spawn(absoluteBin, argv[], {cwd, env, detached: true})` with no shell. It owns the process group. `cwd` must resolve inside the profile's `allowedRoots` after symlink resolution.
- Readiness is a callback the adapter supplies (a protocol event or health check). A launch resolves `ready` only on that evidence, and otherwise fails with a typed `startup` or `timeout` error at the configured deadline.
- Stop escalation is interrupt, then SIGTERM to the group, then SIGKILL, each with a bound. Stopping one session can never signal another, because signals go to a group id the supervisor recorded for that session.
- Crash detection publishes `crashed`. On service start, `reconcile()` checks each recorded pid against its recorded start time and command. A match is reattached only if the adapter declares the capability. Otherwise the session becomes `saved` (or `unreachable` if unclear) with its resume record intact.
- Tests: fake-provider readiness, immediate crash, startup timeout, graceful and forced stop, exact process isolation.

### TASK_008: Adapter test harness
- `runProviderContract(adapterFactory)` in `provider-core` is one behavioral suite for all adapters, and it asserts a typed `unsupported` result for undeclared capabilities.
- `packages/test-fixtures/bin/fake-provider.mjs` is a real executable driven by scenario flags: slow start, exit immediately, crash mid-stream, malformed JSON, schema-version change, single-choice question, multi-select, free text, permission rejection, delayed confirm, acknowledgement lost but history written, exact resume, frozen process. These cover the 20 fixtures in PRD 7.5. Content is invented.
- A deliberately broken adapter must fail the expected contract cases. A cleanup test asserts no orphan processes.

### TASK_027: Provider registry
- `config/providers.registry.json`, validated by Zod at boot, holds label, base URL, credential variable names in failover order, protocol family, default model, default window, default output budget, model list with measured windows, effort levels with distinct output budgets, and a verification note.
- Four readers take values only from it: request router, session launcher, session-row API, model picker.
- Tests: a synthetic entry launches a fake provider with no code change. A grep-style test fails if any reader hardcodes a provider name, window, model ID, or effort level. Two providers sharing one session type render distinct labels.
- Placed here rather than after the adapters so the Claude Code adapter registers through it from its first commit. The PRD's own note says to do this first.

**Phase 2 exit:** the fake provider passes the contract, the broken one fails it, and there is no user interface yet.

---

## Phase 3: Claude Code adapter and headless core (TASK_010, 012, 013, 014)

**Goal:** Launch, send, stream, restart, and resume a real conversation through the HTTP API alone.

### TASK_010: Claude Code adapter
- **Step 0, documentation spike.** Read the official CLI docs and `claude --help` for 2.1.282. Record the actual flags for print mode, streaming input and output formats, session ID, resume, model, permission mode, and permission prompt handling, plus the transcript location. Build fixtures from real output with the content replaced by invented text. Nothing below is coded until this is recorded in `research.md`.
- Session identity is the ID the provider reports in its own stream. It is stored as the authoritative key.
- Message delivery: `submitting` when written, `accepted` on the provider's stream acknowledgement, `confirmed` only when the provider's authoritative history shows the message (stream echo or the transcript file, whichever the spike shows is authoritative). A lost acknowledgement is reconciled from history.
- Interrupt uses the provider's supported cancel mechanism and leaves the session alive.
- Permission questions: use the supported permission-prompt mechanism if the spike shows one, surfaced as normalized `pending_actions`. **This is the highest-risk item** (R1 below). If unsupported, the adapter reports `questions: false` and a visible compatibility state, and no screen scraping is added to fake it.
- Preview deltas reconcile with the final result by message ID. Version and flag detection runs at startup and produces a visible compatibility state on mismatch.
- Tests: shared contract, unsupported-flag, stream corruption, permission question, exact resume, expired authentication.

### TASK_012: Session aggregation and recovery catalog
- One catalog merges `agent_sessions` (live) with `conversation_snapshots` and `adapter.listSaved()` (saved). Live and saved are distinct types, and each record's provider ID is authoritative.
- Resume is lazy: it runs only when you open or message a saved conversation. Concurrent resumes of one conversation serialize through a keyed async mutex. A failed resume keeps the saved record and returns an actionable error.
- Recovery snapshots are written atomically (temp file, fsync, rename). A corrupt snapshot falls back to the last valid one. Archive and delete are separate operations.
- Tests: multi-provider catalog, service-restart reconcile, computer-restart simulation, duplicate resume, corrupt snapshot.

### TASK_013: Authenticated local API
- **Gate: write the chosen auth design into `research.md` and get your approval before any code.** With the recommended device pairing, the server writes a single-use, short-lived pairing code to a `0600` file at startup. The browser posts it and receives an HTTP-only, secure, same-site, expiring cookie. Sessions are rows in a new `app_sessions` table (G6) so logout-all works. Rotate on login, rate-limit attempts, avoid account enumeration, and compare in constant time.
- `buildApp(deps)` in `apps/server/src/app.ts` takes injected clock, random, storage, and supervisor, so tests use Fastify `inject()`.
- Every route has Zod request and response schemas. State-changing routes require session, same-origin check, CSRF token header, bounded body, request ID, and a per-action rate limit. Security headers are set explicitly (CSP without inline script). Pino redacts authorization, cookies, and configured secret fields. Message content is redacted by default. Production errors never carry stacks.
- Route groups follow PRD 9.1 and 9.2. Only the routes for Phase 3 to 4 are built now (bootstrap, session, profiles, sessions, history, start, resume, send, interrupt, answer, events).
- Tests: injection coverage of every route, auth bypass, CSRF, rate limit, cookie expiry and revocation, redaction snapshots.

### TASK_014: Event stream and external store
- `GET /api/events` is SSE with monotonic IDs, `Last-Event-ID` replay, a 15 s heartbeat, and a bounded per-client queue. Overflow closes the stream with a `resync` marker and the client performs a full safe refresh. `event_log` keeps a fixed maximum of rows and evicts oldest first. Replay older than the window also forces a refresh.
- Per-session order is enforced by `sessionSeq`. Out-of-order events are buffered briefly, then trigger a resync.
- Web store: a normalized entity map with per-entity subscriptions through `useSyncExternalStore`. Selectors derive views and there is no redundant React state. Only affected entities notify, which is what keeps card focus stable later.
- Tests: replay, reconnect, out-of-order, preview reconciliation, bounded queue, subscription cleanup.

**Phase 3 exit evidence:** an integration test starts the server, pairs, launches a session against the fake provider, sends, streams, kills the server, restarts it, and resumes the same conversation ID. Then one announced live smoke test against real Claude Code in a scratch directory (D14). It never touches your own live session.

---

## Phase 4: Level One UI (TASK_015, 016, 017, 018)

**Goal:** You can open the dashboard, see sessions, launch one, converse, and answer questions. This is Release A.

- **015 shell.** Tailwind 4, mobile CSS first with `min-width` queries for desktop. Routes are `/` and `/s/:sessionId`, so refresh keeps the selection. The desktop two-column layout follows PRD 4.1 and mobile follows 4.3 (list view, conversation view, back). Session cards are keyed by session ID and memoized on their own entity so focus and DOM nodes survive updates. Privacy mode is a `data-private` flag stored in `localStorage` that blurs names, account labels, previews, and message text through CSS, and it never changes server data. Visual identity uses your D1 answers.
- **016 create flow.** A modal on desktop and a full-screen sheet on mobile. Fields come from adapter capabilities and the registry, and unsupported fields are absent. Working directories are chosen from the allowed roots only. A client idempotency key is created before the request, and the form stays open until the store shows `ready` or `working`. Failures show a secret-safe message and keep the values.
- **017 conversation and composer.** The conversation renders from normalized messages. Live text updates in place and the final event replaces the preview with no duplicate. Each user message shows its delivery state and a failed one stays visible with Retry, which creates a new `delivery_attempts` row for the same message. The client generates the idempotency key before sending, and the server ensures one provider submission per key. Steer is shown only when `steer` is declared. Stop calls interrupt and keeps the session. The composer is sticky, uses `env(safe-area-inset-bottom)`, `dvh`, and the `visualViewport` API for the keyboard.
- **018 questions.** Cards render only from `pending_actions` (current provider state), never from historical events. There is no prose or numbered-list parsing because the adapter supplies structured options. Supported types are single choice, multi-select (answered from stored labels), free text, confirm, deny, and dismiss. A submitted action disables its buttons, and a rapid second click is dropped. Bypass permissions are not offered anywhere.
- **Browser tests** (Playwright at 390x844 and 1440x900): list sections, refresh persistence, privacy, launch success, launch failure, slow launch, duplicate submit, keyboard viewport, network interruption, single and sequential questions, and multi-select. The stress test applies 200 incremental updates while the user selects, and it must lose zero selections. Screenshots use invented identities.

**Phase 4 exit:** Release A. You use it with Claude Code for a real task and give feedback before Phase 5.

---

## Phase 5: Second wave, local (TASK_019, 020, 022)

- **019 attachments.** Endpoints for begin, append, finish, and abort. Chunked upload with SHA-256 verified at finish. Server-generated filenames (UUID plus an extension derived from sniffed content, not the client's name), while the original name is display metadata only. A `0700` attachment directory, canonical-path check, and symlink-escape rejection. Type and size limits come from D9. Expiry is enforced by a bounded maintenance task. Delivery to the provider is available only if the adapter declares `attachments`, and the spike from Task 010 must show how Claude Code accepts images. Mobile: multi-select, per-file progress, per-file retry.
- **020 controls.** Model and reasoning changes show a pending state until the provider reports the effective value, and a failed change reverts to the last confirmed value. Rename is local plus provider rename where supported. Archive hides without deleting provider history. Terminate needs confirmation. Frozen-session recovery needs a second explicit confirmation and preserves the provider conversation. Every sensitive action writes an audit event. Context usage is shown only when the provider reports it.
- **022 health and activity.** `/api/health` returns cached, bounded results. Slow provider probes run asynchronously with a TTL and per-provider independence. The activity view reads `audit_events`. Diagnostics export is redacted and covered by snapshot tests. Log rotation and retention are configurable. The configuration-diff and additive-sync criteria (13 to 15) are built as preview-first, explicit-confirm, reversible operations that never rewrite the canonical source.

**Phase 5 exit:** Release B (local). Confirm the terminate, archive, and sync confirmation UX.

---

## Phase 6: Second provider, handoff, remote access

- **Second adapter (your choice at the gate).** Codex (Task 009): app-server over stdio or a private Unix socket, schemas generated from the installed version, `codex login status`. Or hosted (Task 028): the full section 6.5 harness, which is the largest single task in the PRD. Or Hermes (Task 011). Each one starts with the same documentation spike and the same contract suite. Codex and Hermes need installing first. A hosted provider needs an API key (pay per token). The first hosted step is the three-part verification gate (catalogue, tool-call, measured window). **A model that cannot emit a tool call is not registered.**
- **021 handoff.** Target provider, profile, model, reasoning, and directory are explicit. Context transfer is none, selected messages, or a neutral summary you edit before launch. Internal reasoning and secrets are excluded by a tested filter. The new session stores the source session ID as lineage. A failed launch preserves the reviewed handoff. The source conversation is never modified.
- **023 Cloudflare Tunnel + Access.** Order matters. (1) Install `cloudflared` and confirm the domain is on Cloudflare. (2) Create the Access self-hosted application with an allow policy for your one verified email and an explicit session duration. (3) Only after that, create the named tunnel and route the hostname to `127.0.0.1`. (4) The origin validates the `Cf-Access-Jwt-Assertion` token (issuer, audience, expiry, signature via cached JWKS), and the local app session still applies. Tests: an unauthenticated public request is blocked, an unapproved identity is blocked (this needs a second test identity), the owner reaches the full mobile UI, streaming survives the tunnel, and tunnel failure leaves loopback access working. **I do not enable the public hostname without your explicit go-ahead.**

**Phase 6 exit:** Release C readiness. Public exposure approved by you. A knowledgeable human still has to review security before routine remote use, because the PRD says tests alone do not prove an internet-exposed agent controller is secure.

---

## Phase 7: Level Three daily-use features (TASK_024, 029, 031, then 030, 032)

**7a. Operations (024).** A launchd LaunchAgent with an explicit environment and `KeepAlive`, plus throttling. The watchdog stops auto-restart after a configurable failure threshold. Graceful reload preserves provider processes only where a durable host or provider capability exists, and otherwise exact-resume records carry over. Updates build into a new release directory, run `validate`, then atomically swap, and roll back on failure. Backups use the online API, with a documented and disposable-data-tested restore. Uninstall never touches provider credentials, and deleting saved data needs explicit confirmation. Idle maintenance uses the time of the **last submitted user message**, previews before acting, protects active, waiting, and uncertain sessions, and stays disabled until you enable a policy.

**7b. Palette and search (029, 031).** The invocable registry scans skill, agent, and command files into one list with a memory-plus-disk cache revalidated on file changes. It tolerates both line-ending conventions, and colliding names never advertise the winner's invocation. The palette claims the key handler before awaiting data, so Enter during the fetch accepts rather than sends, and a stale palette cannot write into another session's composer. Search uses an SQLite FTS5 index over `normalized_messages` plus titles, with server-side `bm25`, a hard result limit, and `snippet()` excerpts. Privacy-excluded and quarantined transcripts are excluded by a column filter tested with a seeded exclusion. Saved conversations are indexed on first sight, bounded per run.

**7c. Terminal-compat mode (030, 032, durable reattach), if you approve D13.** A tmux-hosted interactive Claude Code session inside the Claude adapter package, not in shared code. It provides modal detection (title, hint, accepted keys read from the modal's own footer with arrows always offered, body bounded at the frame, in the repaint signature), a key-forward endpoint (fixed allowlist, bounded repeats and length, literal mode, contained socket path, returns the repainted session), seeded launch (a server-side key only, sent only after the composer is drawn, delivered once, resumed as the same seeded type after a login interruption), and reattachment across service restarts. Fixtures come from verbatim captures taken the way the running code reads the terminal. If you decline D13, tasks 030 and 032 are recorded as deferred with the reason. That means release success criteria 6 and 17 are not fully met.

---

## Phase 8: Hardening and release (TASK_025, 026)

- Accessibility through axe-core in Playwright (no critical violations), keyboard coverage of every action, and screen-reader labels. Performance budgets from the Global Constraints, with 200 saved conversations. Concurrency tests. Adversarial input tests (traversal filenames, oversized bodies, key-forward abuse, forged Access headers). Visual regression at both viewports. The full suite passes twice from a clean start, with results recorded in `progress.md`.
- Documentation covers install, provider onboarding through official flows, multi-profile setup without copying credentials, Cloudflare setup, recovery, backup, restore, update, and uninstall. Its commands are executed in a clean environment and links are validated.
- Source-protection scan (deny list and secret scan) and a check that screenshots and fixtures contain only invented content. The similarity review can only compare against materials available to the reviewer, and it is not a legal guarantee.
- Final gate (PRD 17): complete `RELEASE_CHECKLIST.md`, restart the dashboard while an agent is live, **you restart the computer and resume a saved conversation**, review logs and diagnostics for secrets, and record the release commit in `progress.md`.

## Phase 9: Optional (TASK_033, 034)

Only after the checklist passes and only if selected (D11). 033 (orchestration engine, run store, universal implementer adapter) and 034 (opposite-provider review loop, seed-key launch) follow PRD 6.9 and 6.10 as written. 034 depends on 032 and therefore on D13.

---

## 6. Risks and how the plan contains them

| ID | Risk | Containment |
|---|---|---|
| R1 | Claude Code permission prompts may not be bridgeable in headless mode. | Spike in Task 010 step 0. If unsupported, report `questions: false` visibly and use the tmux-compat mode (Phase 7c) rather than scraping in shared code. This may move story 6 to Phase 7 for Claude Code. It will not silently degrade. |
| R2 | `better-sqlite3` native build or FTS5 support fails on Node 24 arm64. | Verified in Phase 0 before any storage code. |
| R3 | Provider CLIs change flags or storage between versions. | Version and flag detection at startup, a visible compatibility state, fixtures pinned to the recorded version, and documentation re-read before each adapter. |
| R4 | Live provider tests spend your quota and could disrupt an active session. | Announced first, scratch directory, dedicated test session, never your live session (D14). |
| R5 | Public exposure of an agent controller. | Access policy before tunnel, origin JWT validation, app session on top, your explicit approval, and a human security review before routine remote use. |
| R6 | The hosted-provider task (028) is large and its harness is subtle. | Chosen only if it is your D4 pick. Provider registry work (027) lands first, and the tool-call gate runs before any integration code. |
| R7 | PRD version pins may not exist as published. | Phase 0 verification. Nearest compatible set is recorded with the reason. |
| R8 | Scope drift toward multi-user features. | The boundary list is a standing review check, and any user table, sign-up, or teammate login is rejected as out of specification. |

## 7. How execution will run after you approve

1. Phase 0 starts with the batched question round. Nothing else runs first.
2. At the start of each phase, I expand its tasks into bite-sized TDD steps (failing test, run, minimal code, run, commit) with exact file paths, interfaces, and code. This uses the writing-plans format against the real installed versions. I write them just in time because the provider details (Task 010 step 0) change them.
3. Execution uses subagent-driven development, one task per fresh subagent with review between tasks, and it is one task current at a time.
4. After each task I follow the PRD completion protocol (tests, previous two groups, integration, type-check, build, update JSON state, `plan.md`, `progress.md`) and commit one coherent task per commit.
5. I stop at every gate in the phase table and ask you only for genuine decisions: logins, spend, remote exposure, destructive actions, and security choices.
