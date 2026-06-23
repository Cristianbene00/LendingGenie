-- Migration 004: human-review flag on KB entries + sufficient_context on query log
-- Run with: psql $DATABASE_URL -f scripts/migrations/004_review_and_stats.sql

-- 1. Human-review flag on qa_pairs
--    Auto-extracted entries start unreviewed (false); curated/manual entries are pre-approved.
ALTER TABLE qa_pairs ADD COLUMN IF NOT EXISTS is_reviewed BOOLEAN NOT NULL DEFAULT false;
UPDATE qa_pairs SET is_reviewed = true WHERE origin = 'curated';
UPDATE qa_pairs SET is_reviewed = true WHERE source_label = 'Manual';
UPDATE qa_pairs SET is_reviewed = true WHERE origin = 'extracted' AND extraction_confidence >= 0.90;

-- 2. Track whether the bot had sufficient context for each query.
--    Enables accurate answer-rate stats on the dashboard.
ALTER TABLE query_log ADD COLUMN IF NOT EXISTS sufficient_context BOOLEAN;
