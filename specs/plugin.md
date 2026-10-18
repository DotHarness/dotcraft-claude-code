# DotCraft Plugin For Claude Code

| Field | Value |
|-------|-------|
| **Version** | 0.1.0 |
| **Status** | Draft |
| **Date** | 2026-10-18 |
| **Depends On** | DotCraft [Exec CLI](https://github.com/DotHarness/dotcraft/blob/main/specs/features/exec-cli.md) |

Purpose: let Claude Code hand work to DotCraft, either running a task on a model DotCraft has configured or generating an image, and receive the result in the same Claude Code session.

## 1. Overview

The plugin is a set of plain Claude Code plugin components: commands, one subagent, and one skill. All of them drive the `dotcraft` CLI through Claude Code's shell tool. It ships no MCP server, scripts, hooks, or binaries. Every capability it offers is a `dotcraft exec` invocation defined by the Exec CLI spec.

DotCraft does the work in its own thread. The thread is visible in DotCraft Desktop and can be continued from Claude Code or from Desktop.

## 2. Goals

- One command to delegate a task and get DotCraft's answer back.
- One command to generate an image, optionally from reference images, and get its file back.
- Let Claude delegate on its own when the user asks for DotCraft or for a model DotCraft provides.
- Continue the previous DotCraft thread when the user asks to.
- Run long tasks in the background and stop them.
- Tell the user exactly what is missing when DotCraft is not ready.

## 3. Non-Goals

- No MCP server or MCP tools.
- No code-review commands or stop-time review gates.
- No job store, status, or result commands. Claude Code's own background tasks cover this.
- No forwarding of the Claude Code transcript to DotCraft.
- No installing or updating DotCraft, and no bundled `dotcraft` binary.

## 4. Repository And Distribution

The plugin lives in its own repository, `DotHarness/dotcraft-claude-code`. It is published as a Claude Code marketplace named `dotcraft` that contains one plugin, also named `dotcraft`.

```text
.claude-plugin/marketplace.json
plugins/dotcraft/.claude-plugin/plugin.json
plugins/dotcraft/commands/task.md
plugins/dotcraft/commands/image.md
plugins/dotcraft/commands/cancel.md
plugins/dotcraft/commands/setup.md
plugins/dotcraft/agents/dotcraft-delegate.md
plugins/dotcraft/skills/dotcraft-exec/SKILL.md
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

- DotCraft with the Exec CLI contract, reachable as `dotcraft` on the shell PATH
- the Claude Code project folder set up as a DotCraft workspace, meaning it contains `.craft`
- a model provider configured in DotCraft; the first task reports it when none is
- for images, an image provider that supports image generation

The README and `/dotcraft:setup` both say that the project must be set up as a DotCraft workspace before the first delegation.

`/dotcraft:setup` checks these in order and stops at the first gap with a concrete next step:

1. **Binary.** Run `dotcraft --version`. If the command is missing, look for the binary bundled with DotCraft Desktop:
   - Windows: `%LOCALAPPDATA%\Programs\DotCraft\resources\bin\dotcraft.exe`
   - macOS: `/Applications/DotCraft.app/Contents/Resources/bin/dotcraft`
   - Linux: `/opt/DotCraft/resources/bin/dotcraft`

   If the bundled binary exists, ask once whether to add its folder to the user's PATH. Otherwise point to DotCraft's installation instructions. When Desktop is installed, prefer its bundled binary over a separate CLI install, so that Desktop and exec use the same Hub binary.
2. **Workspace.** Check that the current project contains `.craft`. If it does not, tell the user to open the folder in DotCraft Desktop, or to run `dotcraft setup` in it.

Setup does not inspect provider configuration, which may hold secrets.

Setup never creates a workspace or edits DotCraft configuration itself.

## 6. Components

### 6.1 `/dotcraft:task`

```text
/dotcraft:task [--background] [--resume | --fresh] [--model <id>] [--auto-approve] <task>
```

- Hands the task to the `dotcraft:dotcraft-delegate` subagent. It runs in the foreground by default; `--background` runs the subagent in the background, and Claude Code notifies the session when it finishes.
- `--resume` continues the thread of the most recent DotCraft result in this conversation, using `exec resume <thread-id>`. Only when the conversation has no DotCraft result yet does it fall back to `exec resume --last`. In that case it may continue a thread that another client was using, so the reply names the thread it continued.
- `--fresh` always starts a new thread. With neither flag, a new thread is started unless the request is plainly a continuation of the previous DotCraft task, such as "continue" or "apply that fix".
- `--model` and `--auto-approve` are passed to `dotcraft exec`. On a resumed thread, they change that thread's settings from this task on.
- The user-visible result is the subagent's output, labeled as DotCraft's answer, followed by the thread id for follow-ups.

### 6.2 `/dotcraft:image`

```text
/dotcraft:image [--ref <file>]... <description>
```

- Runs in the main conversation, so Claude can look at the result. It makes one `dotcraft exec` call with each `--ref` as `-i` and a prompt asking DotCraft to generate the image with its image generation tool.
- Claude reads every generated image path from the output, views the image with its file reader, and reports the path.
- The file stays where DotCraft saved it, under the workspace's `.craft` folder. Claude copies it elsewhere in the project only when the user names a destination.
- On failure, Claude reports DotCraft's error and does not try to produce the image another way.

### 6.3 `/dotcraft:cancel`

```text
/dotcraft:cancel [<thread-id>]
```

Runs `dotcraft exec interrupt` with the given thread. Without an argument, it runs `dotcraft exec interrupt` with no thread id, which stops the only exec task running in the workspace. A background task's thread id is only known when it finishes, so this is how a running background task is stopped. When several exec tasks are running, DotCraft lists their ids and Claude asks the user which one to stop. The command's description states that stopping a Claude Code background task does not stop DotCraft's work, and that this command does.

### 6.4 `/dotcraft:setup`

Runs the checks in §5 and reports the result. It takes no arguments.

### 6.5 Subagent `dotcraft-delegate`

- Tools: `Bash`, and `Read` for the output file of a command Claude Code moved to the background. It preloads the `dotcraft-exec` skill and runs on Opus.
- **Description.** Use it when the user asks DotCraft, or a model DotCraft provides, to do a task, or wants a second attempt from another model on a self-contained task. Do not use it for work Claude can finish quickly itself.
- **Behavior.** It is a forwarder:
  - It shapes the request into one `dotcraft exec` (or `exec resume`) call, makes that one Bash call with the longest allowed timeout, and returns the command output unchanged.
  - It does not read the repository, plan, solve the task, poll, or summarize.
  - If the call fails, it returns the error output and nothing else.

### 6.6 Skill `dotcraft-exec`

Claude can invoke this skill itself. It is also preloaded by the subagent. It grants `Bash(dotcraft:*)` and holds the calling contract:

- **Command forms.** Which `exec`, `exec resume`, and `exec interrupt` form to use, and how to pass long prompts through stdin.
- **Reading results.** The final answer is on stdout, and only when the task completed. The thread id, generated image paths, progress, and failure reasons are on stderr. Exit status `0` means the task completed.
- **Approvals.** Operations that need approval follow the workspace's default approval policy in DotCraft. Use `--auto-approve` only when the user asks for it.
- **Where work happens.** DotCraft works in the project, which must be a DotCraft workspace. When exec reports `DotCraft workspace not found`, send the user to `/dotcraft:setup` instead of retrying elsewhere. Generated images are saved under the project's `.craft` folder.
- **Rules.** Present DotCraft's output as DotCraft's, not as Claude's. Do not redo a failed DotCraft task unless the user asks.

## 7. Behavioral Contract

- **Working directory.** The plugin runs `dotcraft` in Claude Code's current directory, which must be the DotCraft workspace. Files DotCraft edits are therefore inside the project, and the Exec CLI keeps other access behind approval.
- **Approvals.** Approval outcomes follow the thread's approval policy, which for a new exec thread is the workspace's default. The plugin adds `--auto-approve` only when the user passes it, or explicitly asks for unattended full access.
- **Long tasks.** Foreground delegation is bounded by Claude Code's shell timeout. For tasks expected to run longer, the subagent's description and the `task` command recommend `--background`.
- **Concurrency.** A thread runs one task at a time. Resuming a thread that is still running reports the conflict. Claude then suggests waiting, `/dotcraft:cancel`, or `--fresh`.
- **Data flow.** Only the user's task text, reference images, and the files DotCraft reads in the project leave Claude Code. The plugin never sends Claude's conversation history.

## 8. Acceptance Checklist

- [ ] The marketplace installs with the commands in §4, and `/dotcraft:setup` reports each failure case in §5 correctly: missing binary, Desktop-only install, and a project without `.craft`.
- [ ] `/dotcraft:task` returns DotCraft's answer and the thread id, both in the foreground and with `--background`.
- [ ] `--resume` continues the previous thread, and `--fresh` starts a new one.
- [ ] `--model` runs the task on the requested model.
- [ ] `/dotcraft:image` returns a viewable image file, both with and without `--ref`.
- [ ] `/dotcraft:cancel` stops a running background task in DotCraft.
- [ ] Claude delegates through the subagent when the user asks for DotCraft without a command.
- [ ] The task thread is visible in DotCraft Desktop and continues there.

## 9. Open Questions

- The Desktop bundled-binary paths in §5 are the packager's defaults and have not been checked against real installs on each OS.
- Delegations longer than Claude Code's shell timeout. Verify whether a background subagent's shell call can outlive the foreground limit, or whether the skill must start `dotcraft exec` with background execution and wait for its completion notice.
