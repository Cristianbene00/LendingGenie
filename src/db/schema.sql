-- LendingGenie Knowledge Base Schema
-- PostgreSQL with pgvector extension

CREATE EXTENSION IF NOT EXISTS vector;

-- Threads from email or Teams (raw source data)
CREATE TABLE IF NOT EXISTS threads (
  id UUID PRIMARY KEY,
  source_id UUID NOT NULL,
  source_kind VARCHAR(20) NOT NULL,
  source_label VARCHAR(255),
  topic VARCHAR(500) NOT NULL,
  messages JSONB NOT NULL,
  participants TEXT[] NOT NULL,
  earliest_at TIMESTAMP,
  latest_at TIMESTAMP,
  dedup_key VARCHAR(255) UNIQUE NOT NULL,
  extraction_status VARCHAR(50) DEFAULT 'pending',
  extraction_reason TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_threads_source_id ON threads(source_id);
CREATE INDEX idx_threads_extraction_status ON threads(extraction_status);

-- Source uploads (mbox files, Teams syncs)
CREATE TABLE IF NOT EXISTS source_uploads (
  id UUID PRIMARY KEY,
  kind VARCHAR(50) NOT NULL,
  filename VARCHAR(255),
  bytes BIGINT,
  status VARCHAR(50) DEFAULT 'pending',
  thread_count INTEGER,
  qa_count INTEGER,
  created_at TIMESTAMP DEFAULT now(),
  completed_at TIMESTAMP
);

CREATE INDEX idx_source_uploads_status ON source_uploads(status);

-- Q&A pairs (curated knowledge base)
CREATE TABLE IF NOT EXISTS qa_pairs (
  id UUID PRIMARY KEY,
  thread_id UUID REFERENCES threads(id),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category VARCHAR(255),
  tags TEXT[] DEFAULT '{}',
  extraction_confidence FLOAT DEFAULT 0.5,
  origin VARCHAR(50) DEFAULT 'extracted',
  source_label VARCHAR(255),
  curator_notes TEXT,
  is_active BOOLEAN DEFAULT true,
  is_reviewed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_qa_pairs_is_active ON qa_pairs(is_active);
CREATE INDEX idx_qa_pairs_is_reviewed ON qa_pairs(is_reviewed);
CREATE INDEX idx_qa_pairs_source_label ON qa_pairs(source_label);
CREATE INDEX idx_qa_pairs_category ON qa_pairs(category);
CREATE INDEX idx_qa_pairs_created_at ON qa_pairs(created_at DESC);

-- Embeddings (vector search index)
CREATE TABLE IF NOT EXISTS qa_embeddings (
  qa_id UUID PRIMARY KEY REFERENCES qa_pairs(id) ON DELETE CASCADE,
  embedding vector(1536) NOT NULL,
  embedded_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_qa_embeddings_embedding ON qa_embeddings USING ivfflat (embedding vector_cosine_ops);

-- Query log (for analytics and feedback)
CREATE TABLE IF NOT EXISTS query_log (
  id UUID PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT,
  user_email VARCHAR(255),
  user_rating SMALLINT,
  user_feedback TEXT,
  sufficient_context BOOLEAN,
  confidence FLOAT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_query_log_created_at ON query_log(created_at DESC);
CREATE INDEX idx_query_log_user_email ON query_log(user_email);

-- Open questions (gaps the bot couldn't answer)
CREATE TABLE IF NOT EXISTS open_questions (
  id UUID PRIMARY KEY,
  question TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'open',
  answer TEXT,
  resulting_qa_id UUID REFERENCES qa_pairs(id),
  ask_count INTEGER DEFAULT 1,
  reason TEXT,
  best_confidence FLOAT,
  source_query_id UUID,
  asked_by VARCHAR(255),
  answered_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_open_questions_status ON open_questions(status);
CREATE INDEX idx_open_questions_ask_count ON open_questions(ask_count DESC);
CREATE INDEX idx_open_questions_updated_at ON open_questions(updated_at DESC);

-- Product feedback (team notepad)
CREATE TABLE IF NOT EXISTS product_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_product_feedback_created_at ON product_feedback(created_at DESC);
