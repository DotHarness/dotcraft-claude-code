---
description: Stop a DotCraft task that is still running. Stopping a Claude Code background task does not stop DotCraft; this does.
argument-hint: "[<thread-id>]"
allowed-tools: Bash(dotcraft:*)
---

Stop DotCraft's running task.

Thread: $ARGUMENTS

Run `dotcraft exec interrupt` with the thread id above, or with no argument when it is empty:

```bash
dotcraft exec interrupt [<thread-id>]
```

Without a thread id, DotCraft stops the only exec task running in this workspace. If several are running, it lists their ids; ask the user which one to stop, then run the command again with that id.

Report what the command printed.
