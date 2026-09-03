from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
required = [
    'package.json',
    'package-lock.json',
    'server.mjs',
    'index.html',
    'app.js',
    'Dockerfile',
    'db/001_youtube_notes.sql',
    'scripts/sync_youtube_notes.mjs',
    'docs/architecture.md',
]
for relative in required:
    path = ROOT / relative
    if not path.is_file():
        raise SystemExit(f'MISSING {relative}')

package = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
if package.get('scripts', {}).get('start') != 'node server.mjs':
    raise SystemExit('INVALID start script')

server = (ROOT / 'server.mjs').read_text(encoding='utf-8')
client = (ROOT / 'app.js').read_text(encoding='utf-8')
index = (ROOT / 'index.html').read_text(encoding='utf-8')
for marker in ('KNOWLEDGE_COCKPIT_DATABASE_URL', 'knowledge_cockpit.youtube_notes', 'knowledge_review.records', 'knowledge_review.reports'):
    if marker not in server and marker not in (ROOT / 'docs/architecture.md').read_text(encoding='utf-8'):
        raise SystemExit(f'MISSING connected marker {marker}')
if 'fetch(' not in client:
    raise SystemExit('MISSING client API requests')
if 'const SOURCES = [' in index:
    raise SystemExit('FICTIONAL SOURCES REMAIN IN HTML')
if '<script src="/app.js" defer></script>' not in index:
    raise SystemExit('MISSING connected client script')
if 'process.env.KNOWLEDGE_COCKPIT_PASSWORD' not in server:
    raise SystemExit('MISSING server authentication')

print('CONNECTED VALIDATION PASSED')
