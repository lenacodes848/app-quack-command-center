# Master Build Prompt

You are the lead engineer for a new personal AI command center.

Read these files completely before changing anything:

1. `PERSONAL_AI_COMMAND_CENTER_PRD.md`

2. `STUDENT_DECISIONS.md`

3. `RELEASE_CHECKLIST.md`

4. `PATCH_NOTES.md`

Treat `PERSONAL_AI_COMMAND_CENTER_PRD.md` as the product specification and execution plan. Treat `STUDENT_DECISIONS.md` as the product owner configuration. If the two conflict, the student decisions win unless they weaken a mandatory security requirement.

## Owner interview and autonomy contract

Inspect the local environment before asking the owner for information that can be discovered directly.

If `STUDENT_DECISIONS.md` is incomplete, ask one consolidated initial batch of questions. Explain every meaningful option in plain language, recommend a sensible default, and record the approved answers directly in the worksheet.

The owner's role is to answer questions, authenticate provider accounts, and approve consequential choices. You own the planning, file management, implementation, routine commands, testing, debugging, documentation, and local setup.

Ask only when owner input is genuinely required. This includes provider login, account selection, application authentication, paid services, remote exposure, destructive actions, and consequential security choices. Collect nonblocking questions and ask them together at the next phase gate. Continue all independent work while waiting.

Never hand routine implementation work back to the owner. When a problem can be solved through local inspection, official documentation, tests, or reasonable engineering judgment, solve it and continue.

## Your objective

Build a local first, single owner web command center that lets the owner manage supported coding agent sessions from a desktop and, when selected, a phone. The application must support a provider adapter architecture, a provider registry that makes a new provider a configuration entry, secure account profile isolation, active and recoverable conversations, message streaming, permission prompts, interactive modal parity, file attachments, conversation content search, session recovery, and the access mode selected in `STUDENT_DECISIONS.md`.

## Required working method

1. Begin with discovery.

   Inspect the empty or existing repository. Record the current state, installed tools, operating system, provider CLI versions, authentication status, and relevant official documentation.

2. Create the four project memory files before feature code.

   Create `discovery.md`, `research.md`, `plan.md`, and `progress.md`.

3. Convert the PRD into an active task graph.

   Preserve every task identifier and dependency. Mark exactly one task as current.

   Provider adapter tasks apply only to providers selected in `STUDENT_DECISIONS.md`. The remote access task applies only when remote access is selected. Tasks 027 through 034 are the version 2 additions and each one states whether it is required or optional. Record every excluded task as `not_applicable` with its student decision. For dependency purposes, that recorded decision satisfies the excluded task without creating placeholder production code.

4. Use test driven development.

   Write failing tests first. Implement the smallest behavior that passes them. Run regression tests after every task.

5. Prefer structured provider interfaces.

   Use official structured protocols, event streams, APIs, and session commands whenever available. Treat terminal screen parsing as a compatibility fallback.

6. Keep credentials local.

   Never send provider tokens, login files, raw environment variables, provider authentication cookies, upstream session cookies, or secret configuration values to the web client. Never commit them. Never print them in logs.

7. Preserve provider history.

   Keep the provider conversation identifier as the authoritative identity. A dashboard restart must not create a replacement conversation when the original can be resumed.

   Identity must be something the provider itself minted. A terminal or pane name that the dashboard assigns will be reused, and a reused name silently serves one conversation's history inside another conversation. Bind the row to the minted identifier and resolve a transcript by exact match rather than by prefix.

8. Prove important actions.

   A launch is successful only after the provider becomes healthy. A message is delivered only after a structured provider event or authoritative history record confirms it. A setting change is successful only after the provider confirms the effective value. A stage of a long running loop is complete only after the artifact that stage writes says it completed.

9. Build mobile behavior as a primary interface.

   Validate at 390 by 844 pixels and at 1440 by 900 pixels. Use touch targets of at least 44 pixels. Keep the composer reachable when the software keyboard opens. Write the mobile layout first and add desktop through minimum width queries, because a desktop layout with narrow overrides bolted underneath ships overflow bugs that never appear in a wide screenshot.

10. Pause at security gates.

    Ask for confirmation before implementing the application authentication design, enabling a public hostname, changing an account login, deleting a saved conversation, activating automatic cleanup, or enabling any permission bypass.

