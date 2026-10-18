---
description: Hand a task to DotCraft and get its answer back
argument-hint: "[--background] [--resume | --fresh] [--model <id>] [--auto-approve] <task>"
allowed-tools: Agent
---

Hand this request to the `dotcraft:dotcraft-delegate` subagent with the Agent tool and show its output to the user unchanged, labeled as DotCraft's answer.

Request:
$ARGUMENTS

Routing:

- `--background` runs the subagent in the background. Otherwise run it in the foreground. Do not forward this flag.
- `--resume` continues the thread of the most recent DotCraft result in this conversation: tell the subagent that thread id. If this conversation has no DotCraft result yet, tell the subagent to use `--last` and name the thread it continued in your reply.
- `--fresh` always starts a new thread. With neither `--resume` nor `--fresh`, start a new thread unless the request plainly continues the previous DotCraft task, such as "continue" or "apply that fix".
- Forward `--model` and `--auto-approve` as they are.
- If no task text remains, ask the user what DotCraft should do.

If DotCraft reports that the project is not a DotCraft workspace, or that `dotcraft` is missing, tell the user to run `/dotcraft:setup`.
