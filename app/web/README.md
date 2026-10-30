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
| [LibrarySearch.tsx](LibrarySearch.tsx) | 检索入口 |
| [AIAssistant.tsx](AIAssistant.tsx) | 当前文章的 AI 交互 |
| [AIReview.tsx](AIReview.tsx) | 建议预览与接受流程 |
| [model.ts](model.ts) | 文稿模型、格式与同步事实 |
| [tree.ts](tree.ts) | 树结构操作 |
| [workspace.ts](workspace.ts) | 标签与分栏状态 |
| [bridge.ts](bridge.ts) | 与原生外壳的调用边界 |

## 使用与维护

样式文件与 brand-logo.svg 配合现有界面使用。构建命令从应用工程 `app/` 目录执行；数据与网络契约见 [原生说明](../native/README.md)。通用文件的背景由本地图统一说明。
