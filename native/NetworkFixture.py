"""Loopback-only native integration fixture; contains no production credentials."""
import base64
import json
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PIXEL = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4YoAAAAASUVORK5CYII=")


class Fixture(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def send(self, status, data, mime="application/json", headers=None):
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def authorized(self):
        return "writer-native-test=fixture" in self.headers.get("Cookie", "")

    def do_GET(self):
        if self.path == "/admin/login":
            self.send(200, b"<html><body>Fixture login<script>setTimeout(()=>history.pushState({},'', '/admin'),250)</script></body></html>", "text/html", {"Set-Cookie": "writer-native-test=fixture; Path=/; HttpOnly; SameSite=Lax"})
        elif self.path == "/admin":
            self.send(200, b"<html><body>Native fixture signed in</body></html>", "text/html")
        elif self.path == "/api/desktop/posts":
            result = {"cookie": self.authorized(), "origin": self.headers.get("Origin") == f"http://127.0.0.1:{self.server.server_port}"}
            self.send(200 if result["cookie"] else 401, json.dumps(result).encode())
        elif self.path == "/uploads/pixel.png":
            self.send(200, PIXEL, "image/png")
        elif self.path == "/redirect-out":
            self.send(302, b"", "text/html", {"Location": "https://example.com/"})
        else:
            self.send(404, b'{}')

    def do_POST(self):
        data = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        if self.path.startswith("/ai/") and self.path.endswith("/chat/completions"):
            if self.headers.get("Authorization") != "Bearer isolated-fixture-key" or self.headers.get("Cookie") or self.headers.get("Origin"):
                self.send(401, b'{}')
                return
            body = json.loads(data)
            if body.get("stream") is not False:
                self.send(400, b'{}')
                return
            if "/qwen/" in self.path and body.get("enable_thinking") is not False:
                self.send(400, b'{}')
                return
            model = body.get("model")
            if model == "redirect":
                self.send(302, b"", headers={"Location": "https://example.com/"})
                return
            if model == "slow":
                time.sleep(2)
            messages = body["messages"]
            text = "建议先写一个具体场景，再解释自己的想法。"
            if messages == [{"role": "user", "content": "请只回复：连接成功"}]:
                text = "连接成功"
            else:
                try:
                    content = json.loads(messages[-1]["content"])
                    task = content.get("任务", "")
                    prompt = content.get("要求", "")
                    if task in ["写完整文章", "重写全文"] or "完整文章" in prompt:
                        text = json.dumps({"reply": "按提出问题、具体做法、回到主旨来组织全文。", "article": {"title": "把生活写下来", "markdown": "从一句简短的记录开始，不必先想好整篇文章。\n\n## 从具体场景开始\n\n记录一个今天注意到的细节，再解释它为什么让你停下来。\n\n- 写下看到的事物\n- 补充自己的理解\n\n## 给想法一条主线\n\n把这些片段围绕一个问题组织起来，让每一段接住上一段。\n\n## 留给明天的自己\n\n今天先留下一句话，明天再回头看看它。"}}, ensure_ascii=False)
                    elif task == "生成提纲":
                        text = json.dumps({"reply": "提纲已放入正文审阅。", "brief": "主题：生活记录；读者：刚开始写作的人；语气：朴素。", "insertion": {"after": "end", "markdown": "## 从具体场景开始\n\n- 一个生活细节\n- 它引出的想法\n\n## 回到文章主旨\n\n整理变化与下一步。"}}, ensure_ascii=False)
                    elif prompt == "把第一段扩成两段":
                        text = json.dumps({"reply": "只扩写第一段，其余保留。", "edits": [{"from": "p0", "to": "p0", "markdown": "第一段展开，**写清最初的想法**。\n\n随后补上具体的观察。"}]}, ensure_ascii=False)
                    elif task in ["通篇优化", "选段写作"]:
                        text = json.dumps({"reply": "调整了选定文字。", "changes": [{"id": u["id"], "after": u["text"] + " 更自然"} for u in content.get("允许修改的片段", [])]}, ensure_ascii=False)
                    elif task == "标题建议":
                        text = json.dumps({"reply": "这些标题可以参考。", "titles": ["在日常里找到写作", "把生活写下来", "从一个片段开始"]}, ensure_ascii=False)
                    elif '"reply"' in messages[0]["content"]:
                        edits = [{"id": u["id"], "after": u["text"] + " 更自然"} for u in content.get("允许修改的片段", [])] if "调整" in prompt else []
                        text = json.dumps({"reply": "可以，从一个具体场景开始写。", "changes": edits, "titles": []}, ensure_ascii=False)
                    elif "允许修改的片段" in content:
                        text = json.dumps({"changes": [{"id": u["id"], "after": u["text"] + " 更自然"} for u in content["允许修改的片段"]]}, ensure_ascii=False)
                    elif '"titles"' in messages[0]["content"]:
                        text = json.dumps({"titles": ["在日常里找到写作", "把生活写下来", "从一个片段开始"]}, ensure_ascii=False)
                except (KeyError, ValueError):
                    pass
            response = {"choices": [{"finish_reason": "length" if model == "truncated" else "stop", "message": {"role": "assistant", "content": text}}]}
            self.send(200, json.dumps(response, ensure_ascii=False).encode())
            return
        if not self.authorized():
            self.send(401, b'{}')
            return
        if self.path == "/api/desktop/posts":
            self.send(200, json.dumps(json.loads(data)).encode())
        elif self.path == "/api/admin/upload" and PIXEL in data and b'name="file"' in data and "multipart/form-data" in self.headers.get("Content-Type", ""):
            self.send(200, b'{"url":"/uploads/pixel.png"}')
        else:
            self.send(400, b'{}')


server = ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 0), Fixture)
print(f"http://127.0.0.1:{server.server_port}", flush=True)
server.serve_forever()
