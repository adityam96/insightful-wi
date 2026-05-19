import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle, CreditCard as Edit3, AlertCircle, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  countAccountsTouched,
  formatDuration,
  formatDurationMin,
  getWeekBounds,
  addDays,
  formatDateLabel,
  formatDateTime,
} from '../lib/dataUtils';
import { fetchSummary } from '../lib/summaryApi';
import { Skeleton } from '../components/Skeleton';

type FeedbackState = null | 'accurate' | 'adjust' | 'unexpected';

interface Session {
  id: string;
  name: string;
  description: string | null;
  started_at: string;
  duration_minutes: number;
}


export default function EmployeeView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const teamId = searchParams.get('team') || 'team_support';
  const weekStart = searchParams.get('week') || '2026-04-06';
  const { start } = getWeekBounds(weekStart);
  const weekEnd = addDays(start, 6);

  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [workReality, setWorkReality] = useState('');
  const [accountsTouched, setAccountsTouched] = useState(0);
  const [activeTimeMs, setActiveTimeMs] = useState(0);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [feedbackConfirmed, setFeedbackConfirmed] = useState(false);

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setSummaryLoading(true);
    setWorkReality('');

    // Sessions this week
    const { data: weekSessions } = await supabase
      .from('sessions')
      .select('id, name, description, started_at, duration_minutes')
      .eq('employee_id', id)
      .gte('started_at', start + 'T00:00:00Z')
      .lte('started_at', weekEnd + 'T23:59:59Z')
      .order('started_at');

    const sess = weekSessions || [];
    setSessions(sess);

    // Accounts touched
    setAccountsTouched(countAccountsTouched(sess.map(s => s.name)));

    // Fetch AI summary (non-blocking — resolves after main data load)
    fetchSummary(
      id,
      start,
      'paragraph',
      sess.map(s => ({ name: s.name, description: s.description }))
    ).then(summary => {
      setWorkReality(summary ?? 'No sessions recorded for this week.');
      setSummaryLoading(false);
    });

    // Active time from fragments this week (used in the compact stats line)
    const { data: fragsThis } = await supabase
      .from('fragments')
      .select('duration_ms, active')
      .eq('employee_id', id)
      .gte('started_at', start + 'T00:00:00Z')
      .lte('started_at', weekEnd + 'T23:59:59Z')
      .limit(50000);

    let totalActiveMs = 0;
    for (const f of fragsThis || []) {
      if (f.active) totalActiveMs += f.duration_ms || 0;
    }
    setActiveTimeMs(totalActiveMs);

    setLoading(false);
  }, [id, start, weekEnd]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFeedback = (type: FeedbackState) => {
    setFeedback(type);
    setFeedbackConfirmed(false);
    console.log('[WorkReality feedback]', { choice: type, employeeId: id });
  };

  const confirmFeedback = () => {
    setFeedbackConfirmed(true);
  };

  const FEEDBACK_LABELS: Record<NonNullable<FeedbackState>, string> = {
    accurate: 'This is accurate',
    adjust: 'Adjust the summary',
    unexpected: "Not what I'd expect from this role",
  };

  const weekLabel = `${formatDateLabel(start)} – ${formatDateLabel(weekEnd)}`;

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#F5F7FA' }}>
      {/* Back link */}
      <div className="px-8 pt-6 pb-0">
        <button
          onClick={() => navigate(`/?team=${teamId}&week=${start}`)}
          className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline transition-colors"
          style={{ color: '#4F63D2' }}
        >
          <ArrowLeft size={15} />
          Back to {teamId.replace('team_', '').replace('_', ' ')} team
        </button>
      </div>

      {/* Header */}
      <header className="px-8 pt-4 pb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold"
                style={{ background: '#4F63D2', fontSize: 14 }}
              >
                {id ? id.replace('emp_', '').replace(/^0+/, '') : '?'}
              </div>
              <div>
                <h1 className="text-xl font-bold" style={{ color: '#0D1117' }}>
                  {id ? `Team member ${id.replace('emp_', '').replace(/^0+/, '')}` : '—'}
                </h1>
                <p className="text-sm" style={{ color: '#6B7280' }}>
                  {weekLabel}
                </p>
                {loading ? (
                  <Skeleton className="w-48 h-3 mt-1.5 rounded" />
                ) : (
                  <p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>
                    {[
                      `${sessions.length} session${sessions.length !== 1 ? 's' : ''}`,
                      activeTimeMs > 0 ? `${formatDuration(activeTimeMs)} active` : null,
                      accountsTouched > 0 ? `~${accountsTouched} accounts & tools referenced` : null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 px-8 pb-12 space-y-6">
        {/* Work Reality paragraph */}
        <div
          className="bg-white rounded-card border border-border p-6"
          style={{ borderLeft: '3px solid #4F63D2' }}
        >
          <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#4F63D2' }}>
            Work Reality this week
          </h2>
          {summaryLoading ? (
            <div className="space-y-2">
              <Skeleton className="w-full h-4" />
              <Skeleton className="w-5/6 h-4" />
              <Skeleton className="w-4/6 h-4" />
              <Skeleton className="w-3/5 h-4" />
            </div>
          ) : (
            <>
              <p className="text-base leading-relaxed font-medium" style={{ color: '#0D1117', lineHeight: 1.7 }}>
                {workReality}
              </p>
              <p
                className="text-xs mt-3 italic"
                style={{ color: '#6B7280' }}
              >
                Compared to the observed pattern of the {teamId.replace('team_', '').replace(/_/g, ' ')} team, Mar 22 – Apr 14, 2026.
              </p>

              {/* Tune loop */}
              <div className="mt-4 pt-4 border-t border-border">
                {!feedbackConfirmed ? (
                  <div>
                    <p className="text-xs font-medium mb-2.5" style={{ color: '#6B7280' }}>
                      Is this summary accurate?
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <FeedbackButton
                        type="accurate"
                        active={feedback === 'accurate'}
                        label="This is accurate"
                        icon={<CheckCircle size={13} />}
                        color="#059669"
                        activeBg="#D1FAE5"
                        onClick={() => handleFeedback('accurate')}
                      />
                      <FeedbackButton
                        type="adjust"
                        active={feedback === 'adjust'}
                        label="Adjust the summary"
                        icon={<Edit3 size={13} />}
                        color="#D97706"
                        activeBg="#FEF3C7"
                        onClick={() => handleFeedback('adjust')}
                      />
                      <FeedbackButton
                        type="unexpected"
                        active={feedback === 'unexpected'}
                        label="Not what I'd expect"
                        icon={<AlertCircle size={13} />}
                        color="#DC2626"
                        activeBg="#FEE2E2"
                        onClick={() => handleFeedback('unexpected')}
                      />
                    </div>
                    {feedback && (
                      <div className="mt-3 flex items-center gap-3">
                        <p className="text-xs" style={{ color: '#6B7280' }}>
                          "{FEEDBACK_LABELS[feedback]}" selected.
                        </p>
                        <button
                          onClick={confirmFeedback}
                          className="text-xs font-medium px-3 py-1 rounded-badge transition-colors"
                          style={{ background: '#4F63D2', color: '#fff' }}
                        >
                          Confirm
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <CheckCircle size={14} color="#059669" />
                    <p className="text-xs font-medium" style={{ color: '#059669' }}>
                      Feedback recorded: "{FEEDBACK_LABELS[feedback!]}"
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* What they produced */}
        <div className="bg-white rounded-card border border-border p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: '#0D1117' }}>
            What they produced
          </h3>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-3 rounded-lg border border-border">
                  <Skeleton className="w-24 h-3 mb-2" />
                  <Skeleton className="w-full h-4 mb-1" />
                  <Skeleton className="w-4/5 h-3" />
                </div>
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: '#9CA3AF' }}>
              No sessions this week
            </p>
          ) : (
            <div className="space-y-2">
              {sessions.map(s => (
                <SessionCard
                  key={s.id}
                  session={s}
                  onClick={() => navigate(`/session/${s.id}?team=${teamId}&week=${start}&emp=${id}`)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="px-8 py-4 text-center border-t border-border">
        <p className="text-xs" style={{ color: '#9CA3AF' }}>
          Prototype. Summaries are generated from live Supabase activity data to demonstrate the Work Reality concept.
        </p>
      </footer>
    </div>
  );
}

function SessionCard({
  session,
  onClick,
}: {
  session: Session;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3.5 rounded-lg border border-border hover:border-accent hover:bg-accent-light transition-all duration-150 group"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-xs" style={{ color: '#6B7280' }}>
          {formatDateTime(session.started_at)}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-badge"
            style={{ background: '#EEF0FB', color: '#4F63D2' }}
          >
            {formatDurationMin(session.duration_minutes)}
          </span>
          <ChevronRight
            size={13}
            style={{ color: '#9CA3AF' }}
            className="group-hover:text-accent transition-colors"
          />
        </div>
      </div>
      <p className="text-sm font-semibold leading-snug mb-1" style={{ color: '#1B2559' }}>
        {session.name}
      </p>
      {session.description && (
        <p
          className="text-xs leading-relaxed"
          style={{
            color: '#6B7280',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {session.description}
        </p>
      )}
    </button>
  );
}

function FeedbackButton({
  active,
  label,
  icon,
  color,
  activeBg,
  onClick,
}: {
  type: string;
  active: boolean;
  label: string;
  icon: React.ReactNode;
  color: string;
  activeBg: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-badge border transition-all duration-150"
      style={{
        background: active ? activeBg : '#F9FAFB',
        color: active ? color : '#6B7280',
        borderColor: active ? color : '#E5E7EB',
      }}
    >
      {icon}
      {label}
    </button>
  );
}
