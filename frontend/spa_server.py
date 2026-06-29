from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os

ROOT = Path(__file__).resolve().parent / "dist"


class SPAHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        clean_path = path.split("?", 1)[0].split("#", 1)[0]
        requested = ROOT / clean_path.lstrip("/")

        if requested.is_file():
            return str(requested)

        return str(ROOT / "index.html")

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    os.chdir(ROOT)
    server = ThreadingHTTPServer(("0.0.0.0", 3000), SPAHandler)
    print("Frontend SPA rodando em http://0.0.0.0:3000")
    server.serve_forever()
