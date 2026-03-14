-- ============================================================
-- Migration 001 — Table agent_usage
-- À exécuter dans : https://app.supabase.com/project/ataxqfqlprndcjisepbn/sql/new
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_usage (
  id          BIGSERIAL PRIMARY KEY,
  agent_id    TEXT        NOT NULL,
  agent_name  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour les requêtes par date (YTD, plages)
CREATE INDEX IF NOT EXISTS idx_agent_usage_created_at ON agent_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_agent_usage_agent_id   ON agent_usage(agent_id);

-- Row Level Security — autoriser la clé anon (publishable) à lire et insérer
ALTER TABLE agent_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "anon_insert" ON agent_usage
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "anon_select" ON agent_usage
  FOR SELECT TO anon USING (true);
