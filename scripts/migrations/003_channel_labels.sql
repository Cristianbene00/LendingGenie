-- Channel/source labeling so the knowledge base can distinguish where each
-- Q&A came from (e.g. "Engineers" vs "Collections and Customer Service").

ALTER TABLE threads  ADD COLUMN IF NOT EXISTS source_label TEXT;
ALTER TABLE qa_pairs ADD COLUMN IF NOT EXISTS source_label TEXT;

-- Backfill: every Teams thread synced so far came from the Engineers channel.
UPDATE threads  SET source_label = 'Engineers' WHERE source_kind = 'teams' AND source_label IS NULL;
UPDATE qa_pairs q SET source_label = t.source_label
  FROM threads t WHERE q.thread_id = t.id AND q.source_label IS NULL;

CREATE INDEX IF NOT EXISTS qa_pairs_source_label_idx ON qa_pairs (source_label);
