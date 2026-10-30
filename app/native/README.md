# 原生外壳与构建

本层属于应用核心产出，负责窗口、存储、桥接、网络和恢复能力。总体背景见[应用工程](../README.md)，编辑交互见[前端地图](../web/README.md)；下文是本层架构与验证契约。

macOS 13+，AppKit + 系统 WebKit。无 Electron、远程页面桥接、网站密码存储或后台自动发布。AI 密钥使用系统钥匙串。`Info.plist` 固定应用标识为 `life.baode.writer`。

## 窗口与顶部工具栏

使用 AppKit unifiedCompact 工具栏；标准红黄绿与右侧搜索、专注按钮在同一行，顶部内容间距为 4 点。使用无系统玻璃背景的自绘按钮与无边框原生搜索字段；点击搜索／⌘F 向左展开，Esc 收起，保留原生中文输入与清空行为。搜索和菜单操作通过本机页面的 writer-chrome 事件交给 React；windowState 只同步搜索、就绪与专注等窗口状态，不写文稿或发布。

## 前端契约

本地页面加载为 `writer-app://local/index.html`，只能用打包后的普通 `<script>`（当前 esbuild `iife`），不要切换为 ES module。相对 JS、CSS、字体与静态资源均从应用包读取。

调用 `window.webkit.messageHandlers.native.postMessage({action,...})` 得到 Promise。操作失败会 reject，并提供可展示的中文错误。桥接仅接受本机主页面；登录窗口完全没有桥接。

| action | 入参 | 成功结果 |
| --- | --- | --- |
| load | 无 | `{library:null或Library,dataPath,siteURL,recoveryWarning?}` |
| save | `{library}` | `{ok:true}`，仅在原子写入完成后返回 |
| storeImage | `{name,mime,base64}` | `{url,name,mime,size}` |
| getImage | `{url}` | `{base64,mime,name}` |
| downloadImage | `{url}`，本站绝对或相对地址 | 与 storeImage 相同 |
| request | `{path,method,body?}` | `{status,data}` |
| upload | `{url}`，本地图片地址 | `{status,data}`，multipart 的字段为 `file` |
| login | 无 | 成功 `{ok:true}`；关闭为 `{ok:false,cancelled:true}` |
| setSite | `{url}`，网站根地址 | `{ok:true,siteURL}` |
| openURL | `{url}`，HTTP(S) 网页 | `{ok:boolean}` |
| exportBackup | 无，原生保存面板 | `{ok:true,path}`，取消 `{ok:false,cancelled:true}` |
| restoreBackup | 无，原生目录面板与恢复确认 | `{ok:true,path,library,safetyBackup}`，取消同上 |

AI 桥接仅开放给本机主页面：

| action | 入参 | 成功结果 |
| --- | --- | --- |
| aiLoad | 无 | `{configurations,defaultID}`，不返回密钥 |
| aiSave | `{configuration,apiKey,makeDefault?}` | 设置列表；空密钥仅保留同一接口已有密钥 |
| aiDefault / aiRemove | `{id}` | 更新后的设置列表 |
| aiRequest | `{requestID,configurationID,messages}` | `{content}`，只接受完整文字结果 |
| aiTest | `{requestID,configurationID}` | `{content}`，只发送连接测试文字 |
| aiCancel | `{requestID}` | `{ok:true}`，取消对应任务 |

AI 使用独立临时网络会话，不携带网站 cookie 或 Origin，不接受重定向。非密钥配置保存于 `ai-settings.json`，密钥按数据目录隔离保存在系统钥匙串。`Library.aiSessions` 与 `Note.aiRevisions` 保存会话和修改前版本，网站发布只读取既有文稿字段。

`Library` 必须符合 `{schema:1,notes:Note[]}`。本机图片格式为 `writer-asset://local/<SHA256>.<ext>`，目录不能遍历；单张图片最多 25 MB。使用标准 `<input type="file">`，原生已实现 WKUIDelegate 的文件选择面板。

前端必须提供 `window.flushAll(): Promise`。关闭窗口或退出时会等待其完成；抛错或返回 `false` 会阻止退出。自动保存写本地，与网站请求分开。

## 数据与网络边界

默认数据目录为 `~/Library/Application Support/BaodeWriter/`。同一目录使用系统文件锁，防止两份应用同时写入。`library.json` 原子写入；上一份有效内容保存于 `previous.json`。读取时验证版本、文稿字段、日期和 BlockNote JSON。主库损坏时从有效上一版恢复并保留损坏原件，两个版本均损坏时明确报错，不生成空库。

