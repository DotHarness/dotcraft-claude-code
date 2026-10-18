---
description: Hand a task to DotCraft and get its answer back
argument-hint: "[--background|--wait] [--resume|--fresh] [--model <id>] [--auto-approve] <task>"
allowed-tools: Bash(node:*), AskUserQuestion, Agent
---

Hand this request to the `dotcraft:dotcraft-delegate` subagent with the `Agent` tool (`subagent_type: "dotcraft:dotcraft-delegate"`). Show its output to the user verbatim, labeled as DotCraft's answer.

Request:
$ARGUMENTS

Running it:

- With `--background`, run the subagent in the background. Claude Code tells you when it finishes. Recommend this for long tasks.
- With `--wait` or neither flag, run it in the foreground.
- Do not forward `--background` or `--wait`, and do not treat them as task text.

Continuing a thread:

- With `--resume` or `--fresh`, do not ask. The user already chose.
- Otherwise, first run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/dotcraft-companion.mjs" task-resume-candidate --json
```

- If it reports `available: true`, ask once with `AskUserQuestion`. The two options are `Continue current DotCraft thread` and `Start a new DotCraft thread`.
- Put `Continue current DotCraft thread (Recommended)` first when the request plainly continues earlier work, such as "continue", "keep going", or "apply that fix". Otherwise put `Start a new DotCraft thread (Recommended)` first.
- Add `--resume` if the user chooses to continue, or `--fresh` for a new thread.
- If it reports `available: false`, do not ask.

Forwarding:

- Forward `--model`, `--auto-approve`, `--resume`, and `--fresh` as they are. Add `--auto-approve` only when the user passed it or asked for unattended full access.
- Do not ask the subagent to read files, check status, fetch results, cancel, or summarize.
- Do not paraphrase, summarize, or add commentary to DotCraft's output.
- If the output says DotCraft is missing or the project is not a DotCraft workspace, tell the user to run `/dotcraft:setup`.
- If no task text remains, ask the user what DotCraft should do.
