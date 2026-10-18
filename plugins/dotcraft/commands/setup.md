---
description: Check that DotCraft is ready to take tasks in this project
allowed-tools: Bash, AskUserQuestion
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/dotcraft-companion.mjs" setup --json
```

If `node` itself is not found, tell the user to install Node.js 18.18 or later and stop.

Go through the report in this order and stop at the first problem:

1. **Node.** If `nextSteps` asks for a newer Node.js, tell the user to install Node.js 18.18 or later.
2. **DotCraft.** If `dotcraft.available` is false:
   - If `dotcraft.bundledPath` is set, DotCraft Desktop is installed. Ask once with `AskUserQuestion` whether to add the folder of `bundledPath` to the user's PATH. The options are `Add to PATH (Recommended)` and `Skip`. If the user agrees, add the folder to the user-level PATH, rerun setup, and tell the user to restart Claude Code so the change applies.
   - Otherwise, point the user to https://github.com/DotHarness/dotcraft to install DotCraft.
3. **Workspace.** If `workspace.hasCraft` is false, tell the user to open this folder in DotCraft Desktop, or to run `dotcraft setup` in it.

Present the final report to the user. When `ready` is true, say that DotCraft is ready, and mention `/dotcraft:task` and `/dotcraft:image`. DotCraft uses the model provider configured in DotCraft. If none is configured, the first task reports it.

Never create the workspace or change DotCraft's configuration yourself.
