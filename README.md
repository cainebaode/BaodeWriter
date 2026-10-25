# 饱得写作 · BaodeWriter

把生活，慢慢写下来。

一个留在 Mac 上的写作角落。记一点日常，写一篇长文，把想法慢慢整理。断网也能写，准备好了再分享。

**[产品介绍](https://writer.baode.life/)** · **[下载 Mac 版](https://github.com/cainebaode/BaodeWriter/releases/tag/v0.1.0)** · [使用帮助](https://writer.baode.life/help/) · [隐私说明](https://writer.baode.life/privacy/)

![饱得写作实际界面，文稿均为演示内容](assets/writing.png)

## 可以做什么

- 本地优先的写作、图片保存与离线使用。
- 文件夹、标签、搜索、记录日期及修改时间管理。
- 分级文章目录、点击跳转、专注模式，可调宽和隐藏的分栏。
- 原始文稿与图片备份、恢复前安全副本。
- 主动选择后同步文章及图片，失败重试、重复同步不重建，冲突保留双方。

首版的网站同步对接作者的 baode.life，需要该站管理员权限。暂不支持任意博客；本地写作和备份不需要账号。

## 安装

要求 macOS 13 或更新版本。Universal 安装包包含 Apple Silicon 和 Intel 架构；实际运行验证使用 Apple Silicon，Intel 已完成编译与架构检查。

1. 在 Releases 下载 DMG，打开并把「饱得写作」拖到「应用程序」。
2. 当前为个人使用预览版，采用本地签名，尚未经过 Apple 公证。首次启动可能被 macOS 阻止，请先阅读[安装帮助](https://writer.baode.life/help/#install)及其中的 Apple 官方说明。
3. 新建文稿，看到「已保存到本机」即可关闭。更新前退出应用，再覆盖安装；数据独立于应用包保存。

公开资产附 SHA-256 校验文件。当前手动下载更新，没有自动更新服务。

## 使用与反馈

完整说明见[使用帮助](https://writer.baode.life/help/)。请在 Issues 附版本、macOS 版本和复现步骤，不要上传私人文稿、备份、密码或登录信息。

## 仓库范围与第三方许可

本仓库用于产品说明和安装包分发，应用自有源码暂未公开，不代表采用了开源许可。

第三方组件遵循各自许可证。安装包的 `Contents/Resources/licenses/` 包含完整声明及 BlockNote 0.31.3 受 MPL 覆盖的对应源码。Releases 同时提供 `Third-Party-Licenses-0.1.0.tar.gz`，无需安装应用即可获取。未采用 BlockNote XL。详情见 [LICENSES.md](LICENSES.md) 与 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
