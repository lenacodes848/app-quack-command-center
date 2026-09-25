# Personal AI Command Center PRD

Version: 1.0

Research date: 2026 07 28

Document role: product requirements, engineering specification, test plan, and executable coding agent prompt

## 0. How to use this document

This document is the source of truth for building a personal AI command center from scratch.

The product is a local first, single owner web application. It runs on the owner’s computer, connects to locally authenticated coding agent tools, and presents their sessions through one responsive interface. A secure tunnel makes the interface reachable from the owner’s phone.

This document describes product behavior, interfaces, constraints, tests, and delivery order. It contains detailed, production informed product requirements while excluding private production source, private identifiers, and production configuration. The separate repository and similarity checks protect source secrecy. They do not provide a legal clean room or noninfringement guarantee.

The coding agent must complete tasks in dependency order. Every task includes acceptance criteria, test requirements, and a machine readable state block. The coding agent must update the checkbox state and JSON block when the task is complete.

## 0.1 Clean room rule

The implementation must be created in a new repository.

The agent must not read, import, copy, translate, reconstruct, or paraphrase any private command center source. The agent may use this PRD, current official provider documentation, public library documentation, and the student’s own product decisions.

The interface may use the structural layout in this PRD. Branding, icons, colors, typography, component details, animation, and copy must be original to the student.

## 0.2 Product boundary

This is a personal system for one owner and one computer.

It is not a hosted multi tenant service. It does not include billing, licensing, customer support systems, fleet management, a cloud relay, organization administration, or remote access to another person’s computer.

Provider credentials remain on the owner’s computer. The application does not resell model usage. The owner brings their own Claude Code, Codex, Hermes, hosted model, or other provider account.

## 0.3 Required project memory

Before feature code, create these files in the project root:

1. `discovery.md`

   Record why the project exists, the target user, current repository state, host operating system, installed providers, and the first release definition.

2. `research.md`

   Record official documentation links, installed versions, architecture decisions, known provider limitations, security decisions, and failed approaches.

3. `plan.md`

   Track active goals, the current task, blocked work, and recently completed tasks.

4. `progress.md`

   Append dated work results, test output summaries, failures, and newly discovered constraints. Never rewrite historical entries.

## 1. Project overview

### 1.1 Project title

Personal AI Command Center

The student may replace this title with the name in `STUDENT_DECISIONS.md`.

### 1.2 One paragraph summary

Build a responsive web command center for managing local coding agents from a desktop or phone. The owner can connect multiple local provider profiles, launch new Claude Code, Codex, Hermes, hosted model, or compatible agent sessions, view live and saved conversations, send and steer messages, answer provider questions, attach files, change supported settings, monitor progress, stop work, and resume exact conversations after a service or computer restart. The local machine remains the execution environment and credential boundary. Remote access is provided through an authenticated tunnel.

### 1.3 Problem statement

Powerful coding agents live in separate terminal applications with different login systems, session formats, controls, and histories. A person who runs several accounts and providers has to remember which terminal belongs to which project, check many windows for questions, and stay near the computer to respond.

Mobile access adds another problem. Exposing a terminal directly to the internet creates a serious security risk. A useful solution must combine the sessions without moving credentials or file execution into an untrusted cloud service.

### 1.4 Solution overview

The solution has five local layers:

1. A provider adapter layer that translates each provider into a common session contract, sitting on a provider registry: a single configuration file declaring every provider, its endpoint, its credential names, its models with measured context windows, and its reasoning levels. Four things read that registry: the request router, the session launcher, the API that builds a session row, and the model picker. Adding a provider is an entry in this file, and the new provider inherits transcripts, recovery, activity, search and the pickers without any of them being rebuilt.

2. A supervisor that launches, observes, stops, and resumes provider processes.

3. A durable local store for profiles, session metadata, normalized events, delivery state, audit records, and recovery information.

4. A local API and event stream that exposes a secret safe view of the system.

5. A responsive browser interface for session selection, conversation control, questions, attachments, interactive modals, search, privacy, and health.

When selected in `STUDENT_DECISIONS.md`, remote phone access adds two external components:

1. A named Cloudflare Tunnel from a public hostname to the loopback local server.

2. A Cloudflare Access application that authenticates the owner before any request reaches the origin.

### 1.5 Core design principle

Every important state must come from evidence.

A process launch is complete when the provider protocol or health check confirms readiness.

A message is delivered when the provider acknowledges it or its authoritative history records it.

A turn is complete when the provider emits a completion event or the authoritative conversation record shows completion.

A model or reasoning change is complete when the provider reports the effective value.

Timers may trigger checks. Timers must not invent success.

### 1.6 Target user

The target user is a single person who:

1. Uses one or more coding agent tools.

2. Has at least basic terminal experience.

3. Wants to manage long running work from a phone.

4. Owns and controls the host computer.

5. Accepts responsibility for the permissions granted to local agents.

### 1.7 Primary user stories

1. As the owner, I can see all live agent sessions in one list.

2. As the owner, I can see saved conversations that can be resumed.

3. As the owner, I can launch an agent with a chosen provider, account profile, model, reasoning setting, and working directory.

4. As the owner, I can send a message and understand whether it is queued, accepted, confirmed, failed, or ready to retry.

5. As the owner, I can watch the agent reply and work progress in real time.

6. As the owner, I can answer approval and selection questions from my phone.

7. As the owner, I can attach a screenshot, document, or supported file.

8. As the owner, I can stop a turn without losing the conversation.

9. As the owner, I can switch the work to another provider while carrying an explicit summary or selected context.

10. As the owner, I can resume the exact provider conversation after the dashboard restarts.

11. As the owner, I can hide sensitive text when sharing my screen.

12. As the owner, I can see whether the local service, provider adapters, storage, and tunnel are healthy.

### 1.8 Success criteria

The first complete release must meet all of these measurable outcomes:

1. The dashboard supports every provider selected in `STUDENT_DECISIONS.md` through the same adapter contract. The useful personal dashboard milestone requires one provider. The multi provider milestone requires at least two.

2. At least one provider must be Claude Code or Codex.

3. A provider launch returns a truthful ready or failed result within the configured startup timeout.

4. Every sent message reaches confirmed or failed state. No pending message disappears.

5. A duplicate send with the same idempotency key produces one provider submission.

6. Restarting the web service preserves a provider process only when a durable supervisor or provider capability supports reattachment. Otherwise the saved provider conversation remains available for exact resume.

7. Restarting the computer leaves saved conversations available for exact provider resume.

8. Desktop and mobile browser tests pass at 1440 by 900 and 390 by 844 pixels.

9. A documented high volume session list interaction test loses zero selections.

10. The browser receives zero provider credentials and zero raw secret environment values.

11. When remote access is selected, the public hostname rejects users who do not match the configured authentication policy.

12. Unit test coverage reaches at least 80 percent overall and 85 percent for provider adapters and security modules.

13. Accessibility testing reports no critical violations.

14. The complete release checklist passes twice from a clean service start.

15. Adding a provider that speaks an already supported protocol requires a registry entry and no new session, transcript, recovery, or activity code.

16. Every slash command, skill, and agent the installed providers expose is reachable from the browser through one searchable palette.

17. An interactive provider modal can be driven to completion from a phone.

18. Searching the session list matches conversation content as well as titles.

19. A stop cancels the active turn and leaves the session alive with its context intact.

### 1.9 Out of scope

The following features are outside the first release:

1. Multi user collaboration.

2. Hosted execution on a vendor server.

3. Billing or subscriptions.

4. Selling model access.

5. Remote control of a machine the owner does not control.

6. Browser based editing of provider credential files.

7. Automatic permission bypass.

8. Automatic approval of destructive shell actions.

9. Windows support unless selected in `STUDENT_DECISIONS.md`.

10. Native mobile applications.

11. Voice control.

12. Public share links for conversations.

13. Full terminal emulation when structured conversation events are available.

## 2. Technology stack

### 2.1 Recommended baseline

Use exact versions in the lockfile. The following reference pins were observed on 2026 07 28. TypeScript 6.0.2 reflects the Vite React template examined during research, while the package registry may offer a newer release. Reverify the complete dependency set together before installation and record the validated versions in `research.md`:

1. Node.js 24.18.0 LTS.

2. TypeScript 6.0.2.

3. React 19.2.8.

4. Vite 8.1.5.

5. `@vitejs/plugin-react` 6.0.4.

6. Fastify 5.10.0.

7. Zod 4.4.3.

8. Tailwind CSS 4.3.3.

9. Vitest 4.1.10.

10. Playwright 1.62.0.

11. `better-sqlite3` 13.0.1.

12. Pino through Fastify’s built in logger.

Before installing, the coding agent must verify current versions and compatibility against official documentation and package metadata. Version changes must be recorded in `research.md`.

### 2.2 Why this stack

Node.js runs on the same machine as the provider command line tools and offers mature process, stream, filesystem, HTTP, and operating system APIs.

Fastify provides route encapsulation, schema validation, secret safe structured logging, and fast in process API tests through request injection.

React is suitable for a session dashboard whose state arrives from an external event store. Use `useSyncExternalStore` or an equivalent stable subscription layer for provider state. Avoid redundant state that is derived from the normalized session store.

Vite provides a small React and TypeScript build, a development proxy to the local API, and a static production bundle served by the local server.

SQLite provides durable local storage without a separate database service. Use prepared statements, transactions, WAL mode, schema migrations, and restrictive file permissions.

Vitest covers units and component logic. Playwright covers desktop, mobile, refresh, keyboard, touch, accessibility, and restart behavior.

### 2.3 Technology constraints

1. The production server must bind to a loopback address by default.

2. The browser and server must share one origin in production.

3. Provider binaries must be resolved to absolute paths.

4. Shell commands must use argument arrays. Do not concatenate browser input into shell strings.

5. Provider protocols must be version detected.

6. Structured provider APIs and event streams take priority over terminal screen parsing.

7. Compatibility parsing must live inside the provider adapter and must never leak into shared UI logic.

8. State updates must be incremental. Do not rebuild the entire session list on each poll or event.

9. A provider failure must not block unrelated providers or API requests.

10. No provider credential may enter the browser bundle, browser storage, API response, analytics, or logs.

## 3. Architecture

### 3.1 System boundary

The host computer owns:

1. Provider command line tools.

2. Provider authentication.

3. Working directories.

4. Provider processes.

5. Conversation identifiers and local histories.

6. The command center server.

7. The command center database.

8. Temporary attachments.

9. Audit logs.

Cloudflare owns:

1. DNS for the selected hostname.

2. The authenticated edge.

3. The outbound tunnel connection.

Cloudflare proxies application traffic, so conversation content and attachments can traverse and be processed at its edge. Provider credential files, secret environment values, and unnecessary filesystem content must never be included in application traffic.

### 3.2 Major modules

The application should use the following module boundaries:

1. `config`

   Parses validated configuration, resolves directories, and exposes typed settings.

2. `profiles`

   Stores provider profile labels, provider type, local configuration root, binary path, allowed working directories, default model, and default reasoning setting.

3. `providers`

   Contains the common adapter contract and one isolated adapter package per provider.

4. `supervisor`

   Owns child process lifecycle, process groups, graceful stop, crash detection, startup timeout, output stream capture, and recovery reconciliation.

5. `sessions`

   Normalizes live sessions, saved conversations, status, progress, model, context usage, and provider identity.

6. `messages`

   Owns normalized messages, delivery state, idempotency, retries, steering, and authoritative reconciliation.

7. `questions`

   Normalizes provider permission prompts, selection prompts, confirmations, and free text requests.

8. `attachments`

   Validates file size, type, filename, path, storage, cleanup, and provider specific attachment delivery.

9. `storage`

   Owns SQLite migrations, repositories, transactions, backups, retention, and corruption handling.

10. `events`

   Owns normalized event schemas, in memory publication, durable important events, replay cursors, and browser streaming.

11. `api`

   Owns validated HTTP routes, authentication, CSRF protection, rate limits, error mapping, and static frontend delivery.

12. `web`

   Owns the React application, external store, responsive layout, controls, accessibility, privacy mode, and visual tests.

13. `security`

   Owns session cookies, origin checks, path policies, log redaction, Access token validation, and audit events.

14. `ops`

   Owns health checks, service installation, startup, watchdog behavior, log rotation, updates, and diagnostics.

### 3.3 Provider adapter contract

Every provider adapter must implement a versioned contract with these capabilities:

1. Identify provider name and adapter version.

2. Detect the provider binary and installed version.

3. Check authentication without reading or returning credentials.

4. Return available account profiles configured by the owner.

5. Discover available models and reasoning controls from the installed provider when supported.

6. List live sessions owned by the adapter.

7. List saved conversations available for resume.

8. Start a new session.

9. Resume an exact provider conversation.

10. Send a new user message.

11. Steer an active turn when supported.

12. Interrupt the active turn.

13. Gracefully stop the session process.

14. Recover a frozen session only after explicit confirmation.

15. Read normalized history.

16. Stream normalized events.

17. Answer a provider question or permission request.

18. Apply model and reasoning changes when supported.

19. Attach supported local files.

20. Return health and capability information.

21. Return a secret safe inventory of provider instructions, skills, commands, and MCP connections when supported.

