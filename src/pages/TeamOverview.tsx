import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Calendar, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  fmtHours,
  getWeekBounds,
  addDays,
  formatDateLabel,
} from '../lib/dataUtils';
import { fetchSummary, fetchTeamSummary, fetchClassify, fetchTeamTaxonomy } from '../lib/summaryApi';
import { SkeletonCard, Skeleton } from '../components/Skeleton';

const TEAM_LABELS: Record<string, string> = {
  team_product_engineering: 'Product Engineering',
  team_sales: 'Sales',
  team_support: 'Support',
};

interface EmployeeCard {
  id: string;
  producedLine: string | null; // null = still loading from AI
  workType: string | null;     // null = not yet classified
  totalMinutes: number;
  activeRate: number;
  topApp: string;
}

export default function TeamOverview() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const teamId = searchParams.get('team') || 'team_support';
  const weekStart = searchParams.get('week') || '2026-04-06';
  const { start } = getWeekBounds(weekStart);
  const weekEndDate = addDays(start, 6);

  const [cards, setCards] = useState<EmployeeCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalSessions, setTotalSessions] = useState(0);
  const [teamSummary, setTeamSummary] = useState<string | null>(null); // null = loading
  const [taxonomy, setTaxonomy] = useState<string[] | null>(null);

  const loadData = useCallback(async (weekStart_: string, weekEnd_: string) => {
    setLoading(true);
    setCards([]);
    setTeamSummary(null);
    setTaxonomy(null);

    try {
      console.log('[WR] loadData start', { teamId, weekStart: weekStart_, weekEnd: weekEnd_ });

      // 1. Get employees for this team
      const { data: emps, error: empsError } = await supabase
        .from('employees')
        .select('id')
        .eq('team_id', teamId)
        .order('id');

      if (empsError) console.error('[WR] employees query failed', { error: empsError });

      if (!emps || emps.length === 0) {
        setLoading(false);
        return;
      }

      const empIds = emps.map(e => e.id);
      console.log('[WR] employees', { count: emps.length, ids: empIds });

      // 2. Sessions + fragment aggregates in parallel
      const [
        { data: allSessions, error: sessionsError },
        { data: fragRows, error: fragError },
      ] = await Promise.all([
        supabase
          .from('sessions')
          .select('id, employee_id, name, description')
          .eq('team_id', teamId)
          .gte('started_at', weekStart_ + 'T00:00:00Z')
          .lte('started_at', weekEnd_ + 'T23:59:59Z'),
        supabase.rpc('team_fragment_aggregates', {
          p_team_id: teamId,
          p_start: weekStart_ + 'T00:00:00Z',
          p_end: weekEnd_ + 'T23:59:59Z',
        }),
      ]);

      if (sessionsError) console.error('[WR] sessions query failed', { error: sessionsError });
      const sessionCount = allSessions?.length ?? 0;
      console.log('[WR] sessions', { rows: sessionCount });
      setTotalSessions(sessionCount);

      if (fragError) console.error('[WR] fragment aggregates RPC failed', { error: fragError });

      const sessionsByEmp: Record<string, { name: string; description: string | null }[]> = {};
      for (const id of empIds) sessionsByEmp[id] = [];
      for (const s of allSessions || []) {
        if (sessionsByEmp[s.employee_id]) {
          sessionsByEmp[s.employee_id].push({ name: s.name, description: s.description });
        }
      }

      // Fire team summary async — does not block card render
      const teamSessions = (allSessions || []).map(s => ({
        name: s.name,
        description: s.description,
        member_label: `Team member ${s.employee_id.replace('emp_', '').replace(/^0+/, '')}`,
      }));
      fetchTeamSummary(teamId, weekStart_, teamSessions).then(summary => {
        setTeamSummary(summary ?? 'No sessions recorded for this team this week.');
      });

      // Map RPC results by employee_id
      type FragRow = { employee_id: string; total_ms: number; active_ms: number; top_app: string | null };
      const rpcRows = (fragRows as FragRow[] | null) || [];
      const fragAgg: Record<string, { totalMs: number; activeMs: number; topApp: string }> = {};
      for (const empId of empIds) fragAgg[empId] = { totalMs: 0, activeMs: 0, topApp: '—' };
      for (const row of rpcRows) {
        fragAgg[row.employee_id] = {
          totalMs: row.total_ms ?? 0,
          activeMs: row.active_ms ?? 0,
          topApp: row.top_app ?? '—',
        };
      }

      // If RPC returned nothing, fall back to per-employee fragment queries
      if (rpcRows.length === 0 && !fragError) {
        console.warn('[WR] RPC returned 0 rows — falling back to per-employee fragment queries');
        await Promise.all(empIds.map(async empId => {
          const { data: frags } = await supabase
            .from('fragments')
            .select('app, duration_ms, active')
            .eq('employee_id', empId)
            .gte('started_at', weekStart_ + 'T00:00:00Z')
            .lte('started_at', weekEnd_ + 'T23:59:59Z')
            .limit(50000);
          if (!frags || frags.length === 0) return;
          let totalMs = 0;
          let activeMs = 0;
          const appMap: Record<string, number> = {};
          for (const f of frags) {
            const ms = f.duration_ms || 0;
            totalMs += ms;
            if (f.active) activeMs += ms;
            const app = f.app || 'Unknown';
            appMap[app] = (appMap[app] || 0) + ms;
          }
          const topApp = Object.entries(appMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
          fragAgg[empId] = { totalMs, activeMs, topApp };
        }));
      }

      const aggSummary = empIds.map(empId => ({
        empId,
        hours: +(fragAgg[empId].totalMs / 3600000).toFixed(2),
        activeRate: fragAgg[empId].totalMs > 0
          ? Math.round((fragAgg[empId].activeMs / fragAgg[empId].totalMs) * 100)
          : 0,
        topApp: fragAgg[empId].topApp,
      }));
      console.log('[WR] fragment aggregates', { aggSummary });

      // Build cards immediately with null producedLine (AI headlines load async)
      const result: EmployeeCard[] = empIds.map(empId => {
        const agg = fragAgg[empId];
        const totalMinutes = Math.round(agg.totalMs / 60000);
        const activeRate = agg.totalMs > 0 ? Math.round((agg.activeMs / agg.totalMs) * 100) : 0;
        return { id: empId, producedLine: null, workType: null, totalMinutes, activeRate, topApp: agg.topApp };
      });

      console.log('[WR] cards built', { count: result.length });
      setCards(result);
      setLoading(false);

      // Fetch AI headlines per employee in parallel (does not depend on taxonomy)
      empIds.forEach(empId => {
        const sessions = sessionsByEmp[empId] || [];
        fetchSummary(
          empId,
          weekStart_,
          'headline',
          sessions.map(s => ({ name: s.name, description: s.description }))
        ).then(headline => {
          setCards(prev =>
            prev.map(c =>
              c.id === empId
                ? { ...c, producedLine: headline ?? 'No sessions recorded this week.' }
                : c
            )
          );
        });
      });

      // Fetch taxonomy once, then classify each employee against it.
      // Cards are already rendered; this only drives the grouping column.
      const allSessionNames = (allSessions || []).map(s => ({ name: s.name }));
      fetchTeamTaxonomy(teamId, allSessionNames).then(cats => {
        if (!cats || cats.length === 0) return;
        setTaxonomy(cats);
        // Fire classify calls only after categories are confirmed non-empty
        empIds.forEach(empId => {
          const sessions = sessionsByEmp[empId] || [];
          fetchClassify(empId, weekStart_, sessions, cats).then(workType => {
            setCards(prev =>
              prev.map(c => c.id === empId ? { ...c, workType } : c)
            );
          });
        });
      });
    } catch (err) {
      console.error('[WR] loadData FATAL', { err });
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    loadData(start, weekEndDate);
  }, [loadData, start, weekEndDate]);

  const changeWeek = (dir: number) => {
    const newWeek = addDays(start, dir * 7);
    navigate(`/?team=${teamId}&week=${newWeek}`);
  };

  const [search, setSearch] = useState('');
  const [sortDesc, setSortDesc] = useState(true);
  const [groupByWorkType, setGroupByWorkType] = useState(false);

  const sortedFilteredCards = (() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? cards.filter(c => c.producedLine?.toLowerCase().includes(query))
      : cards;
    return [...filtered].sort((a, b) =>
      sortDesc ? b.totalMinutes - a.totalMinutes : a.totalMinutes - b.totalMinutes
    );
  })();

  const teamLabel = TEAM_LABELS[teamId] || teamId;
  const hasData = !loading && cards.length > 0;
  const isEmpty = !loading && cards.length === 0;

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#F5F7FA', width: '100%', maxWidth: '100%', overflowX: 'hidden', boxSizing: 'border-box' }}>
      {/* Sticky header */}
      <header
        className="sticky top-0 z-10 flex items-center justify-between px-8 py-4 border-b border-border"
        style={{ background: '#fff', minHeight: 64, width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}
      >
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-3">
            <Users size={18} style={{ color: '#4F63D2' }} />
            <h1 className="text-lg font-semibold" style={{ color: '#0D1117' }}>
              {teamLabel}
            </h1>
            {!loading && (
              <span
                className="text-xs font-medium rounded-badge px-2 py-0.5"
                style={{ background: '#EEF0FB', color: '#4F63D2' }}
              >
                {cards.length} members
              </span>
            )}
          </div>
          {!loading && cards.length > 0 && (
            <p style={{ fontSize: 12, color: '#6B7280', fontWeight: 400, paddingLeft: 26 }}>
              Synthesized from {totalSessions} work sessions across {cards.length} people · {formatDateLabel(start)} – {formatDateLabel(weekEndDate)}
            </p>
          )}
        </div>

        {/* Week picker */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => changeWeek(-1)}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-border hover:bg-gray-50 transition-colors"
            style={{ color: '#6B7280' }}
          >
            <ChevronLeft size={16} />
          </button>
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border"
            style={{ background: '#fff', minWidth: 180, color: '#0D1117' }}
          >
            <Calendar size={14} style={{ color: '#6B7280', flexShrink: 0 }} />
            <span className="text-sm font-medium">
              {formatDateLabel(start)} – {formatDateLabel(weekEndDate)}
            </span>
          </div>
          <button
            onClick={() => changeWeek(1)}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-border hover:bg-gray-50 transition-colors"
            style={{ color: '#6B7280' }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-8 py-8" style={{ width: '100%', boxSizing: 'border-box', overflowX: 'hidden', minWidth: 0 }}>
        {loading && (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
          >
            {Array.from({ length: 15 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {isEmpty && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
              style={{ background: '#EEF0FB' }}
            >
              <Users size={24} style={{ color: '#4F63D2' }} />
            </div>
            <p className="font-semibold text-lg" style={{ color: '#0D1117' }}>
              No data for this week
            </p>
            <p className="text-sm mt-1" style={{ color: '#6B7280' }}>
              Try selecting a different week. Data exists from Mar 22 – Apr 14, 2026.
            </p>
          </div>
        )}

        {hasData && (
          <div className="flex flex-col gap-6">
            {/* Team-level synthesis card */}
            <div
              className="bg-white rounded-card border border-border p-6"
              style={{ borderLeft: '3px solid #4F63D2' }}
            >
              <p
                className="text-xs font-semibold uppercase tracking-widest mb-3"
                style={{ color: '#4F63D2', letterSpacing: '0.08em' }}
              >
                Work Reality — {teamLabel} Team This Week
              </p>
              {teamSummary === null ? (
                <div className="space-y-2">
                  <Skeleton className="w-full h-4" />
                  <Skeleton className="w-5/6 h-4" />
                  <Skeleton className="w-4/6 h-4" />
                  <Skeleton className="w-3/5 h-4" />
                </div>
              ) : (
                <p style={{ color: '#1B2559', fontSize: 16, lineHeight: 1.6, fontWeight: 400, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                  {teamSummary}
                </p>
              )}
              {teamSummary !== null && (
                <p
                  className="text-xs mt-3"
                  style={{ color: '#9CA3AF', borderTop: '1px solid #F0F2F5', paddingTop: 10 }}
                >
                  Synthesized from {totalSessions} work sessions across {cards.length} people · {formatDateLabel(start)} – {formatDateLabel(weekEndDate)}
                </p>
              )}
            </div>

            {/* Search + sort bar */}
            <div
              className="flex items-center gap-3"
              style={{ marginBottom: -8 }}
            >
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search work — e.g. billing, Caldwell Trust, escalations"
                style={{
                  flex: 1,
                  border: '1px solid #E5E7EB',
                  borderRadius: 6,
                  background: '#fff',
                  fontSize: 13,
                  color: '#0D1117',
                  padding: '7px 12px',
                  outline: 'none',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = '#4F63D2')}
                onBlur={e => (e.currentTarget.style.borderColor = '#E5E7EB')}
              />
              <button
                onClick={() => setSortDesc(d => !d)}
                style={{
                  border: '1px solid #E5E7EB',
                  borderRadius: 6,
                  background: '#fff',
                  fontSize: 13,
                  color: '#6B7280',
                  padding: '7px 10px',
                  outline: 'none',
                  flexShrink: 0,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Sort: Tracked time {sortDesc ? 'high→low' : 'low→high'}
              </button>
              <label
                className="flex items-center gap-1.5 flex-shrink-0 cursor-pointer select-none"
                style={{ fontSize: 13, color: '#374151' }}
              >
                <input
                  type="checkbox"
                  checked={groupByWorkType}
                  onChange={e => setGroupByWorkType(e.target.checked)}
                  style={{ accentColor: '#4F63D2', cursor: 'pointer' }}
                />
                Group by work type
              </label>
              <span
                className="flex-shrink-0 text-xs"
                style={{ color: '#9CA3AF', whiteSpace: 'nowrap' }}
              >
                {sortedFilteredCards.length} of {cards.length} members
              </span>
            </div>

            {/* Employee row list */}
            {groupByWorkType ? (
              <GroupedRowList
                cards={sortedFilteredCards}
                sortDesc={sortDesc}
                taxonomy={taxonomy}
                onRowClick={id => navigate(`/employee/${id}?team=${teamId}&week=${start}`)}
              />
            ) : (
              <div className="bg-white rounded-card border border-border overflow-hidden">
                <RowListHeader />
                {sortedFilteredCards.length === 0 ? (
                  <p className="text-sm text-center py-10" style={{ color: '#9CA3AF' }}>
                    No one worked on that this week.
                  </p>
                ) : (
                  sortedFilteredCards.map((card, i) => (
                    <EmployeeRow
                      key={card.id}
                      card={card}
                      isLast={i === sortedFilteredCards.length - 1}
                      onClick={() => navigate(`/employee/${card.id}?team=${teamId}&week=${start}`)}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="px-8 py-4 text-center border-t border-border">
        <p className="text-xs" style={{ color: '#9CA3AF' }}>
          Prototype · {formatDateLabel(start)} – {formatDateLabel(weekEndDate)} · Summaries synthesized from live activity data.
        </p>
      </footer>
    </div>
  );
}

function empLabel(id: string): string {
  const num = id.replace('emp_', '').replace(/^0+/, '') || '0';
  return `Team member ${num}`;
}

function RowListHeader() {
  return (
    <div
      className="flex items-center gap-4 px-5 py-2"
      style={{
        borderBottom: '1px solid #EEF0F3',
        boxSizing: 'border-box',
      }}
    >
      <span className="flex-shrink-0" style={{ width: 180, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9CA3AF' }}>
        Member
      </span>
      <span style={{ flex: 1, minWidth: 0, padding: '0 8px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9CA3AF' }}>
        What they produced
      </span>
      <span className="flex-shrink-0 text-right" style={{ width: 80, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9CA3AF' }}>
        Tracked time
      </span>
    </div>
  );
}

function GroupedRowList({
  cards,
  sortDesc,
  taxonomy,
  onRowClick,
}: {
  cards: EmployeeCard[];
  sortDesc: boolean;
  taxonomy: string[] | null;
  onRowClick: (id: string) => void;
}) {
  const categoryOrder = taxonomy ?? [];
  const groups = categoryOrder.map(wt => ({
    label: wt,
    rows: cards.filter(c => c.workType === wt),
  })).filter(g => g.rows.length > 0);

  // Cards still awaiting taxonomy or classification
  const pending = cards.filter(c => c.workType === null);

  if (cards.length === 0) {
    return (
      <div className="bg-white rounded-card border border-border overflow-hidden">
        <RowListHeader />
        <p className="text-sm text-center py-10" style={{ color: '#9CA3AF' }}>
          No one worked on that this week.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-white rounded-card border border-border overflow-hidden">
        <RowListHeader />
      </div>
      {groups.map(group => {
        const sorted = [...group.rows].sort((a, b) =>
          sortDesc ? b.totalMinutes - a.totalMinutes : a.totalMinutes - b.totalMinutes
        );
        return (
          <div key={group.label} className="bg-white rounded-card border border-border overflow-hidden">
            {/* Section header */}
            <div
              className="flex items-center gap-3 px-5 py-2.5"
              style={{ borderBottom: '1px solid #EEF0F3', background: '#FAFBFC' }}
            >
              <span
                className="uppercase font-semibold tracking-wider"
                style={{ fontSize: 11, color: '#6B7280', letterSpacing: '0.07em' }}
              >
                {group.label}
              </span>
              <span
                className="text-xs font-medium rounded-badge px-1.5 py-0.5"
                style={{ background: '#EEF0F3', color: '#6B7280' }}
              >
                {sorted.length}
              </span>
            </div>
            {sorted.map((card, i) => (
              <EmployeeRow
                key={card.id}
                card={card}
                isLast={i === sorted.length - 1}
                onClick={() => onRowClick(card.id)}
              />
            ))}
          </div>
        );
      })}

      {/* Rows still being classified */}
      {pending.length > 0 && (
        <div className="bg-white rounded-card border border-border overflow-hidden">
          <div
            className="flex items-center gap-3 px-5 py-2.5"
            style={{ borderBottom: '1px solid #EEF0F3', background: '#FAFBFC' }}
          >
            <span
              className="uppercase font-semibold tracking-wider"
              style={{ fontSize: 11, color: '#9CA3AF', letterSpacing: '0.07em' }}
            >
              {taxonomy ? 'Uncategorized' : 'Grouping…'}
            </span>
            <span
              className="text-xs font-medium rounded-badge px-1.5 py-0.5"
              style={{ background: '#EEF0F3', color: '#9CA3AF' }}
            >
              {pending.length}
            </span>
          </div>
          {pending.map((card, i) => (
            <EmployeeRow
              key={card.id}
              card={card}
              isLast={i === pending.length - 1}
              onClick={() => onRowClick(card.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmployeeRow({
  card,
  isLast,
  onClick,
}: {
  card: EmployeeCard;
  isLast: boolean;
  onClick: () => void;
}) {
  const num = card.id.replace('emp_', '').replace(/^0+/, '');
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-4 px-5 py-3 transition-colors"
      style={{
        borderBottom: isLast ? 'none' : '1px solid #EEF0F3',
        background: 'transparent',
        width: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = '#F7F8FB')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Identity — fixed 180px */}
      <div className="flex items-center gap-2.5 flex-shrink-0" style={{ width: 180 }}>
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white font-semibold"
          style={{ background: '#4F63D2', fontSize: 11 }}
        >
          {num}
        </div>
        <span className="text-sm font-medium truncate" style={{ color: '#0D1117' }}>
          {empLabel(card.id)}
        </span>
      </div>

      {/* Summary — flexible, one line; min-width:0 is required for flex shrink + ellipsis */}
      <div style={{ flex: 1, minWidth: 0, padding: '0 8px' }}>
        {card.producedLine === null ? (
          <Skeleton className="w-full h-3.5" />
        ) : (
          <p
            style={{
              color: '#1B2559',
              fontSize: 14,
              fontWeight: 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {card.producedLine}
          </p>
        )}
      </div>

      {/* Hours — only evidence column kept */}
      <span className="flex-shrink-0 text-right" style={{ width: 80, color: '#6B7280', fontSize: 13 }}>
        {fmtHours(card.totalMinutes)}
      </span>
    </button>
  );
}
