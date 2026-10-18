---
description: Generate an image with DotCraft
argument-hint: "[--ref <file>]... <description>"
allowed-tools: Bash(node:*), Read
---

Generate an image with DotCraft for this request:

$ARGUMENTS

1. Run one command with the Bash tool's longest timeout. Pass each `--ref` file as `--image`, and put the description in the prompt:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/dotcraft-companion.mjs" task --kind image [--image <ref>]... <<'DOTCRAFT_PROMPT'
   Generate an image with your image generation tool: <description>
   DOTCRAFT_PROMPT
   ```

2. Read every `Generated image: <path>` line from the output and look at each image with the Read tool.
3. Tell the user what DotCraft generated and give each path. The files stay where DotCraft saved them, under the project's `.craft` folder. Copy one elsewhere only if the user named a destination.

If the command fails, report DotCraft's error and stop. Do not try to produce the image another way. If DotCraft is missing or the project is not a DotCraft workspace, tell the user to run `/dotcraft:setup`.
