# Patch Notes

## Version 2, September 2026

Version 1 of this kit shipped in July 2026. Everything below came out of running the product every day since then, on a phone as much as on a desktop. Each item exists because something broke, or because something was missing badly enough to be worth building.

Two things to know before you read the list.

**If you are starting from nothing**, ignore the upgrade notes. Paste `PASTE_THIS_INTO_CLAUDE_OR_CODEX.md` and build the whole thing. The version 2 features are already woven into the specification and the task list.

**If you already built from version 1**, paste `PASTE_THIS_TO_UPDATE_AN_EXISTING_BUILD.md` into your existing repository. Your coding agent will audit what you have, tell you which of tasks 027 through 034 you still need, and do them one at a time. Nothing below requires a rebuild. Every item is additive.

---

## What is new

### 1. A provider registry (Task 027, required)

One configuration file declares every provider: its endpoint, its credential names, its models with the context window you actually measured, and its reasoning levels. Four things read it. Adding a provider is now an entry in that file.

**Why it exists.** Adding a second hosted model meant editing four separate places, and the places drifted apart. A session reported one context window on its row and a different one in its own banner, because two readers held two hardcoded numbers. Every drift of that kind shows up as a session that claims one thing and runs another.

**The rule it encodes.** A new provider should never mean new machinery. If you are writing a second copy of transcripts, recovery, activity, or the model picker, stop, and move the difference into the registry.

**Upgrading.** Do this one first. Everything else in version 2 is easier on top of it.

### 2. Hosted model providers, with NanoGPT as the reference (Task 028)

The kit already covered subscription coding agents. Version 2 adds the other kind: a pay as you go model endpoint speaking the OpenAI compatible protocol, which you can put into the dashboard beside Claude Code, Codex and Hermes.

The reference implementation is **NanoGPT** (`https://nano-gpt.com`), because it needs no subscription and bills per token, so a small balance is enough to finish the build. Any OpenAI compatible endpoint works through the same adapter and the same registry entry.

Specification section 6.5 covers the whole thing: the verification gate, credential failover, per session credentials, local consumption counting, streamed tool call normalization, per provider effort levels, session identity, live activity, stop without respawn, and the harness a raw model needs around it.

**Three things in there that cost real debugging time.**

**Verify before you register, and the tool calling check is a gate.** A model that cannot emit a tool call cannot be an agent here, however good its writing is. One model was integrated completely and then abandoned for exactly this. Check it in five minutes with one request, before you build anything.

**Measure the context window, do not read it.** The maximum output tokens is a different number from the input window, and registering the first as the second throws away most of the model's context. Send an oversized prompt, halve until it is accepted, and record the largest accepted size.

**A raw model has no harness.** Everything a coding agent gives you for free has to be built around it: standing context, working memory that survives a restart, retrieval, and a handoff brief written before compaction can discard anything. Build that once and every hosted provider inherits it.

And the finding underneath all of it: **retrieval cannot be a tool the model chooses to call.** Given a retrieval tool, an explicit instruction to use it, and a question it could not answer, a small model answered without calling it. Search the session's own log on every turn and inject what matches. For a model this size, anything that depends on the model choosing to do the right thing will not happen.

### 3. Command palette (Task 029, required)

Type the palette character into an empty composer and every skill, agent and command your providers expose is right there, filterable, reachable from a phone.

**Why it exists.** Everything a provider can do was one command away in a terminal and unreachable from a phone.

**The bug worth knowing about before you write it.** The palette must claim the keyboard handler before it awaits the list. Otherwise enter pressed during the fetch **sends** the half typed command instead of accepting the highlighted one.

### 4. Interactive modal parity (Task 030, required)

A provider command that opens a slider, a filterable table, or a tabbed settings panel now shows a card with the live panel and a key pad, and you can drive it to the end from a phone.

**Why it exists.** Those commands showed nothing. The session looked idle while it sat blocked on a modal, and there was no way to answer it from a phone.

**The design decision.** Parsing each command by hand loses to the next interface change upstream. Detect that the session is in a modal at all, read which keys the modal itself advertises, and forward keystrokes. That way parity holds for commands that do not exist yet.

### 5. Conversation content search (Task 031, required)

The search field now matches what was said inside conversations, not only session names, across live and saved conversations and every provider.

**Why it exists.** After a few hundred conversations, remembering which one held a thing is the actual bottleneck.

