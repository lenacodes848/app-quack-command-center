# Handoff to the next coding agent

Written 2026-09-24 at the end of Phase 0. You are taking over a build that has a complete specification, an approved plan, and a merged Phase 0. There is no application code yet. This document is everything the previous agent knew that is not already obvious from the repository. Where it duplicates another file, it points to it.

## Read this first

**The product.** Quack Command Center is a local-first, single-owner web dashboard that puts every local coding-agent session (Claude Code first) in one responsive interface, so the owner can launch, watch, steer, answer and resume work from a desktop or phone. One owner, one computer. It is not a hosted service and has no billing, licensing, support, fleet, cloud relay, organization admin, or remote access to anyone else's machine. Provider credentials never leave the owner's computer and never reach the browser.

**Read these in order before changing anything:**
1. This file.
2. `PERSONAL_AI_COMMAND_CENTER_PRD.md`: the source of truth. 34 tasks with acceptance criteria, tests and a dependency graph (section 8 and 14), security (5), provider guidance (6), testing (7), API (9), edge cases (15), final gate (17).
3. `STUDENT_DECISIONS.md`: the owner's configuration. **Where it conflicts with the PRD it wins, unless it would weaken a mandatory security requirement.**
4. `plan.md` (task graph and statuses), `research.md` (versions, decisions, failures), `progress.md` (append-only history), `discovery.md`.
5. `docs/superpowers/plans/2026-09-24-personal-ai-command-center.md`: the approved nine-phase implementation plan, with gaps, risks, story mapping and per-phase detail.
6. `MASTER_BUILD_PROMPT.md` (operating rules) and `RELEASE_CHECKLIST.md` (the finish line).

**How the owner works.** They review through pull requests and classify feedback as merge blockers versus non-blocking. They want to review a plan before implementation and to be asked before consequential choices. They answer structured multiple-choice questions well and want a recommended default with each. They caught a real problem in the last PR: a progress note and a ticked PRD box claimed CI evidence that did not exist yet. Assume every claim you write will be checked against CI and the diff.

## Current state

**Status in one line:** Phase 0 (TASK_001) is complete and merged. `main` is green. The current task is **TASK_002** (monorepo scaffold), and it is unblocked.

**Merge history on `main`:**
- PR 1: the specification files and the phased implementation plan. Merged.
- PR 2: Phase 0. It completes the worksheet, the four memory files, Node pin, source protection scanner, repo tests and a secrets-scanning workflow, plus a CI permissions fix made after review. Merged.
- The last CI run on `main` succeeded.

**What exists in the repository:**

| Path | Purpose |
|---|---|
| `PERSONAL_AI_COMMAND_CENTER_PRD.md`, `RELEASE_CHECKLIST.md`, `MASTER_BUILD_PROMPT.md`, `PATCH_NOTES.md` | Specification. TASK_001 is ticked and marked completed in the PRD, TASK_033 and TASK_034 are `not_applicable`. |
| `STUDENT_DECISIONS.md` | Completed worksheet. Two entries are marked "proposed" and one group "deferred", see Open items. |
| `discovery.md`, `research.md`, `plan.md`, `progress.md` | The four project memory files required by PRD 0.3. |
| `.nvmrc` | `24.21.0`. |
| `package.json` | Minimal: name, engine range, three scripts. Task 002 grows it into a workspaces root. |
| `scripts/source-protection-scan.mjs` | Fails on home-directory paths, non-example email addresses, and entries in a local deny list. Prints file, line and rule, never the matched text. |
| `tests/repo/*.test.mjs` | 31 tests using Node's built-in runner: required files, memory files, worksheet completeness, plan/handoff consistency, CI workflow shape, scanner behavior. |
| `.github/workflows/secrets.yml` | Runs the repo tests, the source scan and gitleaks on pull requests and pushes to `main`. |

**What does not exist yet:** any application code, any dependency install, a lockfile, TypeScript, a workspace layout, Vitest, Playwright, a database, or any provider integration. No Claude Code flags or behaviors have been verified.

**Phase status:**