22. Report whether the session is currently blocked on an interactive modal, and which keys that modal accepts.

23. Report live activity for a turn in progress: phase, elapsed time, current step, tool in use, retry count, and the last failure message when there is one.

24. Report a launch state that distinguishes starting from busy, so that a session still booting is never signalled or stopped as though it were working.

Each capability must be declared. Unsupported actions must return a typed unsupported result. The shared UI must hide or disable controls based on capabilities.

### 3.4 Normalized session states

Use these session states:

1. `starting`

2. `ready`

3. `working`

4. `waiting_for_user`

5. `stopping`

6. `stopped`

7. `crashed`

8. `unreachable`

9. `saved`

10. `resuming`

11. `needs_attention`

State transitions must be explicit and tested. Unknown provider output must never be mapped to ready by default.

### 3.5 Normalized message delivery states

Use these delivery states:

1. `queued`

2. `submitting`

3. `accepted`

4. `confirmed`

5. `failed`

6. `retrying`

7. `cancelled`

A message remains visible in its last state until the user dismisses it or the provider history reconciles it.

### 3.6 Durable data model

The SQLite database must include these logical records:

1. `provider_profiles`

   Stores public labels and local routing configuration. Does not store provider tokens.

2. `agent_sessions`

   Stores the command center session identifier, provider type, provider conversation identifier, profile identifier, working directory, display name, model, reasoning setting, process metadata, state, and timestamps.

3. `conversation_snapshots`

   Stores enough provider metadata to show and resume a stopped conversation.

4. `normalized_messages`

   Stores user and assistant messages, provider event identifiers, timestamps, delivery state, and safe display content.

5. `pending_actions`

   Stores questions, permission requests, choices, free text requirements, expiry, and answer state.

6. `attachments`

   Stores safe filenames, local temporary paths, content type, byte size, checksum, session ownership, and expiry.

7. `delivery_attempts`

   Stores idempotency keys, attempt count, provider acknowledgement, error category, and reconciliation state.

8. `audit_events`

   Stores authenticated user actions, security events, destructive confirmations, and provider lifecycle events with redacted metadata.

9. `service_state`

   Stores schema version, clean shutdown marker, recovery cursor, and maintenance metadata.

10. `event_log`

   Stores important normalized events for replay after browser reconnect.

11. `provider_inventory`

   Stores cached public metadata for detected instructions, skills, commands, MCP connections, source revision, compatibility status, and last check time. It never stores credential values or complete private instruction text.

Use UUIDs or another collision resistant identifier for command center records. Treat provider identifiers as opaque strings.

### 3.7 Event streaming

The server should expose one authenticated event stream to the browser.

Server Sent Events are acceptable for the browser stream because the main traffic direction is server to client. Use ordinary HTTP requests for commands. A WebSocket is acceptable if the chosen architecture needs bidirectional framing.

The event stream must support:

1. Monotonic event identifiers.

2. Browser reconnection.

3. Replay from the last received event.

4. Heartbeats.

5. Backpressure or bounded queues.

6. A full state refresh when the replay window is unavailable.

7. Secret safe payloads.

8. Per session event ordering.

The browser must reconcile preview deltas with the final authoritative message event.

### 3.8 Repository layout

Use a structure similar to this:

```text
apps/
  server/
  web/
packages/
  contracts/
  config/
  storage/
  events/
  supervisor/
  provider-core/
  provider-claude/
  provider-codex/
  provider-hermes/
  security/
  test-fixtures/
scripts/
  service/
  diagnostics/
tests/
  integration/
  browser/
  security/
discovery.md
research.md
plan.md
progress.md
PERSONAL_AI_COMMAND_CENTER_PRD.md
```

One repository with npm workspaces is recommended. Keep provider packages independent so one broken provider does not force shared code to understand its internals.

## 4. Interface specification

### 4.1 Desktop structure

The desktop interface uses two primary columns.

The left sidebar should occupy approximately 300 to 360 pixels and contain:

1. Product identity.

2. Service status.

3. Privacy control.

4. Sidebar collapse control.

5. Provider and status filters.

6. An active sessions section.

7. A recoverable conversations section.

8. An optional safe idle cleanup preview.

9. A primary create session action.

All visible wording in this specification and its wireframes is illustrative. Students must create original product names, labels, messages, and empty state copy.

The main panel contains:

1. Session header.

2. Session title and rename action.

3. Provider, account, model, reasoning, working directory, state, and elapsed time.

4. Capability based controls for switch, stop, resume, model, reasoning, attachment, clear local view, archive, and terminate.

5. Conversation history.

6. Streaming progress and tool activity.

7. Question and permission cards.

8. Attachment previews.

9. A sticky composer.

10. Delivery and connection status.

When no session is selected, show a calm empty state with a clear instruction.

Desktop wireframe:

```text
┌──────────────────────────────┬──────────────────────────────────────────────────────────┐
│ Product identity             │ Session name      Provider state      Session actions    │
│ Service state                │ Account · model · reasoning · project · elapsed time     │
│ Privacy · collapse · filter  ├──────────────────────────────────────────────────────────┤
│                              │                                                          │
│ ACTIVE SESSIONS              │ User message                                             │
│ ┌──────────────────────────┐ │                                                          │
│ │ status  name   provider  │ │ Assistant response                                      │
│ │ account · model · age    │ │                                                          │
│ │ current activity         │ │ Live progress or tool activity                          │
│ └──────────────────────────┘ │                                                          │
│                              │ Question or permission card                             │
│ RECOVERABLE                  │                                                          │
│ ┌──────────────────────────┐ │                                                          │
│ │ saved   name   provider  │ │                                                          │
│ │ account · model · age    │ │                                                          │
│ │ resume explanation      │ │                                                          │
│ └──────────────────────────┘ ├──────────────────────────────────────────────────────────┤
│                              │ Attachment  Message composer                      Send   │
│ Maintenance preview          │ Delivery and connection state                           │
│ Create session               │                                                          │
└──────────────────────────────┴──────────────────────────────────────────────────────────┘
```

### 4.2 Session cards

Each live session card must show:

1. Status dot.

2. Display name.

3. Provider badge.

4. Model label when known.

5. Account profile label.

6. Relative age.

7. Current activity or latest safe preview.

8. A visual selected state.

Each saved conversation card must show:

1. Saved state.

2. Display name.

3. Provider badge.

4. Last known model.

5. Account profile label.

6. Last active time.

7. A message that the next send will resume the conversation.

Session card updates must preserve the DOM node and focus when identity is unchanged.

### 4.3 Mobile structure

At widths below 768 pixels:

1. The session list becomes a full screen route or view.

2. Selecting a session opens a full screen conversation view.

3. A back control returns to the list.

4. The selected session and live stream remain active while moving between views.

5. Header actions move into a compact action row or overflow menu.

6. The composer remains sticky above the software keyboard.

7. Primary touch targets are at least 44 by 44 pixels.

8. Horizontal scrolling is forbidden for normal content.

9. Question choices stack vertically.

10. Large code and logs scroll inside their own containers.

11. Safe areas are respected on modern phones.

12. A refresh preserves the selected session identifier in the URL.

Mobile wireframe:

```text
SESSION LIST                         CONVERSATION
┌──────────────────────────┐         ┌──────────────────────────┐
│ Product identity         │         │ Back  Session name  More│
│ Status · privacy · filter│         │ Provider · model · state│
├──────────────────────────┤         ├──────────────────────────┤
│ Active sessions          │         │                          │
│ ┌──────────────────────┐ │         │ User message             │
│ │ session card         │ │         │                          │
│ └──────────────────────┘ │         │ Assistant response       │
│                          │         │                          │
│ Recoverable              │         │ Question card            │
│ ┌──────────────────────┐ │         │                          │
│ │ saved card           │ │         │                          │
│ └──────────────────────┘ │         ├──────────────────────────┤
│                          │         │ Attachment  Composer Send│
├──────────────────────────┤         └──────────────────────────┘
│ Create session           │
└──────────────────────────┘
```

### 4.4 Conversation presentation

User messages appear as visually distinct outgoing bubbles.

Assistant final messages appear as readable content blocks.

Live progress may appear as a compact status block that updates in place.

Tool calls should show a safe summary, state, duration, and optional expandable details. Tool arguments and results must be redacted when they may contain secrets.

Provider questions appear as structured cards with:

1. The question.

2. Optional explanatory text.

3. Available choices.

4. Multi select state when supported.

5. A free text response option when supported.

6. A dismiss action when safe.

7. Submitted and confirmed state.

Question cards must use current provider state so resolved prompts do not reappear from historical provider events.

### 4.5 Composer

The composer supports:

1. Plain text.

2. Multi line text.

3. Paste.

4. Attachment selection.

5. Screenshot paste where the browser supports it.

6. Send.

7. Steer while a turn is active when supported.

8. Retry a failed delivery.

9. Cancel a queued delivery.

10. A disabled state with an explanation when the session cannot accept input.

The send action must create a client idempotency key before the request begins.

### 4.6 Create session flow

The new agent flow is a modal on desktop and a full screen sheet on mobile.

It must collect:

1. Provider.

2. Account profile.

3. Working directory.

4. Display name.

5. Model when supported.

6. Reasoning setting when supported.

7. Permission mode when supported.

8. Optional first message.

The modal remains open during launch. It closes only when the session becomes ready or working. On failure it shows a secret safe, actionable error and preserves the form values.

### 4.7 Switch provider flow

Switching provider creates a new session.

The owner chooses:

1. Target provider.

2. Target account profile.

3. Target model and reasoning setting.

4. Same or different working directory.

5. Context transfer method.

Supported context transfer methods:

1. No context.

2. User selected messages.

3. Generated neutral summary reviewed by the user.

4. Reference to a local handoff file.

Never inject hidden provider credentials, private system prompts, or internal reasoning into the target provider.

### 4.8 Privacy mode

Privacy mode must obscure:

1. Session names.

2. Account labels.

3. Message previews.

4. Conversation text.

It may leave these visible:

1. Provider badge.

2. Model label.

3. Status.

4. Session age.

5. Health status.

Privacy state persists locally in the browser. It must not change server data.

### 4.9 Command palette

Typing the palette trigger as the first character of an empty composer opens a filterable list of every invocable skill, agent, and command the installed providers expose.

1. Filter as the owner types, with arrow keys, tab, enter, escape, and tap selection.

2. Each row shows the invocation string and a one line description.

3. Selecting a row writes the invocation string into the composer. It does not send.

4. Rows are at least 44 pixels tall and the list scrolls inside the composer area rather than pushing the page wider.

5. The palette closes on escape, on blur, and on a session change.

### 4.10 Interactive modal card

When a session is blocked on an interactive provider modal, the conversation view shows a card containing the live modal body and a key pad.

1. The key pad offers exactly the keys the modal accepts, each at least 44 pixels.

2. A modal that accepts typed text also renders a text field.

3. Pressing a key repaints the card from the response, so the phone updates without waiting for a poll.

4. The card disappears when the modal closes.

5. Tappable options take precedence: when the session presents a question with selectable options, show those instead.

### 4.11 Activity card

While a turn is in progress, show what is actually happening rather than a spinner.

1. Phase, elapsed time, current step, and the tool in use.

2. Retry count and the last failure message when a turn is retrying, in a visually distinct state that says what the owner can do.

3. A session that is still starting says starting, and offers no stop control.

### 4.12 Search

The session list search field matches conversation content as well as session names.

1. Results show provider, session, and the matching excerpt.

2. Results cover live and saved conversations.

3. Privacy excluded transcripts never appear.

### 4.13 Attachments on mobile

1. The attach control allows selecting several images in one pass, and uploads them together.

2. Each file shows its own progress and its own failure state.

3. A failed file can be retried without re selecting the others.

## 5. Security requirements

### 5.1 Threat model

Assume an attacker may:

1. Discover the public hostname.

2. Send arbitrary HTTP requests.

3. Attempt credential stuffing.

4. Attempt CSRF from another website.

5. Submit malicious filenames, paths, and message text.

6. Cause a provider to output secret looking text.

7. Read browser storage on an already compromised phone.

8. Trigger repeated launches or sends.

9. Exploit a provider parsing bug.

10. Steal an old application session cookie.

The design must reduce the chance that these actions become shell access.

### 5.2 Authentication

Remote access mode uses two layers:

1. Cloudflare Access at the public edge.

2. An application session at the local origin.

Local only mode requires the application session and loopback binding. Cloudflare Access applies only when remote access is selected.

The application session must:

1. Use a high entropy secret.

2. Use a secure, HTTP only, same site cookie.

3. Expire.

4. Support logout and logout from all devices.

5. Rotate on login.

6. Use constant time verification where applicable.

7. Rate limit login attempts.

8. Avoid account enumeration.

Use the application authentication design selected in `STUDENT_DECISIONS.md`. The coding agent must record the design in `research.md` and obtain explicit owner approval before Task 013 implementation begins. A strictly single owner system behind a correctly configured Access application may use device pairing instead of a reusable password.

### 5.3 Cloudflare Access

Create the Access self hosted application before publishing the tunnel route.

Use an allow policy restricted to the owner’s verified email or identity provider group.

