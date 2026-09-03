#!/usr/bin/env python3
"""Validate the disconnected Knowledge Cockpit static prototype."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / "index.html"
DOCKERFILE_PATH = ROOT / "Dockerfile"
NGINX_PATH = ROOT / "nginx.conf"
HEALTH_PATH = ROOT / "healthz"

errors: list[str] = []


def require(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


html = HTML_PATH.read_text(encoding="utf-8")
dockerfile = DOCKERFILE_PATH.read_text(encoding="utf-8")
nginx = NGINX_PATH.read_text(encoding="utf-8")
health = HEALTH_PATH.read_text(encoding="utf-8")

require(html.lower().startswith("<!doctype html>"), "index.html must start with a doctype")
require('<html lang="fr">' in html, "index.html must declare French content")
require(len(html.encode("utf-8")) <= 120_000, "index.html must stay below 120 KB")

for marker in (
    "Knowledge Cockpit",
    "Données fictives",
    "À traiter",
    "YouTube",
    "Twitter",
    "Reviews",
    "Recherche",
):
    require(marker in html, f"missing UI marker: {marker}")

for pattern, label in (
    (r"\bfetch\s*\(", "fetch()"),
    (r"\bXMLHttpRequest\b", "XMLHttpRequest"),
    (r"\bWebSocket\b", "WebSocket"),
):
    require(not re.search(pattern, html, flags=re.IGNORECASE), f"forbidden disconnected-mode reference: {label}")

script_blocks = re.findall(r"<script>(.*?)</script>", html, flags=re.IGNORECASE | re.DOTALL)
connection_tokens = ("supabase.", "createclient(", "obsidian://")
require(
    not any(token in block.lower() for block in script_blocks for token in connection_tokens),
    "inline JavaScript must not create a live data connection",
)

require(
    not re.search(r"<(?:script|link|img|iframe)\b[^>]+(?:src|href)=['\"]https?://", html, flags=re.IGNORECASE),
    "index.html must not load external resources",
)
require(len(re.findall(r"<script\b", html, flags=re.IGNORECASE)) == 1, "index.html must contain one inline script")
require("FROM nginx:1.27-alpine" in dockerfile, "Dockerfile must use the pinned Nginx Alpine image")
require("EXPOSE 80" in dockerfile, "Dockerfile must expose port 80")
require("HEALTHCHECK" in dockerfile, "Dockerfile must define a healthcheck")
require("Content-Security-Policy" in nginx, "nginx.conf must define a Content Security Policy")
require("connect-src 'none'" in nginx, "nginx.conf must disable browser connections")
require("expires -1" in nginx, "nginx.conf must disable stale prototype caching")
require("try_files $uri $uri/ /index.html" in nginx, "nginx.conf must support the static route fallback")
require(health == "ok\n", "healthz must contain exactly ok")

if errors:
    print("STATIC VALIDATION FAILED")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)

print("STATIC VALIDATION PASSED")
print(f"- HTML bytes: {len(html.encode('utf-8'))}")
print("- External resource loads: 0")
print("- Runtime data connections: 0")
print("- Health endpoint: /healthz")
