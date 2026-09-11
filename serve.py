#!/usr/bin/env python3
"""Local web server for browsing and editing GradApps markdown files."""

from __future__ import annotations

import json
import mimetypes
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
HOST = "127.0.0.1"
PORT = 8765
EDITABLE_SUFFIXES = {".md", ".csv"}


def safe_path(relative: str) -> Path | None:
    if not relative or relative.startswith("/"):
        return None
    target = (ROOT / relative).resolve()
    try:
        target.relative_to(ROOT)
    except ValueError:
        return None
    return target


def list_markdown_files() -> list[dict]:
    files: list[dict] = []
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file():
            continue
        if path.suffix.lower() not in EDITABLE_SUFFIXES:
            continue
        rel = path.relative_to(ROOT).as_posix()
        if rel.startswith("web/"):
            continue
        files.append({"path": rel, "name": path.name, "dir": str(path.parent.relative_to(ROOT))})
    return files


class Handler(BaseHTTPRequestHandler):
    server_version = "GradAppsEditor/1.0"

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def send_json(self, status: int, payload: object) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_bytes(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        if path == "/api/files":
            self.send_json(200, {"files": list_markdown_files()})
            return

        if path == "/api/file":
            rel = parse_qs(parsed.query).get("path", [None])[0]
            if not rel:
                self.send_json(400, {"error": "Missing path"})
                return
            target = safe_path(rel)
            if not target or not target.is_file():
                self.send_json(404, {"error": "File not found"})
                return
            text = target.read_text(encoding="utf-8")
            self.send_json(200, {"path": rel, "content": text})
            return

        if path in ("/", "/index.html"):
            body = (WEB / "index.html").read_bytes()
            self.send_bytes(200, body, "text/html; charset=utf-8")
            return

        if path.startswith("/"):
            asset = WEB / path.lstrip("/")
            if asset.is_file():
                ctype = mimetypes.guess_type(asset.name)[0] or "application/octet-stream"
                self.send_bytes(200, asset.read_bytes(), ctype)
                return

        self.send_json(404, {"error": "Not found"})

    def do_PUT(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/api/file":
            self.send_json(404, {"error": "Not found"})
            return

        rel = parse_qs(parsed.query).get("path", [None])[0]
        if not rel:
            self.send_json(400, {"error": "Missing path"})
            return
        target = safe_path(rel)
        if not target:
            self.send_json(403, {"error": "Invalid path"})
            return
        if target.suffix.lower() not in EDITABLE_SUFFIXES:
            self.send_json(403, {"error": "File type not editable"})
            return

        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
            content = payload["content"]
        except (json.JSONDecodeError, KeyError, UnicodeDecodeError):
            self.send_json(400, {"error": "Invalid JSON body"})
            return

        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        self.send_json(200, {"ok": True, "path": rel})

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()


def main() -> None:
    os.chdir(ROOT)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    url = f"http://{HOST}:{PORT}"
    print(f"GradApps editor running at {url}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        server.server_close()


if __name__ == "__main__":
    main()
