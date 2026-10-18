---
description: Stop a DotCraft task that is still running. Stopping a Claude Code background task does not stop DotCraft's work. This command does.
argument-hint: "[<job-id>]"
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/dotcraft-companion.mjs" cancel "$ARGUMENTS"`

Show the output to the user.
