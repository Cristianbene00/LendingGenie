CREATE TABLE IF NOT EXISTS product_feedback (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  body       TEXT        NOT NULL CHECK (char_length(body) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
