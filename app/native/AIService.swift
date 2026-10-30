import Foundation
import Security
import CryptoKit

struct AIConfiguration: Codable {
    var id: String
    var provider: String
    var name: String
    var baseURL: String
    var model: String
}

struct AISettings: Codable {
    var configurations: [AIConfiguration] = []
    var defaultID: String = ""
}

final class AINoRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

@MainActor
final class AIService {
    let root: URL
    private var requests: [String: Task<[String: Any], Error>] = [:]
    private var settingsURL: URL { root.appendingPathComponent("ai-settings.json") }
    private var keychainService: String { "life.baode.writer.ai." + SHA256.hash(data: Data(root.standardizedFileURL.path.utf8)).map { String(format: "%02x", $0) }.joined() }
    init(root: URL) { self.root = root }

    nonisolated static func endpoint(_ value: String) throws -> URL {
        guard var parts = URLComponents(string: value.trimmingCharacters(in: .whitespacesAndNewlines)),
              let host = parts.host, !host.isEmpty, parts.user == nil, parts.password == nil,
              parts.query == nil, parts.fragment == nil,
              parts.scheme == "https" || (parts.scheme == "http" && ["localhost", "127.0.0.1", "[::1]", "::1"].contains(host)) else {
            throw WriterError("AI 接口须使用 HTTPS 地址；本机服务可使用 HTTP localhost。")
        }
        while parts.path.hasSuffix("/") { parts.path.removeLast() }
        if !parts.path.hasSuffix("/chat/completions") { parts.path += "/chat/completions" }
        guard let url = parts.url else { throw WriterError("AI 接口地址无效。") }
        return url
    }

    private func read() throws -> AISettings {
        guard FileManager.default.fileExists(atPath: settingsURL.path) else { return AISettings() }
        do { return try JSONDecoder().decode(AISettings.self, from: Data(contentsOf: settingsURL)) }
        catch { throw WriterError("AI 设置无法读取，原文件已保留。") }
    }

    private func write(_ settings: AISettings) throws {
        try JSONEncoder().encode(settings).write(to: settingsURL, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: settingsURL.path)
    }

    private func keyQuery(_ id: String) -> [String: Any] { [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: keychainService, kSecAttrAccount as String: id] }

