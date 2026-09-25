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

The PRD pins were observed on 2026-07-28. The npm registry on 2026-09-24 reports the versions below. The PRD requires the whole set to be reverified together before installation, so nothing is installed yet. Task 002 installs, type checks and builds the full set together and records the result here.

| Package | PRD pin | Registry latest | Plan |
|---|---|---|---|
| Node.js | 24.18.0 | 24.21.0 (LTS) | Use 24.21.0, same LTS line |
| TypeScript | 6.0.2 | 7.0.2 | New major. Stay on 6.0.2 unless Task 002 shows 7 works with the whole toolchain |
| React | 19.2.8 | 19.3.0 | Verify in Task 002 |
| Vite | 8.1.5 | 8.3.1 | Verify in Task 002 |
| @vitejs/plugin-react | 6.0.4 | 6.1.1 | Verify in Task 002 |
| Fastify | 5.10.0 | 5.12.5 | Verify in Task 002 |
| Zod | 4.4.3 | 4.6.5 | Verify in Task 002 |
| Tailwind CSS | 4.3.3 | 4.3.3 | Matches |
| Vitest | 4.1.10 | 5.0.1 | New major. Stay on 4.1.10 unless Task 002 shows 5 works |
| Playwright | 1.62.0 | 1.63.0 | Verify in Task 002 |
| better-sqlite3 | 13.0.1 | 13.0.3 | Verified below |

Rule: exact versions in the lockfile, and any choice that differs from the PRD pin is recorded here with the reason.

### better-sqlite3 check (passed)

In a throwaway directory on Node.js 24.21.0 arm64, better-sqlite3 13.0.3 installed from a prebuilt binary with no compile step. It reported SQLite 3.53.4, a working FTS5 virtual table and MATCH query, WAL mode, and a `backup()` function. This covers the FTS5 search (Task 031) and online backup (Task 005) requirements. Its declared engine range is Node 22 or later.

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

- 2026-09-24: A workflow `permissions: contents: read` block makes `gitleaks/gitleaks-action@v2` crash with HTTP 403 on `pull_request` events, because a permissions block sets every unlisted scope to none and the action lists the PR's commits. The fix is `pull-requests: read`. A passing `push` run does not prove the pull request path works, because it never calls that API. The action's PR comments need `pull-requests: write`, so they are disabled with `GITLEAKS_ENABLE_COMMENTS: "false"` to keep the token read-only.

- 2026-09-24: `node --test tests/repo/` (a directory argument) fails on Node 24 with a module-not-found error. Use a quoted glob such as `node --test "tests/repo/*.test.mjs"`.
