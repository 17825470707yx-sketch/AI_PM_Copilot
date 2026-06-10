#!/usr/bin/env python3
import http.server
import socketserver
import os
from pathlib import Path
from urllib.parse import urlparse

PORT = 5173
THIS_FILE_DIR = Path(__file__).resolve().parent
DIRECTORY_ABS = THIS_FILE_DIR / "dist" if (THIS_FILE_DIR / "dist").exists() else THIS_FILE_DIR

class SPARequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIRECTORY_ABS), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        sanitized_path = parsed.path.lstrip("/")
        full_file_path = DIRECTORY_ABS / sanitized_path
        if full_file_path.exists() and full_file_path.is_file():
            return super().do_GET()
        else:
            self.path = "/index.html"
            return super().do_GET()

print(f"✅ Ralph 前端准备从目录提供服务: {DIRECTORY_ABS}")
with socketserver.TCPServer(("", PORT), SPARequestHandler) as httpd:
    print(f"✅ Ralph 前端服务器成功启动: http://127.0.0.1:{PORT}")
    httpd.serve_forever()
