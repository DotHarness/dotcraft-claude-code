---
description: Check that DotCraft is ready to take tasks in this project
allowed-tools: Bash, AskUserQuestion
---

Check these in order. Stop at the first problem and tell the user the next step.

1. **DotCraft CLI.** Run `dotcraft --version`. If the command is not found, look for the binary that DotCraft Desktop bundles:
   - Windows: `%LOCALAPPDATA%\Programs\DotCraft\resources\bin\dotcraft.exe`
   - macOS: `/Applications/DotCraft.app/Contents/Resources/bin/dotcraft`
   - Linux: `/opt/DotCraft/resources/bin/dotcraft`

   If one exists, use AskUserQuestion once to ask whether to add its folder to the user's PATH. Options: `Add to PATH (Recommended)` and `Skip`. If the user agrees, add the folder to the user-level PATH, and tell them to restart Claude Code so the change applies. If no binary exists, point them to https://github.com/DotHarness/dotcraft to install DotCraft.
2. **Workspace.** Check that the current directory contains `.craft`. If it does not, tell the user to open this folder in DotCraft Desktop, or to run `dotcraft setup` here.

When everything passes, say that DotCraft is ready, and mention `/dotcraft:task` and `/dotcraft:image`. DotCraft uses the model provider configured in DotCraft. If none is configured, the first task reports it.

Never create the workspace or change DotCraft's configuration yourself.
