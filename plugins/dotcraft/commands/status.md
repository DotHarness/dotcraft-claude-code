---
description: Show running and recent DotCraft tasks in this project
argument-hint: "[<job-id>] [--wait] [--timeout-ms <ms>] [--all]"
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/dotcraft-companion.mjs" status "$ARGUMENTS"`

If the user did not pass a job id:

- Show the output as one compact Markdown table of this session's jobs.
- Keep the job id, kind, status, phase, elapsed time, summary, DotCraft thread, and follow-up commands.
- Leave out the progress lines and any other prose.

If the user passed a job id, show the full output without condensing it.
