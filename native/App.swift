import AppKit
import WebKit
import UniformTypeIdentifiers

final class ChromeButton: NSButton {
    private var hovered = false
    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach { removeTrackingArea($0) }
        addTrackingArea(NSTrackingArea(rect: .zero, options: [.mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect], owner: self))
    }
    override func mouseEntered(with event: NSEvent) { hovered = true; needsDisplay = true }
    override func mouseExited(with event: NSEvent) { hovered = false; needsDisplay = true }
    override func draw(_ dirtyRect: NSRect) {
        let selected = state == .on
        if selected || hovered || isHighlighted {
            (selected ? NSColor(srgbRed: 234.0/255, green: 219.0/255, blue: 209.0/255, alpha: 1) : NSColor(srgbRed: 222.0/255, green: 220.0/255, blue: 213.0/255, alpha: 1)).setFill()
            NSBezierPath(roundedRect: bounds, xRadius: 8, yRadius: 8).fill()
        }
        let tint = selected ? NSColor(srgbRed: 128.0/255, green: 92.0/255, blue: 73.0/255, alpha: 1) : NSColor(srgbRed: 105.0/255, green: 112.0/255, blue: 109.0/255, alpha: 1)
        if contentTintColor != tint { contentTintColor = tint }
        super.draw(dirtyRect)
    }
}

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
            case "svg": mime = "image/svg+xml"
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
final class WriterApp: NSObject, NSApplicationDelegate, NSWindowDelegate, WKScriptMessageHandlerWithReply, WKNavigationDelegate, WKUIDelegate, NSToolbarDelegate, NSSearchFieldDelegate, NSMenuItemValidation {
    let store: WriterStore
    let webRoot: URL
    lazy var ai = AIService(root: store.root)
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
    var editorTest = false
    var workspaceTest = false
    var trashTest = false
    var testEvidence: URL?
    var websiteDataStore = WKWebsiteDataStore.default()
    let chromeSearch = NSSearchField()
    let chromeSearchButton = ChromeButton(title: "搜索", target: nil, action: nil)
    let chromeFocus = ChromeButton(title: "专注", target: nil, action: nil)
    let chromeControls = NSView(frame: NSRect(x: 0, y: 0, width: 500, height: 28))
    let chromeSearchWrap = NSView(frame: NSRect(x: 360, y: 0, width: 0, height: 28))
    var chromeSearchOpen = false
    var chromeHasNote = false
    var chromeBusy = false

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
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: editorTest ? 1480 : 1240, height: 850), styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
        window.title = "饱得写作"
        window.titleVisibility = .hidden
        window.minSize = NSSize(width: 920, height: 650)
        window.backgroundColor = NSColor(srgbRed: 232.0/255, green: 231.0/255, blue: 227.0/255, alpha: 1)
        window.appearance = NSAppearance(named: .aqua)
        window.titlebarAppearsTransparent = true
        window.titlebarSeparatorStyle = .none
        window.contentView = webView
        makeToolbar()
        window.delegate = self
        if !bridgeTest && !editorTest { window.setFrameAutosaveName("BaodeWriterMainWindow") }
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        guard FileManager.default.fileExists(atPath: webRoot.appendingPathComponent("index.html").path) else {
            showError(WriterError("应用界面文件缺失，请重新安装完整的饱得写作应用。"))
            return
        }
        webView.load(URLRequest(url: URL(string: "writer-app://local/index.html")!))
        if bridgeTest || editorTest {
            DispatchQueue.main.asyncAfter(deadline: .now() + 90) {
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
        editMenu.addItem(.separator())
        let find = NSMenuItem(title: "搜索文稿", action: #selector(focusSearch), keyEquivalent: "f"); find.target = self; editMenu.addItem(find)
        let edit = NSMenuItem(); edit.submenu = editMenu; bar.addItem(edit)
        let documentMenu = NSMenu(title: "文稿")
        for (title, command) in [("文稿设置", "documentSettings"), ("切换阅读预览", "togglePreview"), ("移动到…", "moveDocument"), ("移到废纸篓…", "trashDocument")] {
            let item = NSMenuItem(title: title, action: #selector(documentCommand(_:)), keyEquivalent: "")
            item.target = self; item.representedObject = command; documentMenu.addItem(item)
        }
        let documentItem = NSMenuItem(); documentItem.submenu = documentMenu; bar.addItem(documentItem)
        let windowMenu = NSMenu(title: "窗口")
        windowMenu.addItem(withTitle: "最小化", action: #selector(NSWindow.miniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "关闭", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        let windowItem = NSMenuItem(); windowItem.submenu = windowMenu; bar.addItem(windowItem)
        NSApp.mainMenu = bar
        NSApp.windowsMenu = windowMenu
    }

    private func makeToolbar() {
        let field = chromeSearch
        field.placeholderString = "搜索文稿"; field.controlSize = .small
        field.font = .systemFont(ofSize: 12); field.delegate = self
        field.sendsSearchStringImmediately = true; field.isEnabled = false
        field.isBezeled = false; field.isBordered = false; field.drawsBackground = false; field.focusRingType = .none
        (field.cell as? NSSearchFieldCell)?.searchButtonCell = nil
        field.textColor = NSColor(srgbRed: 100.0/255, green: 107.0/255, blue: 107.0/255, alpha: 1)
        field.placeholderAttributedString = NSAttributedString(string: "搜索文稿", attributes: [.foregroundColor: NSColor(srgbRed: 139.0/255, green: 146.0/255, blue: 144.0/255, alpha: 1), .font: NSFont.systemFont(ofSize: 12)])
        chromeSearchWrap.wantsLayer = true
        chromeSearchWrap.layer?.backgroundColor = NSColor(srgbRed: 246.0/255, green: 245.0/255, blue: 240.0/255, alpha: 1).cgColor
        chromeSearchWrap.layer?.cornerRadius = 8; chromeSearchWrap.layer?.masksToBounds = true
        chromeSearchWrap.alphaValue = 0; chromeSearchWrap.isHidden = true
        field.translatesAutoresizingMaskIntoConstraints = false; chromeSearchWrap.addSubview(field)
        NSLayoutConstraint.activate([field.widthAnchor.constraint(equalToConstant: 344), field.heightAnchor.constraint(equalToConstant: 22), field.trailingAnchor.constraint(equalTo: chromeSearchWrap.trailingAnchor, constant: -8), field.centerYAnchor.constraint(equalTo: chromeSearchWrap.centerYAnchor)])
        chromeControls.addSubview(chromeSearchWrap)
        for (button, x) in [(chromeSearchButton, 366.0), (chromeFocus, 436.0)] {
            button.frame = NSRect(x: x, y: 0, width: 64, height: 28)
            button.isBordered = false; button.imagePosition = .imageLeading
            button.font = .systemFont(ofSize: 12); button.controlSize = .small
            button.setButtonType(.momentaryChange); button.isEnabled = false; button.target = self
            chromeControls.addSubview(button)
        }
        chromeSearchButton.image = NSImage(systemSymbolName: "magnifyingglass", accessibilityDescription: nil)
        chromeSearchButton.action = #selector(toggleChromeSearch); chromeSearchButton.toolTip = "搜索文稿 ⌘F"
        chromeFocus.image = NSImage(systemSymbolName: "viewfinder", accessibilityDescription: "专注模式")
        chromeFocus.setButtonType(.toggle); chromeFocus.target = self; chromeFocus.action = #selector(toggleChromeFocus)
        chromeFocus.setAccessibilityLabel("专注模式")
        NSLayoutConstraint.activate([chromeControls.widthAnchor.constraint(equalToConstant: 500), chromeControls.heightAnchor.constraint(equalToConstant: 28)])
        let toolbar = NSToolbar(identifier: "WriterTopbar")
        toolbar.delegate = self; toolbar.displayMode = .iconOnly; toolbar.allowsUserCustomization = false
        toolbar.showsBaselineSeparator = false
        window.toolbarStyle = .unifiedCompact; window.toolbar = toolbar
        window.titlebarAppearsTransparent = true; window.titlebarSeparatorStyle = .none
    }

    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] { [NSToolbarItem.Identifier("writer.controls"), .flexibleSpace] }
    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] { [.flexibleSpace, NSToolbarItem.Identifier("writer.controls")] }
    func toolbar(_ toolbar: NSToolbar, itemForItemIdentifier identifier: NSToolbarItem.Identifier, willBeInsertedIntoToolbar flag: Bool) -> NSToolbarItem? {
        guard identifier.rawValue == "writer.controls" else { return nil }
        let item = NSToolbarItem(itemIdentifier: identifier); item.label = "搜索与专注"; item.view = chromeControls; item.isBordered = false; return item
    }
    private func dispatchChrome(_ action: String, value: String = "") {
        guard webView.url?.scheme == "writer-app", webView.url?.host == "local" else { return }
        Task { try? await webView.callAsyncJavaScript("window.dispatchEvent(new CustomEvent('writer-chrome',{detail:{action,value}}));", arguments: ["action":action,"value":value], in: nil, contentWorld: .page) }
    }
    @objc private func focusSearch() { setChromeSearchOpen(true) }
    @objc private func toggleChromeSearch() { setChromeSearchOpen(!chromeSearchOpen) }
    private func setChromeSearchOpen(_ open: Bool) {
        chromeSearchOpen = open; chromeSearchWrap.isHidden = false
        chromeSearchButton.state = open || !chromeSearch.stringValue.isEmpty ? .on : .off
        let frame = NSRect(x: open ? 0 : 360, y: 0, width: open ? 360 : 0, height: 28)
        NSAnimationContext.runAnimationGroup { context in
            context.duration = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion ? 0 : 0.2
            chromeSearchWrap.animator().frame = frame; chromeSearchWrap.animator().alphaValue = open ? 1 : 0
        } completionHandler: { [weak self] in
            Task { @MainActor in
                guard let self else { return }
                if !self.chromeSearchOpen { self.chromeSearchWrap.isHidden = true }
            }
        }
        window.makeFirstResponder(open ? chromeSearch : webView)
    }
    @objc private func toggleChromeFocus() { if chromeSearchOpen { setChromeSearchOpen(false) }; dispatchChrome("toggleFocus") }
    @objc private func documentCommand(_ sender: NSMenuItem) { if let command = sender.representedObject as? String { dispatchChrome(command) } }
    func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
        menuItem.action == #selector(documentCommand(_:)) ? chromeHasNote && !chromeBusy : true
    }
    func controlTextDidBeginEditing(_ notification: Notification) { dispatchChrome("searchOpen") }
    func controlTextDidChange(_ notification: Notification) { dispatchChrome("search", value: chromeSearch.stringValue) }
    func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
        guard commandSelector == #selector(NSResponder.cancelOperation(_:)) else { return false }
        setChromeSearchOpen(false); return true
    }
    private var toolbarInset: Double { window.styleMask.contains(.fullScreen) ? 0 : max(0, webView.bounds.height-window.contentLayoutRect.height) }
    func windowDidResize(_ notification: Notification) { dispatchChrome("windowMetrics", value: String(toolbarInset)) }
    func windowDidEnterFullScreen(_ notification: Notification) { dispatchChrome("windowMetrics", value: String(toolbarInset)) }
    func windowDidExitFullScreen(_ notification: Notification) { dispatchChrome("windowMetrics", value: String(toolbarInset)) }

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
        case "windowState":
            chromeHasNote = args["hasNote"] as? Bool == true; chromeBusy = args["busy"] as? Bool == true
            let ready = args["ready"] as? Bool == true, focused = args["focus"] as? Bool == true
            chromeSearch.isEnabled = ready; chromeSearchButton.isEnabled = ready; chromeFocus.isEnabled = ready
            if let query = args["query"] as? String, query != chromeSearch.stringValue { chromeSearch.stringValue = query }
            chromeSearchButton.state = chromeSearchOpen || !chromeSearch.stringValue.isEmpty ? .on : .off
            chromeFocus.state = focused ? .on : .off; chromeFocus.toolTip = focused ? "退出专注" : "专注模式"
            return ["ok": true, "toolbarInset": toolbarInset]
        case "aiLoad": return try ai.load()
        case "aiSave": return try ai.save(args)
        case "aiRemove": return try ai.remove(try string(args, "id"))
        case "aiDefault": return try ai.setDefault(try string(args, "id"))
        case "aiRequest": return try await ai.request(args)
        case "aiTest": return try await ai.request(args, test: true)
        case "aiCancel": ai.cancel(try string(args, "requestID")); return ["ok": true]
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
        if editorTest, webView === self.webView {
            Task {
                do {
                    let result = try await webView.callAsyncJavaScript(trashTest ? NativeEditorTests.trashScript : workspaceTest ? NativeEditorTests.workspaceScript : NativeEditorTests.script, arguments: ["site":store.siteURL.absoluteString], in: nil, contentWorld: .page)
                    print("PASS: Native editor \(trashTest ? "trash" : workspaceTest ? "workspace" : "AI") scenarios: \(result ?? "none")")
                    await saveTestScreenshot()
                    if workspaceTest {
                        window.setContentSize(NSSize(width: 1000, height: 850))
                        _ = try await webView.callAsyncJavaScript(NativeEditorTests.narrowWorkspaceScript, arguments: [:], in: nil, contentWorld: .page)
                        await saveTestScreenshot(suffix: "-narrow")
                        print("PASS: Two editable papers and fixed-width tabs fit a 1000-point window.")
                        window.setContentSize(NSSize(width: 1380, height: 900))
                        let navigation = try await webView.callAsyncJavaScript(NativeEditorTests.navigationScript, arguments: [:], in: nil, contentWorld: .page)
                        await saveTestScreenshot(suffix: "-navigation")
                        print("PASS: \(navigation ?? "document tree navigation")")

                    }
                    if !workspaceTest && !trashTest {
                        window.setContentSize(NSSize(width: 1000, height: 850))
                        _ = try await webView.callAsyncJavaScript(NativeEditorTests.narrowAIScript, arguments: [:], in: nil, contentWorld: .page)
                        await saveTestScreenshot(suffix: "-narrow")
                        print("PASS: Independent review and assistant fit a 1000-point window.")
                    }
                    NSApp.terminate(nil)
                } catch {
                    await saveTestScreenshot()
                    fputs("EDITOR TEST FAILED: \(error.localizedDescription) \((error as NSError).userInfo)\n", stderr)
                    exit(1)
                }
            }
            return
        }
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

    private func saveTestScreenshot(suffix: String = "") async {
        guard let evidence = testEvidence else { return }
        let url = suffix.isEmpty ? evidence : evidence.deletingLastPathComponent().appendingPathComponent(evidence.deletingPathExtension().lastPathComponent + suffix + ".png")
        do {
            let image = try await webView.takeSnapshot(configuration: nil)
            guard let tiff = image.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff), let png = bitmap.representation(using: .png, properties: [:]) else { return }
            try png.write(to: url)
        } catch { fputs("Could not save editor test screenshot.\n", stderr) }
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

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        guard webView === self.webView, frame.request.url?.scheme == "writer-app" else { completionHandler(false); return }
        let alert = NSAlert(); alert.messageText = message
        alert.addButton(withTitle: "确认"); alert.addButton(withTitle: "取消")
        alert.beginSheetModal(for: window) { response in completionHandler(response == .alertFirstButtonReturn) }
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
        if editorTest { try? FileManager.default.removeItem(at: store.root.deletingLastPathComponent()) }
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
            let workspaceTest = args.contains("--self-test-workspace")
            let trashTest = args.contains("--self-test-trash")
            let editorTest = args.contains("--self-test-editor") || workspaceTest || trashTest
            let bridgeTestRoot = args.contains("--self-test-webkit") || args.contains("--self-test-network") || editorTest ? try NativeTests.makeBridgeFixture() : nil
            let defaultRoot = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("BaodeWriter", isDirectory: true)
            let root = bridgeTestRoot?.appendingPathComponent("data") ?? option("--data-dir").map { URL(fileURLWithPath: $0, isDirectory: true) } ?? defaultRoot
            let webRoot = (editorTest ? nil : bridgeTestRoot?.appendingPathComponent("web")) ?? option("--web-root").map { URL(fileURLWithPath: $0, isDirectory: true) } ?? Bundle.main.resourceURL!.appendingPathComponent("Web", isDirectory: true)
            let store = try WriterStore(root: root, siteOverride: option("--site"))
            if args.contains("--self-test-network") || editorTest, !(store.siteURL.scheme == "http" && store.siteURL.host == "127.0.0.1") { throw WriterError("网络自测仅允许显式 --site http://127.0.0.1:<测试端口>。") }
            if editorTest { try NativeEditorTests.seed(store) }
            let libraryLock = try LibraryLock(root: root)
            let app = NSApplication.shared
            let delegate = WriterApp(store: store, webRoot: webRoot)
            delegate.bridgeTest = bridgeTestRoot != nil && !editorTest
            delegate.bridgeNetworkTest = args.contains("--self-test-network")
            delegate.editorTest = editorTest
            delegate.workspaceTest = workspaceTest
            delegate.trashTest = trashTest
            delegate.testEvidence = option("--evidence").map { URL(fileURLWithPath: $0) }
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