Choose an explicit session duration.

Configure the tunnel to point to the loopback local service.

Enable `Protect with Access` on the tunnel when available, or validate the Access JWT at the origin using issuer, audience, expiry, and signature.

Do not rely on an obscure hostname as an authentication control.

### 5.4 Request protection

Every state changing request must include:

1. An authenticated application session.

2. Same origin validation.

3. CSRF protection.

4. A validated JSON schema.

5. A bounded request body.

6. A request identifier.

7. Rate limits appropriate to the action.

Three routes carry more risk than the rest, because each one can put characters into a terminal that runs with the owner's privileges.

1. **Key forwarding.** A fixed allowlist of key names, a bounded repeat count, a bounded text length, and literal mode for text so that a supplied string can never be interpreted as a key name.

2. **Seeded launch.** A key naming server side text. Anything unrecognised is dropped. Message text from the browser is never accepted here.

3. **Any route that writes to a local socket.** The socket path must be contained to a known directory. A caller supplied path at such a route means the browser can write into any socket this user can open.

Treat a message identity carried inside a message body as unverified. Anything that can write to a local messaging socket can claim to be anything, so a claimed sender is display data and never an authorisation.

### 5.5 Process safety

Provider processes must:

1. Launch from absolute binary paths.

2. Receive argument arrays.

3. Receive an explicit environment allowlist.

4. Receive a validated working directory.

5. Run without a shell unless the provider requires one.

6. Use process groups so stop behavior is predictable.

7. Have bounded startup checks.

8. Emit secret safe logs.

9. Avoid automatic permission bypass.

10. Preserve unrelated provider processes during dashboard restart when a durable session host owns them. Preserve exact resume records for every other provider.

### 5.6 Filesystem safety

The application must:

1. Canonicalize all paths.

2. Restrict working directories to configured roots.

3. Reject traversal.

4. Reject symbolic link escapes where applicable.

5. Store attachments in a dedicated private directory.

6. Generate server side attachment filenames.

7. Preserve the original display name separately.

8. Enforce type and size limits.

9. Use restrictive permissions.

10. Delete expired temporary attachments through a safe maintenance task.

### 5.7 Logging

Logs must redact:

1. Authorization headers.

2. Cookies.

3. Provider tokens.

4. Environment variables.

5. Provider credential file contents.

6. Access JWTs.

7. Full attachment paths when unnecessary.

8. Message content by default.

Audit logs may record action types, safe identifiers, timestamps, outcomes, and confirmation state.

## 6. Provider integration guidance

### 6.1 Shared rule

Use the most structured stable interface the installed provider offers.

Preferred order:

1. Official rich client or app server protocol.

2. Official local REST or event API.

3. Official structured command line input and output.

4. Official session history files or database through documented interfaces.

5. Pseudo terminal compatibility mode.

Terminal screen parsing is a last resort because provider interface changes can silently break readiness, question, and message detection.

### 6.2 Codex adapter

Use Codex app server for a rich integration when the installed version supports it.

The adapter must:

1. Start `codex app-server` through standard input and output or a private Unix socket.

2. Perform the required initialize handshake.

3. Generate TypeScript or JSON schemas from the installed Codex version.

4. Start, list, resume, fork, archive, and read threads through the protocol.

5. Start turns and consume incremental item and message events.

6. Use turn steer for active work when supported.

7. Use turn interrupt for cancellation.

8. Surface approvals and questions as normalized pending actions.

9. Treat final thread and turn events as authoritative.

10. Check login through `codex login status`.

11. Keep account profiles isolated with a separate supported Codex configuration home or operating system identity.

12. Keep app server listeners on loopback or a private Unix socket.

13. Never expose an unauthenticated app server listener to the network.

If app server is unavailable, use `codex exec` with JSONL output for one shot or resumable programmatic tasks. Interactive terminal mode may be offered as a compatibility adapter with reduced capabilities.

### 6.3 Claude Code adapter

Prefer the official structured command line interface or Agent SDK path that preserves the user’s supported Claude Code authentication.

The adapter must:

1. Check login through `claude auth status`.

2. Use structured output for programmatic sessions.

3. Use streaming structured output for live progress.

4. Capture the provider session identifier.

5. Resume an exact conversation through the official resume command.

6. Set the model and permission mode through supported flags or structured controls.

7. Surface permission questions through the supported permission prompt mechanism when possible.

8. Reconcile the preview stream with the final structured result.

9. Keep separate account profiles in separate supported configuration roots or separate operating system identities.

10. Never copy authentication files through the browser or database.

11. Record unsupported interactive features in the capability response.

12. Avoid screen scraping when structured output provides the state.

The adapter must verify the installed Claude Code version and flags at startup. If required structured flags are unavailable, it must enter a visible compatibility state.

### 6.4 Hermes adapter

Prefer the Hermes authenticated API Server and Sessions API when available.

The adapter must:

1. Start or connect to a loopback Hermes API server.

2. Store the API server key only in the local secret store.

3. Check `/v1/capabilities`.

4. List sessions through the Sessions API.

5. Read authoritative message history through the session messages endpoint.

6. Create and fork sessions through the API.

7. Stream a turn through the session chat stream endpoint.

8. Normalize assistant deltas, tool start, tool completion, and run completion.

9. Use the official Hermes session identifier for resume.

10. Use named Hermes profiles for account and configuration isolation.

11. Discover skills and toolsets through read only API endpoints when useful.

12. Fall back to official CLI commands when the API does not expose a required action.

Direct SQLite reads may be used only for recovery diagnostics when the official API is unavailable and the database schema version is recognized. The adapter must never write to Hermes storage directly.

### 6.5 Hosted model provider adapter

This adapter connects a pay as you go model endpoint that speaks the OpenAI compatible chat completions protocol. The reference implementation of this specification uses **NanoGPT** (`https://nano-gpt.com`, API base `https://nano-gpt.com/api/v1`), because it requires no subscription and bills per token, which suits a build you are only starting. Any OpenAI compatible endpoint works through the same adapter and the same registry entry.

A hosted model session differs from a subscription coding agent in one important way: the model arrives with no harness. Everything a coding agent gives you for free has to be supplied around it. That work belongs in one shared layer, and every hosted provider then inherits it.

#### 6.5.1 Verify before you register

Never register a provider you have not proven. Three checks, in this order.

1. The catalogue answers with the key.

2. The model emits a tool call. Send a request with one tool defined and a question that requires it, and require a tool call finish reason with correct arguments in the response. **This is a gate.** A model that cannot emit tool calls cannot be an agent in this product, however strong its prose is, and finding that out after the integration is written wastes the integration.

3. The real context window, measured. Send a deliberately oversized prompt and halve until the request is accepted. Record the largest accepted prompt size. A published figure is marketing and the maximum output tokens is a different number entirely. Registering an output ceiling as the input window costs most of the model's context, and under registering is the safe direction to be wrong in, because compaction simply triggers early.

Record what you measured and the date you measured it. Registry windows are verified floors.

Some providers answer an authorised request that carries no user agent header with a status that reads like a dead endpoint rather than a rejected client. Send a user agent.

#### 6.5.2 The provider registry

The registry is a single configuration file. Each entry declares:

1. Display label.

2. Base URL.

3. The environment variable names holding its credentials, in failover order.

4. Protocol family.

5. Default model, default window, default maximum output tokens.

6. The model list, each with its identifier, its measured context window, and its label.

7. The reasoning or effort levels this provider supports, each with its own output budget and its own reasoning switch.

8. A note recording what was verified and when.

The registry is read by the request router, the session launcher, the API that composes a session row, and the model picker. A value that any one of those hardcodes will drift, and every drift of this kind shows up as a session that reports one thing while running another.

#### 6.5.3 The adapter must

1. Route each request upstream by model identifier and attach that provider's credential.

2. Fail over to the next declared credential on an authentication or capacity rejection, and record which credential served the request.

3. Support a per session credential choice, so that exhausting one key on a long job leaves every other session working.

4. Count consumption locally per credential and report **work done**. Most providers publish no quota header, so work remaining cannot be known and must never be displayed.

5. Normalize a streamed tool call, including providers that bundle the tool name and its arguments into one frame.

6. Apply the provider's own reasoning switch. Identify the effort level from the request's own output budget when the transport carries no session identifier, which is why every level must declare a distinct output budget.

7. Preserve stream framing when rewriting a stream. Blank lines are frame separators in server sent events, and dropping them ends every turn in a transport error.

8. Strip any reasoning the adapter folded into the visible stream before that text is fed back as history or recorded into memory, so the model is never given its own deliberation as context.

9. Mint a session identifier at launch and use it as the only identity for that conversation everywhere: the row, the transcript path, the recovery record, the effort file, the model file, and the credential file.

10. Resolve a transcript by exact directory match on that identifier. A prefix match across a reused terminal name will concatenate unrelated conversations and serve them as one.

11. Read live activity from the session log the harness writes, rather than from the terminal. Derive phase, elapsed, step, tool, retry count and the last failure. Grow the read window until the running turn's own start record is in view, because a retrying turn pushes its start far back and a fixed window reports a busy session as idle.

12. Take user turns from the authoritative store and never treat terminal text as assistant output. A message typed while the session is busy is echoed by the terminal with no prompt marker, and a parser that trusts the terminal will show the user their own words as the agent's reply.

13. Stop a turn by asking the upstream router to abort it and sending an interrupt to the session process, preserving the session and its context. A stop must never kill the session or send an interrupt to the whole foreground process group, which takes the session's tool servers down with it.

14. Treat a session that is still booting as `starting` rather than `busy`, and never signal it.

#### 6.5.4 The shared harness around a hosted model

Every hosted provider inherits this layer. Build it once.

1. **Standing context**, a file describing the environment the session runs in, sized to the window rather than to a constant. Load the essentials always and the extended capability map only when the budget allows.

2. **Working memory** that survives compaction and restart, written deterministically after every exchange.

3. **Deterministic retrieval.** Search the session's own log against the current question on every turn and inject what matches. Do not implement this as a tool the model chooses to call. A small model given a retrieval tool, an explicit instruction to use it, and a question it cannot answer will answer without calling it.

   Four failures to avoid, each of which returns a confident zero rather than an error: truncating each stored turn so the fact is never stored; a length normalisation that punishes the long turn holding the answer; an absolute score threshold that rejects everything early in a session, when a two document corpus gives every shared term a negligible inverse document frequency; and ranking the turn where the model already said it could not find something, which feeds the failure back and the model repeats it. Rank and take a small number of results, excerpt around the matching terms rather than from the head of the turn, and filter refusals.

4. **A carry brief.** Before compaction can discard anything, ask the model for a structured handoff covering goal, state, decisions, facts, open questions, artifacts, and next step. Validate its shape and pin it ahead of everything else. Run it after the response is sent so it never delays an answer.

5. **Tool result pruning and just in time tool definitions**, so that the tool schemas do not consume the window.

6. **Per session transcripts, saved rows, resume, and isolation** identical to every other provider.

The principle underneath all six: for a model of this size, anything that depends on the model choosing to do the right thing will not happen. The parts that work are the structural ones.

#### 6.5.5 The model picker

1. Scope the picker to the session's own provider, with chips to widen it so a session can be moved across providers.

2. Filter and search on the server. A phone must never receive a full catalogue.

3. Derive the scope from a provider key carried on the row, never by matching a display label against a list that has yet to arrive.

4. Show the window in thousands of tokens. Dividing by 1024 produces a number that contradicts the exact figure shown beside it.

5. When a provider reports the same string for its display name and its model identifier, print it once.

### 6.6 Interactive modal parity

Interactive slash commands are the reason a phone feels like half a terminal. A provider command that opens a slider, a filterable table, or a tabbed settings panel will block the session, and a dashboard that only understands numbered lists shows an idle looking session that is actually waiting.

Bespoke parsing per command loses to every upstream interface change. Detect instead that the session is inside a modal at all, report which keys the modal accepts, and forward keystrokes.

The adapter must:

1. Detect a modal and return its title, hint, accepted keys, whether it accepts typed text, and its visible body.

2. Read the accepted keys from the modal's own hint footer, and offer the arrow keys unconditionally, because some modals stop advertising them once filtered and hiding them strands a phone that has several matches.

3. Bound the body at the modal's own frame so that stale scrollback cannot leak in and mislabel the panel.

4. Suppress the modal card while tappable options are available, since tappable options beat a key pad.

5. Include the modal body in the repaint signature, or the card freezes after the first key press.

The key forwarding endpoint must use a fixed key allowlist, bound repeat counts, bound text length, and send text in literal mode so a supplied string can never be read as a key name. It returns the repainted session so the phone updates immediately rather than waiting for the next poll.

### 6.7 Provider question fidelity

A provider question rendered from a terminal has to survive two layouts.

1. When options carry a preview, the interface renders a narrow option column beside a bordered preview panel, and one line of the capture holds a truncated label followed by the panel's border. Find the panel's left column by agreement across at least two lines of the block and cut every option line there.

2. Every option carries a description on the lines below its label. Walk each option's whole block: a continuation indented to the left of the label column is the wrapped remainder of the label, anything at or beyond it is the description.

