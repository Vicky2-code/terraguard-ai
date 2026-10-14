import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { LiveProvider } from "./hooks/useLive";
import { NotificationProvider } from "./lib/notifications";
import { AppShell } from "./components/AppShell";
import Dashboard from "./pages/Dashboard";
import AIPrediction from "./pages/AIPrediction";
import EarlyAlerts from "./pages/EarlyAlerts";
import GisMonitor from "./pages/GisMonitor";
import WeatherRadar from "./pages/WeatherRadar";
import SoilMoisture from "./pages/SoilMoisture";
import ReportIncident from "./pages/ReportIncident";
import FieldIncidents from "./pages/FieldIncidents";
import RoadCorridors from "./pages/RoadCorridors";
import CriticalInfrastructure from "./pages/CriticalInfrastructure";
import RiskAnalytics from "./pages/RiskAnalytics";
import RiskSimulator from "./pages/RiskSimulator";
import ModelAnalysis from "./pages/ModelAnalysis";
import TemporalAnalysis from "./pages/TemporalAnalysis";
import ReportExport from "./pages/ReportExport";
import IncidentReports from "./pages/IncidentReports";
import AnalyticsReports from "./pages/AnalyticsReports";
import ModelGovernance from "./pages/ModelGovernance";
import DataPipeline from "./pages/DataPipeline";
import AdminData from "./pages/AdminData";
import Settings from "./pages/Settings";
import { LoginPage, RegisterPage } from "./pages/Auth";
import { PageHeader, Panel } from "./components/ui";
import { useT } from "./lib/i18n";

function NotFound() {
  const t = useT();
  return (
    <div>
      <PageHeader title="404 — Not Found" subtitle="THE REQUESTED MODULE DOES NOT EXIST" />
      <Panel title="ROUTE MISSING">
        <div className="py-8 text-center space-y-3">
          <div className="text-3xl font-black font-mono text-slate-600">404</div>
          <div className="text-[11px] font-mono text-slate-500">
            {t("Use the sidebar to navigate to a real module.")}
          </div>
          <a
            href="/dashboard"
            className="inline-flex px-3 py-1.5 rounded text-xs font-mono font-bold uppercase tracking-wider border border-emerald-700 text-emerald-300 hover:bg-emerald-900/40"
          >
            {t("Back to dashboard")}
          </a>
        </div>
      </Panel>
    </div>
  );
}

export default function App() {
  return (
    <LiveProvider>
      <NotificationProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route element={<AppShell />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/ai-prediction" element={<AIPrediction />} />
              <Route path="/early-alerts" element={<EarlyAlerts />} />
              <Route path="/gis-monitor" element={<GisMonitor />} />
              <Route path="/weather-radar" element={<WeatherRadar />} />
              <Route path="/soil-moisture" element={<SoilMoisture />} />
              <Route path="/report-incident" element={<ReportIncident />} />
              <Route path="/field-incidents" element={<FieldIncidents />} />
              <Route path="/road-corridors" element={<RoadCorridors />} />
              <Route path="/critical-infrastructure" element={<CriticalInfrastructure />} />
              <Route path="/risk-analytics" element={<RiskAnalytics />} />
              <Route path="/risk-simulator" element={<RiskSimulator />} />
              <Route path="/model-analysis" element={<ModelAnalysis />} />
              <Route path="/temporal-analysis" element={<TemporalAnalysis />} />
              <Route path="/report-export" element={<ReportExport />} />
              <Route path="/incident-reports" element={<IncidentReports />} />
              <Route path="/analytics-reports" element={<AnalyticsReports />} />
              <Route path="/model-governance" element={<ModelGovernance />} />
              <Route path="/data-pipeline" element={<DataPipeline />} />
              <Route path="/admin-data" element={<AdminData />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </NotificationProvider>
    </LiveProvider>
  );
}
