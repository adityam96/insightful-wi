/*
  # Team work taxonomy table

  Caches the LLM-derived work-type category taxonomy for each team.
  Taxonomy is derived once per team from its session data and reused
  across all weeks so category names remain stable over time.

  1. New Tables
    - `team_work_taxonomy`
      - `id` (uuid, primary key)
      - `team_id` (text, unique) — e.g. "team_support"
      - `categories` (jsonb) — ordered array of 3–4 category name strings
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS
    - Anon users can SELECT (dashboard is internal read-only display)
    - Service role has INSERT and UPDATE (edge function uses service role key)

  3. Notes
    - UNIQUE on team_id so there is exactly one taxonomy per team
    - Edge function upserts on conflict to allow taxonomy refresh if needed
*/

CREATE TABLE IF NOT EXISTS team_work_taxonomy (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     text NOT NULL UNIQUE,
  categories  jsonb NOT NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE team_work_taxonomy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read team taxonomy"
  ON team_work_taxonomy FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Service role can insert team taxonomy"
  ON team_work_taxonomy FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update team taxonomy"
  ON team_work_taxonomy FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
