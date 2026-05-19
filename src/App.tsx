import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import TeamOverview from './pages/TeamOverview';
import EmployeeView from './pages/EmployeeView';
import SessionDrilldown from './pages/SessionDrilldown';

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen" style={{ background: '#F5F7FA' }}>
        {/* Sidebar — always visible */}
        <Sidebar />

        {/* Main content — offset by sidebar width */}
        <div className="flex-1 flex flex-col" style={{ marginLeft: 240, minWidth: 0, overflow: 'hidden' }}>
          <Routes>
            <Route
              path="/"
              element={<TeamOverview />}
            />
            <Route
              path="/employee/:id"
              element={<EmployeeView />}
            />
            <Route
              path="/session/:id"
              element={<SessionDrilldown />}
            />
            <Route
              path="*"
              element={<Navigate to="/?team=team_support&week=2026-04-07" replace />}
            />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
