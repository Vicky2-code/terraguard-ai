import React, { useState } from 'react';
import { WebSocketProvider } from './context/WebSocketProvider';
import { DashboardKPIs } from './components/dashboard/KPICard';
import { LiveMonitor } from './components/dashboard/LiveMonitor';
import { RiskMap } from './components/map/RiskMap';
import { NotificationCenter } from './components/notifications/AlertCenter';
import { RiskAnalytics } from './pages/Analytics';
import { FieldReportForm } from './pages/FieldReportForm';
import { LandingPage } from './pages/LandingPage';

export default function App() {
  const [isLaunched, setIsLaunched] = useState(false);
  const [view, setView] = useState<'dashboard' | 'analytics' | 'reports'>('dashboard');

  if (!isLaunched) {
    return <LandingPage onLaunch={() => setIsLaunched(true)} />;
  }

  return (
    <WebSocketProvider>
      <div className="min-h-screen bg-forest-green text-white p-8 font-sans">
        <NotificationCenter />
        <header className="mb-10 flex justify-between items-center">
          <div className="flex items-center space-x-8">
            <div className="cursor-pointer" onClick={() => setIsLaunched(false)}>
              <h1 className="text-4xl font-black tracking-tighter">TERRAGUARD AI</h1>
              <p className="text-moss-green font-medium">Slope Monitoring & Early Warning System</p>
            </div>
            <nav className="flex space-x-4">
              <button
                onClick={() => setView('dashboard')}
                className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${view === 'dashboard' ? 'bg-moss-green text-white' : 'bg-white/10 hover:bg-white/20'}`}
              >
                Dashboard
              </button>
              <button
                onClick={() => setView('analytics')}
                className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${view === 'analytics' ? 'bg-moss-green text-white' : 'bg-white/10 hover:bg-white/20'}`}
              >
                Analytics
              </button>
              <button
                onClick={() => setView('reports')}
                className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${view === 'reports' ? 'bg-moss-green text-white' : 'bg-white/10 hover:bg-white/20'}`}
              >
                Field Reports
              </button>
            </nav>
          </div>
          <div className="flex items-center space-x-2 bg-white/10 px-4 py-2 rounded-full border border-white/20">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-widest">System Live</span>
          </div>
        </header>

        {view === 'dashboard' && (
          <>
            <DashboardKPIs />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 h-[600px] bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl overflow-hidden">
                <RiskMap />
              </div>
              <div className="lg:col-span-1">
                <LiveMonitor />
              </div>
            </div>
          )}

        {view === 'analytics' && (
          <div className="max-w-6xl mx-auto">
            <RiskAnalytics />
          </div>
        )}

        {view === 'reports' && (
          <div className="max-w-2xl mx-auto">
            <FieldReportForm />
          </div>
        )}
      </div>
    </WebSocketProvider>
  );
}
