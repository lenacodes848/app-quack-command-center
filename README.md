# Quack Command Center

**Your coding agents, from anywhere.**

A small web dashboard that runs on your own computer and lets you talk to Claude Code through a browser instead of a terminal. You type a message, the agent answers, and the whole conversation is saved so you can close the window, restart your computer, and pick the same conversation up where you left it.

If you have never used this before, read [Before you start](#before-you-start) and then [Setup](#setup). Every command is written out in full.

---

## Contents

- [What this is, in plain terms](#what-this-is-in-plain-terms)
- [What it can and cannot do today](#what-it-can-and-cannot-do-today)
- [How it fits together](#how-it-fits-together)
- [Before you start](#before-you-start)
- [Setup](#setup)
- [Running it](#running-it)
- [Using it](#using-it)
- [Configuration](#configuration)
- [Where your data lives](#where-your-data-lives)
- [Why it is built this way](#why-it-is-built-this-way)
- [What the agent is allowed to do](#what-the-agent-is-allowed-to-do)
- [Troubleshooting](#troubleshooting)
- [Working on the code](#working-on-the-code)
- [What is not built yet](#what-is-not-built-yet)

---

## What this is, in plain terms

Claude Code normally runs in a terminal. That is fine at a desk, and awkward everywhere else: you cannot easily glance at it from your phone, a closed terminal loses the thread, and there is no list of what you were working on last week.

Quack Command Center puts a web page in front of it. The page runs from a small server on your own machine. When you send a message, that server starts Claude Code, streams the reply back to your browser word by word, and writes both sides of the conversation to a database file next to it.

Three things are worth understanding before anything else:

1. **Everything runs on your computer.** The server, the database, and the agent itself. Nothing is sent to a service of ours, because there is no service of ours.
2. **It uses your existing Claude Code login.** You do not enter an API key. If `claude` works in your terminal, it works here.
3. **It is built for one person — you.** There are no user accounts, no sharing, no multi-tenant anything. That assumption is what lets the design stay small: there is no password, only a one-time code you copy from your own terminal to pair a browser.

---

## What it can and cannot do today

Being straight about this up front saves you from hunting for buttons that do not exist.

**It can:**

- Hold a conversation with Claude Code in a browser, with replies streaming in as they are generated.
- Show you which tools the agent used (a small chip labelled `Read`, `Write`, and so on).
- Ask you to pair the browser before it will do anything, so reaching the port is not the same as controlling the agent.
- Save every conversation to disk, so restarting the server loses nothing.
- List your past conversations in a sidebar; click one to reopen it and carry on. The agent still remembers the earlier context, because it resumes the same underlying session.
- Let the agent read and write files inside its own workspace directory.

**It cannot yet:**

- **Ask you for permission to run a shell command.** The agent has no shell at all right now. See [What the agent is allowed to do](#what-the-agent-is-allowed-to-do).
- **Be reached from another computer.** The server only ever listens on loopback, on purpose. Remote access is meant to arrive later as an authenticated tunnel, not by opening a port.
- Handle attachments, run more than one conversation at a time, rename or delete saved conversations, or search across them.

---

## How it fits together

Four pieces, each doing one job:

```
   Your browser                  Your computer
  ┌──────────────┐        ┌──────────────────────────────────┐
  │              │        │                                  │
  │  apps/web    │◄──────►│  apps/server                     │
  │  chat UI +   │  HTTP  │  routes, streaming, one session   │
  │  sidebar     │        │                                  │
  └──────────────┘        │        │                │         │
                          │        ▼                ▼         │
                          │  packages/adapter  packages/      │
                          │  runs the CLI      storage        │
                          │        │           quack.db       │
                          │        ▼                          │
                          │  claude (the real CLI)            │
                          └──────────────────────────────────┘
```

- **`apps/web`** is the page you look at: a message list, a box to type in, and a sidebar of saved conversations.
- **`apps/server`** answers the browser, streams a reply back as it arrives, and writes each turn to the database.
- **`packages/adapter`** starts the real `claude` command, reads its output, and turns it into a tidy list of events (*a session started*, *some text*, *a tool ran*, *the turn finished*).
- **`packages/storage`** is the SQLite database holding your conversations.

---

## Before you start

You need four things. Each one has a command to check it and a note on why it is needed.

### 1. A Mac or Linux machine

Developed and tested on macOS (Apple silicon). Linux should work; Windows is untested.

### 2. Node.js 24.21.0

Check what you have:

```bash
node --version
```

If it does not print `v24.21.0`, install it with [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm install 24.21.0
```

**Why this exact version:** the project pins it in a file called `.nvmrc` and refuses to run on older versions. Pinning means the version that passes the tests is the version you run, so a failure is a real failure and not a version difference.

### 3. Claude Code, installed and logged in

Check both:

```bash
claude --version
claude --print "say hello"
```

The first prints a version (this was built against `2.1.282`). The second must print a greeting. **If the second says `Not logged in · Please run /login`, run `claude` on its own and log in before going further** — the dashboard uses your existing login and cannot log in for you.

**Why:** the dashboard does not talk to Anthropic directly. It runs the same `claude` command you would, so your subscription and your login are what authorise it.

### 4. Git

```bash
git --version
```

---

## Setup

Five steps, once.

### Step 1 — Get the code

```bash
git clone https://github.com/lenacodes848/app-quack-command-center.git
cd app-quack-command-center
```

### Step 2 — Switch to the right Node version

```bash
nvm use
```

Expected output:

```
Found '.../app-quack-command-center/.nvmrc' with version <24.21.0>
Now using node v24.21.0 (npm v11.19.0)
```

> **This must be run from inside the project directory.** `nvm use` with no argument reads `.nvmrc` from wherever you currently are, so from anywhere else it fails. You also need to run it again in every new terminal window — it does not stick.

### Step 3 — Install dependencies

```bash
npm install
```

This prints a warning that looks alarming and is not (it may mention one or two packages, depending on your platform):

```
npm warn install-scripts 2 packages have install scripts not yet covered by allowScripts:
npm warn install-scripts   better-sqlite3@13.0.1 (install: node-gyp rebuild)
npm warn install-scripts   fsevents@2.3.3 (install: (install scripts present))
```

**Leave it unapproved.** `better-sqlite3` is the database library. It ships a ready-compiled binary for your platform, so the compile step it is asking to run is unnecessary. Install scripts execute arbitrary code, so the project deliberately does not approve any. The database works; there is a test that proves it.

### Step 4 — Build it

```bash
npm run build
```

This compiles the server and bundles the web page. Expect something ending in:

```
✓ built in 108ms
```

### Step 5 — Choose a folder for your data

The server needs one directory to keep everything in. Make it somewhere permanent:

```bash
mkdir -p ~/quack-data
```

> **Do not use a folder inside `/tmp`.** macOS and Linux clear `/tmp`, which would silently delete every saved conversation. The path must also be **absolute** (starting with `/` or `~`), not relative.

---

## Running it

### Start the server

From the project directory, in a terminal where you have run `nvm use`:

```bash
DATA_DIR=~/quack-data node apps/server/dist/index.js
```

You should see exactly three lines, with your own home directory expanded in place of `~`:

```
Quack Command Center on http://127.0.0.1:4317
Agent workspace: ~/quack-data/workspace
Conversations: ~/quack-data/quack.db
```

Those three lines tell you the address to open, the folder the agent works in, and the file your conversations are saved to.

On a **first** start there will be two more lines, because no browser is paired yet:

```
Pairing code: P32C-7W0P-P4
Also written to ~/quack-data/pairing-code — it expires in ten minutes and can be used once.
```

On later starts, when a device is already paired, you get this instead — no code, because printing a live credential at every restart would be a standing invitation:

```
1 paired device(s). Pair another from one of them, or restart with QUACK_PAIR=1.
```

### Pair your browser

1. Go to **<http://127.0.0.1:4317>**.
2. You will see a box asking for a pairing code.
3. Type the code from the terminal. **Case and dashes do not matter** — `p32c7w0pp4` works as well as `P32C-7W0P-P4`. The letters I, L, O and U never appear in a code, so if you think you see one it is a 1 or a 0, and typing either works.
4. Click **Pair this device**.

That is the only time you do this on that browser. The session lasts **90 days**, or **14 days** without using it, and survives restarting the server and your computer.

> **If you started the server in the background** and the code went to a log file, it will not be there: it is deliberately printed only when a terminal is watching, so it never lands in a log. Read it from the file instead:
>
> ```bash
> cat ~/quack-data/pairing-code
> ```

**If you miss the ten-minute window,** stop the server and start it again for a fresh code.

**To pair a second device,** such as your phone, do it from a browser that is already paired rather than restarting: the code is printed to the server's terminal again when you ask for one. (There is no button for this yet, so today it means restarting with `QUACK_PAIR=1`.)

**If you lose every paired device,** start the server with `QUACK_PAIR=1` to force a new code:

```bash
QUACK_PAIR=1 DATA_DIR=~/quack-data node apps/server/dist/index.js
```

### What you should see once paired

A header with a duck, an empty conversation area, and a message box at the bottom. If you have used it before, the sidebar on the left lists your past conversations.

### Stop it

Press **Ctrl+C** in the terminal. Nothing is lost: each turn is written to the database as it happens, not when you shut down.

### Leave it running in the background

```bash
DATA_DIR=~/quack-data nohup node apps/server/dist/index.js > ~/quack-data/server.log 2>&1 &
```

To stop a server you started that way:

```bash
lsof -ti tcp:4317 | xargs kill
```

---

## Using it

### Your first message

1. Click the message box at the bottom (it says *Message Claude Code*).
2. Type something. Try: `What files are in the current directory?`
3. Press **Enter** to send. (**Shift+Enter** makes a new line instead.)

You will see your message appear under **you**, then an **agent** block showing `thinking…`, then the reply arriving a few words at a time.

### Reading a reply

- **Streaming text** — the reply appears progressively, as the agent produces it. You are watching it work, not waiting for a finished answer.
- **Tool chips** — small grey labels above a reply, like `Read` or `Write`. They tell you the agent did something rather than only talked. If you asked it to create a file and see no `Write` chip, it did not create the file.
- **Red text** — something failed. The message is the error itself, not a generic apology.

### Starting a fresh conversation

Click **New session**, top right. This begins a new thread with no memory of the previous one. It does **not** delete the old conversation — that stays in the sidebar.

### Going back to an earlier conversation

Click any entry in the left sidebar. The transcript reloads, and the entry highlights to show which one you are in. Anything you send now continues *that* conversation, and the agent still has its earlier context — it resumes the same underlying session rather than starting over.

Conversations are named automatically from your first message and ordered with the most recently active at the top.

> **The sidebar is hidden on narrow screens.** It appears at roughly tablet width and up. On a phone you can still hold a conversation, but not yet switch between saved ones — a gap that matters given the whole point is to use this from a phone, and one that will close when remote access is built.

### Logging out

Two buttons, top right, and the difference matters:

- **Log out** ends this browser's session only. Other paired devices keep working.
- **Log out everywhere** ends *every* session, on every device, immediately. This is the control for a phone you no longer have. Since it also logs out the browser you clicked it in, the next server start prints a fresh pairing code.

Neither deletes anything. Your conversations stay exactly where they were.

### The one rule worth remembering

**One turn at a time.** If you send a message while another is still running, the server answers `409` and refuses. Wait for the reply.

---

## Configuration

Set these as environment variables when starting the server. Only `DATA_DIR` is required.

| Variable | Default | What it does |
|---|---|---|
| `DATA_DIR` | *(required)* | Absolute path to the folder holding the database and the agent's workspace. |
| `PORT` | `4317` | Port to listen on. Must be 1024–65535. |
| `HOST` | `127.0.0.1` | Address to bind. **Loopback only** — see below. |
| `NODE_ENV` | `development` | `development`, `test` or `production`. |
| `LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug` or `trace`. |
| `QUACK_PAIR` | unset | Set to `1` to force a pairing code at startup even when a device is already paired. The way back in if you lose them all. |

Running two at once, for example a scratch copy that cannot disturb your real one:

```bash
PORT=4318 DATA_DIR=~/quack-scratch node apps/server/dist/index.js
```

**`HOST` will refuse a public address.** Setting `HOST=0.0.0.0` fails with:

```
HOST must be a loopback address (127.0.0.1, ::1 or localhost). Remote access goes
through a tunnel to loopback, never by binding a public interface.
```

This is on purpose, and the refusal matters more than usual right now: there is no login yet, so a server on a public interface would hand anyone who found it the ability to run an agent on your machine. Remote access is meant to arrive as an authenticated tunnel, not an open port.

---

## Where your data lives

Everything sits under the `DATA_DIR` you chose:

```
~/quack-data/
├── quack.db          your conversations and paired devices
├── quack.db-wal      write-ahead log (see below)
├── quack.db-shm      shared memory file for the above
├── pairing-code      only while a code is live; deleted the moment it is used
└── workspace/        where the agent reads and writes files
```

- **`quack.db`** holds every conversation and message, and the list of paired devices. It stores **no usable credential**: a session is kept as a SHA-256 hash of its token, so reading this file gives an attacker nothing they can present as a cookie. The directory is created `0700` and the database `0600` — owner-only — because this is a transcript of your work.
- **`pairing-code`** exists only while a code is valid. It is `0600`, and it is removed the instant the code is used, expires, or is destroyed by wrong guesses. If you see one, a code is live.
- **`quack.db-wal`** is the write-ahead log. Expect it to be larger than the database sometimes; that is normal and is what makes an abrupt shutdown safe. It is folded back into `quack.db` and removed when the server stops cleanly — that is, on Ctrl+C or a plain `kill`. A `kill -9` skips it, and the log is simply recovered on the next start instead.
- **`workspace/`** is the agent's working directory. Files it creates land here.

**To back up your conversations,** stop the server and copy the whole directory. Copying `quack.db` alone while the server is running can catch it mid-write.

---

## Why it is built this way

Every one of these is a decision that could have gone another way. Knowing the reason makes the thing predictable.

### Why a local server instead of a hosted app

Your code is on your machine and your Claude Code login is on your machine. Sending either to a server somewhere would mean trusting that server with both. Keeping everything local means the sensitive part never leaves, and there is no account to create.

### Why it drives the `claude` command instead of calling an API

Two reasons. It uses the login you already have, so there is no API key to manage and no separate bill. And it inherits whatever the CLI can do; when Claude Code gains an ability, so does this.

### Why there is no terminal emulator

An obvious design would be to run `claude` in a pseudo-terminal and show the terminal in the browser. That means parsing screen output, and screen output is for humans: it repaints, wraps, and animates. Instead the adapter asks the CLI for structured output (`--output-format stream-json`) and reads that. The result is a real data structure, so *"the agent used the Write tool"* is a fact the UI can render, not a guess about characters on a screen. It also means no pseudo-terminal and no process supervisor.

### Why one message at a time

Two turns at once would interleave their output and race over which conversation they belong to. Refusing the second is a one-line rule that removes a whole category of confusing bugs. A queue can come later.

### Why streaming over plain HTTP instead of a WebSocket

A turn is a request with a long answer, which is exactly what a streaming HTTP response is for. A WebSocket would add a connection to manage, reconnect and test for no benefit at this size.

### Why SQLite, and why the write-ahead log

Conversations must survive a restart, and a single-file database with no separate service to install is the smallest thing that does the job. The write-ahead log is what makes it survive a *crash* rather than only a tidy shutdown. That was tested by killing the server with `kill -9` mid-life and confirming a new process replayed the transcript and resumed the conversation.

### Why messages have an explicit sequence number

Ordering by timestamp looks fine and is subtly broken: several messages in one turn can land in the same millisecond, and then their order is whatever the database happens to return. Each message carries a counter instead, so a conversation cannot come back scrambled.

### Why the table names look over-engineered

They are `agent_sessions` and `normalized_messages`, from a longer specification with nine more tables still to come. Using the final names now means the rest can be added later without renaming the tables your conversations are already stored in.

### Why a pairing code instead of a password

There is exactly one user, so a password would be a secret you choose, reuse and have to remember — and a login form that accepts one is a thing to guess at. A pairing code sidesteps all of it: it only exists for ten minutes, only works once, and can only be read by someone who can already see your terminal or read a file only you can read. Proving you are at the machine is the strongest claim available here, and it is exactly the claim that matters.

Five wrong guesses destroy the code rather than just slowing you down. Against a 50-bit secret a delay still leaves it guessable; removing the target ends the attempt.

### Why the session lasts 90 days

Because the alternative is worse. A dashboard that logs you out constantly trains you to re-pair without reading, which is the habit that makes a phishing page work. A long session with a real revoke button — **Log out everywhere** — is safer than a short one you dismiss twenty times a week. The 14-day idle limit is the backstop for a device you stopped using and forgot about.

### Why the agent has no shell

See the next section — it is the single most important thing to understand about using this safely.

---

## What the agent is allowed to do

The dashboard starts the agent with three deliberate restrictions. This is a security boundary, so it is worth reading even if you skip everything else.

**It may read and write files** in its workspace directory, without stopping to ask. There is nobody at the terminal to answer a permission prompt, so a prompt would simply be refused and the agent would be unable to do anything at all. Allowing edits inside its own workspace is the trade.

**It has no shell.** No `Bash`, no way to run a command. This is the strongest of the three: even if you ask it to run something, it cannot.

**It has none of your connectors.** If you use Claude Code with Gmail, Google Drive, Calendar or similar, the dashboard agent does *not* get them, and it does not load your personal skills or settings either.

That last one was a real bug, found by running this for the first time. The agent's very first reply listed the owner's connected Gmail, Calendar, Drive and scheduling tools, unprompted — the workspace was isolated but the *account* was not. Fixing it needed two separate flags, because restricted mode alone removes tools that come from configuration files and leaves everything attached to the signed-in account. Without the fix, reaching this dashboard would have meant reaching that person's email.

**What this does not protect against:** anything already running as you on your machine can read the database and the workspace. The restrictions limit what the *agent* can reach, not what your own computer can. The same is true of pairing: a process running as you could read the pairing-code file while a code is live.

---

## Troubleshooting

### `nvm use` prints an error, or nothing seems to happen afterwards

You are probably not in the project directory. `nvm use` with no argument looks for `.nvmrc` where you currently are. Worse, when it fails inside a chain of commands joined by `&&`, everything after it is silently skipped — which looks like the next command producing no output at all. Run it from the project root, or name the version: `nvm use 24.21.0`.

### `Invalid configuration: DATA_DIR is required...`

You started the server without saying where to keep data:

```bash
DATA_DIR=~/quack-data node apps/server/dist/index.js
```

### `Invalid configuration: DATA_DIR must be an absolute path.`

You used a relative path like `data`. Use a full path, or `~/quack-data`.

### `Port 4317 is already in use. Quack Command Center may already be running — stop it, or set PORT to a free port.`

A previous server is still running. Either use it, or stop it:

```bash
lsof -ti tcp:4317 | xargs kill -9
```

### The reply says it could not do something because permission was denied

Expected for anything outside editing files in the workspace — most often a shell command. The agent has no shell. See [What the agent is allowed to do](#what-the-agent-is-allowed-to-do).

### `Not logged in · Please run /login` appears in a reply

Your Claude Code login has expired. Fix it in the terminal, not here:

```bash
claude
```

Then log in and send the message again.

### I am asked for a pairing code and do not have one

The server prints one only when no device is paired yet, and only to a terminal. Either read the file (`cat ~/quack-data/pairing-code`), or stop the server and start it with `QUACK_PAIR=1` for a fresh code.

### "That code was not accepted"

Codes expire after ten minutes and work once. Get a new one by restarting the server. Case, spaces and dashes do not matter, so a typo is usually a genuinely wrong character — and note the alphabet contains no I, L, O or U.

### "Too many attempts"

Five wrong guesses destroy the code deliberately. Wait a few minutes, then restart the server for a new one.

### I was logged out unexpectedly

Either the session passed 90 days, or the browser went 14 days unused, or something clicked **Log out everywhere**. Pair again.

### The page loads but the sidebar is empty and nothing sends

Check the server is actually up:

```bash
curl http://127.0.0.1:4317/api/health
```

A healthy server answers `{"ok":true}` and nothing more — that endpoint answers before authentication, so it deliberately says nothing about whether anyone is paired or what is running. To see the rest you must be paired, and then `/api/me` carries it.

### My conversations vanished

Almost certainly a `DATA_DIR` inside `/tmp`, which the operating system clears. Move it somewhere permanent. There is no recovery.

---

## Working on the code

Run every check with one command:

```bash
npm run validate
```

That runs eleven steps in order — format check, type-check, lint, repository tests, unit tests with coverage, integration tests, both builds, a real browser test, and three security scans — stopping at the first failure. It is the same set that runs in CI.

Individually:

| Command | What it does |
|---|---|
| `npm test` | Unit tests only (fast). |
| `npm run test:integration` | Slower tests that build and start things. |
| `npm run test:e2e` | Drives the built page in a real browser. |
| `npm run typecheck` | Types only. |
| `npm run lint` | ESLint. |
| `npm run format` | Rewrites files to the project style. |
| `npm run clean` | Deletes build output when a build goes strange. |

Two things that will bite you otherwise:

- **Do not pipe a command whose result you care about.** `npm run lint | tail` reports `tail`'s exit code, so a failing lint looks like it passed.
- **`typecheck` must run before `lint`.** The type-aware lint rules need the build outputs to exist.

No test ever calls the real `claude`. They run against a fake standing in for it, so the suite costs no quota and needs no network.

---

## What is not built yet

Roughly in the order they matter:

1. **Permission prompts in the browser,** so the agent could run commands with your approval instead of not at all.
2. **A button to pair another device.** The mechanism exists and is authenticated, but nothing in the interface calls it yet, so adding your phone means restarting with `QUACK_PAIR=1`.
3. **A list of your paired devices,** with the ability to revoke one rather than all of them.
4. **Renaming and deleting saved conversations.**
5. **Search across conversations.**
6. **Remote access** through an authenticated tunnel, so this works from a phone. This is the point of the product, and it is deliberately last.

Authentication itself is built. What is **not** yet done from the wider security task: request and response schema validation on every route, structured logging with redaction, and an audit log of security events. None of those is authentication, and all are recorded in `plan.md`.

Also absent: attachments, more than one conversation at a time, and support for agents other than Claude Code.

---

## Project layout

```
apps/
  server/     HTTP server, routes, streaming, persistence wiring
  web/        React + Tailwind chat UI
packages/
  adapter/    runs the claude CLI and normalises its output
  storage/    SQLite conversation store
  config/     environment variable validation
  contracts/  shared names and types
tests/        repository, integration and browser tests
```

Three files carry the project's memory and are worth reading before changing anything:

- **`plan.md`** — what is done, what is next, and the decisions that need an owner.
- **`research.md`** — verified facts about the tools, the security design, and approaches that failed and why.
- **`progress.md`** — an append-only log of what was built, with the evidence.
