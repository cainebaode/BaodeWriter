# 构建与许可

本层将界面、原生程序与许可组合为 App 和 DMG。工程背景和完整命令见 [app 说明](../README.md)。

| 入口 | 职责 |
| --- | --- |
| [build-web.mjs](build-web.mjs) | 打包本地编辑页面 |
| [build-native.sh](build-native.sh) | 原生编译、自测、签名与 DMG |
| [licenses.mjs](licenses.mjs) | 核对实际打包依赖并归集许可 |
| [license-sources](license-sources/) | 固定许可正文与来源 |

命令在 `app/` 执行，版本来自工程配置；更换打包依赖须重新核对许可。
