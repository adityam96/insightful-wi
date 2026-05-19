import { BarChart2 } from 'lucide-react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { getWeekBounds, addDays, formatDateLabel } from '../lib/dataUtils';

function formatWeekRange(weekParam: string): string {
  const { start } = getWeekBounds(weekParam);
  const end = addDays(start, 6);
  return `${formatDateLabel(start)} – ${formatDateLabel(end)}`;
}

const TEAMS = [
  { id: 'team_product_engineering', label: 'Product Engineering' },
  { id: 'team_sales', label: 'Sales' },
  { id: 'team_support', label: 'Support' },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const currentTeam = searchParams.get('team') || 'team_support';
  const currentWeek = searchParams.get('week') || '2026-04-07';

  const handleTeamClick = (teamId: string) => {
    navigate(`/?team=${teamId}&week=${currentWeek}`);
  };

  const isOverview = location.pathname === '/';

  return (
    <aside
      className="fixed left-0 top-0 h-screen flex flex-col z-20"
      style={{ width: 240, background: '#1B2559' }}
    >
      {/* Wordmark */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
        <div
          className="flex items-center justify-center rounded-lg"
          style={{ width: 32, height: 32, background: '#4F63D2' }}
        >
          <BarChart2 size={18} color="white" strokeWidth={2} />
        </div>
        <span className="font-semibold text-white tracking-tight" style={{ fontSize: 15 }}>
          Work Reality
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 pt-6 pb-4 overflow-y-auto">
        <div className="mb-2 px-3">
          <span
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            Teams
          </span>
        </div>
        {TEAMS.map(team => {
          const isActive = isOverview && currentTeam === team.id;
          return (
            <button
              key={team.id}
              onClick={() => handleTeamClick(team.id)}
              className="w-full text-left px-3 py-2.5 rounded-lg mb-1 flex items-center gap-2.5 transition-all duration-150"
              style={{
                background: isActive ? 'rgba(79,99,210,0.25)' : 'transparent',
                color: isActive ? '#fff' : 'rgba(255,255,255,0.65)',
                fontWeight: isActive ? 600 : 400,
                fontSize: 14,
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)';
                  (e.currentTarget as HTMLButtonElement).style.color = '#fff';
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.65)';
                }
              }}
            >
              {isActive && (
                <span
                  className="absolute left-3 w-0.5 h-5 rounded-full"
                  style={{ background: '#4F63D2' }}
                />
              )}
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: isActive ? '#4F63D2' : 'rgba(255,255,255,0.3)' }}
              />
              {team.label}
            </button>
          );
        })}
      </nav>

      {/* Footer hint */}
      <div className="px-4 py-4 border-t border-white/10">
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)', lineHeight: 1.5 }}>
          Week of {formatWeekRange(currentWeek)}
        </p>
      </div>
    </aside>
  );
}
