# Writer 产品官网源码

本层是独立产品官网的核心产出，为 writer.baode.life 提供介绍、安装帮助和隐私说明；与应用源码和主站后台分别维护。

上层背景与入口：[项目说明](../README.md)。

## 内容与入口

| 位置 | 用途与关系 |
| --- | --- |
| [index.html](index.html) | 产品介绍及下载入口 |
| [help/](help) | 安装和使用帮助；本层说明同时解释该子目录 |
| [privacy/](privacy) | 对外隐私说明 |
| [assets/](assets) | 网站当前使用的图像 |
| [style.css](style.css) | 静态站样式 |
| [sitemap.xml](sitemap.xml) | 站点页面索引 |
| [robots.txt](robots.txt) | 爬取入口配置 |

## 使用与维护

页面保持相对引用。源码、公开下载和线上站点各有独立状态；发布维护从本地 `docs/03-发布/README.md` 进入。
