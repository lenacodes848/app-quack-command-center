# Student Decisions

The coding agent will inspect the local environment, ask the owner one initial batch of questions, and complete this file from the approved answers before implementation begins.

Completed 2026-09-24 from the owner's answers and the local discovery in `discovery.md`. Entries marked "proposed" were drafted by the coding agent and are open for owner edits during PR review. Entries marked "deferred" are decided in principle and get their concrete values at the named phase gate in `docs/superpowers/plans/2026-09-24-personal-ai-command-center.md`.

## 1. Product identity

Product name: Quack Command Center

Short subtitle: Your coding agents, from anywhere (proposed)

Primary color: Amber #F5B301, used with dark text for contrast

Icon or emoji: 🦆

## 2. Host computer

Operating system: macOS

Supported version: macOS 15 and later on Apple silicon (arm64), verified on 15.7

Primary shell: zsh

Default projects directory: ~/Downloads/1-git (temporary. Revisit before Phase 7, when the background service is installed, because Downloads is a macOS-protected folder. Moving to ~/Projects is a configuration change.)

## 3. Initial providers

Mark the providers you want in the first release. At least one of the first two is required, because a subscription coding agent is what the dashboard exists to drive.

1. [x] Claude Code

2. [ ] Codex

3. [ ] Hermes

4. [ ] A hosted model provider through an OpenAI compatible API

5. [ ] Another provider

Second provider: deferred to the Phase 6 gate. Codex, Hermes and the hosted provider tasks (009, 011, 028) stay pending_decision until then. Cross-provider handoff (021) needs the second provider.

Hosted provider name: n/a (not selected)

Base URL: n/a (not selected)

Another provider name and documentation URL: n/a (not selected)

## 4. Hosted model selection

not_applicable: no hosted model provider is selected in section 3. Revisit at the Phase 6 gate.

Models to register, with the context window you measured for each: n/a (no hosted provider)

Model used when a session starts with no explicit choice: n/a (no hosted provider)

Number of API keys for this provider: n/a (no hosted provider)

Failover order when a key is exhausted or rejected: n/a (no hosted provider)

Per key consumption display: n/a (no hosted provider)

## 5. Account profiles

List the account labels you want visible in the dashboard. Use labels only. Never paste credentials into this file.

Claude Code profile labels: personal

Codex profile labels: n/a (not selected)

Hermes profile labels: n/a (not selected)

Hosted provider key labels: n/a (not selected)

## 6. Remote access

Choose one.

1. [ ] Local computer only

2. [x] Named Cloudflare Tunnel with Cloudflare Access

Sequencing: local first. Build and use on loopback through Phase 5. Cloudflare Tunnel and Access are set up in Phase 6, the Access policy before the tunnel route, and no public hostname is enabled without the owner's explicit approval at that gate.

Desired hostname: deferred to the Phase 6 gate (requires a domain managed through Cloudflare)

Allowed login email: deferred to the Phase 6 gate (the owner's own verified email, recorded then and never committed to this repository)

## 7. Application authentication

Choose one. The coding agent must not begin `TASK_013` until this choice is selected and the owner approves the design.

1. [x] Owner device pairing with a secure application session

2. [ ] Owner password with a secure application session

Design approval: the owner selected device pairing on 2026-09-24. The written design still needs the owner's explicit approval in `research.md` before `TASK_013` starts.

## 8. Permission policy

Choose the default.

1. [x] Ask before important actions

2. [ ] Provider default

3. [ ] Read only planning mode

Automatic permission bypass remains unavailable from the browser in the first release.

## 9. Idle session policy

Choose the default.

1. [x] Never stop sessions automatically

2. [ ] Archive after a chosen number of inactive days

3. [ ] Ask before cleanup

Idle threshold in days: n/a (automatic cleanup is disabled until the owner enables a policy)

## 10. Attachment limits

Maximum file size: 10 MB

Allowed file types: png, jpg, webp, gif, pdf, txt, md

Multiple images in one pass on mobile:

1. [x] Yes

2. [ ] No

Files are written to a dedicated temporary attachment directory and never to a path supplied by the browser.

## 11. Launch seeds

A launch seed is a stored instruction the dashboard sends into a brand new session so that one tap starts a specific kind of work.

List the seeds you want, by name: none for the first release. Names are chosen at the Phase 7 gate.

The launch endpoint must accept a seed key only. Free text from the browser at that endpoint would turn a launch into a way to type arbitrary input into a terminal, so anything unrecognised is dropped.

## 12. Optional: orchestration session type

1. [ ] Include it

2. [x] Leave it out of the first release

Planner model, implementer runtimes, correction rounds and per unit timeout: n/a (left out). `TASK_033` is not_applicable.

## 13. Optional: two provider review loop

1. [ ] Include it

2. [x] Leave it out of the first release

Builder default: n/a (left out)

Maximum rounds: n/a (left out). `TASK_034` is not_applicable.

## 14. Definition of the first release

Write one paragraph describing what you want working before adding optional features:

Proposed by the coding agent from the approved plan, open for owner edits: On my Mac I can open Quack Command Center in a browser and see my live agent sessions and my saved conversations in two separate lists. I can launch a Claude Code session by choosing a profile, model, reasoning setting and a working directory under my allowed projects directory, then send messages and watch each one move through queued, accepted, confirmed or failed while the reply streams in. When Claude Code asks for permission or a choice, I can answer it with buttons, and I can stop a running turn without losing the conversation. I can hide sensitive text with privacy mode, and after restarting the service I can resume the exact same Claude Code conversation. Everything runs on loopback behind a paired-device login, no provider credential ever reaches the browser, and the automated tests pass at desktop (1440 by 900) and mobile (390 by 844) sizes. Phone access through Cloudflare, a second provider, attachments, provider handoff, the command palette, search and always-on service startup come after this.