3. The preview belongs to the highlighted option and is redrawn as the cursor moves, so the repaint signature must include the selected index.

4. A multiple selection reply must be composed from a stored label rather than from the button's rendered text, or a description leaks into the answer.

5. Build fixtures from a verbatim terminal capture taken the same way the running code reads the terminal.

### 6.8 Future provider adapter

A fourth provider should be addable without modifying the shared session store or primary UI.

The future adapter acceptance test must prove:

1. The provider registers itself through the registry alone.

2. Capabilities control visible actions.

3. Sessions appear in the shared list.

4. Messages use normalized events.

5. Unsupported controls remain hidden.

6. Provider failure does not affect other providers.

7. No label anywhere in the interface names a different provider that shares the same session type.

### 6.9 Optional: orchestration session type

Build this only when it is selected in `STUDENT_DECISIONS.md`, and only after the core build passes its release checklist.

An orchestration session takes an objective, plans the work into units, dispatches each unit to an implementer session, reviews what comes back, runs correction rounds, and verifies the result. The whole loop stays visible inside one session.

Requirements:

1. A provider neutral task contract carrying the objective, the files in scope, the interfaces, the constraints, the verification steps, the response format, and a mandatory structured report block.

2. A schema for the plan, the review, and the final verdict, so the planner's output is validated rather than read as prose.

3. An engine with explicit phases: plan, assign, wave, dispatch, review, correction rounds, final verification.

4. A workspace snapshot taken through a temporary index so that untracked files are included and the owner's own working state is never touched.

5. A persistent run store, so a run survives a dashboard restart and can be inspected afterwards.

6. Implementer adapters. A headless adapter per subscription provider, plus one universal adapter that drives any provider the dashboard can already launch, through the same launch, send, history, and busy machinery the browser uses. That universal adapter is what makes every present and future provider an implementer with no new plumbing.

7. The reviewer re runs verification itself rather than trusting an implementer's claim. An implementer blocked by a local guard is a unit the reviewer can still pass on its own evidence.

Three implementation traps worth writing down before you hit them:

1. A variadic command line flag placed before a positional argument swallows the argument. Pass one joined value, and send a long prompt over standard input.

2. A second trigger arriving a few microtasks after a phase change finds the previous execution's cleanup unfinished and is dropped. Chain triggers on the previous promise.

3. A stop issued before an adapter attaches its abort listener hangs forever. Check the aborted flag first, and handle an already aborted signal in every adapter.

### 6.10 Optional: two provider review loop

Build this only when it is selected in `STUDENT_DECISIONS.md`.

A review loop is a session where one provider plans and builds while a **different** provider reviews, and a third fresh session inspects the result. It exists to prevent a model from grading its own work.

Requirements:

1. **The opposite provider rule is structural.** The reviewer must differ from the host and the inspector must differ from the builder. The runner enforces it and raises otherwise. Because of that, those two roles are displayed as locked chips carrying the reason. A dropdown that can hold one value is a lie, and one that can hold two produces an error. Only the builder, the models, and the round limits are real choices.

2. **Launch it as an ordinary session of an existing provider, seeded with the loop instruction.** It then inherits the row, transcript, recovery, isolation, account picker, and model controls that already exist. A new session type would need its own copy of every one of those.

3. **The seam is a seed key, never a message.** The stored instruction text lives on the server, the launch endpoint accepts a key naming it, and anything unrecognised is dropped. Accepting free text at that endpoint would turn a launch into a way to type arbitrary input into a terminal.

4. **Wait for a drawn composer before sending a seed.** Keys sent into a session that is still booting are echoed and then discarded, and the instruction simply vanishes. Use the same readiness signal the ordinary send path uses to verify a delivery, and wait for any pending handoff first so two messages cannot concatenate into one turn.

5. **Read stage state from the artifacts the runner writes, never from the transcript.** The runner writes a record when a call starts and rewrites it when it ends, carrying status, mode, provider, verdict, findings, coverage, and limitations. A stage reporting done must be a call that completed. A phase with no runner call behind it reports only what it can prove, such as whether the plan file exists.

6. **Applying a configuration must both store it and say so in the session.** The agent runs the loop, so a stored setting the agent was never told about is a dashboard lying to itself. Save, then send a composed sentence into the session, and report whether that delivery succeeded.

7. **Read the model list from the provider at runtime.** Model names spoken aloud in a video, or hardcoded from documentation, will be wrong, and a subscription account exposes a different set of names from an API account. Validate against the live list.

8. **Repaint the status card from the same place the header state is kept current**, repainting only when a signature of the displayed state changes, and never underneath an open dropdown. A card painted once with the transcript will still be showing a superseded failure long after the header has moved on.

9. Configuration rows are mobile first: stacked by default so a select wraps onto its own line rather than truncating, two columns only above a wider breakpoint, tap targets at least 44 pixels.

## 7. Testing architecture

### 7.1 Testing layers

Use five layers:

1. Pure unit tests.

   Cover parsers, reducers, state machines, schemas, path policy, redaction, idempotency, and capability logic.

2. Adapter contract tests.

   Run the same behavioral suite against every provider adapter using deterministic fixtures.

3. Process integration tests.

   Use fake provider executables that emit structured events, delay startup, crash, ask questions, reject messages, and resume conversations.

4. API integration tests.

   Use Fastify injection for authentication, validation, rate limits, CSRF, response shapes, and error mapping.

5. Browser tests.

   Use Playwright for desktop, mobile, accessibility, refresh, reconnect, focus, keyboard, touch, file attachment, and recovery behavior.

### 7.2 Test directory conventions

Use:

```text
packages/*/src/**/*.test.ts
tests/contracts/*.contract.test.ts
tests/integration/*.integration.test.ts
tests/security/*.security.test.ts
tests/browser/*.spec.ts
tests/fixtures/providers/*
```

Test names should describe behavior and evidence:

```text
confirms a message only after the provider acknowledgement
keeps a failed message visible for retry
resumes the exact provider conversation after service restart
rejects a working directory outside configured roots
preserves the selected session during 200 incremental updates
```

### 7.3 Mock and stub strategy

Do not mock the provider adapter in shared integration tests. Use a fake provider process that exercises the same stream and lifecycle boundaries.

Mock only:

1. Clock.

2. Random identifier source.

3. Cloudflare token verifier network fetch.

4. Filesystem permission edge cases that cannot be created portably.

5. Provider catalog calls in narrow unit tests.

Use temporary directories and disposable SQLite databases for integration tests.

### 7.4 Coverage

Required thresholds:

1. Provider adapters: 85 percent lines, branches, functions, and statements.

2. Security modules: 90 percent lines and branches.

3. Shared session and message state machines: 90 percent branches.

4. Entire repository: 80 percent lines, branches, functions, and statements.

Coverage exclusions require an explanation in `research.md`.

### 7.5 Critical failure fixtures

Create fixtures for:

1. Provider binary missing.

2. Provider logged out.

3. Provider startup timeout.

4. Provider exits immediately.

5. Provider emits malformed JSON.

6. Provider changes schema version.

7. Provider asks a single choice question.

8. Provider asks a multi select question.

9. Provider requires free text.

10. Provider rejects permission.

11. Provider streams partial assistant text.

12. Provider crashes mid stream.

13. Provider confirms the user message after a delay.

14. Provider writes the message to history but the acknowledgement is lost.

15. Provider resumes an exact conversation.

16. Provider has a frozen process.

17. Provider returns an unknown model.

18. Provider account expires.

19. Tunnel connection drops while a turn continues.

20. Browser reconnects with an old event cursor.

### 7.6 Test first rule

For every feature task:

1. Write failing tests.

2. Run them and record the failure.

3. Implement the smallest passing behavior.

4. Refactor with the tests green.

5. Run the current task tests.

6. Run the previous two task groups.

7. Run affected integration and browser tests.

8. Update this document and `progress.md`.

## 8. Feature tasks

Task applicability follows `STUDENT_DECISIONS.md`. Tasks 009, 010, and 011 apply only to their selected providers. Task 023 applies only when remote access is selected. Record each excluded task as `not_applicable` in its JSON state and in `progress.md`, together with the governing student decision. An excluded task counts as a satisfied dependency for the remaining task graph. Shared contracts, fixtures, and security boundaries remain mandatory.

### Task 001: Source separated repository and project memory

Description: Create a new repository and record the product decisions, host environment, provider inventory, and implementation boundaries. Establish the four project memory files before application code.

Acceptance criteria:

1. [x] The repository is separate from every private reference project.

2. [x] `discovery.md`, `research.md`, `plan.md`, and `progress.md` exist.

3. [x] `STUDENT_DECISIONS.md` is complete.

4. [x] The installed Node.js and provider versions are recorded.

5. [x] The source separation rule is copied into `discovery.md`.

6. [x] A secrets baseline scan passes.

Test requirements:

1. [x] A repository structure test confirms required files.

2. [x] A source protection test rejects known private domains and paths configured in a local deny list.

3. [x] A secrets scanner runs in CI.

```json
{
  "task_id": "TASK_001",
  "name": "Source separated repository and project memory",
  "status": "completed",
  "tests_status": "passing",
  "unit_tests_passing": true,
  "integration_tests_passing": true,
  "dependencies": [],
  "estimated_complexity": "low"
}
```

Completed 2026-09-24. Validation: `npm run test:repo` (24 tests), `npm run scan:source`, `npm run scan:secrets`. Details in `progress.md`.

### Task 002: Monorepo scaffold and pinned toolchain

Description: Create the server, web, shared package, test, and script workspaces. Pin the toolchain and add strict TypeScript, formatting, linting, build, and test configuration.

Acceptance criteria:

1. [x] Workspace commands run from the repository root.

2. [x] TypeScript strict mode is enabled.

3. [x] The server and web application build separately.

4. [x] Production dependencies and development dependencies are exact in the lockfile.

5. [x] Node.js version is pinned.

6. [x] Environment variable types and validation exist.

7. [x] No secret is placed in a Vite exposed environment variable.

Test requirements:

1. [x] A clean install passes.

2. [x] Type checking passes.

3. [x] The production build passes.

4. [x] An invalid environment fixture fails with an actionable message.

```json
{
  "task_id": "TASK_002",
  "name": "Monorepo scaffold and pinned toolchain",
  "status": "completed",
  "tests_status": "passing",
  "unit_tests_passing": true,
  "integration_tests_passing": true,
  "dependencies": ["TASK_001"],
  "estimated_complexity": "medium"
}
```

Completed 2026-09-24 (verified locally, CI evidence recorded in `progress.md` once the pull request has run). Validation: clean clone `npm ci`, `npm run typecheck`, `npm test` (24 tests), `npm run build`, plus lint, format check, audit and the repository scans. Deviation from the PRD pins: Vitest 4.1.11 (advisory in 4.1.10) and a root override pinning a single Vite 8.1.5, see `research.md`.

### Task 003: Continuous integration and validation commands

Description: Add automated validation for formatting, linting, type checking, unit tests, integration tests, coverage, build, browser smoke tests, and secret scanning.

Acceptance criteria:

1. [x] One command runs the complete local validation.

2. [x] CI uses a supported Node.js LTS version.

3. [x] CI caches dependencies without caching secrets or mutable database state.

4. [x] Test reports and coverage artifacts are retained.

5. [x] Browser failures retain screenshots and traces.

6. [ ] CI blocks merging when any required check fails.

Test requirements:

1. [ ] A deliberately failing fixture proves CI blocks.

2. [x] A clean validation run passes.

3. [x] CI configuration contains no credential literal.

```json
{
  "task_id": "TASK_003",
  "name": "Continuous integration and validation commands",
  "status": "pending",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_002"],
  "estimated_complexity": "medium"
}
```

### Task 004: Shared contracts and state machines

Description: Define normalized provider capabilities, session states, message delivery states, question types, events, errors, and transition rules. Make shared contracts provider neutral.

Acceptance criteria:

1. [ ] Every normalized type has runtime validation.

2. [ ] State transitions reject impossible changes.

3. [ ] Provider identifiers remain opaque.

4. [ ] Capability flags control every optional action.

5. [ ] Error categories separate authentication, startup, protocol, timeout, permission, validation, storage, and unknown failures.

6. [ ] Events have stable versions and identifiers.

Test requirements:

1. [ ] Table driven tests cover every valid session transition.

2. [ ] Table driven tests reject every invalid session transition.

3. [ ] Delivery state tests cover retry and reconciliation.

4. [ ] Schema round trip tests pass.

```json
{
  "task_id": "TASK_004",
  "name": "Shared contracts and state machines",
  "status": "pending",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_002"],
  "estimated_complexity": "high"
}
```

### Task 005: SQLite storage and migrations

Description: Implement durable local storage for profiles, sessions, snapshots, messages, questions, attachments, delivery attempts, events, audit records, and service state.

Acceptance criteria:

1. [ ] Migrations are ordered and transactional.

2. [ ] The database uses WAL mode.

3. [ ] Prepared statements are used.

4. [ ] Foreign keys are enabled.

5. [ ] The database and backup files use restrictive permissions.

6. [ ] Corruption creates a visible recovery state.

7. [ ] Important writes are atomic.

8. [ ] Backup creation is supported.

Test requirements:

