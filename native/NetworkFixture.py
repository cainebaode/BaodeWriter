"""Loopback-only native integration fixture; contains no production credentials."""
import base64
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

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
        self.wfile.write(data)

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
        if not self.authorized():
            self.send(401, b'{}')
            return
        data = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        if self.path == "/api/desktop/posts":
            self.send(200, json.dumps(json.loads(data)).encode())
        elif self.path == "/api/admin/upload" and PIXEL in data and b'name="file"' in data and "multipart/form-data" in self.headers.get("Content-Type", ""):
            self.send(200, b'{"url":"/uploads/pixel.png"}')
        else:
            self.send(400, b'{}')


server = HTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 0), Fixture)
print(f"http://127.0.0.1:{server.server_port}", flush=True)
server.serve_forever()