    private func key(_ id: String) throws -> String {
        var query = keyQuery(id); query[kSecReturnData as String] = true; query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return "" }
        guard status == errSecSuccess, let data = item as? Data, let value = String(data: data, encoding: .utf8) else { throw WriterError("无法读取系统钥匙串中的 AI 密钥，请在设置中重新保存。") }
        return value
    }

    private func putKey(_ value: String, id: String) throws {
        let query = keyQuery(id), data = Data(value.utf8)
        var status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if status == errSecItemNotFound {
            var item = query; item[kSecValueData as String] = data; item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            status = SecItemAdd(item as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw WriterError("AI 密钥未能保存到系统钥匙串，设置未生效。") }
    }

    func load() throws -> [String: Any] {
        let settings = try read()
        // Loading the writer does not prompt to unlock or read any saved secret.
        return ["configurations": settings.configurations.map { c in ["id": c.id, "provider": c.provider, "name": c.name, "baseURL": c.baseURL, "model": c.model] }, "defaultID": settings.defaultID]
    }

    func save(_ args: [String: Any]) throws -> [String: Any] {
        guard let object = args["configuration"] as? [String: Any] else { throw WriterError("AI 配置无效。") }
        let data = try JSONSerialization.data(withJSONObject: object)
        var config = try JSONDecoder().decode(AIConfiguration.self, from: data)
        guard UUID(uuidString: config.id) != nil else { throw WriterError("AI 配置标识无效。") }
        config.name = config.name.trimmingCharacters(in: .whitespacesAndNewlines)
        config.model = config.model.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !config.name.isEmpty, !config.model.isEmpty, config.model.count < 200 else { throw WriterError("请填写服务名称和模型名称。") }
        _ = try Self.endpoint(config.baseURL)
        var settings = try read()
        let old = settings.configurations.first { $0.id == config.id }
        let secret = (args["apiKey"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if secret.isEmpty {
            guard let old = old, try Self.endpoint(old.baseURL) == Self.endpoint(config.baseURL), !(try key(config.id)).isEmpty else { throw WriterError("新增服务或更换接口地址时，请填写 API Key。") }
        } else {
            guard !secret.contains("\n"), !secret.contains("\r") else { throw WriterError("API Key 不能包含换行。") }
            try putKey(secret, id: config.id)
        }
        if let index = settings.configurations.firstIndex(where: { $0.id == config.id }) { settings.configurations[index] = config }
        else { settings.configurations.append(config) }
        if settings.defaultID.isEmpty || args["makeDefault"] as? Bool == true { settings.defaultID = config.id }
        try write(settings)
        return try load()
    }

    func remove(_ id: String) throws -> [String: Any] {
        var settings = try read()
        settings.configurations.removeAll { $0.id == id }
        if settings.defaultID == id { settings.defaultID = settings.configurations.first?.id ?? "" }
        let status = SecItemDelete(keyQuery(id) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw WriterError("无法从系统钥匙串移除密钥，请重试。") }
        try write(settings)
        return try load()
    }

    func setDefault(_ id: String) throws -> [String: Any] {
        var settings = try read()
        guard settings.configurations.contains(where: { $0.id == id }) else { throw WriterError("请先保存此 AI 配置。") }
        settings.defaultID = id; try write(settings)
        return try load()
    }

    func cancel(_ id: String) { requests[id]?.cancel() }

    nonisolated static func parseResponse(_ data: Data, status: Int) throws -> [String: Any] {
        guard (200...299).contains(status) else {
            switch status {
            case 401, 403: throw WriterError("AI 密钥无效或模型未开通，请检查服务、密钥与地域。")
            case 402: throw WriterError("AI 账户额度不足，请在服务商处检查余额。")
            case 429: throw WriterError("AI 请求过于频繁或额度不足，请稍后重试。")
            case 400, 413, 422: throw WriterError("AI 请求被拒绝，请检查模型是否支持文本对话，或缩小参考范围后重试。")
            case 404: throw WriterError("AI 接口或模型不存在，请检查设置中的地址与模型名称。")
            default: throw WriterError("AI 服务暂时不可用（\(status)），请稍后重试。")
            }
        }
        guard data.count < 4_000_000, let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let choice = (json["choices"] as? [[String: Any]])?.first,
              choice["finish_reason"] as? String == "stop",
              let message = choice["message"] as? [String: Any], message["tool_calls"] == nil || message["tool_calls"] is NSNull,
              let content = message["content"] as? String, !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw WriterError("AI 未返回完整文字结果，请缩小范围后重试。原文未改变。")
        }
        return ["content": content]
    }

    func request(_ args: [String: Any], test: Bool = false) async throws -> [String: Any] {
        guard let id = args["requestID"] as? String, UUID(uuidString: id) != nil, requests[id] == nil else { throw WriterError("AI 请求标识无效或重复。") }
        let settings = try read(), configurationID = args["configurationID"] as? String ?? ""
        guard let config = settings.configurations.first(where: { $0.id == configurationID }) else { throw WriterError("请先在应用设置中配置 AI 服务。") }
        let secret = try key(config.id)
        guard !secret.isEmpty else { throw WriterError("请重新保存 AI 密钥。") }
        let messages: [[String: String]]
        if test { messages = [["role": "user", "content": "请只回复：连接成功"]] }
        else {
            guard let value = args["messages"] as? [[String: String]], !value.isEmpty, value.count <= 100,
                  value.allSatisfy({ ["system", "user", "assistant"].contains($0["role"] ?? "") && $0["content"] != nil }),
                  value.reduce(0, { $0 + ($1["content"]?.utf8.count ?? 0) }) <= 400_000 else { throw WriterError("参考内容或会话过长，请缩小范围或新建对话，不会自动截断内容。") }
            messages = value
        }
        var body: [String: Any] = ["model": config.model, "messages": messages, "stream": false]
        if config.provider == "qwen" { body["enable_thinking"] = false }
        let endpoint = try Self.endpoint(config.baseURL)
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"; request.timeoutInterval = 120
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(secret)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let task = Task<[String: Any], Error> {
            let configuration = URLSessionConfiguration.ephemeral
            configuration.httpCookieStorage = nil; configuration.urlCache = nil; configuration.timeoutIntervalForResource = 125
            let session = URLSession(configuration: configuration, delegate: AINoRedirect(), delegateQueue: nil)
            defer { session.invalidateAndCancel() }
            let (data, response) = try await session.data(for: request)
            try Task.checkCancellation()
            guard let response = response as? HTTPURLResponse else { throw WriterError("AI 服务响应无效。") }
            return try Self.parseResponse(data, status: response.statusCode)
        }
        requests[id] = task
        defer { requests.removeValue(forKey: id) }
        do { return try await task.value }
        catch is CancellationError { throw WriterError("已停止生成，原文未改变。") }
        catch let error as URLError {
            if error.code == .cancelled { throw WriterError("已停止生成，原文未改变。") }
            if error.code == .timedOut { throw WriterError("AI 响应超时，请稍后重试或缩小范围。") }
            throw WriterError("无法连接 AI 服务，请检查网络和接口地址。")
        }
    }
}