1. [ ] Migrations pass from an empty database.

2. [ ] Upgrade tests pass from every retained schema version.

3. [ ] Transaction rollback tests pass.

4. [ ] Corruption fallback tests pass.

5. [ ] Concurrent repository tests preserve consistency.

```json
{
  "task_id": "TASK_005",
  "name": "SQLite storage and migrations",
  "status": "pending",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_004"],
  "estimated_complexity": "high"
}
```

### Task 006: Provider profile configuration and account isolation

Description: Add owner configured provider profiles that select a provider binary, public label, local configuration root, safe environment allowlist, defaults, and allowed working directories without copying credentials.

Acceptance criteria:

1. [ ] Profiles contain labels and routing configuration only.

2. [ ] Credential values are absent from the database.

3. [ ] Each provider process receives only the selected profile environment.

4. [ ] Profile configuration roots are canonicalized.

5. [ ] Authentication status comes from provider supported commands or APIs.

6. [ ] Logging out one profile cannot affect another profile in tests.

7. [ ] The API returns public profile data only.

8. [ ] Each profile can report a secret safe inventory of instructions, skills, commands, and MCP connection status.

9. [ ] Inventory collection reads metadata and health only. It does not return complete private instruction text.

Test requirements:

1. [ ] Environment allowlist tests reject unexpected variables.

2. [ ] Secret redaction tests cover profile errors.

3. [ ] Multi profile isolation integration tests pass.

4. [ ] Authentication status timeout tests pass.

5. [ ] Provider inventory redaction tests pass.

```json
{
  "task_id": "TASK_006",
  "name": "Provider profile configuration and account isolation",
  "status": "pending",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_004", "TASK_005"],
  "estimated_complexity": "high"
}
```

### Task 007: Process supervisor

Description: Implement provider process launch, readiness checks, process group ownership, output capture, graceful stop, crash detection, startup timeout, and restart reconciliation.

Acceptance criteria:

1. [ ] Binaries are absolute paths.

2. [ ] Browser input never enters a shell command string.

3. [ ] Working directories are validated before launch.

4. [ ] Launch success requires readiness evidence.

5. [ ] Startup timeout produces a typed failure.

6. [ ] A crashed process creates a visible session state.

7. [ ] Dashboard restart reattaches to or reconciles existing provider processes when supported.

8. [ ] Stopping one session cannot stop another.

Test requirements:

1. [ ] Fake provider readiness tests pass.

2. [ ] Immediate crash tests pass.

3. [ ] Startup timeout tests pass.

4. [ ] Graceful stop and forced stop tests pass.

5. [ ] Exact process isolation tests pass.

```json
{
  "task_id": "TASK_007",
  "name": "Process supervisor",
  "status": "pending",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_004", "TASK_005", "TASK_006"],
  "estimated_complexity": "high"
}
```

### Task 008: Provider adapter test harness

Description: Build a reusable contract suite and deterministic fake providers before implementing real provider adapters.

Acceptance criteria:

1. [ ] One contract suite runs against every adapter.

2. [ ] Fake providers cover readiness, stream, question, failure, crash, resume, and setting changes.

3. [ ] Fixtures contain invented content.

4. [ ] Protocol versions are selectable.

5. [ ] Slow and malformed fixtures are available.

Test requirements:

1. [ ] The reference fake adapter passes the contract.

2. [ ] A deliberately broken adapter fails the expected contract cases.

3. [ ] Fixture process cleanup leaves no orphan processes.

```json
{
  "task_id": "TASK_008",
  "name": "Provider adapter test harness",
  "status": "pending",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_004", "TASK_007"],
  "estimated_complexity": "high"
}
```

### Task 009: Codex adapter

Description: Implement the Codex provider through app server when supported by the pinned installed version. The protocol includes a stable API subset, while the `codex app-server` launcher is currently documented as experimental. Generate matching schemas, remain within the documented stable subset, treat transport compatibility as version sensitive, and normalize threads, turns, items, approvals, streamed output, steering, interruption, and authentication status.

Acceptance criteria:

1. [ ] The adapter checks `codex login status`.

2. [ ] The adapter performs the app server initialization handshake.

3. [ ] Schemas are generated from the installed Codex version.

4. [ ] New threads and exact thread resume work.

5. [ ] Turn start, steering, interruption, and completion work when supported.

6. [ ] Assistant deltas reconcile with final messages.

7. [ ] Approval requests become normalized pending actions.

8. [ ] Model and reasoning values are provider confirmed.

9. [ ] App server transport remains local and private.

10. [ ] Account profiles remain isolated.

Test requirements:

1. [ ] The Codex adapter passes the shared provider contract.

2. [ ] Handshake failure tests pass.

3. [ ] Schema version mismatch tests pass.

4. [ ] Steering during an active turn tests pass.

5. [ ] Exact resume tests pass.

6. [ ] Logged out profile tests pass.

```json
{
  "task_id": "TASK_009",
  "name": "Codex adapter",
  "status": "pending",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_006", "TASK_007", "TASK_008"],
  "estimated_complexity": "high"
}
```

### Task 010: Claude Code adapter

Description: Implement the Claude Code provider through supported structured input, structured streaming output, authentication status, exact session identifiers, resume, model selection, permission modes, and permission prompt handling.

Acceptance criteria:

1. [ ] The adapter checks `claude auth status`.

2. [ ] The installed version and supported flags are detected.

3. [ ] New sessions capture an exact provider session identifier.

4. [ ] Structured streaming output becomes normalized events.

5. [ ] Exact resume continues the original conversation.

6. [ ] Model and permission settings use supported provider controls.

7. [ ] Permission questions become normalized pending actions where supported.

8. [ ] Preview output reconciles with the final provider result.

9. [ ] Compatibility limitations are visible.

10. [ ] Account profiles remain isolated.

Test requirements:

1. [ ] The Claude Code adapter passes the shared provider contract.

2. [ ] Unsupported flag tests pass.

3. [ ] Structured stream corruption tests pass.

4. [ ] Permission question tests pass.

5. [ ] Exact resume tests pass.

6. [ ] Expired authentication tests pass.

```json
{
  "task_id": "TASK_010",
  "name": "Claude Code adapter",
  "status": "pending",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_006", "TASK_007", "TASK_008"],
  "estimated_complexity": "high"
}
```

### Task 011: Hermes adapter

Description: Implement the Hermes provider through its authenticated local API Server and Sessions API. Normalize profile selection, capabilities, sessions, history, streaming turns, tools, forking, and exact resume.

Acceptance criteria:

1. [ ] The Hermes API Server is local only.

2. [ ] The API key remains server side.

3. [ ] Capabilities are discovered before actions are enabled.

4. [ ] Sessions and message history use official API endpoints.

5. [ ] Stream events normalize assistant deltas, tool activity, and completion.

6. [ ] Exact resume uses the provider session identifier.

7. [ ] Named Hermes profiles isolate accounts and configuration.

8. [ ] Skills and toolsets may be listed without exposing secret configuration.

9. [ ] API unavailable state produces a supported CLI fallback or visible compatibility state.

10. [ ] Hermes storage is never written directly.

Test requirements:

1. [ ] The Hermes adapter passes the shared provider contract.

2. [ ] API key rejection tests pass.

3. [ ] Capability fallback tests pass.

4. [ ] Streaming event tests pass.

5. [ ] Profile isolation tests pass.

6. [ ] Exact resume tests pass.

```json
{
  "task_id": "TASK_011",
  "name": "Hermes adapter",
  "status": "pending",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_006", "TASK_007", "TASK_008"],
  "estimated_complexity": "high"
}
```

### Task 012: Session aggregation and recovery catalog

Description: Combine live sessions and saved conversations from every enabled provider into one normalized catalog. Preserve provider identities, reconcile processes after service restart, and store enough metadata for exact lazy resume after computer restart.

Acceptance criteria:

1. [ ] Live and saved records are distinct.

2. [ ] Provider identities remain authoritative.

3. [ ] Dashboard restart reattaches to live provider processes only when a durable supervisor or provider capability supports it.

4. [ ] Unsupported process reattachment and computer restart both leave recoverable conversation records for exact resume.

5. [ ] Resume launches only when the owner selects or messages a saved conversation.

6. [ ] Concurrent resume requests for one conversation serialize.

7. [ ] A failed resume preserves the saved record and shows an actionable error.

8. [ ] Intentional archive and deletion remain distinct.

9. [ ] Recovery metadata writes are atomic.

10. [ ] Corrupt recovery state falls back to the last valid snapshot.

Test requirements:

1. [ ] Multi provider catalog tests pass.

2. [ ] Service restart reconciliation tests pass.

3. [ ] Computer restart simulation tests pass.

4. [ ] Duplicate resume tests pass.

5. [ ] Corrupt snapshot fallback tests pass.

```json
{
  "task_id": "TASK_012",
  "name": "Session aggregation and recovery catalog",
  "status": "pending",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_005", "TASK_007", "TASK_009", "TASK_010", "TASK_011"],
  "estimated_complexity": "high"
}
```

### Task 013: Authenticated local API

Description: Build the Fastify API with typed route schemas, application authentication, session cookies, CSRF protection, rate limits, origin checks, redacted errors, request identifiers, and static frontend delivery.

Acceptance criteria:

1. [ ] The server binds to loopback by default.

2. [ ] The application authentication design matches the approved choice in `STUDENT_DECISIONS.md`.

3. [ ] Every route has request and response schemas.

4. [ ] State changing routes require authentication and CSRF protection.

5. [ ] Login or device pairing attempts are rate limited.

6. [ ] Sessions expire and can be revoked.

7. [ ] Security headers are present.

8. [ ] Request bodies are bounded.

9. [ ] Logs redact authorization, cookies, and configured secret fields.

10. [ ] Errors are actionable and secret safe.

11. [ ] The production frontend is served from the same origin.

Test requirements:

1. [ ] Fastify injection tests cover every route.

2. [ ] Authentication bypass tests pass.

3. [ ] CSRF tests pass.

4. [ ] Rate limit tests pass.

5. [ ] Cookie expiry and revocation tests pass.

6. [ ] Redaction tests pass.

```json
{
  "task_id": "TASK_013",
  "name": "Authenticated local API",
  "status": "pending",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_004", "TASK_005", "TASK_006", "TASK_012"],
  "estimated_complexity": "high"
}
```

### Task 014: Browser event stream and external store

Description: Add the authenticated server event stream, replay cursor, heartbeat, reconnect behavior, bounded queues, and React external store that incrementally updates sessions, messages, questions, health, and delivery state.

Acceptance criteria:

1. [ ] Events have monotonic identifiers.

2. [ ] Reconnect resumes from the last browser cursor.

3. [ ] Missing replay history triggers a full safe refresh.

4. [ ] Preview deltas reconcile with final messages.

5. [ ] Per session event order is preserved.

6. [ ] The browser store updates only affected entities.

7. [ ] Derived views are calculated from normalized state.

8. [ ] Stream failures produce a visible reconnect state.

9. [ ] Event payloads contain no secret fields.

10. [ ] Queue overload fails visibly with retry guidance.

Test requirements:

1. [ ] Replay tests pass.

2. [ ] Reconnect tests pass.

3. [ ] Out of order event tests pass.

4. [ ] Preview reconciliation tests pass.

5. [ ] Bounded queue tests pass.

6. [ ] React subscription cleanup tests pass.

```json
{
  "task_id": "TASK_014",
  "name": "Browser event stream and external store",
  "status": "pending",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_013"],
  "estimated_complexity": "high"
}
```

### Task 015: Responsive command center shell

Description: Build the original student branded desktop and mobile shell with the specified sidebar, active and recoverable sections, main session view, empty state, filters, privacy control, and mobile navigation.

Acceptance criteria:

1. [ ] Desktop uses the two column structure.

2. [ ] Mobile uses separate list and conversation views.

3. [ ] Active sessions and recoverable conversations are distinct.

4. [ ] Session cards show provider, account, model, status, activity, and age when available.

5. [ ] Session card identity and focus survive incremental updates.

6. [ ] The selected session is represented in the URL.

7. [ ] Refresh preserves the selected session.

8. [ ] Privacy mode hides sensitive text.

9. [ ] Desktop sidebar collapse preserves the conversation.

10. [ ] Branding and visual design are original to the student.

Test requirements:

1. [ ] Component tests cover list sections and capabilities.

2. [ ] Playwright desktop layout tests pass.

3. [ ] Playwright mobile layout tests pass.

4. [ ] A documented high volume interaction stress test loses zero selections.

5. [ ] Refresh persistence tests pass.

6. [ ] Privacy mode tests pass.

```json
{
  "task_id": "TASK_015",
  "name": "Responsive command center shell",
  "status": "pending",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_014"],
  "estimated_complexity": "high"
}
```

### Task 016: Create session launch flow

Description: Build the capability aware new agent form for provider, account profile, working directory, display name, model, reasoning, permission mode, and optional first message. Keep the form open until launch is proven.

Acceptance criteria:

1. [ ] Provider selection filters compatible profiles and controls.

2. [ ] Working directories come from allowed roots.

3. [ ] Model and reasoning options come from the provider adapter.

4. [ ] Unsupported fields remain hidden.

