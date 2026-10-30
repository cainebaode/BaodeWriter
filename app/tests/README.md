# 模型验证代码

本层为核心编辑和组织能力提供验证依据；TypeScript 测试、原生自测与真实界面或服务验收各有范围。

上层背景与入口：[应用工程](../README.md)。

## 内容与入口

| 位置 | 用途与关系 |
| --- | --- |
| [ai.test.ts](ai.test.ts) | AI 提案与写入边界 |
| [article.test.ts](article.test.ts) | 文章生成、解析和接受 |
| [model.test.ts](model.test.ts) | 文稿、媒体与日期模型 |
| [trash.test.ts](trash.test.ts) | 删除与恢复 |
| [tree.test.ts](tree.test.ts) | 父子结构与移动 |
| [workspace.test.ts](workspace.test.ts) | 标签和分栏 |
| [writing.test.ts](writing.test.ts) | 持续写作及局部改写 |

## 使用与维护

从应用工程 `app/` 目录执行 npm test。原生测试在 native/ 维护；模拟服务和单元测试不代表真实模型质量或用户体验已验收。
