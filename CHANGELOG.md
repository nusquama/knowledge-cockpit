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
- Coolify deployment: verified running:healthy at commit `619e314`; HTTPS and security headers passed the public check.
- Follow-up fix: source details now use unique mirror references for duplicate YouTube IDs.
- Follow-up fix: authentication rejection responses include the security headers.
- Follow-up UI fix: source details stay anchored right and render Markdown as readable content without raw front matter.
- Follow-up security fix: HTTPS responses include HSTS.
- Follow-up layout fix: source details use a centered wide reading sheet, with empty report boxes hidden.
- Follow-up media fix: missing local captures render as compact references, and Markdown links remain readable.
- Follow-up spacing fix: source details fit their content, use one scroll area, and keep mobile code blocks within the viewport.
- Follow-up regression test: npm test checks the source-panel spacing and responsive layout contracts.

## 2026-09-04 — Remove source panel bottom gap

- Removed the artificial vertical gap created by the flexible detail body.
- Kept the detail panel centered and content-sized on desktop.
- Kept the mobile panel full-height with actions anchored after the scroll area.
- Replaced nested source scrolling with one detail-panel scroll area.
- Wrapped long code and quote lines to prevent mobile horizontal overflow.
- Added seven UI layout contracts to the npm test suite.
- Verified desktop and mobile screenshots with Apex visual review.
- Deployed and verified commit `619e314` on Coolify.
