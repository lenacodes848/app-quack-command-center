# Student Decisions

The coding agent will inspect the local environment, ask the owner one initial batch of questions, and complete this file from the approved answers before implementation begins.

## 1. Product identity

Product name:

Short subtitle:

Primary color:

Icon or emoji:

## 2. Host computer

Operating system:

Supported version:

Primary shell:

Default projects directory:

## 3. Initial providers

Mark the providers you want in the first release. At least one of the first two is required, because a subscription coding agent is what the dashboard exists to drive.

1. [ ] Claude Code

2. [ ] Codex

3. [ ] Hermes

4. [ ] A hosted model provider through an OpenAI compatible API

5. [ ] Another provider

If a hosted model provider is selected, name it and give its documentation URL. The reference implementation of this kit uses **NanoGPT** (`https://nano-gpt.com`, OpenAI compatible at `https://nano-gpt.com/api/v1`), which is pay as you go with no subscription, which is why it suits a build you are only starting. Any OpenAI compatible endpoint works through the same adapter.

Hosted provider name:

Base URL:

If another provider is selected, write its name and official documentation URL:

## 4. Hosted model selection

Complete this section only when a hosted model provider is selected.

Every model you list must pass the tool calling gate before it is registered. A model that cannot emit a tool call cannot act as an agent here, however good its prose is. Verify it, then record what you verified.

Models to register, with the context window you measured for each:

Model used when a session starts with no explicit choice:

Number of API keys for this provider:

Failover order when a key is exhausted or rejected:

Do you want to see per key consumption in the dashboard? Count work done locally, because most providers publish no quota header and work remaining cannot be known.

1. [ ] Yes

2. [ ] No

## 5. Account profiles

List the account labels you want visible in the dashboard. Use labels only. Never paste credentials into this file.

Claude Code profile labels:

Codex profile labels:

Hermes profile labels:

Hosted provider key labels:

## 6. Remote access

Choose one.

1. [ ] Local computer only

2. [ ] Named Cloudflare Tunnel with Cloudflare Access

For phone access, option two is recommended.

Every tunnel must require authentication. Never expose the dashboard through an unauthenticated URL.

Desired hostname:

Allowed login email:

## 7. Application authentication

Choose one. The coding agent must not begin `TASK_013` until this choice is selected and the owner approves the design.

1. [ ] Owner device pairing with a secure application session

2. [ ] Owner password with a secure application session

Device pairing is recommended for a strictly single owner system behind Cloudflare Access. The application session must still expire, support revocation, and use a secure HTTP only cookie.

## 8. Permission policy

Choose the default.

1. [ ] Ask before important actions

2. [ ] Provider default

3. [ ] Read only planning mode

Automatic permission bypass must remain unavailable from the browser in the first release.

If a provider offers a reduced prompting mode that you use in your own terminal, the dashboard must verify that the launched session actually entered that mode, and show the real mode on the session row. A session that reports one mode and runs in another is the defect this decision exists to prevent.

## 9. Idle session policy

Choose the default.

1. [ ] Never stop sessions automatically

2. [ ] Archive after a chosen number of inactive days

3. [ ] Ask before cleanup

Idle threshold in days:

## 10. Attachment limits

Maximum file size:

Allowed file types:

Do you want to select several images in one pass on mobile?

1. [ ] Yes

2. [ ] No

Files must be written to a dedicated temporary attachment directory. They must never be written to an arbitrary path supplied by the browser.

## 11. Launch seeds

A launch seed is a stored instruction the dashboard sends into a brand new session so that one tap starts a specific kind of work.

List the seeds you want, by name:

The launch endpoint must accept a seed key only. Free text from the browser at that endpoint would turn a launch into a way to type arbitrary input into a terminal, so anything unrecognised is dropped.

## 12. Optional: orchestration session type

An orchestration session plans a piece of work, dispatches units to implementer sessions, reviews their output, and runs correction rounds until verification passes.

1. [ ] Include it

2. [ ] Leave it out of the first release

If included, name the planner model, the implementer runtimes you want available, the maximum correction rounds, and the per unit timeout:

## 13. Optional: two provider review loop

A review loop is a session where one provider plans and builds while a different provider reviews, and a third fresh session inspects the result.

1. [ ] Include it

2. [ ] Leave it out of the first release

If included, the rule is structural rather than a preference: the reviewer must be a different provider from the host, and the inspector must be a different provider from the builder. A model grading its own work is the failure the loop exists to prevent, so those two roles are shown locked with the reason, and only the builder, the models, and the round limits are real choices.

Builder default:

Maximum rounds:

## 14. Definition of the first release

Write one paragraph describing what you want working before adding optional features:
