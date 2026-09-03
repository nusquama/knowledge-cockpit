import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Pool } = pg;
const DEFAULT_ROOT = '/home/openclaw/dropbox-youtube-summary';
const rootArgIndex = process.argv.indexOf('--root');
const root = path.resolve(rootArgIndex >= 0 ? process.argv[rootArgIndex + 1] : (process.env.YOUTUBE_NOTES_ROOT || DEFAULT_ROOT));
const connectionString = process.env.KNOWLEDGE_COCKPIT_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error('database_not_configured');

function cleanScalar(value) {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function scalar(frontmatter, key) {
  for (const line of frontmatter.split('\n')) {
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    if (line.slice(0, separator).trim() === key) return cleanScalar(line.slice(separator + 1));
  }
  return '';
}

function list(frontmatter, key) {
  const lines = frontmatter.split('\n');
  const start = lines.findIndex((line) => line.trim() === `${key}:`);
  if (start < 0) return [];
  const values = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('- ') && line.indexOf(':') >= 0) break;
    if (trimmed.startsWith('- ')) values.push(cleanScalar(trimmed.slice(2)));
  }
  return values.filter(Boolean);
}

function validVideoId(value) {
  return value.length === 11 && [...value].every((character) => /[A-Za-z0-9_-]/.test(character));
}

function videoId(value) {
  const text = String(value || '');
  const lower = text.toLowerCase();
  const markers = ['youtube.com/watch?v=', 'youtube.com/shorts/', 'youtube.com/embed/', 'youtu.be/'];
  for (const marker of markers) {
    const index = lower.indexOf(marker);
    if (index < 0) continue;
    const candidate = text.slice(index + marker.length, index + marker.length + 11);
    if (validVideoId(candidate)) return candidate;
  }
  return '';
}

function summaryFromBody(body) {
  const readable = body.split('```').filter((_, index) => index % 2 === 0).join(' ');
  const paragraphs = readable
    .split('\n\n')
    .map((part) => part.split('\n').map((line) => line.trim().replace(/^#+ /, '')).join(' ').replaceAll('*', ' ').replaceAll('_', ' ').replaceAll('`', ' ').replaceAll('>', ' ').trim())
    .filter((part) => part.length > 60);
  return (paragraphs[0] || '').slice(0, 480);
}

function parseNote(relativePath, raw, fileMtime) {
  const opening = '---\n';
  const closing = '\n---\n';
  let frontmatter = '';
  let body = raw;
  if (raw.startsWith(opening)) {
    const end = raw.indexOf(closing, opening.length);
    if (end >= 0) {
      frontmatter = raw.slice(opening.length, end);
      body = raw.slice(end + closing.length);
    }
  }
  const url = scalar(frontmatter, 'url') || scalar(frontmatter, 'resource') || videoId(raw);
  const sourceId = videoId(url);
  if (!sourceId) return null;
  const parts = relativePath.split(path.sep);
  const fallbackChannel = parts.length > 1 ? parts[0] : 'Unknown';
  const title = scalar(frontmatter, 'title') || path.basename(relativePath, '.md');
  const channel = scalar(frontmatter, 'channel') || fallbackChannel;
  const published = scalar(frontmatter, 'published') || scalar(frontmatter, 'timestamp') || '';
  const publishedDate = published ? new Date(published) : null;
  const rawBytes = Buffer.from(raw, 'utf8');
  return {
    canonicalPath: relativePath.split(path.sep).join('/'),
    sourceId,
    title,
    url: url.startsWith('http') ? url : `https://www.youtube.com/watch?v=${sourceId}`,
    channel,
    publishedAt: publishedDate && !Number.isNaN(publishedDate.getTime()) ? publishedDate.toISOString() : null,
    tags: list(frontmatter, 'tags'),
    summary: scalar(frontmatter, 'description') || summaryFromBody(body),
    bodyMarkdown: raw,
    contentHash: createHash('sha256').update(rawBytes).digest('hex'),
    fileMtime: fileMtime.toISOString(),
  };
}

async function collectMarkdown(directory, relative = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const nextRelative = relative ? path.join(relative, entry.name) : entry.name;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (['_channels', '_entities', '_templates'].includes(entry.name)) continue;
      files.push(...await collectMarkdown(fullPath, nextRelative));
    } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'index.md') {
      files.push({ fullPath, relativePath: nextRelative });
    }
  }
  return files;
}

const files = await collectMarkdown(root);
const notes = [];
let skipped = 0;
for (const file of files) {
  const [raw, metadata] = await Promise.all([readFile(file.fullPath, 'utf8'), stat(file.fullPath)]);
  const note = parseNote(file.relativePath, raw, metadata.mtime);
  if (note) notes.push(note);
  else skipped += 1;
}

const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 5000, application_name: 'knowledge-cockpit-youtube-sync' });
try {
  for (let offset = 0; offset < notes.length; offset += 20) {
    const batch = notes.slice(offset, offset + 20);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const note of batch) {
        await client.query(`
          INSERT INTO knowledge_cockpit.youtube_notes
            (canonical_path, source_id, title, url, channel, published_at, tags, summary, body_markdown, content_hash, file_mtime, synced_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9, $10, $11, now())
          ON CONFLICT (canonical_path) DO UPDATE SET
            source_id = EXCLUDED.source_id,
            title = EXCLUDED.title,
            url = EXCLUDED.url,
            channel = EXCLUDED.channel,
            published_at = EXCLUDED.published_at,
            tags = EXCLUDED.tags,
            summary = EXCLUDED.summary,
            body_markdown = EXCLUDED.body_markdown,
            content_hash = EXCLUDED.content_hash,
            file_mtime = EXCLUDED.file_mtime,
            synced_at = now()`, [
          note.canonicalPath,
          note.sourceId,
          note.title,
          note.url,
          note.channel,
          note.publishedAt,
          note.tags,
          note.summary,
          note.bodyMarkdown,
          note.contentHash,
          note.fileMtime,
        ]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    process.stdout.write(`synced_batch=${Math.min(offset + 20, notes.length)}/${notes.length}\n`);
  }
} finally {
  await pool.end();
}
process.stdout.write(`youtube_sync_complete files=${files.length} notes=${notes.length} skipped=${skipped}\n`);
