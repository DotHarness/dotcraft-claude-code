---
name: dotcraft-result-handling
description: How to present DotCraft companion output to the user.
user-invocable: false
---

# DotCraft Result Handling

When the companion returns DotCraft output:

- Present DotCraft's answer as DotCraft's, not as your own.
- Keep the `DotCraft thread:` and `Job:` lines, so the user can continue the thread or look the job up.
- Report every `Generated image:` path exactly as given.
- If the run failed, report the most useful error lines and stop.
- Do not redo a failed task yourself unless the user asks.
- If DotCraft never ran, do not produce a substitute answer.
- If DotCraft is missing or the project is not a DotCraft workspace, send the user to `/dotcraft:setup`.