| Phase | Tasks | Status |
|---|---|---|
| 0 Discovery, decisions, repo | 001 | **Done** |
| 1 Foundation | 002, 003, 004, 005 | **Next** |
| 2 Profiles, supervisor, harness, registry | 006, 007, 008, 027 | Not started |
| 3 Claude Code adapter and headless core | 010, 012, 013, 014 | Not started |
| 4 Level One UI | 015, 016, 017, 018 | Not started |
| 5 Second wave (local) | 019, 020, 022 | Not started |
| 6 Second provider, handoff, remote | 009 or 011 or 028, 021, 023 | Not started, needs owner decision |
| 7 Daily-use features | 024, 029, 031, then 030, 032 | Not started, needs owner decision |
| 8 Hardening and release | 025, 026, checklist | Not started |
| 9 Optional | 033, 034 | `not_applicable` |

## Decisions already made

Full detail and dates are in `STUDENT_DECISIONS.md` and the decision table in `research.md`. Decision IDs D1 to D14 refer to the plan document, section 2.

| Topic | Decision |
|---|---|
| Identity | Name Quack Command Center, amber `#F5B301` with dark text, duck emoji. Subtitle and first-release paragraph are proposals awaiting owner edits. Branding must stay original to the owner. |
| Host | macOS 15 on Apple silicon, zsh. |
| Allowed working-directory root | `~/Downloads/1-git`, **temporary**. Revisit before Phase 7, see Owner gates. |
| Providers | Claude Code only for Level One. The second provider (Codex, Hermes or a hosted OpenAI-compatible model) is decided at the Phase 6 gate. |
| Account profiles | One Claude Code profile labeled `personal`. |
| Remote access | Cloudflare Tunnel plus Access is selected but built in Phase 6. Everything before that is loopback only. Hostname and login email are deferred. |
| App authentication | Owner device pairing. The written design still needs explicit owner approval before TASK_013. |
| Permission policy | Ask before important actions. Bypass never available from the browser. |
| Idle sessions | Never stop automatically. Cleanup preview only, disabled until the owner enables it. |
| Attachments | 10 MB max. png, jpg, webp, gif, pdf, txt, md. Multi-image select on mobile. |
| Launch seeds | None yet. Names chosen at the Phase 7 gate. |
| Orchestration (033), review loop (034) | Left out of release 1. `not_applicable`. |
| tmux compatibility mode | Kept in scope, final decision at the Phase 7 gate. It would give phone-driven slash-command modals (030), seeded launches (032) and provider processes that survive a service restart. |
| Toolchain | Node 24.21.0 LTS, TypeScript strict, npm workspaces, Fastify, Zod, better-sqlite3, React, Vite, Tailwind, Vitest, Playwright. Exact versions in a lockfile. |
| Repository | Private GitHub repository, default branch `main`, work through pull requests. |

## Environment

