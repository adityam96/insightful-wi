/*
  # Summary cache table

  Caches AI-generated summaries keyed by employee_id + week_start + type.

  1. New Tables
    - `summary_cache`
      - `id` (uuid, primary key)
      - `employee_id` (text) — e.g. "emp_019"
      - `week_start` (date) — Monday of the week, e.g. "2026-04-07"
      - `summary_type` (text) — "paragraph" (EmployeeView) or "headline" (TeamOverview card)
      - `content` (text) — the generated summary text
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS
    - Anon users can read (dashboard is internal, read-only display)
    - Service role can insert/update (edge function uses service role key)

  3. Notes
    - Unique constraint on (employee_id, week_start, summary_type) for upsert
*/

CREATE TABLE IF NOT EXISTS summary_cache (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  text NOT NULL,
  week_start   date NOT NULL,
  summary_type text NOT NULL CHECK (summary_type IN ('paragraph', 'headline')),
  content      text NOT NULL,
  created_at   timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS summary_cache_lookup
  ON summary_cache (employee_id, week_start, summary_type);

ALTER TABLE summary_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read summaries"
  ON summary_cache FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Service role can insert summaries"
  ON summary_cache FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update summaries"
  ON summary_cache FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
