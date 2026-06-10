#!/usr/bin/env python3
import http.server
import socketserver
import os
from pathlib import Path
from urllib.parse import urlparse

PORT = 5174
THIS_FILE_DIR = Path(__file__).resolve().parent
DIRECTORY_ABS = THIS_FILE_DIR / "dist"

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

if not DIRECTORY_ABS.exists():
    print(f"❌ 错误: 目录不存在 {DIRECTORY_ABS}")
    exit(1)

print(f"✅ 准备从绝对路径提供服务: {DIRECTORY_ABS}")
with socketserver.TCPServer(("", PORT), SPARequestHandler) as httpd:
    print(f"✅ Conduit 服务器成功启动: http://localhost:{PORT}")
    httpd.serve_forever()
