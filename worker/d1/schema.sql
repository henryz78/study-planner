-- Cloudflare D1 schema for study-planner sync (mirrors Supabase study_snapshots)
-- Minimal invasive: keep same logical model, only store portable state JSON.

CREATE TABLE IF NOT EXISTS study_snapshots (
  user_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  client_updated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Helpful index for updated_at ordering (optional)
CREATE INDEX IF NOT EXISTS idx_study_snapshots_updated_at ON study_snapshots(updated_at DESC);
