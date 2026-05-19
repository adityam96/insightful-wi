// Deterministic client-side summary generation — no external API calls

/**
 * Generate "what they produced this week" from session names.
 * Takes leading noun phrase (before "—" or ":" or comma), dedupes, joins top 3.
 */
export function generateProducedLine(sessionNames: string[]): string {
  if (!sessionNames.length) return 'No sessions recorded this week.';

  const extract = (name: string): string => {
    // Strip trailing " — ..." clause
    let s = name.replace(/\s*[—–-]\s*.+$/, '').trim();
    // Strip trailing colon clause
    s = s.replace(/\s*:\s*.+$/, '').trim();
    // Trim to first comma
    const commaIdx = s.indexOf(',');
    if (commaIdx > 10) s = s.slice(0, commaIdx).trim();
    return s;
  };

  const phrases = sessionNames.map(extract).filter(Boolean);
  // Dedupe case-insensitively
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const p of phrases) {
    const key = p.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(p);
    }
  }

  const top3 = unique.slice(0, 3);
  if (top3.length === 0) return 'No sessions recorded this week.';
  return top3.map((p, i) => (i === 0 ? p : p.charAt(0).toLowerCase() + p.slice(1))).join('; ') + '.';
}

// Role-alignment scoring intentionally out of MVP scope — requires real role definitions, not session-title frequency. See product notes.

/**
 * Synthesize a paragraph from session names + description snippets.
 */
export function synthesizeWorkReality(
  sessions: { name: string; description: string | null }[]
): string {
  if (!sessions.length) return 'No sessions recorded for this week.';

  const parts: string[] = [];
  for (const s of sessions.slice(0, 8)) {
    const namePart = s.name.replace(/\s*[—–-]\s*.+$/, '').trim();
    const descFirst = s.description
      ? s.description.split(/[.!?]/)[0].trim()
      : null;
    if (descFirst && descFirst.length > 20) {
      parts.push(`${namePart}: ${descFirst.toLowerCase()}`);
    } else {
      parts.push(namePart);
    }
  }

  // Dedupe
  const seen = new Set<string>();
  const unique = parts.filter(p => {
    const k = p.toLowerCase().slice(0, 40);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return unique.slice(0, 5).join('. ') + '.';
}

/**
 * Count approximate distinct proper-noun tokens (capitalized words) in session names.
 */
export function countAccountsTouched(sessionNames: string[]): number {
  const proper = new Set<string>();
  for (const name of sessionNames) {
    const words = name.split(/\s+/);
    for (const word of words) {
      const cleaned = word.replace(/[^a-zA-Z]/g, '');
      if (cleaned.length > 2 && /^[A-Z][a-z]/.test(cleaned)) {
        proper.add(cleaned.toLowerCase());
      }
    }
  }
  return proper.size;
}

/**
 * Canonical duration formatter (milliseconds → "Xm" or "Xh Ym").
 * < 60 min  → "Xm"          (whole minutes)
 * >= 60 min → "Xh Ym"       (whole hours, whole minutes; omits "0m")
 */
export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Format duration in minutes using the same rules as formatDuration.
 * Accepts fractional minutes (e.g. from DB duration_minutes column).
 */
export function formatDurationMin(min: number): string {
  return formatDuration(Math.round(min) * 60000);
}

/**
 * Format total time as a compact hours figure for card secondary lines.
 * e.g. 152 min → "2.5h"  (one decimal max, trailing zero stripped)
 */
export function fmtHours(min: number): string {
  const h = min / 60;
  // toFixed(1) then strip trailing ".0" for whole hours
  const s = h.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) + 'h' : s + 'h';
}

// Keep legacy aliases so callers are updated explicitly rather than silently.
/** @deprecated use formatDuration(ms) */
export function fmtMs(ms: number): string {
  return formatDuration(ms);
}

/** @deprecated use formatDurationMin(min) */
export function fmtMinutes(min: number): string {
  return formatDurationMin(min);
}

/**
 * Get week start (Monday) and end (Sunday) for a given date string.
 */
export function getWeekBounds(dateStr: string): { start: string; end: string } {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() + diff);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  return {
    start: mon.toISOString().slice(0, 10),
    end: sun.toISOString().slice(0, 10),
  };
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function formatDateTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
