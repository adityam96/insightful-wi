const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export type SummaryType = "paragraph" | "headline" | "team" | "classify" | "taxonomy";

export async function fetchSummary(
  employeeId: string,
  weekStart: string,
  summaryType: SummaryType,
  sessions: { name: string; description: string | null }[]
): Promise<string | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/synthesize-summary`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          "Apikey": SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          employee_id: employeeId,
          week_start: weekStart,
          summary_type: summaryType,
          sessions,
        }),
      }
    );
    if (!res.ok) {
      console.warn('[WR] summary http error', { employeeId, status: res.status });
      return null;
    }
    const data = await res.json();
    return data.summary ?? null;
  } catch (err) {
    console.error('[WR] summary fetch threw', { employeeId, err });
    return null;
  }
}

export async function fetchClassify(
  employeeId: string,
  weekStart: string,
  sessions: { name: string }[],
  categories: string[]
): Promise<string | null> {
  if (!categories.length) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/synthesize-summary`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          "Apikey": SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          employee_id: employeeId,
          week_start: weekStart,
          summary_type: "classify",
          sessions: sessions.map(s => ({ name: s.name, description: null })),
          categories,
        }),
      }
    );
    if (!res.ok) {
      console.warn('[WR] classify http error', { employeeId, status: res.status });
      return null;
    }
    const data = await res.json();
    const raw = data.summary?.trim() ?? null;
    if (!raw) return null;
    // Normalize: strip surrounding quotes, trailing punctuation, collapse whitespace
    const normalized = raw.replace(/^["']+|["']+$/g, '').replace(/[.,;!?]+$/, '').trim();
    // Case-insensitive match; return the canonical string from the categories list
    const match = categories.find(c => c.toLowerCase() === normalized.toLowerCase());
    return match ?? null;
  } catch (err) {
    console.error('[WR] classify fetch threw', { employeeId, err });
    return null;
  }
}

export async function fetchTeamTaxonomy(
  teamId: string,
  sessions: { name: string }[]
): Promise<string[] | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/synthesize-summary`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          "Apikey": SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          employee_id: teamId,
          week_start: "2000-01-01", // taxonomy is not week-scoped; placeholder satisfies required field
          summary_type: "taxonomy",
          sessions: sessions.map(s => ({ name: s.name, description: null })),
        }),
      }
    );
    if (!res.ok) {
      console.warn('[WR] taxonomy http error', { teamId, status: res.status });
      return null;
    }
    const data = await res.json();
    const raw = data.summary;
    if (!raw) return null;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? (parsed as string[]) : null;
  } catch (err) {
    console.error('[WR] taxonomy fetch threw', { teamId, err });
    return null;
  }
}

export async function fetchTeamSummary(
  teamId: string,
  weekStart: string,
  sessions: { name: string; description: string | null; member_label: string }[]
): Promise<string | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/synthesize-summary`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          "Apikey": SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          employee_id: teamId,
          week_start: weekStart,
          summary_type: "team",
          sessions,
        }),
      }
    );
    if (!res.ok) {
      console.warn('[WR] team summary http error', { teamId, status: res.status });
      return null;
    }
    const data = await res.json();
    return data.summary ?? null;
  } catch (err) {
    console.error('[WR] team summary fetch threw', { teamId, err });
    return null;
  }
}