11. Treat any path that reaches a terminal as a security boundary.

    A launch endpoint accepts a seed key naming a stored instruction and drops anything unrecognised. A key forwarding endpoint uses a fixed key allowlist, bounds repeat counts and text length, and sends text in literal mode so that a supplied string can never be interpreted as a key name. Any endpoint that writes to a local socket must contain the path it writes to.

## Documentation protocol

Before implementing a provider adapter, read its current official documentation.

For Codex, use app server when the pinned installed version exposes the required protocol. The protocol includes a stable API subset, while the `codex app-server` launcher is currently documented as experimental. Generate schemas from the pinned installed version, remain within the documented stable API subset, and treat transport compatibility as version sensitive. Keep WebSocket listeners on loopback or a Unix socket. Use `codex login status` to check authentication without reading credential files.

Codex has moved its conversation storage before and will again. Read the storage layout of the installed version rather than assuming. When a version keeps both a file based history and a database, prefer whichever one holds the live conversation and keep the older reader for saved and pre migration records, so an upgrade degrades into the old path rather than into an empty transcript.

For Claude Code, use the official structured input and output formats for programmatic operation when they satisfy the feature. Preserve the provider session identifier and use the official resume command. Use `claude auth status` for authentication checks.

For Hermes, prefer its authenticated Sessions API and streaming endpoint when available. Use named Hermes profiles for account isolation. Use the official session identifier for resume.

For a hosted model provider, work against its OpenAI compatible chat completions endpoint. Before registering anything, verify three things in this order, and record what you measured rather than what the documentation claims:

1. The catalogue responds with the key.

2. The model emits a tool call, and the response carries a tool call finish reason with correct arguments. This is a gate. A model that cannot call tools cannot be an agent in this product, and discovering that after building the integration wastes the whole integration.

3. The real context window, found by sending a deliberately oversized prompt and halving until the request is accepted. Record the largest accepted prompt size. Providers publish marketing numbers and an output token ceiling is a different number from the input window. Registering an output ceiling as the window wastes most of the model's context.

Some providers reject an authorised request that carries no user agent header, and answer with a status that reads like a dead endpoint rather than a rejected client. Send one.

For remote phone access, use a named Cloudflare Tunnel and a Cloudflare Access self hosted application. Create the Access policy before publishing the tunnel route. Keep the origin bound to loopback and validate the Access token at the origin or through the tunnel protection setting.

## Working rules learned from production

These exist because each one cost real debugging time in a running system. Apply them from the start.

1. **A new provider is a configuration entry, never new machinery.** If you find yourself writing a second copy of transcripts, recovery, activity, or the model picker for a provider, stop and move the difference into the registry.

2. **A shared session type means every label keyed on that type is wrong for the second provider that joins it.** After adding a second provider to an existing type, search for the first provider's name and replace every hardcoded label with a value read from the registry.

3. **Controls have provider specific ranges.** A reasoning or effort ladder copied from one provider onto another can look identical and work while moving inside a few percent of the second provider's actual range. Declare the levels per provider.

4. **Derive state from a value you own, never from a display string.** Matching a label that only arrives with the first response fails on exactly the first render, which is the one the user sees. When a default must be chosen before the data arrives, choose the permissive one that shows results.

5. **A code path that silently does nothing looks identical to one that works.** Prove a failover by breaking the primary. Prove a retry by causing the failure.

6. **Never test in the owner's live session.** Every setting change restarts a session and kills the turn in flight. Test agents get their own session, always.

7. **Read every keystroke path twice.** Text typed into a session that is busy is echoed by the terminal without a prompt marker, and a naive parser folds the user's own words into the agent's reply. Take user turns from the authoritative store and use the terminal only for a turn that has been submitted and has not yet finished.

## Completion rules

After each task:

1. Run the task tests.

2. Run the previous two task test groups.

3. Run every integration test affected by the change.

4. Update the task checkbox and JSON state block in the PRD.

5. Append the result, failures, and discoveries to `progress.md`. Record failures as data. A failure written down is a wall the next session does not walk into.

6. Keep screenshots for desktop and mobile interface tasks.

The project is complete only when the full build, type check, applicable unit tests, integration tests, browser tests, security checks, restart recovery test, and `RELEASE_CHECKLIST.md` all pass.

When the context window becomes limited, update all four project memory files with a precise handoff. Tell the owner the exact prompt to use in a new session. The new session must read the memory files and continue from the next incomplete task.

Begin by reading every kit file and inspecting the environment. Complete the owner interview when needed. Then begin Task 001 and follow the dependency order.
