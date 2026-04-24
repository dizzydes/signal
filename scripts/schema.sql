CREATE TABLE IF NOT EXISTS signals (
  id              BIGSERIAL PRIMARY KEY,
  source          TEXT NOT NULL,
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  classification  TEXT,
  claimed_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS signals_status_created_idx
  ON signals (status, created_at);

CREATE TABLE IF NOT EXISTS transcripts (
  id            BIGSERIAL PRIMARY KEY,
  signal_id     BIGINT NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  commands      JSONB NOT NULL DEFAULT '[]'::jsonb,
  reasoning     TEXT,
  diff          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transcripts_signal_idx
  ON transcripts (signal_id);

CREATE TABLE IF NOT EXISTS pull_requests (
  id                BIGSERIAL PRIMARY KEY,
  signal_id         BIGINT NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  github_pr_number  INTEGER NOT NULL,
  branch            TEXT NOT NULL,
  preview_url       TEXT,
  services_rebuilt  TEXT[] NOT NULL DEFAULT '{}',
  services_skipped  TEXT[] NOT NULL DEFAULT '{}',
  build_ms          INTEGER,
  merged_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pull_requests_pr_number_uidx
  ON pull_requests (github_pr_number);
