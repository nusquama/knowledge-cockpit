# Connected architecture

## Contract

Authorization: one Franck operator account protected by server-side HTTP Basic Authentication.
Applicability: one private dashboard, bounded lists, read-heavy usage.
Workload, owner, transport, database role, and RLS behavior: the application owns a narrow server adapter. The adapter uses the read-only path available to the self-hosted `amastuces` instance. The browser has no database credentials and no direct Supabase connection.
API schema, source object, row grain, and allowed columns: tweets use `public.v_tweet` at one tweet per row. YouTube uses `knowledge_cockpit.youtube_notes` at one Markdown file per row. Reviews use `knowledge_review.records` and `knowledge_review.reports` at one review record or report per row. The API returns only the fields required by the dashboard.
List/search/filter/sort/page/count/export contract: the server applies whitelisted view and status filters, bounded search, deterministic newest-first sorting, page size 10/25/50, and offset pagination. The API does not expose bulk export.
Freshness, cache, and Realtime contract: browser responses use `no-store`. Tweets and reviews read the source on request. YouTube notes use an incremental mirror with `synced_at`; the sync updates existing paths and does not delete rows. Realtime is not used.
Connector identity, privilege, and failure policy: the YouTube sync runs on the trusted host with the Agent Supabase wrapper and a private database URL. Review launch validates type and source identity, then uses an explicitly configured server bridge. Missing bridge configuration returns an error and never simulates success.
Scale/geographic requirements, or N/A until triggered: N/A. The current workload is below the documented scale trigger.
Production change approval: Franck explicitly requested connection of the dashboard to real sources. The table change is additive. No destructive database operation is used.

## Why the first connected version uses a server adapter

The `amastuces` instance has no Auth user for Franck and the target review schema is private.
A public browser key would not provide a safe authorization boundary for this dashboard.
The server adapter keeps the database URL and any review bridge credential outside the browser.
A future Supabase Auth migration can replace the adapter after an Auth user, exposed read schema, grants, and RLS tests exist.

## Review identity

YouTube review matching uses `source + identity + revision`.
The revision is compared with the mirrored Markdown content hash.
A changed note becomes `warning` until a new review matches the new revision.
Twitter review matching uses `source + identity` because the existing review registry does not expose a normalized content hash for every tweet.

## Deployment variables

Required runtime variables:

- `KNOWLEDGE_COCKPIT_DATABASE_URL`.
- `KNOWLEDGE_COCKPIT_USER`.
- `KNOWLEDGE_COCKPIT_PASSWORD`.

Optional runtime variables:

- `KNOWLEDGE_REVIEW_BRIDGE_URL`.
- `KNOWLEDGE_REVIEW_BRIDGE_TOKEN`.
- `DB_POOL_MAX`.

The values must come from the approved secret path.
They must not appear in Git, image layers, client JavaScript, logs, or documentation.