可恢复备份是 **`.baodewriter` 目录**，包含 `library.json`、`images/` 和 `manifest.json`，不是 ZIP，不包含设置或 cookie。恢复先验证格式、图片哈希、符号链接和文稿引用，再保留当前完整副本；不删除旧图片。备份可直接复制到其他磁盘。

网站仅允许 HTTPS 根地址；HTTP 仅允许 localhost / 127.0.0.1 / ::1 测试。接口仅允许 `/api/desktop/posts`、`/api/desktop/posts/<ID>`、`/api/admin/upload`，不允许跨域重定向。请求共享默认 WKWebsiteDataStore 中与目标域名、路径和安全标记匹配的 cookie，并提供网站 Origin。图片下载仅允许配置的网站同源，外链需用户另行下载导入。

## 构建与验证

以下命令均在应用工程 `app/` 目录执行。先构建 `build/web` 并生成 `build/licenses`，再运行：

```sh
bash scripts/build-native.sh
```

生成 `dist/饱得写作.app` 和 `dist/BaodeWriter-0.8.1-universal.dmg`，含 arm64 / x86_64，两份许可证总览与逐依赖许可文件。采用 ad-hoc 签名；没有 Developer ID 签名或 Apple 公证。脚本不会安装或提交公证。

隔离验证参数：

```sh
.build/native/BaodeWriter-arm64 --self-test
.build/native/BaodeWriter-arm64 --self-test-webkit
dist/饱得写作.app/Contents/MacOS/BaodeWriter \
  --data-dir /tmp/baode-writer-manual-test \
  --site http://127.0.0.1:3210 \
  --web-root /absolute/path/to/BaodeWriter/app/build/web
```

`--self-test` 验证临时目录中的存储、重开、备份恢复、损坏恢复、图片和访问边界；`--self-test-webkit` 启动真实 WebKit 验证页面、桥接、图片、退出保存，然后清理临时数据。后者需要正常的 macOS 窗口服务，受限执行沙箱可能无法启动。两项自测不访问正式网站或真实文稿库；它们不能代替服务器联调、完整界面验收或公证验证。

原生网络边界可用本机模拟服务独立复验：先运行 `python3 native/NetworkFixture.py`，再使用它打印的端口运行 `BaodeWriter --self-test-network --site http://127.0.0.1:<端口>`。验证正常登录页面、共享 cookie、Origin、JSON 请求、带图上传/下载及跨域重定向拒绝。测试强制使用非持久 cookie 存储，只允许本机 HTTP 测试地址，不会复用真实登录状态；结束后停止模拟服务。

AI 与真实编辑器联调使用同一个本机模拟服务，覆盖七种配置、钥匙串保存/移除、停止、异常响应及实际选段/采纳/撤销。不得把模拟测试写成真实服务验收：

```sh
python3 native/NetworkFixture.py
.build/native/BaodeWriter-arm64 --self-test-network --site http://127.0.0.1:<端口>
.build/native/BaodeWriter-arm64 --self-test-editor --site http://127.0.0.1:<端口> --web-root /absolute/path/to/BaodeWriter/app/build/web --evidence /absolute/path/to/editor.png
.build/native/BaodeWriter-arm64 --self-test-workspace --site http://127.0.0.1:<端口> --web-root /absolute/path/to/BaodeWriter/app/build/web --evidence /absolute/path/to/workspace.png
.build/native/BaodeWriter-arm64 --self-test-trash --site http://127.0.0.1:<端口> --web-root /absolute/path/to/BaodeWriter/app/build/web --evidence /absolute/path/to/trash.png
```

上述测试使用独立临时文稿库、非持久网站会话；AI 测试仅使用测试专用钥匙串项目。`--self-test-workspace` 检查文稿树父子移动、新建子文稿、层级搜索、删除恢复、标签、双栏编辑、各篇保存和配套面板的对应关系，另生成 1000 点宽窗口截图。`--self-test-trash` 验证空白文稿删除、恢复、取消、彻底删除、批量删除和分栏中删除一篇。正常完成后清理测试数据；失败时保留诊断信息。真实 AI 服务需用户在应用内配置其已开通模型后验证。

文稿树使用可选 `Note.parentId`，旧文稿无需改写。原生保存验证父文稿存在、同一文件夹和无循环；备份恢复保留父子关系。文件夹及父子信息不进入网站发布正文或版本指纹。
