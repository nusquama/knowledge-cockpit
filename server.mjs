import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { URL } from 'node:url';
import process from 'node:process';
import pg from 'pg';

const { Pool } = pg;
const PORT = Number.parseInt(process.env.PORT || '80', 10);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = new URL('.', import.meta.url);
const INDEX_PATH = new URL('./index.html', ROOT);
const APP_PATH = new URL('./app.js', ROOT);
const MAX_BODY_BYTES = 16 * 1024;
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 25;

let pool;

function getPool() {
  if (!pool) {
    const connectionString = process.env.KNOWLEDGE_COCKPIT_DATABASE_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('database_not_configured');
    }
    pool = new Pool({
      connectionString,
      max: Number.parseInt(process.env.DB_POOL_MAX || '3', 10),
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      maxUses: 1000,
      application_name: 'knowledge-cockpit',
    });
  }
  return pool;
}

async function query(text, values = []) {
  return getPool().query(text, values);
}

function json(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

function text(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' https://i.ytimg.com https://pbs.twimg.com https://abs.twimg.com data:; connect-src 'self'; object-src 'none'",
  };
}

function authorised(req) {
  if (process.env.NODE_ENV !== 'production' && process.env.KNOWLEDGE_COCKPIT_DEV_BYPASS === '1') {
    return { ok: true };
  }
  const username = process.env.KNOWLEDGE_COCKPIT_USER;
  const password = process.env.KNOWLEDGE_COCKPIT_PASSWORD;
  if (!username || !password) {
    return { ok: false, status: 503, code: 'auth_not_configured' };
  }
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) {
    return { ok: false, status: 401, code: 'auth_required' };
  }
  let decoded;
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  } catch {
    return { ok: false, status: 401, code: 'auth_invalid' };
  }
  const expected = `${username}:${password}`;
  const actualBuffer = Buffer.from(decoded);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return { ok: false, status: 401, code: 'auth_invalid' };
  }
  return { ok: true };
}

function rejectAuth(res, auth) {
  const headers = {
    ...securityHeaders(),
    ...(auth.status === 401 ? { 'WWW-Authenticate': 'Basic realm="Knowledge Cockpit", charset="UTF-8"' } : {}),
  };
  json(res, auth.status, { ok: false, error: auth.code }, headers);
}

function parsePage(value, fallback = 1) {
  const page = Number.parseInt(value || '', 10);
  return Number.isInteger(page) && page >= 1 && page <= 1000 ? page : fallback;
}

function parsePageSize(value) {
  const pageSize = Number.parseInt(value || '', 10);
  return [10, 25, 50].includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE;
}

function safeView(value) {
  return ['all', 'tweet', 'youtube', 'review'].includes(value) ? value : 'all';
}

function safeStatus(value) {
  return ['all', 'pending', 'running', 'done', 'warning'].includes(value) ? value : 'all';
}

function safeType(value) {
  return ['tweet', 'youtube'].includes(value) ? value : null;
}

function validIdentity(type, identity) {
  if (type === 'youtube') return /^[A-Za-z0-9_-]{11}$/.test(identity);
  if (type === 'tweet') return /^\d{1,30}$/.test(identity);
  return false;
}

function validSourceReference(type, reference) {
  if (type === 'youtube') return /^youtube:[A-Za-z0-9_-]{11}:[a-f0-9]{32}$/.test(reference);
  if (type === 'tweet') return /^tweet:\d{1,30}$/.test(reference);
  return false;
}

function isoDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function numberValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function listValue(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

const SOURCE_ROWS_CTE = `
WITH source_rows AS (
    SELECT
        'youtube'::text AS source_type,
        'youtube:' || n.source_id || ':' || md5(n.canonical_path) AS id,
        n.source_id AS identity,
        n.title,
        n.summary,
        n.channel AS author,
        n.published_at AS source_date,
        n.tags,
        n.url AS source_url,
        NULL::text AS media_url,
        n.body_markdown,
        n.canonical_path AS original_path,
        n.content_hash,
        review.review_key,
        review.revision AS review_revision,
        review.status AS review_status,
        review.owner AS review_owner,
        review.report_digest,
        review.updated_at AS review_updated_at
    FROM knowledge_cockpit.youtube_notes AS n
    LEFT JOIN LATERAL (
        SELECT r.review_key, r.revision, r.status, r.owner, r.report_digest, r.updated_at
        FROM knowledge_review.records AS r
        WHERE r.source = 'youtube' AND r.identity = n.source_id
        ORDER BY (r.revision = n.content_hash) DESC NULLS LAST, r.updated_at DESC
        LIMIT 1
    ) AS review ON true

    UNION ALL

    SELECT
        'tweet'::text AS source_type,
        'tweet:' || t.id AS id,
        t.id AS identity,
        COALESCE(NULLIF(t.title, ''), NULLIF(left(t.content, 140), ''), 'Tweet') AS title,
        COALESCE(NULLIF(t.summary, ''), NULLIF(left(t.content, 280), ''), '') AS summary,
        COALESCE(NULLIF(t.author_display, ''), NULLIF(t.author_username, ''), 'X') AS author,
        t.created_at AS source_date,
        COALESCE(t.tags, ARRAY[]::text[]) AS tags,
        t.url AS source_url,
        t.media_url,
        t.content AS body_markdown,
        NULL::text AS original_path,
        NULL::text AS content_hash,
        review.review_key,
        review.revision AS review_revision,
        review.status AS review_status,
        review.owner AS review_owner,
        review.report_digest,
        review.updated_at AS review_updated_at
    FROM public.v_tweet AS t
    LEFT JOIN LATERAL (
        SELECT r.review_key, r.revision, r.status, r.owner, r.report_digest, r.updated_at
        FROM knowledge_review.records AS r
        WHERE r.source = 'twitter' AND r.identity = t.id
        ORDER BY r.updated_at DESC
        LIMIT 1
    ) AS review ON true
), normalised AS (
    SELECT
        source_rows.*,
        CASE
            WHEN review_key IS NULL THEN 'pending'
            WHEN source_type = 'youtube' AND review_revision IS DISTINCT FROM content_hash THEN 'warning'
            WHEN lower(COALESCE(review_status, '')) IN ('in_progress', 'running', 'claimed') THEN 'running'
            WHEN lower(COALESCE(review_status, '')) IN ('youtube_complete', 'twitter_complete', 'done', 'complete', 'extraction_courte') THEN 'done'
            ELSE 'warning'
        END AS status
    FROM source_rows
)
`;

function sourceDto(row, detail = false) {
  const dto = {
    id: row.id,
    type: row.source_type,
    identity: row.identity,
    title: row.title || 'Sans titre',
    summary: row.summary || '',
    author: row.author || 'Inconnu',
    date: isoDate(row.source_date),
    status: row.status,
    statusLabel: {
      pending: 'À analyser',
      running: 'En cours',
      done: 'Terminée',
      warning: 'À reprendre',
    }[row.status] || 'À reprendre',
    tags: listValue(row.tags),
    url: row.source_url || null,
    mediaUrl: row.media_url || null,
    originalPath: row.original_path || null,
    review: row.review_key ? {
      key: row.review_key,
      status: row.review_status || null,
      revision: row.review_revision || null,
      owner: row.review_owner || null,
      reportDigest: row.report_digest || null,
      updatedAt: isoDate(row.review_updated_at),
      revisionMatch: row.source_type !== 'youtube' || row.review_revision === row.content_hash,
    } : null,
  };
  if (detail) dto.bodyMarkdown = row.body_markdown || '';
  return dto;
}

async function getStats() {
  const result = await query(`${SOURCE_ROWS_CTE}
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE source_type = 'tweet')::int AS tweets_total,
      count(*) FILTER (WHERE source_type = 'youtube')::int AS youtube_total,
      count(*) FILTER (WHERE status = 'pending')::int AS pending_total,
      count(*) FILTER (WHERE source_type = 'youtube' AND status = 'pending')::int AS youtube_pending,
      count(*) FILTER (WHERE source_type = 'tweet' AND status = 'pending')::int AS tweet_pending,
      count(*) FILTER (WHERE status = 'running')::int AS running_total,
      count(*) FILTER (WHERE status = 'done')::int AS done_total,
      count(*) FILTER (WHERE status = 'warning')::int AS warning_total,
      (SELECT count(*)::int FROM knowledge_review.records WHERE source IN ('youtube', 'twitter')) AS reviews_total,
      (SELECT count(*)::int FROM knowledge_review.reports) AS reports_total,
      (SELECT max(synced_at) FROM knowledge_cockpit.youtube_notes) AS youtube_sync_at,
      (SELECT max(updated_at) FROM knowledge_review.records WHERE source IN ('youtube', 'twitter')) AS review_updated_at
    FROM normalised`);
  const row = result.rows[0] || {};
  return {
    total: numberValue(row.total),
    tweets: numberValue(row.tweets_total),
    youtube: numberValue(row.youtube_total),
    pending: numberValue(row.pending_total),
    youtubePending: numberValue(row.youtube_pending),
    tweetPending: numberValue(row.tweet_pending),
    running: numberValue(row.running_total),
    done: numberValue(row.done_total),
    warning: numberValue(row.warning_total),
    reviews: numberValue(row.reviews_total),
    reports: numberValue(row.reports_total),
    youtubeSyncAt: isoDate(row.youtube_sync_at),
    reviewUpdatedAt: isoDate(row.review_updated_at),
  };
}

function buildQueue(stats) {
  return [
    { label: 'YouTube à analyser', kind: 'YouTube', count: stats.youtubePending, status: 'pending' },
    { label: 'Tweets à analyser', kind: 'Tweets', count: stats.tweetPending, status: 'pending' },
    { label: 'Reviews en cours', kind: 'Reviews', count: stats.running, status: 'running' },
    { label: 'À reprendre', kind: 'Reviews', count: stats.warning, status: 'warning' },
  ];
}

async function getSources({ view = 'all', status = 'all', queryText = '', page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const offset = (page - 1) * pageSize;
  const result = await query(`${SOURCE_ROWS_CTE}
    SELECT normalised.*, count(*) OVER()::int AS total_count
    FROM normalised
    WHERE ($1 = 'all' OR source_type = $1 OR ($1 = 'review' AND status <> 'pending'))
      AND ($2 = 'all' OR status = $2)
      AND ($3 = '' OR (
        title ILIKE '%' || $3 || '%'
        OR summary ILIKE '%' || $3 || '%'
        OR author ILIKE '%' || $3 || '%'
        OR array_to_string(tags, ' ') ILIKE '%' || $3 || '%'
      ))
    ORDER BY source_date DESC NULLS LAST, id DESC
    LIMIT $4 OFFSET $5`, [view, status, queryText, pageSize, offset]);
  return {
    data: result.rows.map((row) => sourceDto(row)),
    meta: {
      page,
      pageSize,
      total: numberValue(result.rows[0]?.total_count),
    },
  };
}

async function getSource(type, reference) {
  const result = await query(`${SOURCE_ROWS_CTE}
    SELECT *
    FROM normalised
    WHERE source_type = $1 AND id = $2
    LIMIT 1`, [type, reference]);
  if (!result.rows.length) return null;
  const source = sourceDto(result.rows[0], true);
  if (source.review?.reportDigest) {
    const report = await query(`
      SELECT digest, name, body, created_at
      FROM knowledge_review.reports
      WHERE digest = $1
      LIMIT 1`, [source.review.reportDigest]);
    if (report.rows[0]) {
      source.report = {
        digest: report.rows[0].digest,
        name: report.rows[0].name || 'Rapport',
        body: report.rows[0].body || '',
        createdAt: isoDate(report.rows[0].created_at),
      };
    }
  }
  return source;
}

async function sourceExists(type, identity) {
  const result = await query(`${SOURCE_ROWS_CTE}
    SELECT 1 FROM normalised
    WHERE source_type = $1 AND identity = $2
    LIMIT 1`, [type, identity]);
  return result.rows.length > 0;
}

async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new Error('body_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function queueReview(type, identity) {
  if (!validIdentity(type, identity)) {
    return { status: 400, payload: { ok: false, error: 'invalid_source_identity' } };
  }
  if (!(await sourceExists(type, identity))) {
    return { status: 404, payload: { ok: false, error: 'source_not_found' } };
  }
  const bridgeUrl = process.env.KNOWLEDGE_REVIEW_BRIDGE_URL;
  if (!bridgeUrl) {
    return { status: 503, payload: { ok: false, error: 'review_bridge_not_configured' } };
  }
  let url;
  try {
    url = new URL(bridgeUrl);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('unsupported_protocol');
  } catch {
    return { status: 503, payload: { ok: false, error: 'review_bridge_invalid' } };
  }
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.KNOWLEDGE_REVIEW_BRIDGE_TOKEN) {
    headers.Authorization = `Bearer ${process.env.KNOWLEDGE_REVIEW_BRIDGE_TOKEN}`;
  }
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ source: type === 'tweet' ? 'twitter' : 'youtube', identity }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    return { status: 502, payload: { ok: false, error: 'review_bridge_failed' } };
  }
  return { status: 202, payload: { ok: true, queued: true, source: type, identity } };
}

