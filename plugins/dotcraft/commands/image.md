---
description: Generate an image with DotCraft
argument-hint: "[--ref <file>]... <description>"
allowed-tools: Bash(dotcraft:*), Read
---

Generate an image with DotCraft for this request:

$ARGUMENTS

1. Run one command with the Bash tool's longest timeout, passing each `--ref` file as `-i`:

   ```bash
   dotcraft exec [-i <ref>]... "Generate an image with your image generation tool: <description>"
   ```

2. Read every `[CLI] Generated image: <path>` line from the output and look at each image with the Read tool.
3. Tell the user what was generated and give each path. The files stay where DotCraft saved them. Copy one elsewhere only if the user named a destination.

If the command fails, report DotCraft's error and stop. Do not try to produce the image another way. If DotCraft reports that the project is not a DotCraft workspace, or that `dotcraft` is missing, tell the user to run `/dotcraft:setup`.