### 6. Launch seeds (Task 032, required)

One tap starts a session already primed for a specific kind of work.

**The security shape matters more than the feature.** The launch endpoint accepts a **key** naming text stored on the server, and drops anything it does not recognise. Accepting message text from the browser at that endpoint would turn a launch into a way to type arbitrary input into a terminal.

**The bug.** Keys sent into a session that is still booting are echoed by the terminal and then discarded, so the instruction silently vanishes. Wait for a drawn composer, using the same readiness signal the ordinary send path already uses to confirm a delivery.

### 7. Orchestration session type (Task 033, optional)

A session that plans a piece of work, dispatches units to implementer sessions, reviews what comes back, runs correction rounds, and verifies the result, with the whole loop visible in one place.

The design decision that makes it worth building: the universal implementer adapter drives any provider the dashboard can already launch, through the same machinery the browser uses. Every provider you have, and every provider you add later, becomes an implementer with no new plumbing.

Build it after your release checklist passes.

### 8. Claudex Loop, the two provider review loop (Task 034, optional)

One provider plans and builds. A **different** provider reviews. A third fresh session inspects the result.

The loop pattern comes from the open source project **Claudex Loop** (`https://github.com/chaseai-yt/claudex-loop`, MIT). Read it before you build, and scan anything you install into an agent instruction folder, because a file an agent reads is a file an agent obeys.

**The rule is structural rather than a preference.** The reviewer must differ from the host and the inspector must differ from the builder, enforced by the runner. Because of that, those two roles show as locked chips carrying the reason. A dropdown that can hold one value is a lie, and one that can hold two produces an error. Only the builder, the models, and the round limits are real choices.

Everything else about it follows one idea: **stage state is read from the artifacts the runner writes, never scraped from the transcript.** A stage that says done has to be a call that completed. A phase with no runner call behind it reports only what it can prove.

Two practical notes. Read the model list from the provider at runtime, because model names taken from a video or from documentation will be wrong, and a subscription account exposes a different set of names from an API account. And applying a configuration must both store the value and say it out loud in the session, because the agent is what runs the loop, and a stored setting the agent was never told about is a dashboard lying to itself.

Launch it as an ordinary session of an existing provider, seeded with the loop instruction. It then inherits the row, the transcript, recovery, isolation, the account picker and the model controls that already exist.

---

## Smaller changes worth having

1. **Stop cancels a turn and keeps the session.** Ask the router to abort, send an interrupt to the session process, and leave the session and its context alive. Never send an interrupt to the whole foreground process group, which takes the session's tool servers down with it.

2. **Starting is a different state from busy.** A session still booting is not working, and signalling it kills it.

3. **An activity card instead of a spinner.** Phase, elapsed, current step, tool in use, and when a turn is retrying, the attempt count and the last failure. A turn once ran for twelve minutes behind a blank screen, producing the same answer five times and losing the stream at the same point each time.

4. **Multiple image select on mobile**, uploaded in one pass, with per file progress and per file retry.

5. **Provider question fidelity.** Options carrying a preview render beside a bordered panel, and a naive one line read produces truncated labels with border characters in them and drops every description. Section 6.7 has the layout rules.

6. **Codex storage moved.** A newer version keeps the live conversation in a database while older records stay in files. Read the layout of the installed version, prefer whichever holds the live conversation, and keep the old reader for saved records, so an upgrade degrades into the old path rather than into an empty transcript.

7. **Twenty new edge cases** in section 15 and a tightened source protection section, including an explicit check that no personal name, email, home path, private hostname, or account identifier appears anywhere in your repository.

---

## The four rules that produced most of these fixes

1. **Identity must be something the provider minted.** A terminal or pane name that the dashboard assigns gets reused, and a reused name serves one conversation's history inside another. Resolve transcripts by exact match, never by prefix.

2. **Derive state from a value you own, never from a display string.** Matching a label that only arrives with the first response fails on exactly the first render, which is the one the user sees. When a default has to be chosen before the data arrives, choose the one that shows results.

3. **A code path that silently does nothing looks identical to one that works.** A credential swap was written, reviewed and shipped without ever being true, because the process it lived in held no credentials to swap. Prove a failover by breaking the primary.

4. **Never test in your own live session.** Every setting change restarts a session and kills the turn in flight. Test agents get their own session, always.
