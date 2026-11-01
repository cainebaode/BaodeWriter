import AppKit
import WebKit

// External articles have their own browser session and no access to the writer bridge.
final class SourceReader: NSObject, WKNavigationDelegate, WKUIDelegate, NSWindowDelegate {
    let dataStore = WKWebsiteDataStore.nonPersistent()
    private(set) var window: NSWindow?
    private(set) var webView: WKWebView?
    private var reply: (([String: Any]) -> Void)?
    private var polling: Task<Void, Never>?
    private var originalURL: URL?
    var fixtureOrigin: URL? // Set only by the loopback self-test; never exposed to the bridge.
    private let status = NSTextField(wrappingLabelWithString: "")
    private let address = NSTextField(labelWithString: "")

    func read(_ url: URL, parent: NSWindow) async -> [String: Any] {
        guard window == nil else { return ["cancelled": true] }
        return await withCheckedContinuation { continuation in
            reply = { continuation.resume(returning: $0) }; originalURL = url
            let configuration = WKWebViewConfiguration()
            configuration.websiteDataStore = dataStore
            let view = WKWebView(frame: .zero, configuration: configuration)
            view.navigationDelegate = self; view.uiDelegate = self
            webView = view
            let reader = NSWindow(contentRect: NSRect(x: 0, y: 0, width: min(860, parent.frame.width - 40), height: min(740, parent.frame.height - 60)), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
            reader.title = "读取参考文章"; reader.minSize = NSSize(width: 580, height: 420)
            reader.appearance = parent.appearance; reader.backgroundColor = parent.backgroundColor
            reader.delegate = self; reader.isReleasedWhenClosed = false
            address.stringValue = url.host ?? ""; address.font = .systemFont(ofSize: 12, weight: .medium)
            address.lineBreakMode = .byTruncatingMiddle
            status.stringValue = "如出现访问验证，请在此完成；公众号正文载入后会自动返回预览。"
            status.font = .systemFont(ofSize: 12); status.textColor = .secondaryLabelColor
            let cancel = NSButton(title: "取消读取", target: self, action: #selector(cancelReading))
            cancel.keyEquivalent = "\u{1b}"
            let reload = NSButton(title: "重新加载", target: self, action: #selector(reloadPage))
            let capture = NSButton(title: "读取当前文章", target: self, action: #selector(readPage))
            for button in [cancel, reload, capture] { button.bezelStyle = .rounded }
            let heading = NSStackView(views: [address, NSView(), cancel])
            heading.orientation = .horizontal
            let actions = NSStackView(views: [status, reload, capture]); actions.orientation = .horizontal
            status.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
            let content = NSView()
            for row in [heading, actions] {
                row.edgeInsets = NSEdgeInsets(top: 10, left: 16, bottom: 10, right: 16)
                row.translatesAutoresizingMaskIntoConstraints = false; content.addSubview(row)
            }
            view.translatesAutoresizingMaskIntoConstraints = false; content.addSubview(view)
            NSLayoutConstraint.activate([
                heading.topAnchor.constraint(equalTo: content.topAnchor), heading.leadingAnchor.constraint(equalTo: content.leadingAnchor), heading.trailingAnchor.constraint(equalTo: content.trailingAnchor), heading.heightAnchor.constraint(equalToConstant: 44),
                view.topAnchor.constraint(equalTo: heading.bottomAnchor), view.leadingAnchor.constraint(equalTo: content.leadingAnchor), view.trailingAnchor.constraint(equalTo: content.trailingAnchor), view.bottomAnchor.constraint(equalTo: actions.topAnchor),
                actions.leadingAnchor.constraint(equalTo: content.leadingAnchor), actions.trailingAnchor.constraint(equalTo: content.trailingAnchor), actions.bottomAnchor.constraint(equalTo: content.bottomAnchor), actions.heightAnchor.constraint(equalToConstant: 68)
            ])
            reader.contentView = content; window = reader
            parent.beginSheet(reader) { [weak self, weak reader] _ in
                if let self, self.window === reader { self.finish(["cancelled": true]) }
            }
            view.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30))
            polling = Task { @MainActor [weak self, weak view] in
                var previous = ""
                while !Task.isCancelled, let self, let view, self.webView === view {
                    if !view.isLoading, let value = try? await self.snapshot(view, manual: false), value["ready"] as? Bool == true {
                        let signature = value["signature"] as? String ?? ""
                        if signature == previous { self.finish(value); return }
                        previous = signature
                    } else { previous = "" }
                    try? await Task.sleep(nanoseconds: 700_000_000)
                }
            }
        }
    }

    static let snapshotScript = #"""
    const wechat = expectedWeChat || location.hostname === 'mp.weixin.qq.com';
    const root = wechat ? document.querySelector('#js_content') : document.querySelector('article,main') || (manual ? document.body : null);
    const title = (document.querySelector('meta[property="og:title"]')?.content || document.querySelector('#activity-name')?.textContent || document.querySelector('h1')?.textContent || document.title || '').trim();
    const visible = root && root.getClientRects().length && getComputedStyle(root).display !== 'none' && getComputedStyle(root).visibility !== 'hidden';
    const text = root?.innerText?.trim() || '';
    const images = root?.querySelectorAll('img[data-src],img[src]')?.length || 0;
    const ready = !!(visible && title && (text || images));
    if (!ready) return {ready:false};
    return {ready:true, content:document.documentElement.outerHTML, mime:'text/html', url:location.href, signature:title+'\n'+text+'\n'+images, wechat};
    """#

    private func snapshot(_ view: WKWebView, manual: Bool) async throws -> [String: Any] {
        let wechat = originalURL?.host?.lowercased() == "mp.weixin.qq.com"
        let value = try await view.callAsyncJavaScript(Self.snapshotScript, arguments: ["manual": manual, "expectedWeChat": wechat || fixtureOrigin != nil], in: nil, contentWorld: .defaultClient)
        guard webView === view, var result = value as? [String: Any] else { throw WriterError("读取已取消。") }
        guard let current = view.url, allows(current) else { throw WriterError("当前页面不是可收存的公开文章。") }
        if wechat, current.host?.lowercased() != "mp.weixin.qq.com" { return ["ready": false] }
        guard let html = result["content"] as? String else { return ["ready": false] }
        guard html.utf8.count <= 8_000_000 else { throw WriterError("这篇文章过大，暂时无法收存。") }
        result["baseURL"] = current.absoluteString
        if wechat, let originalURL { result["url"] = Self.articleURL(original: originalURL, current: current).absoluteString }
        return result
    }

    @objc func cancelReading() { finish(["cancelled": true]) }
    @objc private func reloadPage() {
        status.stringValue = "正在重新加载；公众号正文出现后会自动返回预览。"
        if let originalURL { webView?.load(URLRequest(url: originalURL, cachePolicy: .reloadIgnoringLocalCacheData)) }
    }
    @objc private func readPage() {
        guard let view = webView else { return }
        Task { @MainActor in
            do {
                let value = try await snapshot(view, manual: true)
                if value["ready"] as? Bool == true { finish(value) }
                else { status.stringValue = "尚未读到文章正文，请先完成页面中的验证或检查访问提示。" }
            } catch { if webView === view { status.stringValue = error.localizedDescription } }
        }
    }

    private func finish(_ result: [String: Any]) {
        guard let complete = reply else { return }
        reply = nil; polling?.cancel(); polling = nil
        webView?.stopLoading(); webView?.navigationDelegate = nil; webView?.uiDelegate = nil; webView = nil
        if let window { window.sheetParent?.endSheet(window); window.orderOut(nil) }
        window = nil; originalURL = nil
        complete(result)
    }

    func windowWillClose(_ notification: Notification) {
        if let closed = notification.object as? NSWindow, closed === window { cancelReading() }
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.targetFrame?.isMainFrame == false, navigationAction.request.url?.absoluteString == "about:blank" { decisionHandler(.allow); return }
        guard let url = navigationAction.request.url, allows(url) else { decisionHandler(.cancel); return }
        if navigationAction.targetFrame?.isMainFrame != false { address.stringValue = url.host ?? "" }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, allows(url) { webView.load(URLRequest(url: url)) }
        return nil
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { status.stringValue = "页面未能载入，可以重新加载或取消读取。" }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { status.stringValue = "页面已停止响应，请重新加载。" }

    private func allows(_ url: URL) -> Bool {
        if let fixtureOrigin, SameOriginSession.matches(url, fixtureOrigin) { return true }
        return (try? publicSourceURL(url.absoluteString)) != nil
    }

    func imageCookies(for url: URL) async -> [HTTPCookie] {
        let all: [HTTPCookie] = await withCheckedContinuation { continuation in dataStore.httpCookieStore.getAllCookies { continuation.resume(returning: $0) } }
        return all.filter { cookie in
            let domain = (cookie.domain.hasPrefix(".") ? String(cookie.domain.dropFirst()) : cookie.domain).lowercased()
            let host = url.host?.lowercased() ?? "", path = url.path.isEmpty ? "/" : url.path
            let matchesPath = path == cookie.path || path.hasPrefix(cookie.path) && (cookie.path.hasSuffix("/") || path.dropFirst(cookie.path.count).first == "/")
            return (host == domain || (cookie.domain.hasPrefix(".") && host.hasSuffix("." + domain))) && matchesPath && (!cookie.isSecure || url.scheme == "https") && (cookie.expiresDate == nil || cookie.expiresDate! > Date())
        }
    }

    static func imageReferer(page: URL, image: URL) -> String? {
        var components = URLComponents(url: page, resolvingAgainstBaseURL: false)
        components?.fragment = nil
        if !SameOriginSession.matches(page, image) { components?.path = "/"; components?.query = nil }
        return components?.url?.absoluteString
    }

    static func articleURL(original: URL, current: URL) -> URL {
        let path = current.path.lowercased()
        return path.contains("verify") || path.contains("captcha") ? original : current
    }
}
