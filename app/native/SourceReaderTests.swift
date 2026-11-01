import AppKit
import WebKit

enum SourceReaderTests {
    @MainActor static func run(reader: SourceReader, parent: NSWindow, site: URL, writerData: WKWebsiteDataStore) async throws {
        guard site.host == "127.0.0.1", site.scheme == "http" else { throw WriterError("读取测试仅允许本机模拟页面。") }
        reader.fixtureOrigin = site
        defer { reader.cancelReading(); reader.fixtureOrigin = nil }
        func expect(_ condition: Bool, _ message: String) throws { if !condition { throw WriterError(message) }; print("PASS: \(message)") }
        func loaded() async throws -> WKWebView {
            for _ in 0..<100 {
                if let view = reader.webView, !view.isLoading, view.url?.path == "/source-reader" { return view }
                try await Task.sleep(nanoseconds: 50_000_000)
            }
            throw WriterError("读取测试页面未载入。")
        }
        let first = Task { await reader.read(site.appendingPathComponent("source-reader"), parent: parent) }
        let view = try await loaded()
        let challenge = try await view.callAsyncJavaScript(SourceReader.snapshotScript, arguments: ["manual": true, "expectedWeChat": true], in: nil, contentWorld: .defaultClient) as? [String: Any]
        try expect(challenge?["ready"] as? Bool == false, "Verification page is never an article, including manual capture")
        let bridge = try await view.callAsyncJavaScript("return !!window.webkit?.messageHandlers?.native;", arguments: [:], in: nil, contentWorld: .page) as? Bool
        try expect(bridge == false && reader.dataStore !== writerData && !reader.dataStore.isPersistent, "Article browser has no writer bridge or shared login store")
        _ = try await view.callAsyncJavaScript("document.querySelector('#fixture-finish').click(); return true;", arguments: [:], in: nil, contentWorld: .page)
        let captured = await first.value
        try expect((captured["content"] as? String)?.contains("动态出现的正文") == true && captured["url"] as? String == site.appendingPathComponent("source-reader").absoluteString, "Same-page article appears and is captured without a second network fetch")
        try expect((captured["content"] as? String)?.contains("data-src=") == true, "Lazy image locations survive DOM capture")
        let second = Task { await reader.read(site.appendingPathComponent("source-reader"), parent: parent) }
        _ = try await loaded(); reader.cancelReading()
        let cancelled = await second.value
        try expect(cancelled["cancelled"] as? Bool == true && cancelled["content"] == nil, "Cancel returns no article and completes the request")
        let third = Task { await reader.read(site.appendingPathComponent("source-reader"), parent: parent) }
        let fresh = try await loaded()
        try await Task.sleep(nanoseconds: 200_000_000)
        try expect(reader.webView === fresh, "Closing an old sheet cannot cancel a new import")
        _ = try await fresh.callAsyncJavaScript("document.querySelector('#fixture-finish').click(); return true;", arguments: [:], in: nil, contentWorld: .page)
        let afterCancel = await third.value
        try expect(afterCancel["content"] != nil && afterCancel["cancelled"] == nil, "A new import succeeds after cancellation")
        let cookie = HTTPCookie(properties: [.domain:"images.example.com", .path:"/private", .name:"source-fixture", .value:"isolated"] )!
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in reader.dataStore.httpCookieStore.setCookie(cookie) { continuation.resume() } }
        let matching = await reader.imageCookies(for: URL(string:"https://images.example.com/private/image.png")!)
        let otherPath = await reader.imageCookies(for: URL(string:"https://images.example.com/private-extra/image.png")!)
        try expect(matching.contains(where: {$0.name == "source-fixture"}) && !otherPath.contains(where: {$0.name == "source-fixture"}), "Image cookies respect directory path boundaries")
        let page = URL(string:"https://mp.weixin.qq.com/s/article?ticket=fixture#position")!
        try expect(SourceReader.imageReferer(page: page, image: URL(string:"https://images.example.com/image.png")!) == "https://mp.weixin.qq.com/" && SourceReader.imageReferer(page: page, image: URL(string:"https://mp.weixin.qq.com/image.png")!) == "https://mp.weixin.qq.com/s/article?ticket=fixture", "Cross-origin image Referer excludes article queries and fragments")
        let otherArticle = URL(string:"https://mp.weixin.qq.com/s/other")!, verification = URL(string:"https://mp.weixin.qq.com/mp/wappoc_appmsgcaptcha?ticket=fixture")!
        try expect(SourceReader.articleURL(original: page, current: otherArticle) == otherArticle && SourceReader.articleURL(original: page, current: verification) == page, "Article navigation keeps its own source URL while verification keeps the requested article")
    }
}
