# Release Checklist

Use this checklist only after all applicable PRD tasks are complete. Record unselected provider and remote access checks as `not_applicable` with the corresponding choice from `STUDENT_DECISIONS.md`.

## 1. Product behavior

1. [ ] The dashboard lists live sessions.

2. [ ] The dashboard lists recoverable saved conversations separately.

3. [ ] A user can launch each selected provider.

4. [ ] A user can select an account profile without exposing credentials.

5. [ ] A user can select a working directory from allowed locations.

6. [ ] A user can send a message and see pending, accepted, confirmed, failed, and retry states.

7. [ ] A user can steer an active turn when the provider supports steering.

8. [ ] A user can stop an active turn.

9. [ ] A user can answer provider permission questions from the dashboard.

10. [ ] A user can attach an allowed file.

11. [ ] A user can change the model or reasoning setting only when the provider supports it.

12. [ ] A user can rename, archive, and resume conversations.

13. [ ] A web service restart preserves live provider processes only when a durable supervisor or provider capability supports reattachment. Every other provider falls back to exact conversation resume without losing the saved record.

14. [ ] Restarting the computer preserves recoverable conversation records.

15. [ ] Stopping a turn cancels it and leaves the session alive with its context intact.

16. [ ] A session that is still starting reports starting, offers no stop control, and is never signalled.

17. [ ] A turn in progress shows phase, elapsed time, current step, and the tool in use.

18. [ ] A retrying turn says so, shows the attempt count, and shows the last failure.

19. [ ] Every invocable skill, agent, and command is reachable from one searchable palette.

20. [ ] A session blocked on an interactive modal can be driven to completion from a phone.

21. [ ] Searching the session list matches conversation content as well as titles.

22. [ ] A launch seed starts a session already primed for its kind of work.

## 2. Desktop interface

1. [ ] The left sidebar and main conversation panel match the structural specification.

2. [ ] Active sessions and recoverable conversations are visually distinct.

3. [ ] Provider, account, model, status, current activity, and age are readable.

4. [ ] The selected session remains selected during background updates.

5. [ ] Updating one session does not rebuild unrelated session cards.

6. [ ] The conversation remains readable while the sidebar is collapsed.

7. [ ] The privacy control hides sensitive previews while preserving useful status information.

## 3. Mobile interface

1. [ ] The session list uses the full screen when no session is selected.

2. [ ] Opening a session creates a focused full screen conversation view.

3. [ ] The back control returns to the session list without losing the active stream.

4. [ ] The top controls remain usable at 390 pixels wide.

5. [ ] The composer remains visible above the mobile keyboard.

6. [ ] Every primary touch target is at least 44 pixels.

7. [ ] Rotation and refresh preserve the selected session.

8. [ ] File attachment and permission cards work with touch input.

## 3b. Provider registry and hosted models

Record as `not_applicable` when no hosted model provider was selected.

1. [ ] One registry file declares every provider, its endpoint, its credential names, its models with measured windows, and its effort levels.

2. [ ] The request router, the session launcher, the session row API, and the model picker all read that registry.

3. [ ] No provider name, window, model identifier, or effort level is hardcoded anywhere else.

4. [ ] Every registered model passed the tool calling gate, and the registry records what was verified and when.

5. [ ] Every registered context window is a measured floor rather than a published figure.

6. [ ] Two providers sharing one session type are labelled correctly everywhere, including confirmations, tooltips, picker headings, and handoff text.

7. [ ] Effort levels are declared per provider and the correct reasoning switch is observed at the wire.

8. [ ] Credential failover was proven by breaking the primary credential.

9. [ ] A per session credential choice is honored.

10. [ ] Consumption is reported as work done, never as work remaining.

11. [ ] A session identity is minted by the provider and is used by the row, the transcript, the recovery record, and every per session setting file.

12. [ ] A transcript resolves by exact match, and a fresh session returns an empty history.

13. [ ] No assistant text is ever taken from the terminal.

14. [ ] Standing context, working memory, deterministic retrieval, and the carry brief are present, and retrieval was proven by recovering a fact from an emptied context.

## 4. Provider reliability

1. [ ] Provider launch success requires a health or protocol confirmation.

2. [ ] Provider messages use structured events where available.

3. [ ] Terminal parsing is isolated behind provider compatibility code.

4. [ ] Unknown provider output produces a needs attention state.

5. [ ] Provider version changes fail visibly and preserve the conversation.

6. [ ] An interrupted stream reconciles with authoritative provider history.

7. [ ] Duplicate sends are idempotent.

8. [ ] Concurrent sends to the same session are serialized.

9. [ ] Slow provider startup cannot freeze unrelated sessions.

10. [ ] A provider crash leaves a visible recovery action.

## 5. Account isolation

1. [ ] Each account profile has an explicit local configuration root.

2. [ ] The provider process receives only the selected profile environment.

3. [ ] Authentication status comes from supported provider commands or APIs.

4. [ ] Logging out one profile does not log out another profile.

5. [ ] Credential files never appear in API responses.

6. [ ] Credential values never appear in application logs.

7. [ ] The browser never receives provider environment variables.

## 6. Security

1. [ ] The local server binds to `127.0.0.1` or an equivalent loopback address.

