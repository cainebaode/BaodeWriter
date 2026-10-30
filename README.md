# 饱得写作 · BaodeWriter

独立 macOS 写作应用及产品官网。先在本机写作和整理，再由用户主动选择同步到 baode.life；AI 建议经审阅接受后写入原文。

核心原则：本地优先、格式兼容、明确同步、审阅后修改，以及可恢复的数据。

| 内容 | 入口 |
| --- | --- |
| 应用源码、使用说明、测试与构建 | [app/](app/README.md) |
| 产品官网、帮助与隐私页 | [site/](site/README.md) |
| 内部背景、当前进度、调研与交付依据 | 本地 `docs/README.md`；该目录不随公开源码提供 |
| 旧基线、回退应用与文稿快照 | 本地 `.local-backups/README.md` |
| 协作约定 | [AGENTS.md](AGENTS.md) |

## 开始开发

```sh
cd app
npm ci
npm run build
```

源码版本由 [package.json](app/package.json) 和 [Info.plist](app/native/Info.plist) 维护。安装包在 `app/dist/`；对外发布状态另按发布记录核对。

本站只维护客户端和官网。登录、上传及 `/api/desktop` 服务端由同级 BaodeLife 项目负责；真实文稿继续保存在 `~/Library/Application Support/BaodeWriter/`。

依赖许可见 [LICENSES.md](app/LICENSES.md) 与 [第三方声明](app/THIRD-PARTY-NOTICES.md)。`SOURCE-PROVENANCE.json` 记录本地源码路径与校验；GitHub 同步、安装包发布和服务器部署分别执行。
