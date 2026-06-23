CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- Every .mbox upload or Teams sync run
CREATE TABLE IF NOT EXISTS source_uploads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            TEXT NOT NULL CHECK (kind IN ('mbox', 'teams_sync')),
  filename        TEXT,
  uploaded_by     TEXT,
  bytes           BIGINT,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'parsing', 'extracting', 'embedding', 'complete', 'failed')),
  thread_count    INTEGER DEFAULT 0,
  qa_count        INTEGER DEFAULT 0,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

-- Reconstructed conversations from emails or Teams
CREATE TABLE IF NOT EXISTS threads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       UUID REFERENCES source_uploads(id) ON DELETE SET NULL,
  source_kind     TEXT NOT NULL CHECK (source_kind IN ('email', 'teams')),
  topic           TEXT NOT NULL,
  messages        JSONB NOT NULL,
  message_count   INTEGER GENERATED ALWAYS AS (jsonb_array_length(messages)) STORED,
  participants    JSONB NOT NULL DEFAULT '[]',
  earliest_at     TIMESTAMPTZ,
  latest_at       TIMESTAMPTZ,
  dedup_key       TEXT UNIQUE NOT NULL,
  extraction_status TEXT NOT NULL DEFAULT 'pending'
                  CHECK (extraction_status IN ('pending', 'skipped_not_qa', 'extracted', 'failed')),
  extraction_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS threads_status_idx ON threads (extraction_status);
CREATE INDEX IF NOT EXISTS threads_source_idx ON threads (source_id);

-- The actual knowledge base — clean Q&A pairs extracted by Claude
CREATE TABLE IF NOT EXISTS qa_pairs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id       UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  question        TEXT NOT NULL,
  answer          TEXT NOT NULL,
  category        TEXT,
  tags            TEXT[] NOT NULL DEFAULT '{}',
  extraction_confidence REAL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  curator_notes   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qa_pairs_thread_idx ON qa_pairs (thread_id);
CREATE INDEX IF NOT EXISTS qa_pairs_active_idx ON qa_pairs (is_active);

-- 1536-dim vectors for OpenAI text-embedding-3-small
CREATE TABLE IF NOT EXISTS qa_embeddings (
  qa_id           UUID PRIMARY KEY REFERENCES qa_pairs(id) ON DELETE CASCADE,
  embedding       VECTOR(1536) NOT NULL,
  embedded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qa_embeddings_hnsw_idx
  ON qa_embeddings USING hnsw (embedding vector_cosine_ops);

-- Every question asked of the KB — for eval and monitoring
CREATE TABLE IF NOT EXISTS query_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text      TEXT NOT NULL,
  user_email      TEXT,
  retrieved_qa_ids UUID[] NOT NULL DEFAULT '{}',
  answer          TEXT,
  citations       JSONB NOT NULL DEFAULT '[]',
  confidence      REAL,
  cost_usd        NUMERIC(10, 6) NOT NULL DEFAULT 0,
  latency_ms      INTEGER,
  user_rating     INTEGER CHECK (user_rating IN (1, -1)),
  user_feedback   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS query_log_created_idx ON query_log (created_at DESC);

-- Track fine-tune dataset exports
CREATE TABLE IF NOT EXISTS finetune_exports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename        TEXT NOT NULL,
  qa_count        INTEGER NOT NULL,
  format          TEXT NOT NULL,
  filters         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
