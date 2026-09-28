# Quack Command Center

**Your coding agents, from anywhere.**

A small web dashboard that runs on your own computer and lets you run several Claude Code agents at once from a browser instead of a terminal. You launch an agent in one of your projects and give it a task; it works in the background, each on its own git branch, while you launch others or close the tab. Every conversation is saved, so you can restart your computer and pick any of them up where you left it.

If you have never used this before, read [Before you start](#before-you-start) and then follow [Setup](#setup) from Step 1 to Step 9. Every command is written out in full.

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

Quack Command Center puts a web page in front of it, and lets you run several Claude Code agents at once. The page runs from a small server on your own machine. You launch an agent in one of your projects, give it a task, and it works in the background: close the tab, launch another, come back later. Each reply streams to any open browser as it is written, and both sides of every conversation are saved to a database file next to the server.

Three things are worth understanding before anything else:

1. **Everything runs on your computer.** The server, the database, and the agent itself. Nothing is sent to a service of ours, because there is no service of ours.
2. **It uses your existing Claude Code login.** You do not enter an API key. If `claude` works in your terminal, it works here.
3. **It is built for one person — you.** There are no user accounts, no sharing, no multi-tenant anything. That assumption is what lets the design stay small: there is no password, only a one-time code you copy from your own terminal to pair a browser.

---

## What it can and cannot do today

Being straight about this up front saves you from hunting for buttons that do not exist.

**It can:**

- Run several Claude Code agents at the same time, each in one of your projects, with a live list showing which are working, finished, failed or stopped.
- Give each agent in a git repository its **own worktree on its own branch** (`quack/<name>-<id>`), so agents working on the same project never edit the same files. Your own checkout is not touched.
- Keep an agent working when you close the tab. Open it again from any paired browser and you see the reply so far, still streaming.
- Launch an agent with a name, a model (Opus, Sonnet, Haiku or the default) and a first message; rename it later.
- Stop an agent mid-answer without losing the conversation.
- Notify you, if you allow it, when an agent finishes or fails while you are looking at something else.
- Show which tools an agent used (a small chip labelled `Read`, `Write`, and so on).
- Ask you to pair the browser before it will do anything, so reaching the port is not the same as controlling the agents.
- Save every conversation to disk, so restarting the server loses nothing. A turn the server was in the middle of is marked *interrupted*; send another message to carry on, and the agent still remembers the earlier context.

**It cannot yet:**

- **Ask you for permission to run a shell command.** The agent has no shell at all right now. See [What the agent is allowed to do](#what-the-agent-is-allowed-to-do).
- **Be reached from another computer.** The server only ever listens on loopback, on purpose. Remote access is meant to arrive later as an authenticated tunnel, not by opening a port.
- Handle attachments, delete agents or their worktrees, or search across conversations.

---

## How it fits together

Four pieces, each doing one job:

```
   Your browser                  Your computer
  ┌──────────────┐        ┌──────────────────────────────────┐
  │              │        │                                  │
  │  apps/web    │◄──────►│  apps/server                     │
  │  agent list, │ HTTP + │  routes, agent registry,         │
  │  agent view  │  SSE   │  event stream, worktrees         │
  └──────────────┘        │        │                │         │
                          │        ▼                ▼         │
                          │  packages/adapter  packages/      │
                          │  runs the CLI      storage        │
                          │        │           quack.db       │
                          │        ▼                          │
                          │  claude (the real CLI)            │
                          └──────────────────────────────────┘
```

- **`apps/web`** is the page you look at: the list of agents, a form to launch one, and the conversation with whichever you open.
- **`apps/server`** runs the agents. A message starts a turn and the request returns at once; the turn carries on in the server, and everything it does reaches every open browser through one event stream. It also creates each agent's git worktree.
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

The first prints a version (this is tested against `2.1.283`). The second must print a greeting. **If the second says `Not logged in · Please run /login`, run `claude` on its own and log in before going further** — the dashboard uses your existing login and cannot log in for you.

**Why:** the dashboard does not talk to Anthropic directly. It runs the same `claude` command you would, so your subscription and your login are what authorise it.

### 4. Git

```bash
git --version
```

**Why:** each agent working in a git repository gets its own worktree, which needs git 2.5 or later. Any git from the last several years qualifies.

---

## Setup

Nine steps, once. By the end you will have an agent working in one of your projects. Every command runs in a terminal; copy them exactly.

### Step 1 — Get the code

```bash
git clone https://github.com/lenacodes848/app-quack-command-center.git
cd app-quack-command-center
```

Every later command assumes you are still in this `app-quack-command-center` folder.

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

Run this again after every `git pull`: the server runs the built files, not the source.

### Step 5 — Choose a folder for the dashboard's own data

The server keeps its database and the agents' worktrees in one directory. Make it somewhere permanent:

```bash
mkdir -p ~/quack-data
```

> **Do not use a folder inside `/tmp`.** macOS and Linux clear `/tmp`, which would silently delete every saved conversation. The path must also be **absolute** (starting with `/` or `~`), not relative.

### Step 6 — Choose the folder that holds your projects

Agents can only work in projects you have approved, and you approve them by naming the folder they live in. Every folder **directly inside** it becomes a project you can pick.

If your projects already live together, for example in `~/Projects`, use that. Otherwise make one and move or clone projects into it:

```bash
mkdir -p ~/Projects
```

Check it holds what you expect:

```bash
ls ~/Projects
```

Three things worth knowing before you pick a project:

- **A git repository is the safe choice.** Each agent gets its own copy of it on its own branch (a *git worktree*), and your checkout is never touched. The repository needs **at least one commit**, because the agent's branch starts from your current commit. A brand-new repository needs `git commit` first.
- **A folder that is not a git repository works too, but the agent edits your real files,** and only one agent can work there at a time.
- **`~/Downloads`, `~/Desktop` and `~/Documents` work when you start the server from a terminal,** because it has your terminal's access. macOS protects those folders, so a server started some other way, such as a login service, may be refused access to them.

### Step 7 — Start the server

```bash
QUACK_PROJECT_ROOTS=~/Projects DATA_DIR=~/quack-data node apps/server/dist/index.js
```

You should see these lines, with your own home directory in place of `~`:

```
Quack Command Center on http://127.0.0.1:4317
Project folders: ~/Projects
Conversations: ~/quack-data/quack.db
Pairing code: P32C-7W0P-P4
Also written to ~/quack-data/pairing-code — it expires in ten minutes and can be used once.
```

**Leave this terminal open.** The server runs until you press Ctrl+C. Your code will differ from the one above.

If the second line says `No project folders configured`, `QUACK_PROJECT_ROOTS` did not reach the server: check the spelling, and that it is on the same line as the command.

### Step 8 — Pair your browser

1. Open **<http://127.0.0.1:4317>** in a browser on the same computer.
2. You will see a box asking for a pairing code.
3. Type the code from the terminal. **Case and dashes do not matter** — `p32c7w0pp4` works as well as `P32C-7W0P-P4`. The letters I, L, O and U never appear in a code, so if you think you see one it is a 1 or a 0, and typing either works.
4. Click **Pair this device**.

You will see a header with a duck, and on the left an empty list of agents with a **New agent** button.

That is the only time you pair this browser. The session lasts **90 days**, or **14 days** without using it, and survives restarting the server and your computer. **If the ten minutes run out,** stop the server with Ctrl+C and start it again with `QUACK_PAIR=1` in front of the command for a fresh code.

### Step 9 — Launch your first agent

1. Click **New agent**.
2. Pick a **project**. Under the list, the form says whether it is a git repository and what that means for where the agent works.
3. Give it a **name**, for example `Explain this project`. The name is shown in the list and becomes part of the agent's branch.
4. Leave the **model** on the default, or pick Opus, Sonnet or Haiku.
5. Type a **first message**: `What does this project do? Read the README and summarise it.`
6. Click **Launch**.

The agent appears at the top of the list marked **Working**, and its reply streams in on the right. When it finishes, it is marked **Idle**. That is the whole loop — see [Using it](#using-it) for everything else you can do.

Optionally, click **Turn on notifications** in the header and allow it, so your browser tells you when an agent finishes or fails while you are looking at something else.

---

## Running it

Day to day, after setup.

### Start it

From the project directory, in a terminal where you have run `nvm use`:

```bash
QUACK_PROJECT_ROOTS=~/Projects DATA_DIR=~/quack-data node apps/server/dist/index.js
```

Once a browser is paired, no code is printed — printing a live credential at every restart would be a standing invitation. You get this instead:

```
1 paired device(s). Pair another from one of them, or restart with QUACK_PAIR=1.
```

Several project folders are separated by `:`, the way `PATH` is:

```bash
QUACK_PROJECT_ROOTS=~/Projects:~/work DATA_DIR=~/quack-data node apps/server/dist/index.js
```

### Stop it

Press **Ctrl+C** in the terminal. Any agent in the middle of an answer is stopped, what it had said so far is saved with a note that the server stopped, and it is marked *interrupted*. Send it another message after you restart to carry on; it still remembers the conversation.

### Leave it running in the background

```bash
QUACK_PROJECT_ROOTS=~/Projects DATA_DIR=~/quack-data nohup node apps/server/dist/index.js > ~/quack-data/server.log 2>&1 &
```

To stop a server you started that way:

```bash
lsof -ti tcp:4317 | xargs kill
```

A plain `kill` stops it the same way Ctrl+C does. Avoid `kill -9`, which skips saving what running agents had said.

> **A pairing code is never written to the log.** It is printed only when a terminal is watching. For a background server, read it from the file instead:
>
> ```bash
> cat ~/quack-data/pairing-code
> ```

### Pair another browser, or get back in

A second browser on the same computer, or a way back in after logging out everywhere, needs a fresh code. Stop the server and start it with `QUACK_PAIR=1`:

```bash
QUACK_PAIR=1 QUACK_PROJECT_ROOTS=~/Projects DATA_DIR=~/quack-data node apps/server/dist/index.js
```

There is no button for this yet; it is planned.

### Why a phone cannot pair yet

There are two separate blockers, not one:

1. **The phone cannot reach the server.** It only ever listens on loopback, so there is no address on your network for a phone to open. That is what the authenticated tunnel is for, and it is not built.
2. **Even if it could reach it, a bare LAN address cannot hold the session.** The session cookie is `Secure`, and browsers only treat loopback and HTTPS as trustworthy — a `http://192.168.x.x` address would accept the response and silently throw the cookie away. Rather than let that happen, the server **refuses to pair** from such an address and says so, leaving your code unused. (Loopback is fine: browsers count it as trustworthy, which was verified rather than assumed.)

So today the dashboard is a browser on the same computer as the server. The layout already works at phone width, ready for when the tunnel lands.

### Updating to a newer version

```bash
git pull
nvm use
npm install
npm run build
```

Then restart the server. Your data folder is untouched by updates; a newer version upgrades the database in place the first time it starts.

---

## Using it

### Launching an agent

1. Click **New agent**.
2. Pick a **project**. The form says whether it is a git repository: if so the agent gets its own worktree and branch; if not, it works in the folder itself and only one agent can work there at a time.
3. Optionally give it a **name** (used in the list and for the branch), a **model**, and a **first message**. Try: `What does this project do? Read the README and summarise it.`
4. Click **Launch**. The agent appears at the top of the list, marked **Working**.

### While it works

- **You can leave.** Open another agent, launch a new one, or close the tab. The agent carries on. Up to four work at once by default (`QUACK_MAX_AGENTS`); past that, a new message is refused with a message naming the limit.
- **Streaming text** — open the agent to watch the reply arrive. Open it on another device and you see the same reply, from where it has got to.
- **Tool chips** — small grey labels like `Read` or `Write`. If you asked for a file and see no `Write` chip, no file was written.
- **Stop** — top right of a working agent. The conversation is kept, marked `[Stopped.]`.
- **Red text** — something failed. The message is the error itself, and the agent is marked **Failed** in the list.

### Notifications

Click **Turn on notifications** once and allow it. After that, when an agent finishes or fails and you are not looking at it, your browser tells you. This works while the dashboard is open in some tab; closed entirely, it cannot.

### Where the work ends up

An agent in a git repository works on its own branch, in a worktree under `DATA_DIR/worktrees/`. Its changes are not in your checkout until you merge them: `git merge quack/fix-login-a1b2c3` from your project, for example. The branch name is shown at the top of the agent. Nothing ever deletes a worktree or branch for you; remove one with `git worktree remove <path>` when you are done with it.

### Renaming

Click the agent's name at the top of its view.

### Logging out

Two buttons, top right, and the difference matters:

- **Log out** ends this browser's session only. Other paired devices keep working.
- **Log out everywhere** ends *every* session, on every device, immediately. This is the control for a phone you no longer have. Since it also logs out the browser you clicked it in, the next server start prints a fresh pairing code.

Neither deletes anything. Your conversations stay exactly where they were.

### The one rule worth remembering

**One turn per agent.** A working agent refuses another message until it finishes or you stop it. Other agents are unaffected.

---

## Configuration

Set these as environment variables when starting the server. Only `DATA_DIR` is required.

| Variable | Default | What it does |
|---|---|---|
| `DATA_DIR` | *(required)* | Absolute path to the folder holding the database and the agents' worktrees. |
| `QUACK_PROJECT_ROOTS` | none | Folders holding your projects, separated by `:`. Agents can be launched in any folder directly inside one. Set here only: nothing in the dashboard can change it. |
| `QUACK_MAX_AGENTS` | `4` | How many agents may work at once, from 1 to 16. |
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

This is on purpose. Pairing protects the dashboard, but binding a public interface would put the login itself on the internet with no policy in front of it, and the session cookie is `Secure`, which a plain-HTTP address other than loopback will not accept anyway. Remote access is meant to arrive as an authenticated tunnel, not an open port.

---

## Where your data lives

Everything sits under the `DATA_DIR` you chose:

```
~/quack-data/
├── quack.db          your conversations and paired devices
├── quack.db-wal      write-ahead log (see below)
├── quack.db-shm      shared memory file for the above
├── pairing-code      only while a code is live; deleted the moment it is used
├── worktrees/        one git worktree per agent launched in a repository
└── workspace/        where conversations from before agents existed still run
```

- **`quack.db`** holds every conversation and message, and the list of paired devices. It stores **no usable credential**: a session is kept as a SHA-256 hash of its token, so reading this file gives an attacker nothing they can present as a cookie. The directory is created `0700` and the database `0600` — owner-only — because this is a transcript of your work.
- **`pairing-code`** exists only while a code is valid. It is `0600`, and it is removed the instant the code is used, expires, or is destroyed by wrong guesses. If you see one, a code is live.
- **`quack.db-wal`** is the write-ahead log. Expect it to be larger than the database sometimes; that is normal and is what makes an abrupt shutdown safe. It is folded back into `quack.db` and removed when the server stops cleanly — that is, on Ctrl+C or a plain `kill`. A `kill -9` skips it, and the log is simply recovered on the next start instead.
- **`worktrees/`** holds a worktree for each agent launched in a git repository, named by a random id. The branch inside it is listed at the top of the agent. Nothing here is deleted automatically.
- **`workspace/`** is where conversations from before agents existed were run, and where they still resume.

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

### Why agents run in the server, not in the request

A turn used to live exactly as long as the browser request that started it, so closing the tab stopped the agent. To start work and walk away, the turn has to belong to something that outlives the tab: the server keeps a registry of agents, a message starts a turn and returns at once, and the turn runs whether or not anyone is watching.

### Why one event stream for every agent

Every open browser needs to hear about every agent: which are working, and the reply of whichever one is open. One [Server-Sent Events](https://developer.mozilla.org/docs/Web/API/Server-sent_events) stream carries all of it. Each event is numbered, so a browser that loses its connection reconnects and is sent exactly what it missed, and every snapshot it fetches says which event it is up to, so nothing is shown twice or skipped. It is one-way on purpose: anything the browser asks for is an ordinary request, which keeps the CSRF rules the same for everything.

### Why a worktree per agent

Two agents editing one checkout would overwrite each other's changes. A git worktree is a second checkout of the same repository on its own branch, sharing history but not files. Each agent gets one, so they never touch the same files and you merge their branches when you are happy. A folder that is not a repository cannot have worktrees, so there the rule is simply one agent at a time.

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

**It may read and write files** in its working directory, without stopping to ask: its own worktree for a git project, or the project folder itself otherwise. There is nobody at the terminal to answer a permission prompt, so a prompt would simply be refused and the agent would be unable to do anything at all. Allowing edits in its own working directory is the trade. **For a folder that is not a git repository, that means your real files,** with no branch to review before merging.

**It has no shell.** No `Bash`, no way to run a command. This is the strongest of the three: even if you ask it to run something, it cannot.

**It has none of your connectors.** If you use Claude Code with Gmail, Google Drive, Calendar or similar, the dashboard agent does *not* get them, and it does not load your personal skills or settings either.

That last one was a real bug, found by running this for the first time. The agent's very first reply listed the owner's connected Gmail, Calendar, Drive and scheduling tools, unprompted — the workspace was isolated but the *account* was not. Fixing it needed two separate flags, because restricted mode alone removes tools that come from configuration files and leaves everything attached to the signed-in account. Without the fix, reaching this dashboard would have meant reaching that person's email.

**What this does not protect against:** anything already running as you on your machine can read the database and the worktrees. The restrictions limit what the *agent* can reach, not what your own computer can. The same is true of pairing: a process running as you could read the pairing-code file while a code is live.

---

## Troubleshooting

### `nvm use` prints an error, or nothing seems to happen afterwards

You are probably not in the project directory. `nvm use` with no argument looks for `.nvmrc` where you currently are. Worse, when it fails inside a chain of commands joined by `&&`, everything after it is silently skipped — which looks like the next command producing no output at all. Run it from the project root, or name the version: `nvm use 24.21.0`.

### `Invalid configuration: DATA_DIR is required...`

You started the server without saying where to keep data:

```bash
QUACK_PROJECT_ROOTS=~/Projects DATA_DIR=~/quack-data node apps/server/dist/index.js
```

### `QUACK_PROJECT_ROOTS entries must be absolute paths`

One of the folders is relative, such as `Projects`. Use `~/Projects` or a full path starting with `/`.

### `Invalid configuration: DATA_DIR must be an absolute path.`

You used a relative path like `data`. Use a full path, or `~/quack-data`.

### `Port 4317 is already in use. Quack Command Center may already be running — stop it, or set PORT to a free port.`

A previous server is still running. Either use it, or stop it:

```bash
lsof -ti tcp:4317 | xargs kill
```

### The launch form says "No project folders are configured"

The server was started without `QUACK_PROJECT_ROOTS`. Stop it and start it again as in [Step 7](#step-7--start-the-server). The launch form lists folders directly inside that folder; if it is empty, so is the list.

### "That repository has no commits yet"

An agent's branch starts from your current commit, and a new repository has none. In that project:

```bash
git add -A
git commit -m "First commit"
```

### "4 agents are already working, which is the limit"

Wait for one to finish, stop one, or start the server with a higher `QUACK_MAX_AGENTS` (up to 16). The agent you were launching was still created; send it the message again once there is room.

### "Another agent is working in this folder"

That project is not a git repository, so agents there share its files and take turns. Wait, or make it a repository (`git init`, then a first commit) so each agent gets its own worktree.

### I cannot find the changes an agent made

They are on the agent's branch, in its worktree, not in your checkout. The branch is shown at the top of the agent. From your project, `git log quack/<branch-name>` shows its commits if it made any, and `git worktree list` shows where its files are. Merge the branch when you want the changes.

### The reply says it could not do something because permission was denied

Expected for anything outside editing files in the agent's working directory — most often a shell command. The agent has no shell. See [What the agent is allowed to do](#what-the-agent-is-allowed-to-do).

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

### The page loads but the agent list is empty and nothing launches

Check the server is actually up:

```bash
curl http://127.0.0.1:4317/api/health
```

If nothing answers, start the server ([Step 7](#step-7--start-the-server)). A healthy server answers `{"ok":true}` and nothing more — that endpoint answers before authentication, so it deliberately says nothing about whether anyone is paired or what is running. To see the rest you must be paired, and then `/api/me` carries it.

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

Roughly in the order they are planned:

1. **Shell commands with your approval,** so an agent can run tests or `git` after asking, answered from an inbox that collects requests from every agent.
2. **A button to pair another device,** and a list of paired devices with per-device revocation. The mechanism exists; nothing in the interface calls it yet, so adding your phone means restarting with `QUACK_PAIR=1`.
3. **Remote access** through an authenticated tunnel, so this works from a phone away from your desk.
4. **Granting specific tools** (MCP servers) to an agent by name.
5. **Deleting agents and their worktrees,** and search across conversations.

Authentication itself is built. What is **not** yet done from the wider security task: request and response schema validation on every route, structured logging with redaction, and an audit log of security events. All are recorded in `plan.md`.

Also absent: attachments, and support for agents other than Claude Code.

---

## Project layout

```
apps/
  server/     HTTP server: routes, agent registry, event stream, worktrees
  web/        React + Tailwind dashboard: agent list, launch form, agent view
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