5. [ ] Form values persist after a launch failure.

6. [ ] A launch shows starting state.

7. [ ] The form closes only after readiness evidence.

8. [ ] A successful launch opens the new session.

9. [ ] Duplicate launch submissions are prevented.

10. [ ] Mobile and desktop flows are usable.

Test requirements:

1. [ ] Form validation tests pass.

2. [ ] Provider capability tests pass.

3. [ ] Successful launch browser tests pass.

4. [ ] Failed launch browser tests pass.

5. [ ] Slow launch tests pass.

6. [ ] Duplicate submission tests pass.

```json
{
  "task_id": "TASK_016",
  "name": "Create session launch flow",
  "status": "pending",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_012", "TASK_013", "TASK_015"],
  "estimated_complexity": "high"
}
```

### Task 017: Conversation history and composer

Description: Build normalized conversation rendering, live progress, tool activity, sticky composer, multi line input, sending, steering, stopping, retry, cancellation, and evidence based delivery states.

Acceptance criteria:

1. [ ] User and assistant messages are visually distinct.

2. [ ] Live assistant output updates in place.

3. [ ] Final provider events replace preview state without duplication.

4. [ ] Every user message shows a delivery state.

5. [ ] Failed messages remain visible.

6. [ ] Retry preserves the original message and creates a new attempt.

7. [ ] Duplicate idempotency keys produce one provider submission.

8. [ ] Active turn steering appears only when supported.

9. [ ] Stop interrupts the turn without deleting the conversation.

10. [ ] The composer remains usable above the mobile keyboard.

Test requirements:

1. [ ] Delivery state machine tests pass.

2. [ ] Duplicate send tests pass.

3. [ ] Stream reconciliation tests pass.

4. [ ] Steering and stop tests pass.

5. [ ] Mobile keyboard browser tests pass.

6. [ ] Network interruption tests pass.

```json
{
  "task_id": "TASK_017",
  "name": "Conversation history and composer",
  "status": "pending",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_012", "TASK_014", "TASK_015"],
  "estimated_complexity": "high"
}
```

### Task 018: Questions, permissions, and approvals

Description: Render normalized provider questions and permission requests as actionable cards. Support single choice, multi select, free text, confirm, deny, dismiss, submitted, expired, and confirmed states.

Acceptance criteria:

1. [ ] Explanatory provider text remains visible outside the choices.

2. [ ] Numbered prose is never mistaken for a choice list.

3. [ ] Single choice works.

4. [ ] Multi select works.

5. [ ] Free text works.

6. [ ] Deny and dismiss work when the provider allows them.

7. [ ] A submitted action disables duplicate clicks.

8. [ ] The next sequential question appears correctly.

9. [ ] Answered questions do not return from historical output.

10. [ ] Dangerous permission bypass remains unavailable.

Test requirements:

1. [ ] Question parser tests pass.

2. [ ] Single and sequential question browser tests pass.

3. [ ] Multi select browser tests pass.

4. [ ] Double click suppression tests pass.

5. [ ] Historical question revival tests pass.

6. [ ] Mobile touch tests pass.

```json
{
  "task_id": "TASK_018",
  "name": "Questions permissions and approvals",
  "status": "pending",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_014", "TASK_015", "TASK_017"],
  "estimated_complexity": "high"
}
```

### Task 019: Attachments and safe file delivery

Description: Add validated file selection, screenshot paste, upload progress, resumable chunking where needed, temporary storage, checksum verification, provider delivery, previews, expiry, and cleanup.

Acceptance criteria:

1. [ ] Allowed types and maximum size are configurable.

2. [ ] Filenames are generated server side.

3. [ ] Original names are display metadata only.

4. [ ] Paths cannot escape the attachment directory.

5. [ ] Upload progress is visible.

6. [ ] Interrupted uploads can resume or restart safely.

7. [ ] Checksums verify the final file.

8. [ ] Provider capability controls attachment availability.

9. [ ] Images and supported media have safe previews.

10. [ ] Expired files are removed by a bounded maintenance task.

Test requirements:

1. [ ] Path traversal tests pass.

2. [ ] Symbolic link escape tests pass where supported.

3. [ ] Oversize and type rejection tests pass.

4. [ ] Interrupted upload tests pass.

5. [ ] Checksum mismatch tests pass.

6. [ ] Mobile attachment browser tests pass.

```json
{
  "task_id": "TASK_019",
  "name": "Attachments and safe file delivery",
  "status": "pending",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_007", "TASK_013", "TASK_015", "TASK_017"],
  "estimated_complexity": "high"
}
```

### Task 020: Session controls and provider settings

Description: Add rename, model, reasoning, permission mode, stop, restart, archive, resume, terminate, and confirmed frozen session recovery controls based on provider capabilities and confirmed state.

Acceptance criteria:

1. [ ] Controls are capability aware.

2. [ ] Model changes show pending state until provider confirmation.

3. [ ] Failed setting changes revert to the last confirmed value.

4. [ ] Reasoning changes follow the same confirmation rule.

5. [ ] Rename persists locally and uses provider rename when supported.

6. [ ] Archive hides a conversation without deleting provider history.

7. [ ] Terminate requires confirmation.

8. [ ] Frozen session recovery requires a second explicit confirmation and preserves the provider conversation.

9. [ ] Unrelated sessions remain untouched.

10. [ ] Every sensitive action creates an audit event.

11. [ ] Context usage and remaining context are shown when the provider reports them.

Test requirements:

1. [ ] Capability visibility tests pass.

2. [ ] Model and reasoning confirmation tests pass.

3. [ ] Setting rollback tests pass.

4. [ ] Archive and resume tests pass.

5. [ ] Destructive confirmation tests pass.

6. [ ] Exact session isolation tests pass.

```json
{
  "task_id": "TASK_020",
  "name": "Session controls and provider settings",
  "status": "pending",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_012", "TASK_015", "TASK_017", "TASK_018"],
  "estimated_complexity": "high"
}
```

### Task 021: Cross provider handoff

Description: Add a safe flow for starting a new provider session with explicitly selected context from an existing conversation. Require owner review of any generated summary.

Acceptance criteria:

1. [ ] The source conversation remains unchanged.

2. [ ] The target provider, profile, model, reasoning, and directory are explicit.

3. [ ] No context transfer is available.

4. [ ] Selected message transfer is available.

5. [ ] Neutral summary transfer is available.

6. [ ] The owner can edit the summary before launch.

7. [ ] Internal reasoning and provider secrets are excluded.

8. [ ] The new session records its source session identifier as lineage metadata.

9. [ ] Launch failure preserves the reviewed handoff.

10. [ ] The target conversation opens after readiness evidence.

Test requirements:

1. [ ] Context selection tests pass.

2. [ ] Secret exclusion tests pass.

3. [ ] Summary review browser tests pass.

4. [ ] Cross provider launch tests pass.

5. [ ] Failed handoff recovery tests pass.

```json
{
  "task_id": "TASK_021",
  "name": "Cross provider handoff",
  "status": "pending",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_009", "TASK_010", "TASK_011", "TASK_016", "TASK_017"],
  "estimated_complexity": "high"
}
```

### Task 022: Health, diagnostics, and audit activity

Description: Add secret safe health checks for the server, database, storage, provider binaries, provider authentication, provider transports, event stream, and tunnel. Add an owner activity view and downloadable redacted diagnostics.

Acceptance criteria:

1. [ ] Health checks are fast and bounded.

2. [ ] Slow provider checks run asynchronously and use cached results.

3. [ ] Health reports never contain secrets.

4. [ ] Provider health is independent.

5. [ ] The activity view records safe lifecycle and security events.

6. [ ] Diagnostics include versions, status, timestamps, and redacted errors.

7. [ ] The browser shows degraded and unavailable states.

8. [ ] Health failures do not freeze the interface.

9. [ ] Logs rotate.

10. [ ] Retention is configurable.

11. [ ] The activity view can show MCP connection health for the selected profile.

12. [ ] The activity view can show whether configured skills, commands, and durable instructions are discoverable by each enabled provider.

13. [ ] A configuration difference preview is available.

14. [ ] Any sync is explicit, additive, reversible, and confirmed before it changes provider configuration.

15. [ ] A sync never rewrites the chosen canonical instruction or skill source.

Test requirements:

1. [ ] Health timeout tests pass.

2. [ ] Secret redaction snapshot tests pass.

3. [ ] Independent provider failure tests pass.

4. [ ] Log rotation tests pass.

5. [ ] Diagnostic export tests pass.

6. [ ] MCP health parsing tests pass.

7. [ ] Configuration difference tests pass.

8. [ ] Additive sync and rollback tests pass.

```json
{
  "task_id": "TASK_022",
  "name": "Health diagnostics and audit activity",
  "status": "pending",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_009", "TASK_010", "TASK_011", "TASK_013", "TASK_014"],
  "estimated_complexity": "medium"
}
```

### Task 023: Secure mobile URL with Cloudflare Tunnel and Access

Description: Document and validate a named Cloudflare Tunnel that routes a protected public hostname to the loopback service. Configure a Cloudflare Access self hosted application before publishing the route.

Acceptance criteria:

1. [ ] The local service remains bound to loopback.

2. [ ] The Access application exists before the tunnel route.

3. [ ] The allow policy matches only the owner’s chosen identity.

4. [ ] The session duration is explicit.

5. [ ] The tunnel routes the selected hostname to the local service.

6. [ ] Access token validation is enabled at the tunnel or origin.

7. [ ] An unauthenticated request is blocked.

8. [ ] An unauthorized identity is blocked.

9. [ ] The authorized owner can use the complete mobile interface.

10. [ ] Tunnel failure leaves local access working.

Test requirements:

1. [ ] Local loopback tests pass.

2. [ ] Public unauthenticated tests pass.

3. [ ] Authorized browser smoke test passes.

4. [ ] Mobile streaming and command tests pass through the tunnel.

5. [ ] Tunnel interruption and recovery tests pass.

```json
{
  "task_id": "TASK_023",
  "name": "Secure mobile URL with Cloudflare Tunnel and Access",
  "status": "pending",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_013", "TASK_014", "TASK_015", "TASK_017", "TASK_018", "TASK_019"],
  "estimated_complexity": "high"
}
```

### Task 024: Service lifecycle, recovery, backup, and update

Description: Install the local service for automatic startup, add graceful reload, watchdog checks, atomic recovery snapshots, database backup, documented restore, safe update, and uninstall behavior.

Acceptance criteria:

1. [ ] The service starts automatically after login or boot.

2. [ ] The service uses an explicit environment.

3. [ ] Reload preserves live provider processes when a durable supervisor or provider capability supports reattachment. Other providers retain exact resume records.

4. [ ] Unexpected service exit triggers bounded restart.

5. [ ] Repeated service failures cross a configured threshold and stop automatic restart.

6. [ ] Recovery snapshots are atomic.

7. [ ] Backups are created safely.

8. [ ] Restore is documented and tested with disposable data.

9. [ ] Updates run validation before replacing the active build.

10. [ ] Failed updates roll back.

11. [ ] Uninstall preserves provider credentials.

12. [ ] Removal of saved command center data requires explicit confirmation.

13. [ ] Idle maintenance uses the time of the last submitted user message rather than generic process activity.

14. [ ] Idle cleanup provides a preview and protects active, waiting, and uncertain sessions.

15. [ ] Automatic cleanup is disabled until the owner explicitly enables a policy.

Test requirements:

1. [ ] Service start and stop tests pass.

2. [ ] Graceful reload tests preserve provider process identifiers.

3. [ ] Restart storm tests pass.

4. [ ] Backup and disposable restore tests pass.

5. [ ] Failed update rollback tests pass.

6. [ ] Idle preview tests protect active and uncertain sessions.

7. [ ] Cleanup tests use last user message time.

```json
{
  "task_id": "TASK_024",
  "name": "Service lifecycle recovery backup and update",
  "status": "pending",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_005", "TASK_007", "TASK_012", "TASK_022"],
  "estimated_complexity": "high"
}
```

### Task 025: Accessibility, performance, and adversarial QA

Description: Complete accessibility, performance, mobile, concurrency, failure, and security testing. Fix every release blocking issue and record measured outcomes.

Acceptance criteria:

1. [ ] Keyboard navigation covers every action.

2. [ ] Focus remains stable during live updates.

3. [ ] Screen reader labels describe status and controls.

4. [ ] Color contrast passes.

5. [ ] Touch targets meet the minimum size.

6. [ ] No critical accessibility violations remain.

7. [ ] A documented high volume interaction stress test loses zero selections.

8. [ ] Session list updates remain smooth with 200 saved conversations.

9. [ ] Slow provider work does not block API health.

10. [ ] Network reconnect preserves conversation state.

11. [ ] Security tests report no critical findings.

12. [ ] All measured outcomes are recorded in `progress.md`.

Test requirements:

1. [ ] Accessibility automation passes.

2. [ ] Desktop and mobile visual regression tests pass.

3. [ ] Concurrency tests pass.

4. [ ] Performance budgets pass.

5. [ ] Adversarial input tests pass.

6. [ ] The complete test suite passes twice.

