---
name: dotcraft-exec
description: Run a task or generate an image through DotCraft with the `dotcraft exec` CLI. Use when the user asks DotCraft, or a model configured in DotCraft, to do something, or wants an image generated with DotCraft.
allowed-tools: Bash(dotcraft:*)
---

# DotCraft exec

`dotcraft exec` hands one task to DotCraft in the current project and prints the result. DotCraft runs it in its own thread with its own configured model and tools. The thread is visible in DotCraft Desktop.

The project must be a DotCraft workspace (it contains `.craft`). If the command reports `DotCraft workspace not found`, tell the user to run `/dotcraft:setup` and stop.

## Commands

```bash
dotcraft exec [-m <model>] [-i <image>]... [--auto-approve] "<task>"
dotcraft exec resume <thread-id> [-m <model>] [-i <image>]... "<follow-up>"
dotcraft exec interrupt [<thread-id>]
```

- Pass long task text through stdin instead of an argument: `dotcraft exec - <<'EOF' ... EOF`.
- `-m` picks a model on DotCraft's default provider. Pass it only when the user names a model.
- `-i` attaches a local image. Repeat it for several images.
- Operations that need approval follow the workspace's default approval policy in DotCraft: they run when it approves automatically, and are refused otherwise while the task keeps going. `--auto-approve` makes them run regardless. Use it only when the user asks for it.
- `interrupt` without a thread id stops the only exec task running in the workspace, and lists their ids when several are running.
- `resume` continues an existing thread. Use the thread id from an earlier DotCraft result in this conversation. `resume --last` picks the workspace's most recently active thread from any client, so use it only when the user asks for that.

Run the command with the Bash tool's longest timeout. A task can take many minutes.

## Reading the result

- stdout holds DotCraft's final answer, and only when the task completed.
- stderr holds `[CLI] Thread: <id>`, progress, `[CLI] Generated image: <path>` for each image, and the failure reason.
- Exit code `0` means the task completed. `1` means it failed, was cancelled, or could not run. `2` means the command was used incorrectly.

## Presenting the result

- Present DotCraft's answer as DotCraft's, not as your own, and include the thread id so the user can continue it.
- Report every generated image path. Generated images stay under the project's `.craft` folder; copy one elsewhere only when the user names a destination.
- If the task failed, report DotCraft's error and stop. Do not redo the task yourself unless the user asks.
