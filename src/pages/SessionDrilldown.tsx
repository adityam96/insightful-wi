import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  Zap,
  Keyboard,
  MousePointer,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDuration, formatDurationMin, formatDateTime, formatTime } from '../lib/dataUtils';
import { Skeleton } from '../components/Skeleton';

interface SessionDetail {
  id: string;
  name: string;
  description: string | null;
  started_at: string;
  duration_minutes: number;
  employee_id: string;
}

interface Subworkflow {
  id: string;
  name: string;
  description: string | null;
  duration_ms: number;
}

interface Fragment {
  id: string;
  app: string;
  title: string | null;
  url: string | null;
  started_at: string;
  duration_ms: number;
  active: boolean;
  keystrokes: number | null;
  mouse_clicks: number | null;
  productivity: string | null;
}

export default function SessionDrilldown() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const teamId = searchParams.get('team') || 'team_support';
  const week = searchParams.get('week') || '2026-04-07';
  const empId = searchParams.get('emp') || '';

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [subworkflows, setSubworkflows] = useState<Subworkflow[]>([]);
  const [fragments, setFragments] = useState<Fragment[]>([]);
  const [loading, setLoading] = useState(true);

  // Aggregates
  const [totalKeystrokes, setTotalKeystrokes] = useState(0);
  const [totalClicks, setTotalClicks] = useState(0);
  const [activeMs, setActiveMs] = useState(0);

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    const [sessionRes, subRes, fragRes] = await Promise.all([
      supabase
        .from('sessions')
        .select('id, name, description, started_at, duration_minutes, employee_id')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('subworkflows')
        .select('id, name, description, duration_ms')
        .eq('session_id', id)
        .order('start_ms'),
      supabase
        .from('fragments')
        .select('id, app, title, url, started_at, duration_ms, active, keystrokes, mouse_clicks, productivity')
        .eq('session_id', id)
        .order('started_at'),
    ]);

    if (sessionRes.data) setSession(sessionRes.data);
    setSubworkflows(subRes.data || []);

    const frags = fragRes.data || [];
    setFragments(frags);

    let ks = 0, mc = 0, aMs = 0;
    for (const f of frags) {
      ks += f.keystrokes || 0;
      mc += f.mouse_clicks || 0;
      if (f.active) aMs += f.duration_ms || 0;
    }
    setTotalKeystrokes(ks);
    setTotalClicks(mc);
    setActiveMs(aMs);

    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const backPath = empId
    ? `/employee/${empId}?team=${teamId}&week=${week}`
    : `/?team=${teamId}&week=${week}`;

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#F5F7FA' }}>
      {/* Back link */}
      <div className="px-8 pt-6 pb-0">
        <button
          onClick={() => navigate(backPath)}
          className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
          style={{ color: '#4F63D2' }}
        >
          <ArrowLeft size={15} />
          {empId ? `Back to ${empId}` : 'Back to overview'}
        </button>
      </div>

      {/* Header */}
      <header className="px-8 pt-4 pb-6">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="w-48 h-3" />
            <Skeleton className="w-72 h-6" />
          </div>
        ) : session ? (
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm" style={{ color: '#6B7280' }}>
                  {formatDateTime(session.started_at)}
                </span>
                <span
                  className="font-mono text-xs px-2 py-0.5 rounded"
                  style={{ background: '#F3F4F6', color: '#6B7280' }}
                >
                  {session.id}
                </span>
              </div>
              <h1 className="text-xl font-bold" style={{ color: '#0D1117' }}>
                {session.name}
              </h1>
            </div>
            <span
              className="text-sm font-semibold px-3 py-1 rounded-badge"
              style={{ background: '#EEF0FB', color: '#4F63D2' }}
            >
              {formatDurationMin(session.duration_minutes)}
            </span>
          </div>
        ) : (
          <p style={{ color: '#EF4444' }}>Session not found.</p>
        )}
      </header>

      <main className="flex-1 px-8 pb-12 space-y-6">
        {/* Stat boxes */}
        <div className="grid grid-cols-4 gap-4">
          <StatBox
            label="Duration"
            value={loading || !session ? null : formatDurationMin(session.duration_minutes)}
            icon={<Clock size={16} style={{ color: '#4F63D2' }} />}
          />
          <StatBox
            label="Active time"
            value={loading ? null : formatDuration(activeMs)}
            icon={<Zap size={16} style={{ color: '#4F63D2' }} />}
          />
          <StatBox
            label="Keystrokes"
            value={loading ? null : totalKeystrokes.toLocaleString()}
            icon={<Keyboard size={16} style={{ color: '#4F63D2' }} />}
          />
          <StatBox
            label="Mouse clicks"
            value={loading ? null : totalClicks.toLocaleString()}
            icon={<MousePointer size={16} style={{ color: '#4F63D2' }} />}
          />
        </div>

        {/* Subworkflow timeline */}
        {(loading || subworkflows.length > 0) && (
          <div className="bg-white rounded-card border border-border p-6">
            <h3 className="text-sm font-semibold mb-5" style={{ color: '#0D1117' }}>
              Session timeline
            </h3>
            {loading ? (
              <div className="space-y-5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-4">
                    <Skeleton className="w-7 h-7 rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-2 pt-0.5">
                      <Skeleton className="w-48 h-4" />
                      <Skeleton className="w-full h-3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="relative">
                {/* Vertical line */}
                <div
                  className="absolute left-3.5 top-4 bottom-0 w-px"
                  style={{ background: '#E5E7EB' }}
                />
                <div className="space-y-6">
                  {subworkflows.map((sw, idx) => (
                    <div key={sw.id} className="flex gap-4 relative">
                      {/* Circle */}
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 z-10"
                        style={{ background: '#4F63D2', fontSize: 11 }}
                      >
                        {idx + 1}
                      </div>
                      <div className="flex-1 pb-2">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold" style={{ color: '#0D1117' }}>
                            {sw.name}
                          </p>
                          <span
                            className="text-xs font-medium px-2 py-0.5 rounded-badge"
                            style={{ background: '#EEF0FB', color: '#4F63D2' }}
                          >
                            {formatDuration(sw.duration_ms)}
                          </span>
                        </div>
                        {sw.description && (
                          <p className="text-xs leading-relaxed" style={{ color: '#6B7280' }}>
                            {sw.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Activity log */}
        <div className="bg-white rounded-card border border-border p-6">
          <h3 className="text-sm font-semibold mb-4" style={{ color: '#0D1117' }}>
            Activity log
            <span className="ml-2 text-xs font-normal" style={{ color: '#9CA3AF' }}>
              — raw evidence
            </span>
          </h3>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="w-full h-10" />
              ))}
            </div>
          ) : fragments.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: '#9CA3AF' }}>
              No activity records for this session.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Time', 'App', 'Title', 'Duration', 'Active', 'Productivity'].map(col => (
                      <th
                        key={col}
                        className="text-left pb-2.5 pr-4 font-semibold text-xs"
                        style={{ color: '#6B7280' }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fragments.map(f => (
                    <FragmentRow key={f.id} fragment={f} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Session description */}
        {!loading && session?.description && (
          <div className="bg-white rounded-card border border-border p-5">
            <h3 className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#6B7280' }}>
              Session notes
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: '#374151' }}>
              {session.description}
            </p>
          </div>
        )}
      </main>

      <footer className="px-8 py-4 text-center border-t border-border">
        <p className="text-xs" style={{ color: '#9CA3AF' }}>
          Prototype. Summaries are generated from live Supabase activity data to demonstrate the Work Reality concept.
        </p>
      </footer>
    </div>
  );
}

function StatBox({ label, value, icon }: { label: string; value: string | null; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-card border border-border p-5">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs font-medium" style={{ color: '#6B7280' }}>
          {label}
        </span>
      </div>
      {value === null ? (
        <Skeleton className="w-16 h-8 mt-1" />
      ) : (
        <p className="text-2xl font-bold" style={{ color: '#0D1117' }}>
          {value}
        </p>
      )}
    </div>
  );
}

const PRODUCTIVITY_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  Productive: { label: 'Productive', bg: '#D1FAE5', color: '#059669' },
  Neutral: { label: 'Neutral', bg: '#FEF3C7', color: '#D97706' },
  Unproductive: { label: 'Unproductive', bg: '#FEE2E2', color: '#DC2626' },
};

