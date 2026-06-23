-- Open Questions bank: questions the system couldn't confidently answer,
-- queued for a human to answer manually. Answers become curated qa_pairs,
-- making the knowledge base self-improving and ready to back a live chatbot.

-- Curated answers have no source thread, and we tag their origin.
ALTER TABLE qa_pairs ALTER COLUMN thread_id DROP NOT NULL;
ALTER TABLE qa_pairs ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'extracted'
  CHECK (origin IN ('extracted', 'curated'));

CREATE TABLE IF NOT EXISTS open_questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question        TEXT NOT NULL,
  source_query_id UUID REFERENCES query_log(id) ON DELETE SET NULL,
  asked_by        TEXT,
  ask_count       INTEGER NOT NULL DEFAULT 1,          -- how many times this gap was hit
  reason          TEXT,                                -- why flagged: no_matching_context / insufficient_context / low_confidence
  best_confidence REAL,                                -- best confidence the bot managed
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'answered', 'dismissed')),
  answer          TEXT,                                -- the human-provided answer
  resulting_qa_id UUID REFERENCES qa_pairs(id) ON DELETE SET NULL,
  answered_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS open_questions_status_idx ON open_questions (status);
CREATE INDEX IF NOT EXISTS open_questions_norm_idx ON open_questions (lower(trim(question)));
