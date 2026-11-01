# 本地编辑界面

本层是应用核心产出，负责文稿整理、编辑、AI 审阅及同步交互，通过原生桥接使用本地存储和网络能力。

上层背景与入口：[应用工程](../README.md)。

## 内容与入口

| 位置 | 用途与关系 |
| --- | --- |
| [main.tsx](main.tsx) | 本地页面启动与应用组织 |
| [Editor.tsx](Editor.tsx) | 富文本和 Markdown 编辑 |
| [DocumentWorkspace.tsx](DocumentWorkspace.tsx) | 文稿标签、左右对照与工作区 |
| [LibraryTree.tsx](LibraryTree.tsx) | 文稿树与层级操作 |
| [SyncManager.tsx](SyncManager.tsx)、[sync.ts](sync.ts) | 文件夹和文稿同步状态、范围与批量操作 |
| [ListNumbering.ts](ListNumbering.ts)、[lists.ts](lists.ts) | 编辑器与 Markdown 预览的层级编号 |
| [SearchDialog.tsx](SearchDialog.tsx)、[LibrarySearch.tsx](LibrarySearch.tsx) | 全局检索与标签筛选 |
| [AppSettings.tsx](AppSettings.tsx)、[appearance.tsx](appearance.tsx) | 分类设置、配色与阅读偏好 |
| [refined.css](refined.css)、[appearance.css](appearance.css) | 已确认的工作区布局与八种外观组合 |
| [AIAssistant.tsx](AIAssistant.tsx) | AI 配置管理、快速切换与当前文章的 AI 交互 |
| [AIReview.tsx](AIReview.tsx) | 建议预览与接受流程 |
| [model.ts](model.ts) | 文稿模型、格式与同步事实 |
| [tree.ts](tree.ts) | 树结构操作 |
| [workspace.ts](workspace.ts) | 标签与分栏状态 |
| [bridge.ts](bridge.ts) | 与原生外壳的调用边界 |

## 使用与维护

当前使用 style.css、navigation.css 的功能布局，以及 motion.css、appearance.css、refined.css；旧 desk.css / ink.css 保留历史内容，已不加载。brand-logo.svg 沿用原标识。构建命令从应用工程 `app/` 目录执行；数据与网络契约见 [原生说明](../native/README.md)。通用文件的背景由本地图统一说明。
