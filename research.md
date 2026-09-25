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
| Playwright | 1.62.0 | 1.63.0 | Use the PRD pin (verified together, see spike below) |
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

**Native module and npm 11 install scripts.** npm 11.19 reports better-sqlite3's `node-gyp rebuild` install script as "not yet covered by allowScripts" and does not run it. The module still loads because the package ships prebuilt binaries for darwin arm64 and x64, linux x64 and arm64 (glibc and musl) and win32, and no compile is needed. Keep the script unapproved: it is unnecessary and install scripts run arbitrary code. Task 003 must confirm the Linux CI runner loads the module the same way.

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
- Secret scanning: gitleaks runs in CI through the `gitleaks/gitleaks-action` GitHub Action, referenced by major version tag. The workflow token is read only (`contents: read`, `pull-requests: read`) and gitleaks PR comments are disabled. Task 003 pins third party actions to commit SHAs and adds full-tree and full-history scanning so a merge to `main` is scanned.
- Source protection: `scripts/source-protection-scan.mjs` fails on home directory paths, email addresses other than reserved example domains, and any entry in the local, gitignored `.source-protection-denylist`. It prints file, line and rule, never the matched text.

## Known provider limitations and unknowns

- Claude Code flags, structured stream formats, permission prompt handling, config-directory isolation, attachment support and transcript layout have not been verified yet. Task 010 step 0 records them here from the official documentation and `claude --help` on the installed version before any adapter code is written.
- Whether headless Claude Code can bridge permission prompts is the highest risk item. If it cannot, the adapter reports questions as unsupported and the tmux compatibility mode is the fallback.

## PRD defects noted

- Section 9.2 numbers items 16 to 20 twice. Cosmetic.
- The PRD data model (3.6) has no table for application sessions. Task 013 adds an `app_sessions` migration.
- Story 8 (stop a turn) is in the owner's second wave, but Task 017 bundles interrupt with the composer, so basic stop ships in Phase 4.

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

- 2026-09-24: With Vite pinned at 8.1.5 in the web workspace, Vitest 4.1.11 and both Vite plugins resolved 8.3.1 at the root, giving two copies of Vite. The web `vite.config.ts` then failed to type-check with "Excessive stack depth comparing types" because plugin types and config types came from different Vite versions, even though the build itself worked. Fix: a root `overrides` entry `"vite": "8.1.5"` so every consumer shares one copy (npm ls now shows a single version, marked overridden). Vitest accepts Vite ^6, ^7 or ^8, so it runs fine on 8.1.5. Revisit the override when the Vite pin is deliberately raised.
- 2026-09-24: npm 11 also reports `fsevents@2.3.3` (macOS-only optional file watcher pulled in by Vite) as an unapproved install script. Its prebuilt binary ships in the package, so the script is unnecessary. Left unapproved for the same reason as better-sqlite3.

- 2026-09-24: A workflow `permissions: contents: read` block makes `gitleaks/gitleaks-action@v2` crash with HTTP 403 on `pull_request` events, because a permissions block sets every unlisted scope to none and the action lists the PR's commits. The fix is `pull-requests: read`. A passing `push` run does not prove the pull request path works, because it never calls that API. The action's PR comments need `pull-requests: write`, so they are disabled with `GITLEAKS_ENABLE_COMMENTS: "false"` to keep the token read-only.

- 2026-09-24: `node --test tests/repo/` (a directory argument) fails on Node 24 with a module-not-found error. Use a quoted glob such as `node --test "tests/repo/*.test.mjs"`.
