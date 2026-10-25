import AppKit
import WebKit
import UniformTypeIdentifiers

final class SameOriginSession: NSObject, URLSessionTaskDelegate {
    let origin: URL
    init(origin: URL) { self.origin = origin }
    static func matches(_ a: URL, _ b: URL) -> Bool {
        a.scheme?.lowercased() == b.scheme?.lowercased() && a.host?.lowercased() == b.host?.lowercased() && (a.port ?? (a.scheme == "https" ? 443 : 80)) == (b.port ?? (b.scheme == "https" ? 443 : 80))
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(request.url.map { Self.matches($0, origin) } == true ? request : nil)
    }
}

final class LocalScheme: NSObject, WKURLSchemeHandler {
    let webRoot: URL
    let store: WriterStore
    init(webRoot: URL, store: WriterStore) { self.webRoot = webRoot; self.store = store }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        do {
            guard let url = urlSchemeTask.request.url, url.host == "local" else { throw WriterError("本地资源地址无效。") }
            let file: URL
            if url.scheme == "writer-asset" { file = try store.imageFile(url.absoluteString) }
            else {
                let path = url.path == "/" || url.path.isEmpty ? "index.html" : String(url.path.dropFirst())
                file = webRoot.appendingPathComponent(path).standardizedFileURL.resolvingSymlinksInPath()
                guard file.path.hasPrefix(webRoot.resolvingSymlinksInPath().path + "/") else { throw WriterError("不允许访问应用资源目录之外的文件。") }
            }
            let data = try Data(contentsOf: file)
            let mime: String
            switch file.pathExtension.lowercased() {
            case "html": mime = "text/html"
            case "js", "mjs": mime = "text/javascript"
            case "css": mime = "text/css"
            case "json": mime = "application/json"
            case "woff2": mime = "font/woff2"
            case "woff": mime = "font/woff"
            case "ttf": mime = "font/ttf"
            default: mime = WriterStore.mime(for: file)
            }
            urlSchemeTask.didReceive(URLResponse(url: url, mimeType: mime, expectedContentLength: data.count, textEncodingName: mime.hasPrefix("text/") ? "utf-8" : nil))
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
        } catch { urlSchemeTask.didFailWithError(error) }
    }
    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}

@MainActor
final class WriterApp: NSObject, NSApplicationDelegate, NSWindowDelegate, WKScriptMessageHandlerWithReply, WKNavigationDelegate, WKUIDelegate {
    let store: WriterStore
    let webRoot: URL
    var window: NSWindow!
    var webView: WKWebView!
    var loginWindow: NSWindow?
    var loginWebView: WKWebView?
    var loginReply: (([String: Any]) -> Void)?
    var loginURLObservation: NSKeyValueObservation?
    var terminationPending = false
    var terminationAllowed = false
    var startupError: Error?
    var bridgeTest = false
    var bridgeNetworkTest = false
    var websiteDataStore = WKWebsiteDataStore.default()

    init(store: WriterStore, webRoot: URL) { self.store = store; self.webRoot = webRoot }

