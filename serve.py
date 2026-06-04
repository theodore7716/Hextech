#!/usr/bin/env python3
# 极简静态服务器：固定目录，避免在受限环境调用 os.getcwd()。
import os
import sys
import http.server
import socketserver

DIRECTORY = "/Users/admin/Desktop/second therdore"
PORT = int(os.environ.get("PORT") or (sys.argv[1] if len(sys.argv) > 1 else 8765))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"serving {DIRECTORY} on :{PORT}", flush=True)
    httpd.serve_forever()
