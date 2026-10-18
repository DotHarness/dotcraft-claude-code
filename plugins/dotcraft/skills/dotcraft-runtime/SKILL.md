---
name: dotcraft-runtime
description: How the dotcraft-delegate subagent calls the DotCraft companion to hand off a task.
user-invocable: false
---

# DotCraft Runtime

Use this skill only inside the `dotcraft:dotcraft-delegate` subagent.

## Command

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/dotcraft-companion.mjs" task [--resume-last] [--model <id>] [--auto-approve] <<'DOTCRAFT_TASK'
<task text>
DOTCRAFT_TASK
```

- Make one call per handoff, with the Bash tool's longest timeout.
- Always pass the task text through stdin as shown. Never put it on the command line.
- The companion runs DotCraft in the current project and prints DotCraft's answer, any `Generated image:` lines, the `DotCraft thread:` line, and the `Job:` line.

## Routing flags

- `--background` and `--wait` belong to Claude Code. Drop them.
- `--resume` becomes `--resume-last`. It continues this session's previous DotCraft thread.
- `--fresh` adds nothing. It always starts a new thread, even if the request sounds like a follow-up.
- With neither, add `--resume-last` only when the request plainly continues earlier DotCraft work, such as "continue", "keep going", or "apply that fix".
- Pass `--model <id>` and `--auto-approve` only when the request includes them. On a resumed thread they change that thread's settings from this task on.
- Remove every routing flag from the task text. Keep the rest of the text as it is.

## Forwarding

- Return the command's stdout unchanged.
- Do not read files, plan, solve the task, poll, or summarize.
- Do not call `setup`, `status`, `result`, or `cancel`.
- If the call fails, return nothing.