function FragmentRow({ fragment: f }: { fragment: Fragment }) {
  const prod = f.productivity ? PRODUCTIVITY_CONFIG[f.productivity] : null;
  return (
    <tr className="border-b border-border/60 hover:bg-gray-50 transition-colors">
      <td className="py-2.5 pr-4 text-xs whitespace-nowrap" style={{ color: '#6B7280' }}>
        {formatTime(f.started_at)}
      </td>
      <td className="py-2.5 pr-4 text-xs font-medium whitespace-nowrap" style={{ color: '#0D1117' }}>
        {f.app || '—'}
      </td>
      <td className="py-2.5 pr-4 text-xs max-w-xs" style={{ color: '#374151' }}>
        <span
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 1,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {f.title || f.url || '—'}
        </span>
      </td>
      <td className="py-2.5 pr-4 text-xs whitespace-nowrap" style={{ color: '#6B7280' }}>
        {formatDuration(f.duration_ms || 0)}
      </td>
      <td className="py-2.5 pr-4">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full"
          style={{ background: f.active ? '#10B981' : '#D1D5DB' }}
          title={f.active ? 'Active' : 'Idle'}
        />
      </td>
      <td className="py-2.5">
        {prod ? (
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-badge"
            style={{ background: prod.bg, color: prod.color }}
          >
            {prod.label}
          </span>
        ) : (
          <span className="text-xs" style={{ color: '#9CA3AF' }}>—</span>
        )}
      </td>
    </tr>
  );
}
