# Knowledge Cockpit

Knowledge Cockpit is a private, connected dashboard for Franck's knowledge sources.

## Connected sources

- Tweets read from `public.v_tweet` in the self-hosted Supabase instance.
- YouTube notes mirrored from `/home/openclaw/dropbox-youtube-summary` into `knowledge_cockpit.youtube_notes`.
- Review state read from `knowledge_review.records`.
- Review reports read from `knowledge_review.reports`.

Obsidian remains the canonical source for YouTube notes.
The Supabase table is a read mirror for the dashboard.
The sync never deletes rows and never changes the Markdown source.

## Security boundary

The browser talks only to the same-origin application API.
The application uses a server-only PostgreSQL connection string.
The connection string never enters HTML, JavaScript, or API responses.
Production access requires HTTP Basic Authentication.
Set `KNOWLEDGE_COCKPIT_USER` and `KNOWLEDGE_COCKPIT_PASSWORD` as runtime secrets.
Do not commit them.

The review button validates source type and identity on the server.
It forwards requests only when `KNOWLEDGE_REVIEW_BRIDGE_URL` is configured.
It does not simulate a review when the bridge is absent.

## Local setup

Load the database URL through the approved secret wrapper or an existing private runtime environment.
Do not create a repository `.env` file.

```bash
export KNOWLEDGE_COCKPIT_DEV_BYPASS=1
node scripts/sync_youtube_notes.mjs --root /home/openclaw/dropbox-youtube-summary
node server.mjs
```

The sync requires the `knowledge_cockpit.youtube_notes` table.
Apply `db/001_youtube_notes.sql` through the approved Supabase wrapper.

Open `http://127.0.0.1:80` after setting `PORT=80` or use another local port.

## Commands

```bash
npm ci
npm test
npm start
```

## Container

```bash
docker build -t knowledge-cockpit .
docker run --rm -p 8080:80 \
  -e KNOWLEDGE_COCKPIT_DATABASE_URL="$KNOWLEDGE_COCKPIT_DATABASE_URL" \
  -e KNOWLEDGE_COCKPIT_USER=franck \
  -e KNOWLEDGE_COCKPIT_PASSWORD="$KNOWLEDGE_COCKPIT_PASSWORD" \
  knowledge-cockpit
```

## Data contract

See `docs/architecture.md` for the workload, authorization, freshness, and review-bridge contract.
