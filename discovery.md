# Discovery

Last updated: 2026-09-24

## Why this project exists

Quack Command Center is a personal, local-first web dashboard for coding agents. Powerful agents live in separate terminal applications with different logins, session formats and histories, and the owner has to stay near the computer to answer questions. This project puts every session in one responsive interface, so the owner can launch, watch, steer, answer and resume work from a desktop or a phone, while credentials and execution stay on the owner's computer.

The product boundary is one owner and one computer. It is not a hosted multi tenant service. It has no billing, licensing, customer support systems, fleet management, cloud relay, organization administration, or remote access to another person's computer. Provider credentials remain on the owner's computer and the application does not resell model usage.

## Target user

A single person who uses one or more coding agent tools, has basic terminal experience, wants to manage long running work from a phone, owns the host computer, and accepts responsibility for the permissions granted to local agents.

## Source separation rule

The implementation must be created in a new repository. The agent must not read, import, copy, translate, reconstruct, or paraphrase any private command center source. The agent may use the PRD, current official provider documentation, public library documentation, and the student's own product decisions. Branding, icons, colors, typography, component details, animation and copy must be original to the student.

## Current repository state

- New repository, separate from the kit folder it was planned in. The kit folder stays as read-only reference material.
- Contents at the end of Phase 0: the product spec files, the implementation plan, the four memory files, the completed decisions worksheet, repository structure and source protection tests, and a secrets scanning workflow. There is no application code yet.
- Default branch is `main`. Work happens on feature branches and pull requests.

## Host environment

- Operating system: macOS 15.7 on Apple silicon (arm64), zsh
- Node.js: 24.21.0 LTS installed through nvm, pinned by `.nvmrc`. The machine default is still Node 22, so always run `nvm use` in this repository.
- Also installed: git, tmux, Homebrew, Xcode Command Line Tools, gitleaks
- Not installed: Codex CLI, Hermes, cloudflared

## Installed providers

| Provider | Installed | Authentication |
|---|---|---|
| Claude Code | yes | logged in through a claude.ai subscription |
| Codex | no | not applicable yet |
| Hermes | no | not applicable yet |
| Hosted model provider | not selected | not applicable |

Level One uses Claude Code only. The second provider is chosen at the Phase 6 gate.

## First release definition

The first release is the paragraph in section 14 of `STUDENT_DECISIONS.md`. In short: locally, with Claude Code, list live and saved sessions, launch with an explicit profile, model, reasoning setting and directory, send messages with evidence based delivery state, stream replies, answer permission questions with buttons, stop a turn safely, hide sensitive text, and resume the exact conversation after a restart. Optional features (orchestration and the two provider review loop) are excluded.

## Open items carried forward

- Product subtitle and the first release paragraph are proposals awaiting owner edits.
- Desired hostname and allowed login email are decided at the Phase 6 gate.
- The written application authentication design needs owner approval before TASK_013.
- The allowed working directory root is temporary, see `STUDENT_DECISIONS.md` section 2.
