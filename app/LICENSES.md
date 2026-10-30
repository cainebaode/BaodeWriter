# 开源依赖与商业化边界

核对日期：2026-10-25。适用于本目录锁文件及本次构建产物；升级依赖后重新运行审核。

## 本次采用的许可

- 本应用自己的源码未因依赖引入而整体改用某一开源许可证；其发布授权由项目所有者决定。
- `@blocknote/core`、`@blocknote/react`、`@blocknote/mantine` 固定为 **0.31.3 / MPL-2.0**，使用原包，未修改其源码。MPL 允许商业使用；分发时必须保留许可并提供受 MPL 覆盖的源码。独立应用代码不因此自动变成 MPL。若以后直接修改这些文件，修改后的对应文件仍需按 MPL 提供。
- 未引入 BlockNote XL 或其 GPL / 商业双许可扩展，没有使用其 AI、Word/PDF 导出等付费组件。以后添加这些能力必须重新检查具体包，而不能沿用本次结论。
- 当前实际输出中的其余直接代码包为 MIT、ISC 或 BSD-2-Clause；上游预打包代码另列。原始版权、许可文本及可见 NOTICE 一起提供。保留声明后可用于商业产品；这些许可证不授予第三方商标、产品名称或品牌素材的使用权。
- 编辑器通用图标来自 react-icons 5.5.0 中实际出现的 Remix、Material Design、Ant Design、Heroicons、Tabler 五套图标；按该版本锁定的上游提交分别保留 Apache-2.0 / MIT 原文，没有采用其他写作应用的名称、图标或宣传图作为本应用品牌。不能仅用 react-icons 的 MIT 包装器概括图标许可。
- 界面使用系统字体。为完整提供未修改的 BlockNote npm 源码归档，归档中保留其原有 Inter 字体，同时附 SIL OFL 1.1 原文；不得将字体单独出售或将保留名称用于修改版字体。

## 如何获得声明和 MPL 源码

安装后的应用：在 Finder 中选择“显示包内容”，进入 `Contents/Resources/licenses/`。查看 `THIRD-PARTY-NOTICES.md`、`inventory.json`、`packages/`、`embedded/`、`assets/`。

`sources/` 提供上述三个 BlockNote 0.31.3 完整已安装 npm 包的 `.tar.gz`（包含 `src`、类型、发布文件及原许可，排除嵌套 `node_modules`）。归档摘要和来源写在清单中。源码工程内对应 `build/licenses/`。

原始来源：[BlockNote v0.31.3](https://github.com/TypeCellOS/BlockNote/tree/v0.31.3)、[core npm 源包](https://registry.npmjs.org/@blocknote/core/-/core-0.31.3.tgz)、[react npm 源包](https://registry.npmjs.org/@blocknote/react/-/react-0.31.3.tgz)、[mantine npm 源包](https://registry.npmjs.org/@blocknote/mantine/-/mantine-0.31.3.tgz)。MPL 条款以随包原文及 [Mozilla 官方文本](https://www.mozilla.org/MPL/2.0/) 为准。

## 一项上游声明差异

emoji-mart 5.6.0 的预打包代码包含 `@swc/helpers` 0.4.13 的 `_defineProperty`。该旧 npm 包声明 MIT 但没有附许可文本；实际内嵌函数去除 `export default` 后，与 [SWC v1.3.18 原始函数](https://github.com/swc-project/swc/blob/v1.3.18/crates/swc_ecma_transforms_base/src/helpers/_define_property.js) 逐字相同，该历史仓库提供 Apache-2.0。随包同时保留 npm 原始 metadata、MIT 标准全文、匹配函数和历史 Apache 许可，明确记录差异，没有把新版许可倒推给旧版。脚本校验这个函数的摘要，后续变化会阻止构建，要求重新审核。

## 重跑方法与范围

在本目录完成 `npm ci` 后执行：

```sh
npm run build:web
npm run licenses
```

完整 `npm run build` 已包含许可步骤，再进入原生打包。

`scripts/licenses.mjs` 从 esbuild 实际输出中有贡献的输入追溯 npm 包及版本，再检查它们自带 sourcemap 中的预打包依赖。Tiptap / Mantine 发布包漏带的许可从精确上游版本补入；补充文本、锁文件证据、原始 URL 和 SHA-256 固定在 `scripts/license-sources/`。审核不需要联网，未知许可、缺失原文、未审核的内嵌代码、XL 包及外部 bundle 导入都会让构建失败。

`THIRD-PARTY-NOTICES.md` 是自动生成的读者清单；`build/licenses/inventory.json` 包含锁文件和构建清单摘要、实际输入、许可证文本路径及源码归档摘要。开发工具不进入应用运行包；本清单针对交付产物，不能替代未来新增服务器、付费服务或素材的单独审核。