    func applicationDidFinishLaunching(_ notification: Notification) {
        makeMenu()
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = websiteDataStore
        let scheme = LocalScheme(webRoot: webRoot, store: store)
        configuration.setURLSchemeHandler(scheme, forURLScheme: "writer-app")
        configuration.setURLSchemeHandler(scheme, forURLScheme: "writer-asset")
        configuration.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "native")
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1240, height: 850), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "饱得写作"
        window.subtitle = "本地记录"
        window.minSize = NSSize(width: 920, height: 650)
        window.backgroundColor = NSColor(calibratedRed: 0.035, green: 0.047, blue: 0.063, alpha: 1)
        window.appearance = NSAppearance(named: .darkAqua)
        window.titlebarAppearsTransparent = true
        window.titlebarSeparatorStyle = .none
        window.contentView = webView
        window.delegate = self
        if !bridgeTest { window.setFrameAutosaveName("BaodeWriterMainWindow") }
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        guard FileManager.default.fileExists(atPath: webRoot.appendingPathComponent("index.html").path) else {
            showError(WriterError("应用界面文件缺失，请重新安装完整的饱得写作应用。"))
            return
        }
        webView.load(URLRequest(url: URL(string: "writer-app://local/index.html")!))
        if bridgeTest {
            DispatchQueue.main.asyncAfter(deadline: .now() + 30) {
                fputs("WEBKIT TEST FAILED: timed out waiting for native/WebKit round trip\n", stderr)
                exit(1)
            }
        }
    }

    private func makeMenu() {
        let bar = NSMenu()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "关于饱得写作", action: #selector(showAbout), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "隐藏饱得写作", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "退出饱得写作", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let appItem = NSMenuItem(); appItem.submenu = appMenu; bar.addItem(appItem)
        let editMenu = NSMenu(title: "编辑")
        for (title, action, key) in [("撤销", "undo:", "z"), ("重做", "redo:", "Z"), ("剪切", "cut:", "x"), ("复制", "copy:", "c"), ("粘贴", "paste:", "v"), ("全选", "selectAll:", "a")] {
            editMenu.addItem(withTitle: title, action: Selector(action), keyEquivalent: key)
        }
        let edit = NSMenuItem(); edit.submenu = editMenu; bar.addItem(edit)
        let windowMenu = NSMenu(title: "窗口")
        windowMenu.addItem(withTitle: "最小化", action: #selector(NSWindow.miniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "关闭", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        let windowItem = NSMenuItem(); windowItem.submenu = windowMenu; bar.addItem(windowItem)
        NSApp.mainMenu = bar
        NSApp.windowsMenu = windowMenu
    }

    @objc private func showAbout() {
        let alert = NSAlert()
        alert.messageText = "饱得写作 0.1.0"
        alert.informativeText = "本地记录，随心发布。\n\n数据目录：\n\(store.root.path)\n\n开源组件与许可证见安装包中的 THIRD-PARTY-NOTICES。"
        alert.runModal()
    }

    private func showError(_ error: Error) {
        let alert = NSAlert(); alert.alertStyle = .warning
        alert.messageText = "操作未完成"
        alert.informativeText = error.localizedDescription
        alert.runModal()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.scheme == "writer-app", message.frameInfo.request.url?.host == "local",
              let args = message.body as? [String: Any], let action = args["action"] as? String else { replyHandler(nil, "该页面无权访问本地文稿。"); return }
        Task {
            do { replyHandler(try await perform(action: action, args: args), nil) }
            catch { replyHandler(nil, error.localizedDescription) }
        }
    }

    private func storage<T>(_ block: @escaping () throws -> T) async throws -> T {
        try await withCheckedThrowingContinuation { continuation in
            store.queue.async {
                do { continuation.resume(returning: try block()) }
                catch { continuation.resume(throwing: error) }
            }
        }
    }

    private func string(_ args: [String: Any], _ key: String) throws -> String {
        guard let value = args[key] as? String else { throw WriterError("缺少参数：\(key)") }
        return value
    }

    private func perform(action: String, args: [String: Any]) async throws -> [String: Any] {
        if bridgeTest { fputs("WebKit test bridge: \(action)\n", stderr) }
        switch action {
        case "load": return try await storage { try self.store.load() }
        case "save":
            guard let library = args["library"] as? [String: Any] else { throw WriterError("文稿库格式无效。") }
            return try await storage { try self.store.save(library) }
        case "setSite":
            let value = try string(args, "url")
            return try await storage { try self.store.setSite(value) }
        case "storeImage":
            let base64 = try string(args, "base64"), mime = try string(args, "mime"), name = try string(args, "name")
            guard let data = Data(base64Encoded: base64) else { throw WriterError("无法读取图片数据。") }
            return try await storage { try self.store.storeImage(data: data, mime: mime, name: name) }
        case "getImage":
            let url = try string(args, "url")
            return try await storage { try self.store.getImage(url) }
        case "downloadImage":
            let url = try siteResource(try string(args, "url"))
            let (data, response) = try await fetch(url: url)
            guard (200...299).contains(response.statusCode), let mime = response.mimeType, mime.hasPrefix("image/") else { throw WriterError("网站图片下载失败（\(response.statusCode)）。") }
            return try await storage { try self.store.storeImage(data: data, mime: mime, name: url.lastPathComponent) }
        case "request":
            let path = try string(args, "path"), method = (try string(args, "method")).uppercased()
            guard ["GET", "POST", "PUT", "PATCH"].contains(method) else { throw WriterError("不支持该请求方式。") }
            let url = try apiURL(path)
            let body = try args["body"].map { try JSONSerialization.data(withJSONObject: $0) }
            let (data, response) = try await fetch(url: url, method: method, body: body, contentType: body == nil ? nil : "application/json")
            return parseResponse(data, response)
        case "upload":
            let value = try string(args, "url")
            let image = try await storage { try self.store.getImage(value) }
            guard let base64 = image["base64"] as? String, let data = Data(base64Encoded: base64), let mime = image["mime"] as? String, let name = image["name"] as? String else { throw WriterError("图片读取失败。") }
            let boundary = "BaodeWriter-\(UUID().uuidString)"
            var body = Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(name)\"\r\nContent-Type: \(mime)\r\n\r\n".utf8)
            body.append(data); body.append(Data("\r\n--\(boundary)--\r\n".utf8))
            let (result, response) = try await fetch(url: apiURL("/api/admin/upload"), method: "POST", body: body, contentType: "multipart/form-data; boundary=\(boundary)")
            return parseResponse(result, response)
        case "login": return await login()
        case "openURL":
            let value = try string(args, "url")
            guard let url = URL(string: value), ["https", "http"].contains(url.scheme?.lowercased() ?? ""), url.host != nil else { throw WriterError("只允许打开网页链接。") }
            return ["ok": NSWorkspace.shared.open(url)]
        case "exportBackup":
            let panel = NSSavePanel()
            panel.title = "导出完整备份"
            panel.message = "保存文稿和全部本地图片，可从此目录恢复；不包含登录信息。"
            panel.nameFieldStringValue = "饱得写作-\(DateFormatter.localizedString(from: Date(), dateStyle: .medium, timeStyle: .none)).baodewriter"
            panel.canCreateDirectories = true
            guard await panel.beginSheetModal(for: window) == .OK, let url = panel.url else { return ["ok": false, "cancelled": true] }
            return try await storage { try self.store.exportBackup(to: url) }
        case "restoreBackup":
            let panel = NSOpenPanel()
            panel.title = "恢复文稿备份"
            panel.message = "选择 .baodewriter 备份目录。恢复前会自动保留当前文稿的完整副本。"
            panel.canChooseFiles = false; panel.canChooseDirectories = true; panel.allowsMultipleSelection = false
            guard await panel.beginSheetModal(for: window) == .OK, let url = panel.url else { return ["ok": false, "cancelled": true] }
            let alert = NSAlert(); alert.alertStyle = .warning
            alert.messageText = "用此备份恢复本机文稿？"
            alert.informativeText = "当前文稿会先保留到数据目录内的 before-restore 备份。此操作不会修改网站内容。"
            alert.addButton(withTitle: "恢复备份"); alert.addButton(withTitle: "取消")
            guard await alert.beginSheetModal(for: window) == .alertFirstButtonReturn else { return ["ok": false, "cancelled": true] }
            return try await storage { try self.store.restoreBackup(from: url) }
        default: throw WriterError("未知操作：\(action)")
        }
    }

    private func siteResource(_ value: String) throws -> URL {
        guard let url = URL(string: value, relativeTo: store.siteURL)?.absoluteURL, SameOriginSession.matches(url, store.siteURL), url.user == nil, url.password == nil, url.fragment == nil else { throw WriterError("只能下载当前网站的图片；外链图片请先下载后插入。") }
        return url
    }

    private func apiURL(_ path: String) throws -> URL {
        guard path.hasPrefix("/"), !path.hasPrefix("//"), let url = URL(string: path, relativeTo: store.siteURL)?.absoluteURL,
              SameOriginSession.matches(url, store.siteURL), url.fragment == nil,
              url.path.range(of: "^/api/desktop/posts(?:/[A-Za-z0-9_-]+)?$|^/api/admin/upload$", options: .regularExpression) != nil else { throw WriterError("此服务器接口不在写作应用的访问范围内。") }
        return url
    }

    private func cookies() async -> [HTTPCookie] {
        await withCheckedContinuation { continuation in websiteDataStore.httpCookieStore.getAllCookies { continuation.resume(returning: $0) } }
    }

    private func fetch(url: URL, method: String = "GET", body: Data? = nil, contentType: String? = nil) async throws -> (Data, HTTPURLResponse) {
        let origin = store.siteURL
        guard SameOriginSession.matches(url, origin) else { throw WriterError("请求地址与当前网站不一致。") }
        var request = URLRequest(url: url)
        request.httpMethod = method; request.httpBody = body; request.timeoutInterval = 45
        request.setValue(origin.absoluteString, forHTTPHeaderField: "Origin")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let contentType { request.setValue(contentType, forHTTPHeaderField: "Content-Type") }
        let matchingCookies = await cookies().filter { cookie in
            let domain = cookie.domain.hasPrefix(".") ? String(cookie.domain.dropFirst()) : cookie.domain
            let host = url.host ?? ""
            return (host == domain || (cookie.domain.hasPrefix(".") && host.hasSuffix("." + domain))) && url.path.hasPrefix(cookie.path) && (!cookie.isSecure || url.scheme == "https") && (cookie.expiresDate == nil || cookie.expiresDate! > Date())
        }
        for (key, value) in HTTPCookie.requestHeaderFields(with: matchingCookies) { request.setValue(value, forHTTPHeaderField: key) }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false
        let delegate = SameOriginSession(origin: origin)
        let session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)
        defer { session.finishTasksAndInvalidate() }
        let (data, rawResponse) = try await session.data(for: request)
        guard let response = rawResponse as? HTTPURLResponse else { throw WriterError("服务器没有返回有效响应。") }
        guard data.count <= 150_000_000 else { throw WriterError("服务器响应过大。") }
        let fields = response.allHeaderFields.reduce(into: [String: String]()) { if let key = $1.key as? String { $0[key] = String(describing: $1.value) } }
        for cookie in HTTPCookie.cookies(withResponseHeaderFields: fields, for: url) {
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in websiteDataStore.httpCookieStore.setCookie(cookie) { continuation.resume() } }
        }
        return (data, response)
    }

    private func parseResponse(_ data: Data, _ response: HTTPURLResponse) -> [String: Any] {
        let object = (try? JSONSerialization.jsonObject(with: data)) ?? ["error": "服务器未返回 JSON；请检查网站连接或重新登录。", "status": response.statusCode]
        return ["status": response.statusCode, "data": object]
    }

    private func login() async -> [String: Any] {
        if let loginWindow { loginWindow.makeKeyAndOrderFront(nil); return ["ok": false, "pending": true] }
        let configuration = WKWebViewConfiguration(); configuration.websiteDataStore = websiteDataStore
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = self; view.uiDelegate = self
        let login = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 640, height: 760), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        login.title = "连接网站 — \(store.siteURL.host ?? "")"
        let content = NSView()
        let hint = NSTextField(labelWithString: "完成网站登录后即可返回。")
        hint.font = .systemFont(ofSize: 12); hint.textColor = .secondaryLabelColor
        let done = NSButton(title: "完成登录，返回写作", target: self, action: #selector(completeLogin))
        done.bezelStyle = .rounded
        let bar = NSStackView(views: [hint, NSView(), done]); bar.orientation = .horizontal
        bar.edgeInsets = NSEdgeInsets(top: 8, left: 16, bottom: 8, right: 16)
        view.translatesAutoresizingMaskIntoConstraints = false; bar.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(view); content.addSubview(bar)
        NSLayoutConstraint.activate([
            view.topAnchor.constraint(equalTo: content.topAnchor), view.leadingAnchor.constraint(equalTo: content.leadingAnchor), view.trailingAnchor.constraint(equalTo: content.trailingAnchor), view.bottomAnchor.constraint(equalTo: bar.topAnchor),
            bar.leadingAnchor.constraint(equalTo: content.leadingAnchor), bar.trailingAnchor.constraint(equalTo: content.trailingAnchor), bar.bottomAnchor.constraint(equalTo: content.bottomAnchor), bar.heightAnchor.constraint(equalToConstant: 48)
        ])
        login.contentView = content; login.delegate = self; login.isReleasedWhenClosed = false
        loginWindow = login; loginWebView = view
        loginURLObservation = view.observe(\.url, options: [.new]) { [weak self] view, _ in
            Task { @MainActor in self?.finishLoginIfReady(view) }
        }
        login.center(); login.makeKeyAndOrderFront(nil)
        view.load(URLRequest(url: store.siteURL.appendingPathComponent("admin/login")))
        return await withCheckedContinuation { continuation in loginReply = { continuation.resume(returning: $0) } }
    }

    @objc private func completeLogin() {
        loginReply?(["ok": true]); loginReply = nil
        loginWindow?.close()
    }

    private func finishLoginIfReady(_ view: WKWebView) {
        guard view === loginWebView, let url = view.url, SameOriginSession.matches(url, store.siteURL), url.path.hasPrefix("/admin"), !url.path.hasPrefix("/admin/login") else { return }
        completeLogin()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if bridgeTest, webView === self.webView {
            fputs("WebKit test page loaded\n", stderr)
            Task {
                do {
                    let result = try await webView.callAsyncJavaScript("const testNetwork = \(bridgeNetworkTest ? "true" : "false");\n" + NativeTests.bridgeScript, arguments: [:], in: nil, contentWorld: .page)
                    guard result as? Bool == true else { throw WriterError("WebKit bridge did not finish") }
                    fputs("PASS: WebKit bundled script loading, native bridge, durable save, image URL loading and origin rejection.\n", stderr)
                    if bridgeNetworkTest { fputs("PASS: Loopback login, shared cookies, Origin, JSON request, multipart upload, image download and redirect rejection.\n", stderr) }
                    NSApp.terminate(nil)
                } catch { fputs("WEBKIT TEST FAILED: \(error.localizedDescription) \((error as NSError).userInfo)\n", stderr); exit(1) }
            }
            return
        }
        finishLoginIfReady(webView)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if webView === loginWebView {
            if SameOriginSession.matches(url, store.siteURL) { decisionHandler(.allow); return }
        } else if url.scheme == "writer-app", url.host == "local" { decisionHandler(.allow); return }
        if ["http", "https"].contains(url.scheme ?? ""), navigationAction.navigationType == .linkActivated { NSWorkspace.shared.open(url) }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, ["http", "https"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
        return nil
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel(); panel.canChooseDirectories = false; panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.beginSheetModal(for: webView.window ?? window) { response in completionHandler(response == .OK ? panel.urls : nil) }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if webView === self.webView { showError(WriterError("编辑界面意外停止。已完成的本地保存仍保留；请重新打开应用。")) }
    }

    func windowWillClose(_ notification: Notification) {
        if let closed = notification.object as? NSWindow, closed === loginWindow {
            loginReply?(["ok": false, "cancelled": true]); loginReply = nil
            loginURLObservation = nil
            loginWebView = nil; loginWindow = nil
        }
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        if sender === window { NSApp.terminate(nil); return false }
        return true
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if bridgeTest { fputs("WebKit test termination requested\n", stderr) }
        if terminationAllowed { return .terminateNow }
        if terminationPending { return .terminateCancel }
        guard webView?.url?.scheme == "writer-app" else { return .terminateNow }
        terminationPending = true
        Task {
            if bridgeTest { fputs("WebKit test waiting for flushAll\n", stderr) }
            do {
                let result = try await webView.callAsyncJavaScript("if (typeof window.flushAll !== 'function') throw new Error('编辑器尚未准备好，请稍后重试'); return await window.flushAll();", arguments: [:], in: nil, contentWorld: .page)
                if let value = result as? Bool, value == false { throw WriterError("本地保存尚未完成，请重试后再退出。") }
                terminationAllowed = true
                sender.terminate(nil)
            } catch {
                terminationPending = false
                showError(WriterError("暂未退出，以保护未保存的内容。\n\(error.localizedDescription)"))
            }
        }
        // Let the WebKit reply run on the normal event loop before issuing the
        // final quit. AppKit's deferred-termination loop can suspend those replies.
        return .terminateCancel
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationWillTerminate(_ notification: Notification) {
        if bridgeTest {
            do {
                let library = try store.load()["library"] as? [String: Any]
                guard library?["quitFlushVerified"] as? Bool == true else { throw WriterError("Quit did not wait for durable save") }
                print("PASS: App quit awaited window.flushAll() and completed the final durable save.")
                try? FileManager.default.removeItem(at: store.root.deletingLastPathComponent())
            } catch { fputs("QUIT TEST FAILED: \(error.localizedDescription)\n", stderr); exit(1) }
        }
    }
}

@main
enum Entry {
    static func main() {
        let args = CommandLine.arguments
        func option(_ name: String) -> String? { args.firstIndex(of: name).flatMap { $0 + 1 < args.count ? args[$0 + 1] : nil } }
        do {
            if args.contains("--self-test") { try NativeTests.run(); return }
            let bridgeTestRoot = args.contains("--self-test-webkit") || args.contains("--self-test-network") ? try NativeTests.makeBridgeFixture() : nil
            let defaultRoot = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("BaodeWriter", isDirectory: true)
            let root = bridgeTestRoot?.appendingPathComponent("data") ?? option("--data-dir").map { URL(fileURLWithPath: $0, isDirectory: true) } ?? defaultRoot
            let webRoot = bridgeTestRoot?.appendingPathComponent("web") ?? option("--web-root").map { URL(fileURLWithPath: $0, isDirectory: true) } ?? Bundle.main.resourceURL!.appendingPathComponent("Web", isDirectory: true)
            let store = try WriterStore(root: root, siteOverride: option("--site"))
            if args.contains("--self-test-network"), !(store.siteURL.scheme == "http" && store.siteURL.host == "127.0.0.1") { throw WriterError("网络自测仅允许显式 --site http://127.0.0.1:<测试端口>。") }
            let libraryLock = try LibraryLock(root: root)
            let app = NSApplication.shared
            let delegate = WriterApp(store: store, webRoot: webRoot)
            delegate.bridgeTest = bridgeTestRoot != nil
            delegate.bridgeNetworkTest = args.contains("--self-test-network")
            if bridgeTestRoot != nil { delegate.websiteDataStore = .nonPersistent() }
            app.delegate = delegate; app.setActivationPolicy(.regular)
            withExtendedLifetime((delegate, libraryLock)) { app.run() }
        } catch {
            fputs("饱得写作：\(error.localizedDescription)\n", stderr)
            if !args.contains("--self-test") { let alert = NSAlert(); alert.messageText = "饱得写作无法启动"; alert.informativeText = error.localizedDescription; alert.runModal() }
            exit(1)
        }
    }
}
