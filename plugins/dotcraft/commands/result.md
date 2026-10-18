---
description: Show the answer of a finished DotCraft task
argument-hint: "[<job-id>]"
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/dotcraft-companion.mjs" result "$ARGUMENTS"`

Show the full output to the user. Do not summarize or condense it. Keep every generated image path, the DotCraft thread, and the job id exactly as printed.
