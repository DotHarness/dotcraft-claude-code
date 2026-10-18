---
description: Stop a DotCraft task that is still running. Stopping a Claude Code background task does not stop DotCraft; this does.
argument-hint: "[<thread-id>]"
allowed-tools: Bash(dotcraft:*)
---

Stop DotCraft's running task.

Thread: $ARGUMENTS

Use the thread id above. If it is empty, use the thread of the most recent DotCraft task in this conversation. If there is none, ask the user for the thread id. Never use `--last`: it could stop a thread that someone is running in DotCraft Desktop.

Run:

```bash
dotcraft exec interrupt <thread-id>
```

Report what the command printed.
