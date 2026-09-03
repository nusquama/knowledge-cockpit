# Changelog

## 2026-09-03 — Connect Knowledge Cockpit to real sources

- Replaced the fictitious client dataset with a server-owned API.
- Added bounded search, filters, pagination, source detail, and live counters.
- Added the Supabase mirror contract for Obsidian YouTube notes.
- Added server-side authentication and secret isolation.
- Added strict review-source validation and an optional review bridge.
- Added local validation and integration tests.

Verification status:

- Local source queries: passed with 942 tweets and 271 mirrored YouTube notes.
- Local application tests: passed with 1,213 source rows and duplicate-detail coverage.
- Local browser verification: passed for counters, YouTube filter, search, detail, and review-bridge error handling.
- Coolify runtime variables: configured through the approved wrapper; values are not stored in Git.
- Coolify deployment: pending after this commit is published.
- Follow-up fix: source details now use unique mirror references for duplicate YouTube IDs.
- Follow-up fix: authentication rejection responses include the security headers.
- Follow-up UI fix: source details stay anchored right and render Markdown as readable content without raw front matter.
