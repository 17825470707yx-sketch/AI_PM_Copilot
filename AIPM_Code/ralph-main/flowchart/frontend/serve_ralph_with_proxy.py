#!/usr/bin/env python3
import http.server
import socketserver
import os
from pathlib import Path
from urllib.parse import urlparse
import urllib.request
import urllib.parse
import shutil

PORT = 5174
BACKEND_PORT = 8787
THIS_FILE_DIR = Path(__file__).resolve().parent
DIRECTORY_ABS = THIS_FILE_DIR / "dist"

class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

class ProxiedSPAHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIRECTORY_ABS), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.proxy_request("GET")
            return
        sanitized_path = parsed.path.lstrip("/")
        full_file_path = DIRECTORY_ABS / sanitized_path
        if full_file_path.exists() and full_file_path.is_file():
            return super().do_GET()
        else:
            self.path = "/index.html"
            return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            self.proxy_request("POST")
            return
        self.send_error(404)

    def do_OPTIONS(self):
        if self.path.startswith("/api/"):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()
            return
        self.send_response(200)
        self.end_headers()

    def proxy_request(self, method):
        try:
            backend_url = f"http://127.0.0.1:{BACKEND_PORT}{self.path}"
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length) if content_length > 0 else None
            req = urllib.request.Request(backend_url, data=post_data, method=method)
            for key, val in self.headers.items():
                if key.lower() not in ['host', 'content-length']:
                    req.add_header(key, val)
            with urllib.request.urlopen(req, timeout=300) as resp:
                self.send_response(resp.status)
                for header_name, header_value in resp.headers.items():
                    if header_name.lower() not in ['transfer-encoding', 'connection']:
                        self.send_header(header_name, header_value)
                self.end_headers()
                shutil.copyfileobj(resp, self.wfile)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            for header_name, header_value in e.headers.items():
                if header_name.lower() not in ['transfer-encoding', 'connection']:
                    self.send_header(header_name, header_value)
            self.end_headers()
            if e.fp:
                shutil.copyfileobj(e.fp, self.wfile)
        except Exception as e:
            self.send_error(502, f"Bad Gateway to backend 127.0.0.1:{BACKEND_PORT}: {str(e)}")

if not DIRECTORY_ABS.exists():
    print(f"❌ Error: Directory not found {DIRECTORY_ABS}")
    exit(1)

print(f"✅ Serving Ralph SPA from: {DIRECTORY_ABS}")
print(f"✅ API Proxy: forwarding all /api/* requests to http://127.0.0.1:{BACKEND_PORT}")
with ReusableTCPServer(("", PORT), ProxiedSPAHandler) as httpd:
    print(f"✅ Ralph SPA server running at http://127.0.0.1:{PORT}")
    httpd.serve_forever()
