<div align="center">

![DotCraft for Claude Code](https://github.com/DotHarness/resources/raw/master/dotcraft-claude-code/banner.png)

[中文](./README_ZH.md) · [DotCraft](https://github.com/DotHarness/dotcraft) · [License](./LICENSE)

Hand tasks to DotCraft from Claude Code and get the results back in the same conversation.

</div>

## What it does

Claude can ask DotCraft to take on a task with any model you have set up in DotCraft, such as a GPT model, or to generate an image. The answer, the files DotCraft changed, and the generated images come back to Claude. The task runs as an ordinary DotCraft thread, so you can follow it or continue it in DotCraft Desktop.

Requires DotCraft with the `dotcraft` command on your PATH, and the project folder set up as a DotCraft workspace. Open the folder in DotCraft Desktop once, or run `dotcraft setup` in it.

## Install

```text
/plugin marketplace add DotHarness/dotcraft-claude-code
/plugin install dotcraft@dotcraft
/dotcraft:setup
```

## Use it

```text
/dotcraft:task --model gpt-6.1-sol Find why the login test is flaky
/dotcraft:image A robot mascot waving, flat illustration
```

Or just ask: "Have DotCraft draft the migration script."

## License

[Apache-2.0](./LICENSE)
