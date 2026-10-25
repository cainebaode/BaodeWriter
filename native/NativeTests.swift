import Foundation

enum NativeTests {
    static func makeBridgeFixture() throws -> URL {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("baode-writer-webkit-test-\(UUID().uuidString)")
        let web = root.appendingPathComponent("web")
        try FileManager.default.createDirectory(at: web, withIntermediateDirectories: true)
        try Data("<html><body><h1>饱得写作 · 本地桥接验证</h1><script src=\"./test.js\"></script></body></html>".utf8).write(to: web.appendingPathComponent("index.html"))
        try Data("window.moduleLoaded = true; window.flushAll = async () => { await window.webkit.messageHandlers.native.postMessage({action:'save',library:{schema:1,notes:[],quitFlushVerified:true}}); return true; };".utf8).write(to: web.appendingPathComponent("test.js"))
        return root
    }

    static let bridgeScript = """
    const bridge = message => window.webkit.messageHandlers.native.postMessage(message);
    if (!window.moduleLoaded) throw new Error('Bundled script loading failed');
    const initial = await bridge({action:'load'});
    if (initial.library !== null) throw new Error('test store was not empty');
    await bridge({action:'save',library:{schema:1,notes:[],title:'WebKit bridge save'}});
    const loaded = await bridge({action:'load'});
    if (loaded.library.title !== 'WebKit bridge save') throw new Error('durable bridge save failed');
    const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4YoAAAAASUVORK5CYII=';
    const asset = await bridge({action:'storeImage',base64,mime:'image/png',name:'pixel.png'});
    const image = await bridge({action:'getImage',url:asset.url});
    if (image.base64 !== base64) throw new Error('bridge image changed');
    await new Promise((resolve,reject) => { const img = new Image(); img.onload = resolve; img.onerror = () => reject(new Error('custom image URL failed')); img.src = asset.url; document.body.append(img); });
    let rejected = false;
    try { await bridge({action:'request',path:'https://example.com/api/desktop/posts',method:'GET'}); } catch { rejected = true; }
    if (!rejected) throw new Error('cross-origin request was not rejected');
    if (testNetwork) {
      const login = await bridge({action:'login'});
      if (!login.ok) throw new Error('fixture login failed');
      const response = await bridge({action:'request',path:'/api/desktop/posts',method:'GET'});
      if (response.status !== 200 || !response.data.cookie || !response.data.origin) throw new Error('shared login cookie or Origin header failed');
      const post = await bridge({action:'request',path:'/api/desktop/posts',method:'POST',body:{test:'native-body'}});
      if (post.status !== 200 || post.data.test !== 'native-body') throw new Error('native JSON request failed');
      const upload = await bridge({action:'upload',url:asset.url});
      if (upload.status !== 200 || upload.data.url !== '/uploads/pixel.png') throw new Error('native multipart image upload failed');
      const downloaded = await bridge({action:'downloadImage',url:'/uploads/pixel.png'});
      if (downloaded.url !== asset.url) throw new Error('native image download changed bytes');
      let redirectBlocked = false;
      try { await bridge({action:'downloadImage',url:'/redirect-out'}); } catch { redirectBlocked = true; }
      if (!redirectBlocked) throw new Error('off-origin redirect was followed');
      document.body.append('Loopback login, cookie, Origin, JSON, upload, download and redirect tests passed.');
    }
    return true;
    """

