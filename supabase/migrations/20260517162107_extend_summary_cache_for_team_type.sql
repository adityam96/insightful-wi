/*
  # Extend summary_cache for team-level summaries

  1. Changes
    - Drop the CHECK constraint that limits summary_type to 'paragraph'|'headline'
      so 'team' is also accepted (and any future types)
    - employee_id remains NOT NULL; for team rows it stores the team_id value
      (e.g. "team_support") — the unique index on (employee_id, week_start, summary_type)
      correctly keys team rows without any schema change

  2. Notes
    - No data loss: existing rows are untouched
    - The unique index and RLS policies are unchanged
*/

ALTER TABLE summary_cache
  DROP CONSTRAINT IF EXISTS summary_cache_summary_type_check;