- **Machine:** macOS 15.7, arm64, zsh. The machine's default Node is 22. **Always run `nvm use` in this repository** or you will run Node 22 against a Node 24 project.
- **Installed:** git, Homebrew, Xcode Command Line Tools, tmux, `gh` (authenticated, pushing over HTTPS works), gitleaks 8.30.1, Claude Code 2.1.282 (logged in through a claude.ai subscription).
- **Not installed:** Codex CLI, Hermes, `cloudflared`, Playwright browsers.
- **Commands that work today:** `npm run test:repo`, `npm run scan:source`, `npm run scan:secrets`. Verified on `main`: 28 of 28 tests passed before this handoff branch added three, and both scans are clean.
- **Local-only file:** `.source-protection-denylist` is gitignored and exists only on the previous machine. It holds the owner's name. On another machine, copy `.source-protection-denylist.example` to that name and add the owner's name and any private identifiers, one per line. Never commit it.
- **The original kit folder** (the unzipped starter kit in the owner's Downloads folder) is reference only. Everything needed is in this repository. It also holds a start-here readme and two paste-this bootstrap prompts that were deliberately not copied.
- **CI:** one workflow. The workflow token is read-only, and gitleaks PR comments are disabled. The repository is private on a plan that **does not offer branch protection** (the API refuses with a 403), see Open items.
- **Are you running inside a Claude Code session yourself?** If so, never point live tests at your own session or configuration. The PRD forbids testing in the owner's live session.

## Working method

Follow `MASTER_BUILD_PROMPT.md` and PRD section 12. The parts that matter most, and the parts the previous agent learned from:

1. **One task current, test first.** Write failing tests, run them, and keep the failing output as evidence. Implement the smallest change that passes, then run the current task's tests, the previous two task groups, affected integration tests, type-check and the production build.
2. **Prove that tests can fail.** For each new guard, mutate the thing it protects and watch the test fail, then restore it. The previous agent did this for the worksheet test.
3. **Never write a claim before you have the evidence.** Run the checks, then write `progress.md`. Separate "passes locally" from "passes in CI". Only tick a PRD box or write "CI green" after `gh pr checks` shows it. This is the exact mistake the reviewer caught.
4. **Completion protocol per task:** tick the acceptance and test boxes in the PRD, set the JSON block to `completed`, `passing`, both booleans true, add a completion note, update `plan.md`, and append to `progress.md`. `progress.md` is append-only: correct earlier entries with a new dated entry.
5. **Just-in-time detailed plans.** The plan document is phase-level on purpose. At the start of each phase, write a bite-sized TDD plan at `docs/superpowers/plans/<date>-phase-N-<name>.md` with exact file paths, interfaces, code, commands and expected output, then implement from it. Provider facts (Task 010 step 0) change the details, which is why these are written late.
6. **Documentation before adapters.** Do not trust remembered CLI flags. Read the official docs and `--help` for the installed version, record versions, links and findings in `research.md`, and build fixtures from real output with the content replaced by invented text.
7. **Pull requests.** One branch per task or coherent task group, opened against `main`. If a branch depends on an unmerged one, stack it and note that in the PR body. Never amend or force-push, add fix commits. Never skip hooks. PR bodies have a summary, owner review items and a test plan whose boxes are only ticked with evidence. Watch CI with `gh pr checks <number> --watch`. Follow your harness's attribution rules for commits and PR descriptions.
8. **Security invariants (PRD 12.7):** credentials stay local, server on loopback, Cloudflare Access in front of any tunnel, evidence-based success, exact provider conversation identity, destructive actions confirmed, no permission bypass from the browser, provider failures isolated, failed messages stay visible, source stays separated. Any endpoint that can put characters into a terminal is its own security boundary: seed key only, fixed key allowlist, literal mode, contained socket path.
9. **Scope guard.** If you find yourself adding a user table, sign-up, pricing page, teammate login, browser editing of provider credential files, or a permission-bypass convenience, stop. That is outside the product boundary.
10. **Repository hygiene.** No personal names, email addresses, home-directory paths, private hostnames or account identifiers anywhere in the repo, including comments, fixtures, screenshots and commit messages. Fixtures and screenshots use invented identities. `npm run scan:source` enforces part of this. Refer to the owner only as "the owner".
11. **Asking the owner.** Ask only when input is genuinely needed: logins, spend, remote exposure, destructive actions, security choices, and the gates below. Batch non-blocking questions and give each a recommended default. Keep doing independent work while waiting.
12. **Live provider tests spend the owner's subscription quota.** Announce each one first, run it in a scratch directory with its own test session, and never in the owner's own session.

## Owner gates

Do not pass any of these without the owner's explicit approval.

| Gate | When | Rule |
|---|---|---|
| Application auth design | Before any TASK_013 code | Write the device-pairing design into `research.md` (planned shape is there) and get explicit approval. It adds an `app_sessions` table the PRD data model lacks. |
| First live provider smoke test | End of Phase 3 | Announce it, scratch directory, dedicated session. |
| Level One trial | End of Phase 4 | The owner uses it with Claude Code and gives feedback before Phase 5. |
| Second provider | Start of Phase 6 | Codex (needs CLI and subscription), hosted model such as NanoGPT (pay per token, and the largest task, 028), or Hermes. Needed for cross-provider handoff (021). |
| Public hostname | Phase 6, Task 023 | Order is fixed: Access application and policy first, tunnel route second. No public hostname without explicit approval. A knowledgeable human must review security before routine remote use. |
| tmux compatibility mode | Phase 7 | Decides whether 030 and 032 are built. If declined, record them as deferred with the reason and note that PRD success criteria 6 and 17 are then unmet. |
| Allowed root | Before Phase 7 installs the background service | `~/Downloads` is a macOS-protected folder and the service may hit permission errors there. Switching to `~/Projects` is a configuration change, since roots live in profile configuration and only change locally. |
| Destructive actions | Whenever they arise | Deleting saved conversations, enabling automatic cleanup, any permission bypass, changing an account login. |
| Final gate | Phase 8 | The full suite passes twice from a clean start, `RELEASE_CHECKLIST.md` is complete, and the owner restarts the computer and resumes a saved conversation. |

## Next steps

### Step 0: verify your footing (5 minutes)
`nvm use`, `git pull` on `main`, `npm run test:repo` (all pass), `npm run scan:source`, `npm run scan:secrets`, `gh pr list` (nothing should be open besides this handoff PR). Read `plan.md`: `Current task: TASK_002`.

### Step 1: write the Phase 1 plan
Create `docs/superpowers/plans/<date>-phase-1-foundation.md` covering TASK_002 to 005 in bite-sized TDD steps. Put it in the same PR as TASK_002 or open it first for owner review if you want an early check. The owner has so far reviewed plans before implementation, but the approved phase plan already authorizes Phase 1.

### Step 2: TASK_002, monorepo scaffold and pinned toolchain
- Convert the root `package.json` to npm workspaces, keeping the three existing scripts working. Layout is PRD 3.8: `apps/server`, `apps/web`, and `packages/{contracts,config,storage,events,supervisor,provider-core,provider-claude,security,test-fixtures}`, plus `scripts/`, and `tests/{contracts,integration,security,browser}`.
- **Verify the dependency set together before pinning.** The PRD pins date from 2026-07-28. On 2026-09-24 the registry had newer versions, including new majors for **TypeScript (7.0.2 vs pin 6.0.2)** and **Vitest (5.0.1 vs pin 4.1.10)**. Install the PRD pins first, get type-check, tests and build green, and only move to a new major if the whole toolchain works and you can say why. Record the outcome in the `research.md` table. Exact versions, `save-exact=true`, committed lockfile.
- `strict` TypeScript with a base config, separate server and web builds from the repo root, Zod env schema with an actionable failure message, and a test that no secret can reach a Vite-exposed variable (only `VITE_`-prefixed names are exposed). Keep `tests/repo` on Node's runner or move it to Vitest deliberately, but keep it running in CI either way.
- **Scanner pitfall (see Gotchas):** `package.json` fields such as `repository` can hold an SSH-style git remote (user `git` at a host), which the email rule flags. Fix the rule with a test first, do not work around it by dropping the field.
- Tests: clean install passes, type-check passes, production build passes, an invalid environment fixture fails with a clear message.

### Step 3: TASK_003, validation commands and CI
- One command, `npm run validate`, runs format, lint, type-check, unit, integration, coverage thresholds (80% overall, 85% provider adapters, 90% security modules and state-machine branches), build, Playwright smoke and secret scanning. Extend the existing workflow to run it on Node 24 and upload coverage, reports, and screenshots and traces on failure.
- Carry-overs from the PR 2 review that were deliberately deferred here: pin third-party actions to commit SHAs, add full-tree and full-history gitleaks so a merge to `main` is actually scanned (today a merge commit is scanned by nothing), and consider tightening the scanner rules (see Gotchas).
- **Decision needed from the owner:** acceptance criterion 6, "CI blocks merging when any required check fails", cannot be enforced by GitHub branch protection on this private repository. Options: make the repository public, upgrade the plan, or accept a local pre-push hook plus discipline. Ask, with a recommendation, and record the answer in `research.md`.
- A deliberately failing fixture must prove the gate blocks.

### Step 4: TASK_004, shared contracts and state machines
Use the exact names and the proposed transition tables in the plan document, section on Phase 1. Provider-neutral Zod schemas for capabilities, the eleven session states, the seven delivery states, error categories (authentication, startup, protocol, timeout, permission, validation, storage, unknown), the event envelope, and a typed `unsupported` result. Table-driven tests must accept every valid transition and reject every other pair. Provider identifiers stay opaque.

### Step 5: TASK_005, SQLite storage
`better-sqlite3` is already verified on this machine (prebuilt binary, FTS5, WAL, online `backup()`). Ordered transactional migrations, WAL, foreign keys, prepared statements, `0700` data directory and `0600` database and backup files, `PRAGMA integrity_check` on open with a visible recovery state on corruption, the eleven logical tables of PRD 3.6, and online backup. Tests cover empty migrate, upgrade from each retained version, rollback, corruption fallback and concurrent repositories.

### Steps 6 onward
Follow the phase table and plan document. The next things to know:
- **Phase 2:** profiles and account isolation (006), process supervisor (007), fake-provider contract harness (008), provider registry (027, done early on purpose). Verify the real profile-isolation mechanism for Claude Code against the installed version. If it is unsupported, stop and tell the owner.
- **Phase 3, TASK_010 step 0 is a documentation spike before any adapter code:** record actual flags for print mode, streaming input and output formats, session ID, resume, model, permission mode, permission prompt handling, image input, transcript location and interrupt. **The highest-risk item is whether headless Claude Code can bridge permission prompts.** If not, report `questions: false` visibly. Do not screen-scrape in shared code. The tmux mode is the fallback, which may move story 6 for Claude Code into Phase 7.
- After Phase 3, the exit evidence is an integration test that pairs, launches against the fake provider, sends, streams, kills the server, restarts it and resumes the same conversation ID, followed by one announced live smoke test.
- **Phase 4 (UI):** mobile first, verified at 390x844 and 1440x900, touch targets 44px, session cards keyed by ID so focus survives updates, privacy mode as a client-side flag, and the 200-update stress test that must lose zero selections.

## Gotchas and lessons

- **`node --test <directory>` fails on Node 24** with a module-not-found error. Use a quoted glob: `node --test "tests/repo/*.test.mjs"`.
- **`nvm use` every time.** The default Node is 22.
- **A `permissions:` block in a workflow drops every unlisted scope to none.** `gitleaks/gitleaks-action` needs `pull-requests: read` on `pull_request` events or it crashes with a 403. A green `push` run does not prove the PR path works, because it never calls that API. Its PR comments need write access, so they are disabled.
- **The scanner's rules are deliberately simple and have known gaps** (raised in the PR 2 review, not yet fixed): the email rule flags SSH-style git remotes (user `git` at a host) and any other `user at host` example except the reserved example domains (this handoff had to be reworded to avoid it); the home-path rule needs a trailing slash so a bare `/Users/name` at end of line is missed, and `~/...` paths are not covered; `package-lock.json` is excluded only at the repository root. Fix these with tests first when Task 002 or 003 hits them. Do not loosen a rule to make a build pass without a test.
- **Some test helpers build their fixtures from string fragments** (for example joining `''`, `'Users'`, `'someone'`) so the test source itself does not match the scanner. Keep that pattern.
- **The worksheet test skips label lines that introduce a checkbox group.** It was verified by blanking a field and watching it fail.
- **PRD defects:** section 9.2 numbers items 16 to 20 twice (cosmetic). The PRD data model has no application-sessions table, which Task 013 needs. Story 8 (stop a turn) is in the owner's "second wave" but Task 017 bundles interrupt with the composer, so basic stop ships in Phase 4.
- **PRD version pins are stale**, see Task 002. `better-sqlite3` 13.0.3 (newer than the 13.0.1 pin) was verified, the rest were not.
- **Stacked pull requests** worked well. GitHub retargets the child PR once the parent merges.
- **Task IDs never change.** Excluded tasks are `not_applicable` with a cited decision, and count as satisfied dependencies. A test enforces this for 033 and 034.

## Open items

1. The owner has not yet edited the proposed product subtitle ("Your coding agents, from anywhere") or the drafted first-release paragraph in `STUDENT_DECISIONS.md` section 14. Treat them as accepted unless told otherwise, and mention them again at the Phase 4 trial.
2. Cloudflare hostname and allowed login email: deferred to Phase 6. The email must never be committed.
3. Second provider and the tmux compatibility decision: Phase 6 and Phase 7 gates.
4. Device-pairing design approval before TASK_013.
5. Branch protection is unavailable on this repository's plan. Decide at TASK_003.
6. Scanner rule gaps and CI hardening listed above (SHA pinning, full-history gitleaks).
7. The `~/Downloads/1-git` allowed root is temporary.
8. Claude Code behavior is entirely unverified. Everything about flags, streaming, permission prompts, isolation, attachments and transcripts comes from the Task 010 spike.
9. Provider CLIs churn. Keep version and flag detection at adapter startup and a visible compatibility state.

## When you are done

The project is finished only when the PRD's final quality gate (section 17) and `RELEASE_CHECKLIST.md` pass: the full validation twice from a clean start, desktop and mobile tests through loopback (or the authenticated public hostname if remote access was built), a dashboard restart while an agent stays live, a computer restart followed by resuming a saved conversation, log and diagnostics review for secrets, a source-protection review, screenshots with invented identities, and the release commit and evidence recorded in `progress.md`. Then give the owner the exact commands and URLs to start, stop, open and recover the finished product.

## Prompt to start your session

> Read `HANDOFF.md`, then the files it lists in order. Verify the environment as in Step 0. Then continue from `Current task` in `plan.md`, following the working method and stopping at each owner gate.
