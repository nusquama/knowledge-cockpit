import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:18787';
const externalServer = Boolean(process.env.TEST_BASE_URL);
if (!externalServer && !process.env.KNOWLEDGE_COCKPIT_DATABASE_URL && !process.env.DATABASE_URL) {
  console.log('INTEGRATION TEST SKIPPED: database URL is not available');
  process.exit(0);
}

let child;
if (!externalServer) {
  child = spawn(process.execPath, ['server.mjs'], {
    env: {
      ...process.env,
      NODE_ENV: 'development',
      KNOWLEDGE_COCKPIT_DEV_BYPASS: '1',
      PORT: '18787',
      HOST: '127.0.0.1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', () => {});
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/healthz`);
      if (response.status === 200) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function get(path, options) {
  const response = await fetch(`${base}${path}`, options);
  const body = await response.text();
  let json = null;
  try { json = JSON.parse(body); } catch {}
  return { response, body, json };
}

try {
  const health = await get('/healthz');
  assert.equal(health.response.status, 200, health.body);
  assert.equal(health.body, 'ok\n');

  const bootstrap = await get('/api/bootstrap');
  assert.equal(bootstrap.response.status, 200, bootstrap.body);
  assert.equal(bootstrap.json.ok, true);
  assert.ok(bootstrap.json.stats.total > 0);
  assert.ok(bootstrap.json.stats.tweets > 0);
  assert.ok(bootstrap.json.stats.youtube > 0);
  assert.ok(Array.isArray(bootstrap.json.data));
  assert.ok(bootstrap.json.data.length <= 25);

  const youtube = await get('/api/sources?view=youtube&pageSize=50');
  assert.equal(youtube.response.status, 200, youtube.body);
  assert.equal(youtube.json.meta.pageSize, 50);
  assert.ok(youtube.json.data.every((item) => item.type === 'youtube'));

  const duplicatePair = youtube.json.data.find((item, index, items) => items.some((other, otherIndex) => otherIndex > index && other.identity === item.identity));
  if (duplicatePair) {
    const duplicate = youtube.json.data.find((item) => item.identity === duplicatePair.identity && item.id !== duplicatePair.id);
    const firstDuplicateDetail = await get(`/api/source?type=youtube&id=${encodeURIComponent(duplicatePair.id)}`);
    const secondDuplicateDetail = await get(`/api/source?type=youtube&id=${encodeURIComponent(duplicate.id)}`);
    assert.equal(firstDuplicateDetail.response.status, 200, firstDuplicateDetail.body);
    assert.equal(secondDuplicateDetail.response.status, 200, secondDuplicateDetail.body);
    assert.notEqual(firstDuplicateDetail.json.source.originalPath, secondDuplicateDetail.json.source.originalPath);
  }

  const tweet = await get('/api/sources?view=tweet&q=Codex&pageSize=10');
  assert.equal(tweet.response.status, 200, tweet.body);
  assert.ok(tweet.json.data.every((item) => item.type === 'tweet'));

  const first = bootstrap.json.data[0];
  const detail = await get(`/api/source?type=${encodeURIComponent(first.type)}&id=${encodeURIComponent(first.id)}`);
  assert.equal(detail.response.status, 200, detail.body);
  assert.equal(detail.json.source.identity, first.identity);
  assert.ok(typeof detail.json.source.bodyMarkdown === 'string');

  const invalidReview = await get('/api/reviews/queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'unknown', identity: 'bad' }),
  });
  assert.equal(invalidReview.response.status, 400, invalidReview.body);

  console.log(JSON.stringify({
    health: health.response.status,
    total: bootstrap.json.stats.total,
    tweets: bootstrap.json.stats.tweets,
    youtube: bootstrap.json.stats.youtube,
    sampleType: first.type,
    invalidReviewStatus: invalidReview.response.status,
  }));
} finally {
  if (child) child.kill('SIGTERM');
}