```json
{
  "task_id": "TASK_025",
  "name": "Accessibility performance and adversarial QA",
  "status": "pending",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_016", "TASK_017", "TASK_018", "TASK_019", "TASK_020", "TASK_021", "TASK_022", "TASK_023", "TASK_024"],
  "estimated_complexity": "high"
}
```

### Task 026: Student documentation and release package

Description: Create clear setup, provider onboarding, remote access, daily use, troubleshooting, backup, update, and uninstall documentation. Complete the source protection review and release checklist.

Acceptance criteria:

1. [ ] A new user can install the project from the documentation.

2. [ ] Provider authentication steps use official supported flows.

3. [ ] Multiple account profile setup is documented without copying credentials.

4. [ ] Cloudflare Tunnel and Access setup is documented.

5. [ ] Common recovery paths are documented.

6. [ ] Backup, restore, update, and uninstall are documented.

7. [ ] The release checklist is complete.

8. [ ] The source protection scan passes.

9. [ ] Fixtures and screenshots contain invented identities and messages.

10. [ ] The repository contains no private reference source.

Test requirements:

1. [ ] Documentation commands are executed in a clean environment.

2. [ ] Link validation passes.

3. [ ] Source protection scan passes.

4. [ ] Secret scanning passes.

5. [ ] Final build and test suite pass.

```json
{
  "task_id": "TASK_026",
  "name": "Student documentation and release package",
  "status": "pending",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_025"],
  "estimated_complexity": "medium"
}
```

### Task 027: Provider registry

Required. Version 2 addition.

Description: Move every provider specific constant into one registry file read by the request router, the session launcher, the session row API, and the model picker. Adding a provider that speaks a supported protocol becomes a registry entry.

Acceptance criteria:

1. [ ] One registry file declares label, base URL, credential variable names in failover order, protocol family, default model, default window, default output budget, the model list with measured windows, the effort levels, and a verification note.

2. [ ] All four readers take their values from the registry.

3. [ ] No provider name, window, model identifier, or effort level is hardcoded anywhere else.

4. [ ] A session row carries a provider key and a provider label taken from the registry.

5. [ ] Every label in the interface reads the provider label rather than the session type.

6. [ ] Adding a provider requires no change to transcripts, recovery, activity, search, or the pickers.

Test requirements:

1. [ ] A synthetic registry entry produces a launchable provider with no code change.

2. [ ] A grep style test asserts that no reader hardcodes a provider name.

3. [ ] Two providers sharing one session type render distinct labels everywhere.

```json
{
  "task_id": "TASK_027",
  "name": "Provider registry",
  "status": "pending",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_006"],
  "estimated_complexity": "medium"
}
```

### Task 028: Hosted model provider adapter

Required when a hosted model provider is selected in `STUDENT_DECISIONS.md`. Version 2 addition.

Description: Implement section 6.5 in full: verification gate, routing and credential failover, per session credential, local consumption counting, streamed tool call normalization, per provider effort levels, session identity, exact transcript resolution, live activity from the session log, stop without respawn, and the shared harness.

Acceptance criteria:

1. [ ] Every registered model passed the catalogue, tool calling, and measured window checks, and the registry records what was measured and when.

2. [ ] Requests route by model and attach the correct credential.

3. [ ] Credential failover is proven by breaking the primary credential.

4. [ ] A per session credential choice is honored, and exhausting one credential leaves other sessions working.

5. [ ] The dashboard reports work done per credential and never reports work remaining.

6. [ ] A bundled streamed tool call is normalized correctly.

7. [ ] Each effort level declares a distinct output budget and the correct reasoning switch is applied at the wire.

8. [ ] The session identifier is minted at launch and is the only identity used by the row, transcript, recovery, effort, model, and credential files.

9. [ ] A transcript resolves by exact match, and a reused terminal name can never concatenate two conversations.

10. [ ] Live activity reports phase, elapsed, step, tool, retry count, and the last failure, read from the session log.

11. [ ] A booting session reports starting rather than busy and is never signalled.

12. [ ] Assistant text is never taken from the terminal, and a message sent while the session is busy can never appear as a reply.

13. [ ] Stop cancels the turn and preserves the session and its context.

14. [ ] Standing context, working memory, deterministic retrieval, the carry brief, tool result pruning, and just in time tools are all present.

Test requirements:

1. [ ] The adapter passes the shared provider contract.

2. [ ] A failover test proves the fallback credential serves the request.

3. [ ] A retrieval test recovers a fact given inside a long message after the session context has been emptied.

4. [ ] A transcript test proves a fresh session returns an empty history where a prefix match would return another conversation's messages.

5. [ ] An echo test proves a user message sent during a busy turn never renders as assistant text.

6. [ ] A stop test proves the session survives and its context is intact.

```json
{
  "task_id": "TASK_028",
  "name": "Hosted model provider adapter",
  "status": "pending",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_027", "TASK_008", "TASK_012"],
  "estimated_complexity": "high"
}
```

### Task 029: Command palette and invocable registry

Required. Version 2 addition.

Description: Scan every invocable skill, agent, and command the installed providers expose into one cached list, and render a filterable palette that reaches all of them from a phone.

Acceptance criteria:

1. [ ] A registry module scans all invocable sources into one list with a two tier cache and revalidation.

2. [ ] The scan tolerates both line ending conventions, so a metadata block is never misread as body text.

3. [ ] Typing the palette trigger opens a filterable list supporting arrow keys, tab, enter, escape, and tap selection.

4. [ ] The palette claims the key handler before awaiting data, so a key pressed during the fetch accepts rather than sends.

5. [ ] A palette left over from a previous render can never write into a different session's composer.

6. [ ] When two entries collide on a name, a losing entry never advertises the winner's invocation string.

7. [ ] The cache is invalidated when the invocable sources change.

Test requirements:

1. [ ] Registry scan tests cover both line ending conventions.

2. [ ] A key during fetch accepts instead of sending.

3. [ ] A collision test proves each entry invokes its own target.

4. [ ] No horizontal overflow at 375 pixels in both palette states.

```json
{
  "task_id": "TASK_029",
  "name": "Command palette and invocable registry",
  "status": "pending",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_015", "TASK_017"],
  "estimated_complexity": "medium"
}
```

### Task 030: Interactive modal parity

Required. Version 2 addition.

Description: Implement section 6.6. Detect that a session is inside an interactive modal, report the keys it accepts, and forward keystrokes safely.

Acceptance criteria:

1. [ ] Modal detection returns title, hint, accepted keys, typeable flag, and body.

2. [ ] Accepted keys are read from the modal's own hint footer, with arrow keys always offered.

3. [ ] The body is bounded at the modal frame so stale scrollback cannot leak in.

4. [ ] The modal card is suppressed while tappable options are available.

5. [ ] The body is part of the repaint signature.

6. [ ] The forwarding endpoint uses a fixed key allowlist, bounds repeats and text length, and sends text in literal mode.

7. [ ] The endpoint returns the repainted session.

8. [ ] An idle session never reports a modal.

Test requirements:

1. [ ] A slider modal advances through the API and the returned body proves the change.

2. [ ] A filterable table modal filters through typed text sent via the API.

3. [ ] Escape closes the modal and the state returns to none.

4. [ ] Plain prose and ordinary numbered lists produce no modal.

5. [ ] Key pad targets are at least 44 pixels and there is no overflow at 375 pixels.

```json
{
  "task_id": "TASK_030",
  "name": "Interactive modal parity",
  "status": "pending",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_018"],
  "estimated_complexity": "medium"
}
```

### Task 031: Conversation content search

Required. Version 2 addition.

Description: Extend session list search to match what was said inside conversations, live and saved, across every provider.

Acceptance criteria:

1. [ ] Search matches message content as well as titles.

2. [ ] Search runs on the server and returns bounded results.

3. [ ] Results identify the provider, the session, and the matching excerpt.

4. [ ] Search covers saved and recoverable conversations.

5. [ ] A quarantined or privacy excluded transcript is never searched or returned.

Test requirements:

1. [ ] A phrase present only in a message body returns its session.

2. [ ] An excluded transcript never appears in results.

3. [ ] Result payloads stay bounded on a large history.

```json
{
  "task_id": "TASK_031",
  "name": "Conversation content search",
  "status": "pending",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_012", "TASK_015"],
  "estimated_complexity": "low"
}
```

### Task 032: Launch seeds

Required. Version 2 addition.

Description: Let one tap start a session already primed for a specific kind of work, without turning the launch endpoint into a way to type arbitrary text into a terminal.

Acceptance criteria:

1. [ ] Seed text is stored server side and addressed by key.

2. [ ] The launch endpoint accepts a key only and drops anything unrecognised.

3. [ ] A seed is sent only after the composer is drawn, using the same readiness signal the ordinary send path uses.

4. [ ] A pending handoff is awaited first, so two messages cannot concatenate into one turn.

5. [ ] The launch result reports whether the seed was delivered.

6. [ ] A seeded launch blocked by an account login resumes as the same seeded type after login, rather than downgrading to a plain session.

Test requirements:

1. [ ] An unknown seed key is dropped and the session still launches.

2. [ ] A seed sent into a booting session is retried until the composer exists, and arrives exactly once.

3. [ ] The post login retry preserves the requested type.

```json
{
  "task_id": "TASK_032",
  "name": "Launch seeds",
  "status": "pending",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_016"],
  "estimated_complexity": "low"
}
```

### Task 033: Orchestration session type

Optional. Version 2 addition. Build only when selected in `STUDENT_DECISIONS.md` and only after the release checklist passes.

Description: Implement section 6.9. A session that plans, dispatches to implementer sessions, reviews, corrects, and verifies, all visible in one place.

Acceptance criteria:

1. [ ] A provider neutral task contract carries objective, files, interfaces, constraints, verification, response format, and a mandatory structured report block.

2. [ ] Plan, review, and final verdict are schema validated.

3. [ ] The engine runs explicit phases and reports the current one.

4. [ ] The workspace snapshot uses a temporary index, includes untracked files, and never touches the owner's working state.

5. [ ] Runs persist and survive a dashboard restart.

6. [ ] A universal implementer adapter drives any provider the dashboard can launch.

7. [ ] The reviewer re runs verification itself rather than trusting an implementer claim.

8. [ ] A long prompt is sent over standard input, and no variadic flag precedes a positional argument.

9. [ ] Repeated triggers chain on the previous execution.

10. [ ] An abort issued before an adapter attaches its listener still stops the run.

Test requirements:

1. [ ] Engine phase tests against a fake host.

2. [ ] An abort before attach terminates the run.

3. [ ] A rapid double trigger executes once per phase.

4. [ ] A live run completes plan, dispatch, review, and verification end to end.

```json
{
  "task_id": "TASK_033",
  "name": "Orchestration session type",
  "status": "not_applicable",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_016", "TASK_017", "TASK_020"],
  "estimated_complexity": "high"
}
```

### Task 034: Two provider review loop

Optional. Version 2 addition. Build only when selected in `STUDENT_DECISIONS.md`.

Description: Implement section 6.10. One provider plans and builds, a different provider reviews, a fresh session inspects.

Acceptance criteria:

1. [ ] The reviewer differs from the host and the inspector differs from the builder, enforced by the runner.

2. [ ] Those two roles render as locked chips carrying the reason, and only builder, models, and limits are selectable.

3. [ ] The loop launches as an ordinary session of an existing provider seeded through a seed key.

4. [ ] Stage state is read from the artifacts the runner writes, and a phase with no runner call behind it asserts only what it can prove.

5. [ ] Applying a configuration stores it and sends a composed sentence into the session, reporting whether that delivery succeeded.

6. [ ] Model lists are read from the provider at runtime, so a hardcoded name can never be wrong.

7. [ ] The status card repaints from the same place the header state is kept current, only on a signature change, and never underneath an open dropdown.

8. [ ] Configuration rows stack on mobile, with tap targets of at least 44 pixels and no truncated controls at 375 pixels.

9. [ ] A session of another type returns not found from the loop configuration endpoint.

Test requirements:

1. [ ] A same provider reviewer or inspector is rejected.

2. [ ] An invalid configuration value is dropped without disturbing stored values.

3. [ ] Stage state derives from artifacts and never from transcript text.

4. [ ] Screenshots at 375 pixels show no truncation and no overflow.

```json
{
  "task_id": "TASK_034",
  "name": "Two provider review loop",
  "status": "not_applicable",
  "tests_status": "not_written",
  "unit_tests_passing": false,
  "integration_tests_passing": false,
  "dependencies": ["TASK_032", "TASK_020"],
  "estimated_complexity": "high"
}
```

## 9. API surface

The exact route names may change, but the product must provide these capabilities through authenticated, validated endpoints.

### 9.1 Read routes

1. Service bootstrap and public configuration.

2. Current authenticated owner session.

3. Provider profiles with public fields.

4. Provider capabilities and health.

5. Live sessions.

6. Recoverable conversations.

7. One normalized session.

8. Normalized conversation history.

9. Pending actions.

10. Model and reasoning options.

11. Activity and audit events.

12. System health.

13. Redacted diagnostics.

14. Provider configuration inventory.

15. MCP connection status.

16. Skills and instruction compatibility status.

17. Invocable registry: every skill, agent, and command, cached and revalidated.

