<div align="center">

![DotCraft for Claude Code](https://github.com/DotHarness/resources/raw/master/dotcraft-claude-code/banner.png)

[English](./README.md) · [DotCraft](https://github.com/DotHarness/dotcraft) · [License](./LICENSE)

在 Claude Code 里把任务交给 DotCraft，结果回到同一个对话。

</div>

## 能做什么

Claude 可以请 DotCraft 用你在 DotCraft 里配置的任意模型（比如 GPT 模型）完成一项任务，或者生成一张图片。DotCraft 的回答、改过的文件和生成的图片都会回到 Claude 手里。任务是一个普通的 DotCraft 线程，你可以在 DotCraft Desktop 里查看进度或接着聊。

需要 Node.js 18.18 或更高版本，还要安装 DotCraft，并且 `dotcraft` 命令在 PATH 上。项目文件夹要先设为 DotCraft 工作区：用 DotCraft Desktop 打开一次这个文件夹，或者在里面运行 `dotcraft setup`。

## 安装

```text
/plugin marketplace add DotHarness/dotcraft-claude-code
/plugin install dotcraft@dotcraft
/dotcraft:setup
```

## 使用

```text
/dotcraft:task --model gpt-6.1-sol 找出登录测试不稳定的原因
/dotcraft:image 一个挥手的机器人吉祥物，扁平插画风格
```

也可以直接说：“让 DotCraft 起草迁移脚本。”

| 命令 | 作用 |
|------|------|
| `/dotcraft:task` | 把任务交给 DotCraft 并拿回回答。长任务加 `--background`，接着上一个任务做加 `--resume`。 |
| `/dotcraft:image` | 生成图片，可以用 `--ref` 带上参考图。 |
| `/dotcraft:status` | 查看 DotCraft 正在做什么。 |
| `/dotcraft:result` | 查看已完成任务的回答。 |
| `/dotcraft:cancel` | 停止还在运行的任务。 |
| `/dotcraft:setup` | 检查 DotCraft 在这个项目里是否就绪。 |

## 许可证

[Apache-2.0](./LICENSE)
