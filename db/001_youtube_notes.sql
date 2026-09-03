CREATE SCHEMA IF NOT EXISTS knowledge_cockpit;

CREATE TABLE IF NOT EXISTS knowledge_cockpit.youtube_notes (
    canonical_path text PRIMARY KEY,
    source_id text NOT NULL,
    title text NOT NULL,
    url text NOT NULL,
    channel text NOT NULL DEFAULT 'Unknown',
    published_at timestamptz,
    tags text[] NOT NULL DEFAULT '{}',
    summary text NOT NULL DEFAULT '',
    body_markdown text NOT NULL,
    content_hash text NOT NULL,
    file_mtime timestamptz,
    synced_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT youtube_notes_source_id_check CHECK (source_id ~ '^[A-Za-z0-9_-]{11}$')
);

CREATE INDEX IF NOT EXISTS youtube_notes_source_id_idx
    ON knowledge_cockpit.youtube_notes (source_id);

CREATE INDEX IF NOT EXISTS youtube_notes_published_at_idx
    ON knowledge_cockpit.youtube_notes (published_at DESC NULLS LAST, canonical_path);

CREATE INDEX IF NOT EXISTS youtube_notes_tags_idx
    ON knowledge_cockpit.youtube_notes USING gin (tags);