async function handleApi(req, res, url) {
  const auth = authorised(req);
  if (!auth.ok) return rejectAuth(res, auth);

  if (req.method === 'GET' && url.pathname === '/api/bootstrap') {
    const view = safeView(url.searchParams.get('view'));
    const status = safeStatus(url.searchParams.get('status'));
    const queryText = (url.searchParams.get('q') || '').trim().slice(0, 120);
    const page = parsePage(url.searchParams.get('page'));
    const pageSize = parsePageSize(url.searchParams.get('pageSize'));
    const [stats, sources] = await Promise.all([getStats(), getSources({ view, status, queryText, page, pageSize })]);
    return json(res, 200, { ok: true, stats, queue: buildQueue(stats), ...sources });
  }

  if (req.method === 'GET' && url.pathname === '/api/sources') {
    const view = safeView(url.searchParams.get('view'));
    const status = safeStatus(url.searchParams.get('status'));
    const queryText = (url.searchParams.get('q') || '').trim().slice(0, 120);
    const page = parsePage(url.searchParams.get('page'));
    const pageSize = parsePageSize(url.searchParams.get('pageSize'));
    const sources = await getSources({ view, status, queryText, page, pageSize });
    return json(res, 200, { ok: true, ...sources });
  }

  if (req.method === 'GET' && url.pathname === '/api/source') {
    const type = safeType(url.searchParams.get('type'));
    const reference = url.searchParams.get('id') || '';
    if (!type || !validSourceReference(type, reference)) return json(res, 400, { ok: false, error: 'invalid_source_reference' });
    const source = await getSource(type, reference);
    if (!source) return json(res, 404, { ok: false, error: 'source_not_found' });
    return json(res, 200, { ok: true, source });
  }

  if (req.method === 'POST' && url.pathname === '/api/reviews/queue') {
    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch {
      return json(res, 400, { ok: false, error: 'invalid_request' });
    }
    const type = safeType(payload?.type);
    const identity = typeof payload?.identity === 'string' ? payload.identity : '';
    const result = await queueReview(type, identity);
    return json(res, result.status, result.payload);
  }

  return json(res, 404, { ok: false, error: 'not_found' });
}

