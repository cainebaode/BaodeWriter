import Foundation
import CryptoKit
import Darwin

final class LibraryLock {
    private var descriptor: Int32 = -1
    init(root: URL) throws {
        descriptor = Darwin.open(root.appendingPathComponent(".writer.lock").path, O_CREAT | O_RDWR, 0o600)
        guard descriptor >= 0 else { throw WriterError("无法锁定本地文稿目录。") }
        guard flock(descriptor, LOCK_EX | LOCK_NB) == 0 else {
            Darwin.close(descriptor)
            descriptor = -1
            throw WriterError("此文稿库已由另一个饱得写作窗口打开。请使用已打开的应用，或关闭后重试。")
        }
    }
    deinit { if descriptor >= 0 { flock(descriptor, LOCK_UN); Darwin.close(descriptor) } }
}

struct WriterError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
    init(_ message: String) { self.message = message }
}

final class WriterStore {
    let root: URL
    let queue = DispatchQueue(label: "life.baode.writer.storage")
    private let files = FileManager.default
    private(set) var siteURL: URL
    private var libraryURL: URL { root.appendingPathComponent("library.json") }
    private var previousURL: URL { root.appendingPathComponent("previous.json") }
    var imagesURL: URL { root.appendingPathComponent("images", isDirectory: true) }

    static let mimeExtensions = ["image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/avif": "avif", "image/heic": "heic", "image/heif": "heif", "image/tiff": "tiff", "image/bmp": "bmp", "image/svg+xml": "svg"]

    init(root: URL, siteOverride: String? = nil) throws {
        self.root = root.standardizedFileURL
        var savedSite = "https://baode.life"
        if let data = try? Data(contentsOf: root.appendingPathComponent("settings.json")),
           let settings = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let value = settings["siteURL"] as? String { savedSite = value }
        siteURL = try Self.validSite(siteOverride ?? savedSite)
        try files.createDirectory(at: imagesURL, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
    }

    static func validSite(_ value: String) throws -> URL {
        guard let parts = URLComponents(string: value), let host = parts.host?.lowercased(), !host.isEmpty,
              parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil,
              parts.path.isEmpty || parts.path == "/",
              let scheme = parts.scheme?.lowercased() else { throw WriterError("网站地址应是完整的网站根地址。") }
        let loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].contains(host)
        let numericHost = host.allSatisfy { $0.isNumber || $0 == "." || $0 == ":" || $0 == "[" || $0 == "]" }
        guard (scheme == "https" && (loopback || (!numericHost && !host.hasSuffix(".local")))) || (scheme == "http" && loopback) else {
            throw WriterError("网站须使用 HTTPS；本机测试可使用 HTTP localhost 或 127.0.0.1。")
        }
        var clean = parts
        clean.path = ""
        guard let result = clean.url else { throw WriterError("网站地址无效。") }
        return result
    }

    func setSite(_ value: String) throws -> [String: Any] {
        let url = try Self.validSite(value)
        try atomicJSON(["siteURL": url.absoluteString], to: root.appendingPathComponent("settings.json"))
        siteURL = url
        return ["ok": true, "siteURL": url.absoluteString]
    }