18. Conversation content search.

19. Model catalogue for a hosted provider, filtered and paginated on the server.

20. Run state for an orchestration session or a review loop, read from run artifacts.

### 9.2 Command routes

1. Login, logout, and logout all devices.

2. Start session.

3. Resume session.

4. Send message.

5. Steer active turn.

6. Interrupt turn.

7. Answer pending action.

8. Change model.

9. Change reasoning.

10. Rename.

11. Archive.

12. Terminate.

13. Confirmed frozen session recovery.

14. Start handoff.

15. Begin, append, finish, and abort attachment upload.

16. Forward a key or literal text to a session blocked on an interactive modal, through a fixed allowlist with bounded repeats and bounded text length.

17. Change the model or the credential for a hosted provider session.

18. Apply a configuration to an orchestration session or a review loop, which both stores the value and tells the session about it.

19. Launch with a seed key. This route accepts a key naming stored text. It must never accept message text from the browser.

16. Create backup.

17. Request safe maintenance preview.

18. Apply approved maintenance.

19. Preview provider configuration differences.

20. Apply an explicitly approved additive provider configuration sync.

Every command response must include a request identifier, outcome, typed error when applicable, and enough safe state for immediate UI feedback.

## 10. Performance requirements

1. Local service health response at p95 under 100 milliseconds when provider checks are cached.

2. Session list bootstrap at p95 under 500 milliseconds with 200 saved conversations.

3. Browser event to visible state at p95 under 150 milliseconds on local network.

4. Message submission endpoint returns accepted or failed within 2 seconds unless the provider protocol requires a longer bounded acknowledgement.

5. Provider startup does not block unrelated API requests.

6. The browser remains responsive during a 60 second streaming turn.

7. Incremental session updates do not replace unrelated DOM nodes.

8. Memory remains bounded during an eight hour browser session.

9. Event replay storage has an explicit maximum.

10. Logs and temporary attachments have retention limits.

## 11. Error handling standards

1. Never silently swallow an error.

2. Show a plain language owner message.

3. Record a secret safe technical error.

4. Include a stable error category.

5. Include a request or event identifier.

6. Offer a recovery action when one is safe.

7. Preserve the conversation record.

8. Keep failed messages visible.

9. Keep failed setting changes at the last confirmed value.

10. Treat unknown provider state as needs attention.

11. Never convert a timeout into success.

12. Never expose a raw stack trace to the browser in production.

## 12. Instructions for the AI coding agent

### 12.1 Development methodology

You must follow specification driven and test driven development.

1. Read the complete specification before writing code.

2. Inspect the repository and official provider documentation.

3. Write failing tests before implementation.

4. Implement only enough behavior to pass the tests.

5. Refactor while keeping tests green.

6. Update task state and project memory.

7. Commit one coherent task at a time when version control is available.

### 12.2 Documentation protocol

Before using a framework, SDK, CLI, API, or cloud service:

1. Read current official documentation.

2. Verify the installed or selected version.

3. Generate provider schemas from the installed tool when supported.

4. Search official issue trackers for breaking changes when behavior is unclear.

5. Record links and decisions in `research.md`.

Do not trust remembered command flags or protocol fields.

### 12.3 Test execution protocol

After each task:

1. Run its unit tests.

2. Run its integration tests.

3. Run the previous two completed task groups.

4. Run every provider contract touched by the change.

5. Run relevant browser tests.

6. Run type checking.

7. Run the production build.

8. Mark the task complete only when all required checks pass.

### 12.4 Document update protocol

When a task is complete:

1. Mark its acceptance criteria.

2. Mark its test requirements.

3. Set `status` to `completed`.

4. Set `tests_status` to `passing`.

5. Set both passing booleans to true.

6. Add a completion timestamp after the JSON block.

7. Update `plan.md`.

8. Append evidence and failures to `progress.md`.

### 12.5 Failure protocol

When an attempt fails:

1. Record what was attempted.

2. Record the observed failure.

3. Record the constraint it revealed.

4. Keep the repository in a valid state.

5. Continue with safe independent work.

6. Ask the owner only when the missing decision changes security, accounts, deletion, public exposure, spend, or project scope.

### 12.6 Code quality standards

1. Use strict types.

2. Validate external data at runtime.

3. Keep provider code isolated.

4. Keep functions small and focused.

5. Prefer explicit state machines.

6. Use dependency injection at process, clock, random, storage, and verifier boundaries.

7. Avoid global mutable state.

8. Use structured logs.

9. Redact secrets at the logger boundary.

10. Use prepared database statements.

11. Use atomic file writes for recovery data.

12. Document complex compatibility logic with its provider version and test fixture.

### 12.7 Non negotiable rules

1. Keep provider credentials local.

2. Keep the server on loopback.

3. Protect remote access with Cloudflare Access.

4. Use evidence based success.

5. Preserve exact provider conversation identities.

6. Keep destructive actions behind confirmation.

7. Keep permission bypass unavailable from the browser.

8. Keep provider failures isolated.

9. Keep failed messages visible.

10. Keep the implementation source separated.

## 13. Project state

### Completed tasks

TASK_001 and TASK_002 (2026-09-24). TASK_033 and TASK_034 are recorded as not_applicable (`STUDENT_DECISIONS.md` sections 12 and 13).

### Current task

TASK_003

### Blockers and notes

TASK_013 needs owner approval of the written device pairing design first. TASK_009, TASK_011 and TASK_028 wait for the second provider decision at the Phase 6 gate. TASK_030 and TASK_032 wait for the tmux compatibility decision at the Phase 7 gate. See `plan.md`.

### Test results log

2026-09-24: local only, `npm run test:repo` 24 of 24 passing, source protection scan passing, `npm run scan:secrets` (gitleaks) clean. The first CI run on the pull request failed (gitleaks action missing the `pull-requests: read` scope), so CI evidence was not yet available.

2026-09-24 (after review): workflow fixed test first, `npm run test:repo` 28 of 28 locally. The CI result on the pull request is recorded in `progress.md`.

## 14. Dependency graph

```text
TASK_001
  TASK_002
    TASK_003
    TASK_004
      TASK_005
        TASK_006
          TASK_007
            TASK_008
              TASK_009
              TASK_010
              TASK_011
                TASK_012
                  TASK_013
                    TASK_014
                      TASK_015
                        TASK_016
                          TASK_032
                            TASK_034
                        TASK_017
                          TASK_018
                            TASK_030
                          TASK_019
                          TASK_020
                            TASK_033
                          TASK_021
                          TASK_029
                          TASK_031
                    TASK_022
                    TASK_023
                    TASK_024
                      TASK_025
                        TASK_026
```

Task 027 attaches under TASK_006 and is a prerequisite of TASK_028, which also depends on TASK_008 and TASK_012.

```text
TASK_006
  TASK_027
    TASK_028
```

Tasks 029 through 032 are required version 2 features and belong in the Level Three release. Tasks 033 and 034 are optional and belong after the release checklist passes.

### 14.1 Critical path

The critical path is:

```text
001 to 002 to 004 to 005 to 006 to 007 to 008
to every selected provider adapter
to 012 to 013 to 014 to 015 to 017
to 024 to 025 to 026
```

When a hosted model provider is selected, insert 027 before its adapter task and 028 in place of the adapter task itself.

Insert Task 023 after Task 017 when remote access is selected.

### 14.2 Recommended staged releases

Release A:

1. Tasks 001 through 008.

2. One provider adapter.

3. Tasks 012 through 017.

4. Local desktop only.

Release B:

1. A second provider adapter.

2. Tasks 018 through 020.

3. Secure mobile URL.

Release C:

1. Third provider adapter.

2. Cross provider handoff.

3. Full recovery and operations.

4. Final QA and documentation.

## 15. Edge case checklist

The implementation is incomplete until these cases are handled:

1. The provider binary moves after an update.

2. The provider changes a structured event schema.

3. The selected account is logged out.

4. Authentication expires during a turn.

5. The provider launches and exits before readiness.

6. The provider is ready but the dashboard misses the first event.

7. The browser sends the same message twice.

8. The browser disconnects after the provider accepts the message.

9. The provider records the message but the acknowledgement is lost.

10. The user steers while a turn is active.

11. The user sends while a question is waiting.

12. Two question answers are clicked rapidly.

13. A resolved question remains in historical provider events.

14. A provider emits malformed structured output.

15. A provider returns an unknown model identifier.

16. A model change is rejected.

17. A provider crashes during an attachment upload.

18. A file name contains traversal characters.

19. A file is larger than the configured limit.

20. A temporary attachment expires while a saved conversation remains.

21. The database is locked briefly.

22. The database is corrupt.

23. The recovery snapshot is partially written.

24. The dashboard restarts while providers are working.

25. The computer restarts during a provider turn.

26. A saved provider conversation cannot be found.

27. The public tunnel is down.

28. Cloudflare Access denies the user.

29. The Access session expires while the browser is open.

30. The phone changes network during a stream.

31. The mobile keyboard changes viewport height.

32. The session list updates while the user taps a card.

33. Privacy mode is active during refresh.

34. A diagnostics export contains secret looking content.

35. An update fails after downloading but before activation.

36. A service restart loop begins.

37. An idle cleanup preview contains an active session.

38. The user attempts to terminate the wrong session.

39. A provider does not support a shared feature.

40. A future provider adapter is installed.

41. A terminal or pane name is reused by a later session.

42. A transcript is resolved by prefix and matches two conversations.

43. The owner types a message while the session is busy, and the terminal echoes it with no prompt marker.

44. A pasted message wraps across many terminal lines and only the first carries a prompt marker.

45. A session is still booting when a stop is pressed.

46. A hosted model stream ends with no completion reason, repeatedly, at the same output length.

47. An output token ceiling is registered as the context window.

48. A reasoning ladder from one provider is applied to another with a much larger output range.

49. A credential is exhausted mid job while other sessions are using a different credential.

50. A provider publishes no quota header at all, so remaining usage cannot be known.

51. A model picker opens before the provider list has arrived.

52. Two providers share one session type and one of them is labelled with the other's name.

53. An interactive modal stops advertising its arrow keys once it has been filtered.

54. Stale scrollback above a modal frame is read as part of the modal body.

55. A seed is sent into a session whose composer has not been drawn.

56. A seeded launch is interrupted by an account login.

57. A review loop stage reports done while its artifact records a failure.

58. A status card is painted once and never repainted as the state moves on.

59. A provider moves its conversation storage in a version upgrade.

60. A metadata block uses the other line ending convention and is read as body text.

## 16. Official documentation references

These links were verified during PRD preparation. Recheck them before implementation.

1. Node.js release schedule and current LTS:

   `https://nodejs.org/en/about/previous-releases`

2. Fastify TypeScript reference:

   `https://fastify.dev/docs/latest/Reference/TypeScript/`

3. Fastify testing guide:

   `https://fastify.dev/docs/latest/Guides/Testing/`

4. React external store guidance:

   `https://react.dev/reference/react/useSyncExternalStore`

5. React guidance for avoiding unnecessary effects:

   `https://react.dev/learn/you-might-not-need-an-effect`

6. Vite guide:

   `https://vite.dev/guide/`

7. Codex app server:

   `https://developers.openai.com/codex/app-server`

8. Codex CLI reference:

   `https://developers.openai.com/codex/cli/reference`

9. Codex authentication:

   `https://developers.openai.com/codex/auth`

10. Claude Code CLI reference:

   `https://code.claude.com/docs/en/cli-usage`

11. Claude Code authentication commands:

   `https://code.claude.com/docs/en/cli-usage`

12. Hermes API Server:

   `https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server/`

13. Hermes sessions:

   `https://hermes-agent.nousresearch.com/docs/user-guide/sessions/`

14. Hermes CLI commands:

   `https://hermes-agent.nousresearch.com/docs/reference/cli-commands`

15. OpenAI compatible chat completions, the protocol every hosted model provider in this specification speaks:

    `https://platform.openai.com/docs/api-reference/chat`

16. NanoGPT, the hosted model provider used as the reference implementation of section 6.5:

    `https://nano-gpt.com`

17. NanoGPT API documentation:

    `https://docs.nano-gpt.com`

18. Claudex Loop, the open source project the two provider review loop in section 6.10 is modelled on, MIT licensed:

    `https://github.com/chaseai-yt/claudex-loop`

19. Cloudflare Tunnel:

   `https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/`

20. Cloudflare Access for a self hosted public application:

   `https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/`

## 17. Final quality gate

Before declaring the project complete:

1. Complete every applicable checkbox in this PRD. Record unselected provider and remote access tasks as `not_applicable` with the corresponding decision from `STUDENT_DECISIONS.md`.

2. Complete `RELEASE_CHECKLIST.md`.

3. Run the full validation twice from a clean start.

4. When remote access is selected, test desktop and mobile through the authenticated public hostname. Otherwise test both viewports on loopback.

5. Restart the dashboard while an agent remains live.

6. View instruction, skill, command, and MCP health for each enabled provider profile.

7. Restart the computer and resume a saved conversation.

8. Review logs and diagnostics for secrets.

9. Review the repository for copied private source.

10. Save final screenshots using invented identities and content.

11. Record the release commit and evidence in `progress.md`.