async function handleHealth(req, res) {
  if (!['GET', 'HEAD'].includes(req.method)) return text(res, 405, 'method not allowed\n');
  try {
    await query('SELECT 1');
    return text(res, 200, 'ok\n');
  } catch {
    process.stderr.write('healthz_error=database_unavailable\n');
    return text(res, 503, 'unhealthy\n');
  }
}

async function handleStatic(req, res, url) {
  const auth = authorised(req);
  if (!auth.ok) return rejectAuth(res, auth);
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const body = await readFile(INDEX_PATH);
    res.writeHead(200, { ...securityHeaders(), 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
    return res.end(body);
  }
  if (url.pathname === '/app.js') {
    const body = await readFile(APP_PATH);
    res.writeHead(200, { ...securityHeaders(), 'Content-Type': 'application/javascript; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
    return res.end(body);
  }
  if (url.pathname === '/favicon.ico') return text(res, 204, '');
  return text(res, 404, 'not found\n', securityHeaders());
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/healthz') return await handleHealth(req, res);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (!['GET', 'HEAD'].includes(req.method)) return text(res, 405, 'method not allowed\n', securityHeaders());
    return await handleStatic(req, res, url);
  } catch {
    process.stderr.write(`request_error=unavailable path=${url.pathname}\n`);
    if (!res.headersSent) {
      return json(res, 503, { ok: false, error: 'data_source_unavailable' });
    }
    res.end();
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`knowledge_cockpit_listening=${HOST}:${PORT}\n`);
});

async function shutdown(signal) {
  server.close(async () => {
    if (pool) await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
  process.stdout.write(`knowledge_cockpit_shutdown=${signal}\n`);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
