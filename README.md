# Knowledge Cockpit

Knowledge Cockpit is a static prototype for a private knowledge library.

The prototype demonstrates the approved user flow before any data integration:

- global processing view;
- YouTube notes;
- Twitter sources;
- review records and reports;
- client-side search and filters;
- source detail view;
- simulated review actions.

## Current scope

This release uses fictitious data embedded in `index.html`.

It does not connect to Supabase, Obsidian, or the real review queue.

It does not store credentials or call external APIs.

Obsidian remains the planned canonical source for YouTube notes.

Supabase remains the planned read mirror for the future connected release.

## Local preview

Run the static preview with Python:

```bash
python3 -m http.server 8080 --bind 127.0.0.1
```

Open `http://127.0.0.1:8080/` in a browser.

## Container

Build and run the production-like static container with Docker:

```bash
docker build -t knowledge-cockpit .
docker run --rm -p 8080:80 knowledge-cockpit
```

The health endpoint is `http://127.0.0.1:8080/healthz`.

## Validation

Run the dependency-free static checks:

```bash
python3 scripts/validate_static.py
```

The Coolify deployment uses the Dockerfile build pack and exposes port `80`.
