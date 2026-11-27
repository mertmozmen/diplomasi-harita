#!/usr/bin/env python3
"""Yerel sunucu: dosyaları önbelleğe aldırmadan sunar; değişiklik, sayfa yenilenince hemen görünür."""
import http.server
import os
import sys


class Isleyici(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8791
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Isleyici).serve_forever()
