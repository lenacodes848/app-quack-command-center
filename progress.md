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
