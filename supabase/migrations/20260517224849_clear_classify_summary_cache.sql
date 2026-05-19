/*
  # Clear poisoned classify entries from summary_cache

  Classify results cached under the old hardcoded Support team categories will
  never match the new dynamic per-team categories and cause every member to
  appear as "Uncategorized". This migration removes all stale classify rows
  so fresh requests regenerate with the correct team-specific categories.

  1. Changes
    - DELETE all rows from summary_cache WHERE summary_type = 'classify'

  2. Notes
    - Safe to run repeatedly (idempotent — deletes nothing once rows are gone)
    - Going forward, classify results are not written to summary_cache at all
      (handled in the edge function), so this table will never accumulate
      classify rows again
*/

DELETE FROM summary_cache WHERE summary_type = 'classify';
