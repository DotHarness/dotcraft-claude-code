# DotCraft Plugin For Claude Code

| Field | Value |
|-------|-------|
| **Version** | 0.1.0 |
| **Status** | Draft |
| **Date** | 2026-10-18 |
| **Depends On** | DotCraft [Exec CLI](https://github.com/DotHarness/dotcraft/blob/main/specs/features/exec-cli.md) |

Purpose: let Claude Code hand work to DotCraft, either running a task on a model DotCraft has configured or generating an image, and receive the result in the same Claude Code session.

## 1. Overview

The plugin has three parts:

- **Commands, one subagent, and two skills.** These are the Claude Code surface.
- **A companion script.** `scripts/dotcraft-companion.mjs` is a Node script that runs `dotcraft exec --json`, records every run as a job, and answers status, result, and cancel requests from that record.
- **Session hooks.** They tie jobs to the Claude Code session that started them, and clean them up when that session ends.

Every DotCraft capability the plugin uses is a `dotcraft exec` invocation defined by the Exec CLI spec. The job record belongs to the plugin, because exec keeps none.

DotCraft does the work in its own thread. The thread is visible in DotCraft Desktop and can be continued from Claude Code or from Desktop.

## 2. Goals

- One command to delegate a task and get DotCraft's answer back.
- One command to generate an image, optionally from reference images, and get its file back.
- Let Claude delegate on its own when the user asks for DotCraft or for a model DotCraft provides.
- Continue the previous DotCraft thread when the user asks to.
- Run long tasks in the background, list them, read their results, and stop them.
- Tell the user exactly what is missing when DotCraft is not ready.

## 3. Non-Goals

- No MCP server or MCP tools.
- No code-review commands or stop-time review gates.
- No forwarding of the Claude Code transcript to DotCraft.
- No installing or updating DotCraft, and no bundled `dotcraft` binary.
- No npm dependencies or build step. The companion uses Node's standard library only.

## 4. Repository And Distribution

The plugin lives in its own repository, `DotHarness/dotcraft-claude-code`. It is published as a Claude Code marketplace named `dotcraft` that contains one plugin, also named `dotcraft`.

```text
.claude-plugin/marketplace.json
plugins/dotcraft/.claude-plugin/plugin.json
plugins/dotcraft/commands/{task,image,status,result,cancel,setup}.md
plugins/dotcraft/agents/dotcraft-delegate.md
plugins/dotcraft/skills/dotcraft-runtime/SKILL.md
plugins/dotcraft/skills/dotcraft-result-handling/SKILL.md
plugins/dotcraft/hooks/hooks.json
plugins/dotcraft/scripts/dotcraft-companion.mjs
plugins/dotcraft/scripts/session-lifecycle-hook.mjs
plugins/dotcraft/scripts/lib/*.mjs
tests/*.test.mjs
README.md
README_ZH.md
specs/plugin.md
```

Installation:

```text
/plugin marketplace add DotHarness/dotcraft-claude-code
/plugin install dotcraft@dotcraft
/dotcraft:setup
```

The plugin's version is independent of DotCraft's.

## 5. Requirements And Setup

The plugin requires:

- Node.js 18.18 or later, reachable as `node`
- DotCraft with the Exec CLI contract, reachable as `dotcraft` on the shell PATH
- the Claude Code project folder set up as a DotCraft workspace, meaning it contains `.craft`
- a model provider configured in DotCraft; the first task reports it when none is
- for images, an image provider that supports image generation

The README and `/dotcraft:setup` both say that the project must be set up as a DotCraft workspace before the first delegation.

`/dotcraft:setup` runs `dotcraft-companion.mjs setup --json`. The report has one entry per check, in this order, and the command stops at the first gap with a concrete next step:

1. **Node.** The companion reports its Node version. If `node` itself is missing, the command fails before the companion runs, and Claude tells the user to install Node.js 18.18 or later.
2. **Binary.** `dotcraft --version`. If the command is missing, the companion looks for the binary bundled with DotCraft Desktop and reports its path when it exists:
   - Windows: `%LOCALAPPDATA%\Programs\DotCraft\resources\bin\dotcraft.exe`
   - macOS: `/Applications/DotCraft.app/Contents/Resources/bin/dotcraft`
   - Linux: `/opt/DotCraft/resources/bin/dotcraft`

   When the bundled binary exists, Claude asks once whether to add its folder to the user's PATH, with the options `Add to PATH (Recommended)` and `Skip`. Otherwise Claude points to DotCraft's installation instructions. When Desktop is installed, prefer its bundled binary over a separate CLI install, so that Desktop and exec use the same Hub binary.
3. **Workspace.** The current project contains `.craft`. If it does not, tell the user to open the folder in DotCraft Desktop, or to run `dotcraft setup` in it.

Setup does not inspect provider configuration, which may hold secrets. It never creates a workspace or edits DotCraft configuration.

## 6. Companion

`node "${CLAUDE_PLUGIN_ROOT}/scripts/dotcraft-companion.mjs" <subcommand> [options]`

Every subcommand accepts `--cwd <dir>` (default: the current directory) and `--json`. Without `--json`, it prints Markdown meant to be shown to the user. Failures print one line on stderr and exit `1`.

### 6.1 Running exec

The companion runs `dotcraft` with the workspace as its working directory:

```text
dotcraft exec --json [-m <model>] [-i <image>]... [--auto-approve] -
dotcraft exec resume <thread-id> --json [-m <model>] [-i <image>]... [--auto-approve] -
```

- The prompt always goes through stdin, so it is never subject to shell quoting.
- The companion reads the JSONL stream from stdout:
  - `thread.started` gives the thread id. The job record is updated with it at once.
  - `item.completed` drives progress lines, and the last `agent_message` is the final answer.
  - `image_generation` items with a `saved_path` are the generated images.
  - `turn.completed`, `turn.failed`, and `error` end the run.
- exec's stderr is appended to the job log.
- Outcome: exit `0` with `turn.completed` is `completed`. Anything else is `failed`, with the `turn.failed` or `error` message, or the last stderr line, as the error. A run ended by `cancel` is `cancelled` (§6.6).

### 6.2 Job store

Jobs are kept per workspace, under `${CLAUDE_PLUGIN_DATA}/state/<slug>-<hash>/`, where `<slug>` is the workspace folder name and `<hash>` is the first 16 hex digits of the SHA-256 of its real path. Without `CLAUDE_PLUGIN_DATA`, the root is `<os tmpdir>/dotcraft-companion`.

- `state.json` holds the job list, newest first, capped at 50 jobs. Dropping a job deletes its job file and log.
- `jobs/<job-id>.json` holds the full record, including the request and the final output.
- `jobs/<job-id>.log` holds timestamped progress lines.

A job record has:

| Field | Meaning |
|-------|---------|
| `id` | `task-<base36 time>-<random>` |
| `kind` | `task` or `image` |
| `title`, `summary` | `DotCraft Task`, `DotCraft Resume`, or `DotCraft Image`, and the shortened prompt |
| `status` | `queued`, `running`, `completed`, `failed`, or `cancelled` |
| `phase` | the latest progress phase, such as `starting`, `running`, `editing`, `done` |
| `sessionId` | the Claude Code session that started it, when known (§7) |
| `pid` | the companion process that runs exec, while it is active |
| `threadId` | DotCraft's thread, as soon as exec reports it |
| `request` | the arguments needed to run it, for a background worker |
| `result` | final answer, generated image paths, and thread id |
| `errorMessage` | why it failed or was cancelled |
| `createdAt`, `startedAt`, `completedAt`, `updatedAt` | ISO timestamps |

Reading a missing or corrupt `state.json` yields an empty store.

### 6.3 `task`

```text
task [--background] [--resume-last | --resume | --fresh] [--model <id>] [--image <file>]... [--auto-approve] [--kind image] [--prompt-file <file>] [prompt]
```

- The prompt is the positional text, `--prompt-file`, or piped stdin. A missing prompt is an error unless the task resumes, in which case the prompt is `Continue the previous task.`
- `--resume-last` (alias `--resume`) continues the thread of the newest finished task job of this session (§7). If a task job of this session is still active, it fails with `Task <id> is still running. Use /dotcraft:status before continuing it.` If no such job exists, it fails with `No previous DotCraft task thread was found for this session.` `--resume-last` with `--fresh` is an error.
- Foreground: the companion creates the job, runs it as `running` with its own pid, streams progress lines prefixed `[dotcraft]` to stderr, and prints the result on stdout when the run ends. Its exit code is `0` when the job completed and `1` otherwise.
- `--background`: the companion creates the job as `queued`, starts a detached `task-worker` for it, prints `DotCraft Task started in the background as <job-id>. Check /dotcraft:status <job-id> for progress.`, and exits `0`. The worker runs the stored request and records the outcome the same way. The plugin's commands do not use this flag, because Claude Code's own background tasks detach a run (§8.1). It exists for callers that cannot keep a process attached.

Result output:

```text
<DotCraft's final answer, or the failure message>

Generated image: <absolute path>
DotCraft thread: <thread-id>
Job: <job-id>
```

The image lines appear once per generated image, and the thread line only when a thread exists.

### 6.4 `status`

```text
status [<job-id>] [--wait [--timeout-ms <ms>]] [--all]
```

- Without a job id: the active jobs of this session as a table (id, kind, status, phase, elapsed, summary), each with its last few progress lines; then the latest finished job; then up to 8 recent jobs, or every job with `--all`.
- With a job id, which may be a unique prefix: that job's full record and its progress lines. `--wait` polls until the job is no longer active or the timeout passes (default 4 minutes), and says if it timed out.

### 6.5 `result`

```text
result [<job-id>]
```

Prints the stored result output (§6.3) of the given finished job, or of this session's newest finished job. An active job reports `Job <id> is still <status>. Check /dotcraft:status and try again once it finishes.`

### 6.6 `cancel`

```text
cancel [<job-id>]
```

- With a job id: that active job. Without one: the only active job of this session. Several active jobs report `Multiple DotCraft jobs are active. Pass a job id to /dotcraft:cancel.`, and none reports `No active DotCraft job to cancel.`
- When the job has a thread id, the companion runs `dotcraft exec interrupt <thread-id>` first. DotCraft's Hub keeps a Turn running after exec dies, so killing exec alone would not stop the work.
- It then terminates the job's process tree: `taskkill /PID <pid> /T /F` on Windows, `SIGTERM` to the process group elsewhere. A process that no longer exists is not an error.
- The job becomes `cancelled` with `Cancelled by user.`, and the output names the job and whether the DotCraft turn was interrupted.

This works for a job whose companion process is already gone, for example after the user stopped the Claude Code background task that ran it: the job is still `running` in the store, and the interrupt still reaches the thread.

### 6.7 `task-resume-candidate`

Reports, as JSON, whether this session has a finished task job with a thread id: `{ available, sessionId, candidate: { id, status, title, summary, threadId, completedAt } | null }`.

### 6.8 `setup`

Runs the checks in §5 and reports `{ ready, node, dotcraft: { available, version, path, bundledPath }, workspace: { root, hasCraft }, nextSteps }`.

## 7. Session Hooks

`hooks/hooks.json` registers `session-lifecycle-hook.mjs` for `SessionStart` and `SessionEnd`, each with a 5-second timeout.

- **SessionStart** appends `DOTCRAFT_COMPANION_SESSION_ID=<session_id>` and `CLAUDE_PLUGIN_DATA` to `CLAUDE_ENV_FILE`, so every later companion call in the session knows its session.
- **SessionEnd**, for each job of the ending session that is still active, interrupts its thread and terminates its process tree, as `cancel` does. It then removes that session's jobs from the store.
- A job records the session id from the environment when it is created. Session-scoped lookups (`status` without an id, `result` without an id, `cancel` without an id, `--resume-last`, `task-resume-candidate`) consider only jobs of the current session. Without a session id, they consider every job in the workspace.

## 8. Components

### 8.1 `/dotcraft:task`

```text
/dotcraft:task [--background | --wait] [--resume | --fresh] [--model <id>] [--auto-approve] <task>
```

Allowed tools: `Bash(node:*)`, `AskUserQuestion`, `Agent`.

- Hands the request to the `dotcraft:dotcraft-delegate` subagent and returns its output verbatim, labeled as DotCraft's answer.
- `--background` runs the subagent in the background, and Claude Code notifies the session when it finishes. `--wait` or neither runs it in the foreground. These flags are not forwarded.
- With neither `--resume` nor `--fresh`, the command first runs `task-resume-candidate --json`. When a candidate exists, it asks once with `AskUserQuestion`: `Continue current DotCraft thread` or `Start a new DotCraft thread`. The continue option goes first, marked `(Recommended)`, when the request plainly continues earlier work, such as "continue", "keep going", or "apply that fix". Otherwise the new-thread option goes first. The answer becomes `--resume` or `--fresh`.
- `--model`, `--auto-approve`, `--resume`, and `--fresh` are forwarded. On a resumed thread, `--model` and `--auto-approve` change that thread's settings from this task on.
- If no task text remains, ask the user what DotCraft should do.

### 8.2 `/dotcraft:image`

```text
/dotcraft:image [--ref <file>]... <description>
```

Allowed tools: `Bash(node:*)`, `Read`.

- Runs in the main conversation, so Claude can look at the result. It makes one `task --kind image` call, passing each `--ref` as `--image`, with a prompt asking DotCraft to generate the image with its image generation tool.
- Claude reads every `Generated image:` path from the output, views each image with the Read tool, and reports the path.
- The file stays where DotCraft saved it, under the workspace's `.craft` folder. Claude copies it elsewhere only when the user names a destination.
- On failure, Claude reports DotCraft's error and does not try to produce the image another way.

### 8.3 `/dotcraft:status`, `/dotcraft:result`, `/dotcraft:cancel`

Each runs its companion subcommand directly with the command's arguments, through a `!` shell line, and sets `disable-model-invocation: true`.

- `status` without a job id is rendered as one compact Markdown table. With a job id, the full output is shown.
- `result` shows the full output without condensing it.
- `cancel` shows the output. Its description states that stopping a Claude Code background task does not stop DotCraft's work, and that this command does.

### 8.4 `/dotcraft:setup`

Runs `setup --json`, handles the PATH question in §5, reruns setup after a change, and presents the final report.

### 8.5 Subagent `dotcraft-delegate`

- Tools: `Bash` only. It preloads the `dotcraft-runtime` skill and runs on Opus.
- **Description.** Use it when the user asks DotCraft, or a model DotCraft provides, to do a task, or wants another model's attempt at a substantial, self-contained task. Do not use it for work Claude can finish quickly itself.
- **Behavior.** It is a forwarder:
  - It makes exactly one Bash call: `node "${CLAUDE_PLUGIN_ROOT}/scripts/dotcraft-companion.mjs" task ...`, with the longest allowed timeout and the prompt passed through stdin.
  - `--resume` becomes `--resume-last`. `--fresh` adds nothing. With neither, a plain continuation request such as "continue" or "apply that fix" adds `--resume-last`.
  - `--model` and `--auto-approve` are passed only when the request includes them, and are not part of the task text.
  - It keeps the user's task text as it is, apart from removing the routing flags.
  - It returns the companion's stdout unchanged. It does not read the repository, plan, solve the task, poll, call `status`, `result`, or `cancel`, or summarize.
  - If the call fails, it returns nothing.

### 8.6 Skill `dotcraft-runtime`

`user-invocable: false`. The calling contract for the subagent: the `task` command line, routing-flag handling, prompt through stdin, one call per handoff, and the forwarding rules in §8.5.

### 8.7 Skill `dotcraft-result-handling`

`user-invocable: false`. How the main conversation presents companion output:

- Present DotCraft's answer as DotCraft's, not as Claude's, and keep the thread and job ids.
- Report every generated image path exactly as given.
- If the run failed, report the most useful error lines and stop. Do not redo a failed task yourself unless the user asks, and do not produce a substitute answer when DotCraft never ran.
- When setup is needed, send the user to `/dotcraft:setup`.

## 9. Behavioral Contract

- **Working directory.** The companion runs `dotcraft` in the Claude Code project, which must be the DotCraft workspace. Files DotCraft edits are therefore inside the project, and the Exec CLI keeps other access behind approval.
- **Approvals.** Approval outcomes follow the thread's approval policy, which for a new exec thread is the workspace's default. The plugin adds `--auto-approve` only when the user passes it, or explicitly asks for unattended full access.
- **Long tasks.** A foreground delegation is bounded by Claude Code's shell timeout. For long tasks, the subagent's description and `/dotcraft:task` recommend `--background`.
- **Concurrency.** A thread runs one task at a time. `--resume-last` refuses while a task of this session is still active. Resuming a thread that another client is running reports the conflict from exec.
- **Data flow.** Only the user's task text, reference images, and the files DotCraft reads in the project leave Claude Code. The plugin never sends Claude's conversation history.

## 10. Tests

`tests/*.test.mjs` run with `node --test`. They put a fake `dotcraft` on `PATH` that replays scripted JSONL and records its arguments, and cover:

- argument building for new, resumed, model, image, and auto-approve runs
- outcome mapping for completed, failed, and error streams, including generated image paths
- job store: ids, newest-first order, the 50-job cap, and corrupt `state.json`
- session scoping for `status`, `result`, `cancel`, and `--resume-last`
- `cancel` interrupting the recorded thread and terminating the process tree, including when the process is already gone
- `SessionStart` writing the environment file and `SessionEnd` cleaning up only its own session

## 11. Acceptance Checklist

- [ ] The marketplace installs with the commands in §4, and `/dotcraft:setup` reports each failure case in §5 correctly: missing Node, missing binary, Desktop-only install, and a project without `.craft`.
- [ ] `/dotcraft:task` returns DotCraft's answer, the thread id, and the job id, both in the foreground and with `--background`.
- [ ] `/dotcraft:task` asks once whether to continue when this session has an earlier thread. `--resume` continues it, and `--fresh` starts a new one.
- [ ] `--model` runs the task on the requested model.
- [ ] `/dotcraft:image` returns a viewable image file, both with and without `--ref`.
- [ ] `/dotcraft:status` lists a running background task, and `/dotcraft:result` shows it once it finishes.
- [ ] `/dotcraft:cancel` stops a running background task in DotCraft, also after its Claude Code background task was stopped.
- [ ] Ending the Claude Code session stops its running DotCraft tasks.
- [ ] Claude delegates through the subagent when the user asks for DotCraft without a command.
- [ ] The task thread is visible in DotCraft Desktop and continues there.

## 12. Open Questions

- The Desktop bundled-binary paths in §5 are the packager's defaults and have not been checked against real installs on each OS.
- Delegations longer than Claude Code's shell timeout. Verify whether a background subagent's shell call can outlive the foreground limit.