    private func decodeLibrary(_ url: URL) throws -> [String: Any] {
        let data = try Data(contentsOf: url)
        guard data.count <= 150_000_000,
              let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw WriterError("文稿库格式无效。") }
        try validateLibrary(object)
        return object
    }

    private func validateLibrary(_ object: [String: Any]) throws {
        guard object["schema"] as? Int == 1, let notes = object["notes"] as? [[String: Any]] else { throw WriterError("文稿库版本或内容格式无法识别，原文件已保留。") }
        var folderIDs = Set<String>()
        if let value = object["folders"] {
            guard let folders = value as? [[String: String]] else { throw WriterError("文件夹信息无法识别，原文件已保留。") }
            for folder in folders {
                guard let id = folder["id"], !id.isEmpty, folderIDs.insert(id).inserted,
                      let name = folder["name"], !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, name.count <= 60 else { throw WriterError("文件夹名称或标识无效，原文件已保留。") }
            }
        }
        var ids = Set<String>()
        let date = ISO8601DateFormatter(); date.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let basicDate = ISO8601DateFormatter()
        for note in notes {
            if let value = note["trashedAt"] {
                guard let timestamp = value as? String, date.date(from: timestamp) != nil || basicDate.date(from: timestamp) != nil else { throw WriterError("文稿删除日期无效，原文件已保留。") }
            }
            if let folder = note["folderId"], !(folder is NSNull) {
                guard let id = folder as? String, folderIDs.contains(id) else { throw WriterError("文稿关联的文件夹无法识别，原文件已保留。") }
            }
            guard let id = note["id"] as? String, !id.isEmpty, ids.insert(id).inserted,
                  let document = note["document"] as? [String: Any],
                  ["title", "slug", "description", "content", "coverImage"].allSatisfy({ document[$0] is String }),
                  let type = document["contentType"] as? String, ["markdown", "blocknote"].contains(type),
                  document["tags"] is [String], note["assets"] is [String: String],
                  ["displayDate", "createdAt", "updatedAt"].allSatisfy({ key in
                      guard let value = note[key] as? String else { return false }
                      return date.date(from: value) != nil || basicDate.date(from: value) != nil
                  }) else { throw WriterError("文稿字段损坏或记录日期无效，原文件已保留。") }
            if type == "blocknote" {
                guard let data = (document["content"] as? String)?.data(using: .utf8), (try? JSONSerialization.jsonObject(with: data)) is [Any] else { throw WriterError("块编辑文稿内容无效，原文件已保留。") }
            }
        }
        let byID = Dictionary(uniqueKeysWithValues: notes.map { ($0["id"] as! String, $0) })
        for note in notes {
            var seen = Set([note["id"] as! String])
            var current = note
            while let value = current["parentId"], !(value is NSNull) {
                guard let parentID = value as? String, let parent = byID[parentID], seen.insert(parentID).inserted,
                      (parent["folderId"] as? String) == (current["folderId"] as? String) else {
                    throw WriterError("文稿层级无效：父文稿缺失、层级循环或文件夹不一致。原文件已保留。")
                }
                current = parent
            }
        }

    }

    func load() throws -> [String: Any] {
        var result: [String: Any] = ["library": NSNull(), "dataPath": root.path, "siteURL": siteURL.absoluteString]
        guard files.fileExists(atPath: libraryURL.path) else {
            if files.fileExists(atPath: previousURL.path) { throw WriterError("主文稿库丢失，但上一版仍存在。请先备份数据目录并恢复，避免创建空库。") }
            return result
        }
        do { result["library"] = try decodeLibrary(libraryURL) }
        catch {
            guard let previous = try? decodeLibrary(previousURL) else { throw WriterError("文稿库和上一份副本均无法读取。原文件已保留，请从导出的备份恢复。数据目录：\(root.path)") }
            let preserved = root.appendingPathComponent("library-damaged-\(UUID().uuidString).json")
            try files.copyItem(at: libraryURL, to: preserved)
            try atomicJSON(previous, to: libraryURL)
            result["library"] = previous
            result["recoveryWarning"] = "文稿库读取异常，已恢复上一份有效副本；损坏原件保留在 \(preserved.lastPathComponent)。请检查最近的修改。"
        }
        return result
    }

    func save(_ library: [String: Any]) throws -> [String: Any] {
        guard JSONSerialization.isValidJSONObject(library) else { throw WriterError("文稿包含无法保存的数据。") }
        try validateLibrary(library)
        // Never replace the recovery copy with a corrupt main file.
        if files.fileExists(atPath: libraryURL.path) {
            let current = try decodeLibrary(libraryURL)
            try atomicJSON(current, to: previousURL)
        }
        try atomicJSON(library, to: libraryURL)
        return ["ok": true]
    }

    private func atomicJSON(_ object: Any, to url: URL) throws {
        let data = try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
        guard data.count <= 150_000_000 else { throw WriterError("文稿库超过 150 MB，请拆分或导出整理。") }
        try data.write(to: url, options: .atomic)
        try files.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }

    static func digest(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }

    func storeImage(data: Data, mime: String, name: String) throws -> [String: Any] {
        guard let ext = Self.mimeExtensions[mime.lowercased()], !data.isEmpty, data.count <= 25_000_000 else { throw WriterError("请选择不超过 25 MB 的常见图片文件。") }
        let fileName = "\(Self.digest(data)).\(ext)"
        let target = imagesURL.appendingPathComponent(fileName)
        if !files.fileExists(atPath: target.path) {
            try data.write(to: target, options: .atomic)
            try files.setAttributes([.posixPermissions: 0o600], ofItemAtPath: target.path)
        }
        return ["url": "writer-asset://local/\(fileName)", "name": name, "mime": mime.lowercased(), "size": data.count]
    }

    func imageFile(_ value: String) throws -> URL {
        guard let url = URL(string: value), url.scheme == "writer-asset", url.host == "local", url.query == nil, url.fragment == nil,
              url.path.range(of: "^/[a-f0-9]{64}\\.(jpg|png|gif|webp|avif|heic|heif|tiff|bmp|svg)$", options: .regularExpression) != nil else { throw WriterError("本地图片地址无效。") }
        let file = imagesURL.appendingPathComponent(url.lastPathComponent)
        guard file.resolvingSymlinksInPath().deletingLastPathComponent() == imagesURL.resolvingSymlinksInPath() else { throw WriterError("不允许读取图片目录之外的文件。") }
        return file
    }

    static func mime(for file: URL) -> String { mimeExtensions.first { $0.value == file.pathExtension }?.key ?? "application/octet-stream" }

    func getImage(_ value: String) throws -> [String: Any] {
        let file = try imageFile(value)
        return ["base64": try Data(contentsOf: file).base64EncodedString(), "mime": Self.mime(for: file), "name": file.lastPathComponent]
    }

    func exportBackup(to destination: URL) throws -> [String: Any] {
        guard !files.fileExists(atPath: destination.path) else { throw WriterError("此备份名称已存在，请选择一个新名称。") }
        let library = try load()["library"]
        let staging = destination.deletingLastPathComponent().appendingPathComponent(".writer-backup-\(UUID().uuidString)", isDirectory: true)
        defer { try? files.removeItem(at: staging) }
        try files.createDirectory(at: staging, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
        try atomicJSON(library as? [String: Any] ?? ["schema": 1, "notes": []], to: staging.appendingPathComponent("library.json"))
        try files.copyItem(at: imagesURL, to: staging.appendingPathComponent("images"))
        try atomicJSON(["format": "BaodeWriter", "version": 1, "createdAt": ISO8601DateFormatter().string(from: Date())], to: staging.appendingPathComponent("manifest.json"))
        try files.moveItem(at: staging, to: destination)
        return ["ok": true, "path": destination.path]
    }

    func restoreBackup(from source: URL) throws -> [String: Any] {
        let manifestURL = source.appendingPathComponent("manifest.json")
        guard let manifest = try JSONSerialization.jsonObject(with: Data(contentsOf: manifestURL)) as? [String: Any],
              manifest["format"] as? String == "BaodeWriter", manifest["version"] as? Int == 1 else { throw WriterError("请选择饱得写作导出的 .baodewriter 备份目录。") }
        let library = try decodeLibrary(source.appendingPathComponent("library.json"))
        let sourceImages = source.appendingPathComponent("images", isDirectory: true)
        let entries = try files.contentsOfDirectory(at: sourceImages, includingPropertiesForKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
        guard entries.count <= 100_000 else { throw WriterError("备份图片数量异常。") }
        var totalSize = 0
        // Fully validate before copying any content into the active library.
        for file in entries {
            let values = try file.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
            guard values.isRegularFile == true, values.isSymbolicLink != true,
                  file.lastPathComponent.range(of: "^[a-f0-9]{64}\\.(jpg|png|gif|webp|avif|heic|heif|tiff|bmp|svg)$", options: .regularExpression) != nil,
                  let size = values.fileSize, size <= 25_000_000 else { throw WriterError("备份包含不安全或无效的图片文件。") }
            totalSize += size
            guard totalSize <= 5_000_000_000 else { throw WriterError("备份超过 5 GB，请分批整理后导入。") }
            let data = try Data(contentsOf: file)
            guard Self.digest(data) == file.deletingPathExtension().lastPathComponent else { throw WriterError("备份中的图片校验失败，尚未覆盖当前文稿。") }
        }
        let available = Set(entries.map(\.lastPathComponent))
        for note in library["notes"] as? [[String: Any]] ?? [] {
            guard let document = note["document"] as? [String: Any] else { continue }
            let content = (document["coverImage"] as? String ?? "") + " " + (document["content"] as? String ?? "")
            let pattern = try NSRegularExpression(pattern: "writer-asset://local/([a-f0-9]{64}\\.(?:jpg|png|gif|webp|avif|heic|heif|tiff|bmp|svg))")
            let text = content.replacingOccurrences(of: "\\/", with: "/") as NSString
            for match in pattern.matches(in: text as String, range: NSRange(location: 0, length: text.length)) {
                guard available.contains(text.substring(with: match.range(at: 1))) else { throw WriterError("备份缺少文稿引用的本地图片，尚未覆盖当前文稿。") }
            }
        }
        // Keep a complete automatic copy before a user-requested restore.
        let safety = root.appendingPathComponent("before-restore-\(UUID().uuidString).baodewriter", isDirectory: true)
        if (try? decodeLibrary(libraryURL)) != nil { _ = try exportBackup(to: safety) }
        for file in entries {
            let destination = imagesURL.appendingPathComponent(file.lastPathComponent)
            if !files.fileExists(atPath: destination.path) { try files.copyItem(at: file, to: destination) }
        }
        if files.fileExists(atPath: libraryURL.path), (try? decodeLibrary(libraryURL)) == nil {
            try files.moveItem(at: libraryURL, to: root.appendingPathComponent("library-damaged-\(UUID().uuidString).json"))
        }
        _ = try save(library)
        return ["ok": true, "path": source.path, "library": library, "safetyBackup": safety.path]
    }
}