2. [ ] When remote access is selected, the public hostname is protected by Cloudflare Access.

3. [ ] When remote access is selected, the Access policy exists before the tunnel route is published.

4. [ ] When remote access is selected, the origin validates the Cloudflare Access token or uses tunnel level Access protection.

5. [ ] State changing requests require CSRF protection or a same origin token.

6. [ ] Session cookies are secure, HTTP only, same site, expiring, and revocable.

7. [ ] Login attempts are rate limited.

8. [ ] Security headers are present.

9. [ ] File paths are canonicalized and constrained to allowed roots.

10. [ ] Uploaded files are size limited and type checked.

11. [ ] Shell commands use argument arrays and absolute binary paths.

12. [ ] Browser input never enters a shell command through string concatenation.

13. [ ] Dangerous permission bypass is unavailable from the web interface.

14. [ ] Destructive actions require confirmation and create audit events.

15. [ ] Secrets scanning finds zero committed credentials.

16. [ ] A knowledgeable human completed a security review before routine remote use.

## 7. Testing

1. [ ] Unit test coverage is at least 85 percent for provider adapters and security modules.

2. [ ] Overall unit test coverage is at least 80 percent.

3. [ ] Provider contract tests run against fixtures.

4. [ ] Integration tests run against fake provider processes.

5. [ ] Browser tests pass at desktop and mobile sizes.

6. [ ] Accessibility checks report no critical violations.

7. [ ] A documented high volume interaction test loses zero selections.

8. [ ] A restart recovery test resumes the exact provider conversation.

9. [ ] A network interruption test reconciles message state correctly.

10. [ ] A large attachment test respects the configured limit.

11. [ ] When remote access is selected, a tunnel authentication test blocks an unapproved identity.

12. [ ] The complete test suite passes twice from a clean start.

## 8. Operations

1. [ ] The service starts automatically after login or boot.

2. [ ] The service health endpoint reports provider, database, storage, and the selected access mode status.

3. [ ] Health checks never expose secrets.

4. [ ] Logs rotate and have a documented retention period.

5. [ ] State files use restrictive local permissions.

6. [ ] Database migrations are automatic and reversible.

7. [ ] Backups can be created without stopping active sessions.

8. [ ] Restore is documented and tested with disposable data.

9. [ ] Updating the dashboard preserves provider sessions when a durable supervisor or provider capability supports reattachment. Every other provider retains an exact resume record.

10. [ ] Uninstall steps preserve provider credentials and saved conversations unless the user explicitly removes them.

## 8b. Version 2 features

Record optional items as `not_applicable` with the corresponding decision.

1. [ ] The command palette claims the key handler before awaiting data, so a key pressed during the fetch accepts rather than sends.

2. [ ] A palette left from a previous render can never write into another session's composer.

3. [ ] Colliding palette entries each invoke their own target.

4. [ ] The invocable scan tolerates both line ending conventions.

5. [ ] Modal detection reads accepted keys from the modal's own hint footer and always offers arrow keys.

6. [ ] The modal body is bounded at the modal frame.

7. [ ] The key forwarding endpoint uses a fixed allowlist, bounds repeats and text length, and sends text in literal mode.

8. [ ] An idle session never reports a modal.

9. [ ] Content search returns bounded results and never returns an excluded transcript.

10. [ ] The launch endpoint accepts a seed key only and drops anything unrecognised.

11. [ ] A seed is sent only after the composer is drawn, and arrives exactly once.

12. [ ] A seeded launch blocked by an account login resumes as the same seeded type.

13. [ ] Optional orchestration: the workspace snapshot includes untracked files and never touches the owner's working state.

14. [ ] Optional orchestration: the reviewer re runs verification rather than trusting an implementer claim.

15. [ ] Optional review loop: the reviewer differs from the host and the inspector differs from the builder, enforced by the runner.

16. [ ] Optional review loop: those two roles render as locked chips with the reason, and no dropdown offers a single value.

17. [ ] Optional review loop: stage state is read from run artifacts rather than from transcript text.

18. [ ] Optional review loop: applying a configuration both stores it and tells the session, and reports whether the delivery succeeded.

19. [ ] Optional review loop: model lists are read from the provider at runtime.

20. [ ] Every new card repaints on a state signature change and never underneath an open dropdown.

21. [ ] Every new control is at least 44 pixels, and no control truncates at 375 pixels.

## 9. Student source protection

1. [ ] The project was built in a new clean repository.

2. [ ] No private reference project file was copied into the project.

3. [ ] No private reference domain, password, secret path, account identifier, internal service name, or repository path appears in the project.

4. [ ] Branding is original to the student.

5. [ ] Layout behavior follows the specification while visual details remain original.

6. [ ] The project contains no screenshots with private names, messages, account labels, or session history.

7. [ ] Fixtures use invented names and invented content.

8. [ ] A source similarity review found no suspicious copied blocks from private reference materials, proprietary course inputs, or third party projects that were available to the reviewer.

9. [ ] The final repository contains only the student implementation and public documentation references.

10. [ ] No personal name, email address, phone number, home directory path, vault path, private hostname, or account identifier appears anywhere in the repository, including comments, fixtures, seeds, screenshots, and commit messages.
