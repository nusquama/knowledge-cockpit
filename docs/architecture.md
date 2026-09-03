# Architecture

## Prototype boundary

The current release is a static browser prototype.

`index.html` contains the presentation, interactions, and fictitious data.

The browser does not call Supabase, Obsidian, Hermes, or external APIs.

Nginx serves the static files and exposes `/healthz` for deployment checks.

## Future connected boundary

The future release must keep the following ownership:

```text
Obsidian
  -> one-way Markdown synchronization
  -> private Supabase read mirror
  -> Knowledge Cockpit server and browser
```

Obsidian remains canonical for YouTube notes.

Supabase serves bounded, authorized dashboard reads.

Review execution must pass through a controlled server-side bridge.

This prototype does not implement that boundary.
