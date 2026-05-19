/*
  # Team fragment aggregates RPC

  Replaces the per-employee fragment fan-out in TeamOverview with a single
  server-side aggregate query. No raw fragment rows reach the browser.

  Returns one row per employee_id with:
    - total_ms:  sum of all duration_ms in the window
    - active_ms: sum of duration_ms where active = true
    - top_app:   app name with the highest summed duration_ms
*/

CREATE OR REPLACE FUNCTION team_fragment_aggregates(
  p_team_id text,
  p_start   timestamptz,
  p_end     timestamptz
)
RETURNS TABLE (
  employee_id text,
  total_ms    bigint,
  active_ms   bigint,
  top_app     text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH per_app AS (
    SELECT
      f.employee_id,
      f.app,
      SUM(f.duration_ms)                                  AS app_ms,
      SUM(f.duration_ms) FILTER (WHERE f.active = true)   AS app_active_ms
    FROM fragments f
    WHERE f.team_id   = p_team_id
      AND f.started_at >= p_start
      AND f.started_at <= p_end
    GROUP BY f.employee_id, f.app
  ),
  ranked AS (
    SELECT
      employee_id,
      app,
      app_ms,
      app_active_ms,
      ROW_NUMBER() OVER (PARTITION BY employee_id ORDER BY app_ms DESC) AS rn
    FROM per_app
  )
  SELECT
    r.employee_id,
    SUM(r.app_ms)::bigint        AS total_ms,
    SUM(r.app_active_ms)::bigint AS active_ms,
    MAX(r.app) FILTER (WHERE r.rn = 1) AS top_app
  FROM ranked r
  GROUP BY r.employee_id;
$$;