    static func run() throws {
        let files = FileManager.default
        let temporary = files.temporaryDirectory.appendingPathComponent("baode-writer-test-\(UUID().uuidString)")
        defer { try? files.removeItem(at: temporary) }
        try files.createDirectory(at: temporary, withIntermediateDirectories: true)
        let dataRoot = temporary.appendingPathComponent("data")
        let store = try WriterStore(root: dataRoot)
        var assertions = 0
        func check(_ condition: @autoclosure () throws -> Bool, _ message: String) throws {
            guard try condition() else { throw WriterError("SELF-TEST FAILED: \(message)") }
            assertions += 1
        }
        func rejects(_ message: String, _ work: () throws -> Void) throws {
            do { try work() } catch { assertions += 1; return }
            throw WriterError("SELF-TEST FAILED: \(message)")
        }
        try check(try store.load()["library"] is NSNull, "fresh library")
        var lock: LibraryLock? = try LibraryLock(root: dataRoot)
        try withExtendedLifetime(lock) { try rejects("second writer blocked") { _ = try LibraryLock(root: dataRoot) } }
        lock = nil
        lock = try LibraryLock(root: dataRoot)
        try check(lock != nil, "writer lock released on close")
        lock = nil
        func fixture(_ title: String, content: String = "内容保存在本机") -> [String: Any] {
            ["schema": 1, "notes": [["id": "test-1", "document": ["title": title, "slug": "", "description": "", "content": content, "contentType": "markdown", "coverImage": "", "tags": []] as [String: Any], "displayDate": "2026-10-25T12:00:00.000Z", "createdAt": "2026-10-25T12:00:00.000Z", "updatedAt": "2026-10-25T12:00:00.000Z", "base": NSNull(), "assets": [:]] as [String: Any]]]
        }
        func title(_ library: [String: Any]?) -> String? { ((library?["notes"] as? [[String: Any]])?.first?["document"] as? [String: Any])?["title"] as? String }
        let first = fixture("离线文稿")
        let second = fixture("离线修改")
        _ = try store.save(first)
        let reopened = try WriterStore(root: dataRoot)
        let library = try reopened.load()["library"] as? [String: Any]
        try check(title(library) == "离线文稿", "save and reopen")
        _ = try store.save(second)
        let previous = try JSONSerialization.jsonObject(with: Data(contentsOf: dataRoot.appendingPathComponent("previous.json"))) as? [String: Any]
        try check(title(previous) == "离线文稿", "previous preserved")

        let pixel = Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4YoAAAAASUVORK5CYII=")!
        let image = try store.storeImage(data: pixel, mime: "image/png", name: "照片.png")
        let url = image["url"] as! String
        try check(try store.getImage(url)["base64"] as? String == pixel.base64EncodedString(), "image bytes preserved")
        let repeated = try store.storeImage(data: pixel, mime: "image/png", name: "重命名.png")
        try check(repeated["url"] as? String == url, "image deduplication")
        try check(try files.contentsOfDirectory(atPath: store.imagesURL.path).count == 1, "one image file")
        try rejects("reject traversal") { _ = try store.imageFile("writer-asset://local/../../library.json") }
        try rejects("reject file image") { _ = try store.imageFile("file:///etc/passwd") }
        try rejects("reject untrusted MIME") { _ = try store.storeImage(data: pixel, mime: "text/html", name: "x.html") }
        try rejects("reject non-loopback HTTP") { _ = try WriterStore.validSite("http://baode.life") }
        try rejects("reject site credentials") { _ = try WriterStore.validSite("https://name:password@baode.life") }
        try rejects("reject site paths") { _ = try WriterStore.validSite("https://baode.life/admin") }
        try rejects("reject remote private address") { _ = try WriterStore.validSite("https://192.168.1.1") }
        try check(try WriterStore.validSite("http://127.0.0.1:3210/").absoluteString == "http://127.0.0.1:3210", "loopback test site")
        try check(!SameOriginSession.matches(URL(string: "https://baode.life")!, URL(string: "https://attacker.example")!), "redirect different origin rejected")
        _ = try store.setSite("http://localhost:3210")
        try check(try WriterStore(root: dataRoot).siteURL.absoluteString == "http://localhost:3210", "settings reopen")

        let backup = temporary.appendingPathComponent("complete.baodewriter")
        _ = try store.exportBackup(to: backup)
        try check(files.fileExists(atPath: backup.appendingPathComponent("library.json").path), "backup library")
        try check(files.fileExists(atPath: backup.appendingPathComponent("images").appendingPathComponent(URL(string: url)!.lastPathComponent).path), "backup images")
        try check(!files.fileExists(atPath: backup.appendingPathComponent("settings.json").path), "no private settings in backup")
        let restored = try WriterStore(root: temporary.appendingPathComponent("restored"))
        _ = try restored.save(first)
        let restoration = try restored.restoreBackup(from: backup)
        try check(files.fileExists(atPath: restoration["safetyBackup"] as! String), "restore safety copy")
        let restoredLibrary = try restored.load()["library"] as? [String: Any]
        try check(title(restoredLibrary) == "离线修改", "backup restore content")
        try check(try restored.getImage(url)["base64"] as? String == pixel.base64EncodedString(), "backup restore images")
        try rejects("never overwrite backup") { _ = try store.exportBackup(to: backup) }
        let backupImage = backup.appendingPathComponent("images").appendingPathComponent(URL(string: url)!.lastPathComponent)
        try Data("tampered".utf8).write(to: backupImage)
        try rejects("tampered backup blocked before restore") { _ = try restored.restoreBackup(from: backup) }
        try check(try restored.getImage(url)["base64"] as? String == pixel.base64EncodedString(), "failed restore keeps current image")
        try files.removeItem(at: backupImage)
        try files.createSymbolicLink(at: backupImage, withDestinationURL: URL(fileURLWithPath: "/etc/hosts"))
        try rejects("symbolic link backup blocked") { _ = try restored.restoreBackup(from: backup) }

        try Data("invalid JSON".utf8).write(to: dataRoot.appendingPathComponent("library.json"))
        let recovered = try store.load()
        try check(recovered["recoveryWarning"] as? String != nil, "corruption warning")
        let recoveredLibrary = recovered["library"] as? [String: Any]
        try check(title(recoveredLibrary) == "离线文稿", "previous recovery")
        try check(try files.contentsOfDirectory(atPath: dataRoot.path).contains(where: { $0.hasPrefix("library-damaged-") }), "damaged original preserved")
        try Data("broken".utf8).write(to: dataRoot.appendingPathComponent("library.json"))
        try Data("broken".utf8).write(to: dataRoot.appendingPathComponent("previous.json"))
        try rejects("never silently empty damaged store") { _ = try store.load() }
        try rejects("never overwrite damaged store on save") { _ = try store.save(first) }
        try rejects("reject arbitrary valid JSON") { _ = try restored.save([:]) }
        try rejects("reject invalid note fields") { _ = try restored.save(["schema": 1, "notes": [["id": "x"]]]) }
        let empty = try WriterStore(root: temporary.appendingPathComponent("empty"))
        let emptyBackup = temporary.appendingPathComponent("empty.baodewriter")
        _ = try empty.exportBackup(to: emptyBackup)
        let emptyRestored = try restored.restoreBackup(from: emptyBackup)
        try check((emptyRestored["library"] as? [String: Any])?["schema"] as? Int == 1, "empty backup has valid schema")
        let missing = temporary.appendingPathComponent("missing.baodewriter")
        _ = try empty.save(fixture("missing image", content: "![photo](\(url))"))
        _ = try empty.exportBackup(to: missing)
        try rejects("missing referenced image blocks restore") { _ = try restored.restoreBackup(from: missing) }
        let organized = try WriterStore(root: temporary.appendingPathComponent("organized"))
        var grouped = fixture("文件夹中的文章")
        grouped["folders"] = [["id": "folder-one", "name": "日常记录"]]
        var groupedNotes = grouped["notes"] as! [[String: Any]]
        groupedNotes[0]["folderId"] = "folder-one"; grouped["notes"] = groupedNotes
        _ = try organized.save(grouped)
        let organizedReopened = try WriterStore(root: organized.root).load()["library"] as! [String: Any]
        try check((organizedReopened["folders"] as? [[String: String]])?.first?["name"] == "日常记录", "folders survive reopen")
        let organizedBackup = temporary.appendingPathComponent("organized.baodewriter")
        _ = try organized.exportBackup(to: organizedBackup)
        let organizedRestore = try WriterStore(root: temporary.appendingPathComponent("organized-restore"))
        _ = try organizedRestore.restoreBackup(from: organizedBackup)
        let organizedRestored = try organizedRestore.load()["library"] as! [String: Any]
        try check((organizedRestored["notes"] as? [[String: Any]])?.first?["folderId"] as? String == "folder-one", "folder membership survives backup restore")
        var duplicateFolders = grouped
        duplicateFolders["folders"] = [["id": "folder-one", "name": "日常"], ["id": "folder-one", "name": "重复"]]
        try rejects("duplicate folder IDs rejected") { _ = try organized.save(duplicateFolders) }
        var missingFolder = grouped; missingFolder["folders"] = [] as [[String: String]]
        try rejects("missing folder membership rejected before save") { _ = try organized.save(missingFolder) }
        print("PASS: \(assertions) native storage, recovery, backup, image and origin assertions. No production files or servers were accessed.")
    }
}
