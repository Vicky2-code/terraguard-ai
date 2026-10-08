import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ChevronDown,
  CloudRain,
  CloudSun,
  Compass,
  Database,
  FileWarning,
  Gauge,
  Layers3,
  LocateFixed,
  Map as MapIcon,
  Menu,
  Mountain,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Siren,
  TrendingUp,
  Waves,
  Wind,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api, { checkBackend } from "./services/api";
import "./App.css";

type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

type Site = {
  name: string;
  district: string;
  rainfall: number;
  moisture: number;
  score: number;
  risk: RiskLevel;
  latitude: number;
  longitude: number;
};

const demoSites: Site[] = [
  {
    name: "Gangtok Demo Zone",
    district: "Gangtok, Sikkim",
    rainfall: 35.2,
    moisture: 42,
    score: 78,
    risk: "HIGH",
    latitude: 27.3389,
    longitude: 88.6065,
  },
  {
    name: "Darjeeling Demo Zone",
    district: "Darjeeling, West Bengal",
    rainfall: 18.6,
    moisture: 31,
    score: 54,
    risk: "MODERATE",
    latitude: 27.036,
    longitude: 88.2627,
  },
  {
    name: "Shillong Demo Zone",
    district: "East Khasi Hills, Meghalaya",
    rainfall: 8.4,
    moisture: 24,
    score: 28,
    risk: "LOW",
    latitude: 25.5788,
    longitude: 91.8933,
  },
  {
    name: "Aizawl Demo Zone",
    district: "Aizawl, Mizoram",
    rainfall: 52.8,
    moisture: 69,
    score: 91,
    risk: "CRITICAL",
    latitude: 23.7271,
    longitude: 92.7176,
  },
];

const rainfallHistory = [
  { time: "06:00", rainfall: 4, threshold: 30 },
  { time: "08:00", rainfall: 9, threshold: 30 },
  { time: "10:00", rainfall: 12, threshold: 30 },
  { time: "12:00", rainfall: 18, threshold: 30 },
  { time: "14:00", rainfall: 26, threshold: 30 },
  { time: "16:00", rainfall: 35, threshold: 30 },
  { time: "18:00", rainfall: 29, threshold: 30 },
];

const initialAlerts = [
  {
    id: 1,
    level: "CRITICAL" as RiskLevel,
    title: "Elevated demo risk detected",
    location: "Aizawl Demo Zone",
    time: "Latest demo event",
    message: "Example alert — verify against field and sensor observations.",
  },
  {
    id: 2,
    level: "HIGH" as RiskLevel,
    title: "Slope monitoring attention",
    location: "Gangtok Demo Zone",
    time: "Latest demo event",
    message: "Example alert — not an official emergency warning.",
  },
  {
    id: 3,
    level: "MODERATE" as RiskLevel,
    title: "Rainfall observation updated",
    location: "Darjeeling Demo Zone",
    time: "Latest demo event",
    message: "Example monitoring notification.",
  },
];

const navItems = [
  { label: "Overview", icon: Gauge },
  { label: "Risk Monitoring", icon: Mountain },
  { label: "Geospatial Map", icon: MapIcon },
  { label: "Early Warnings", icon: BellRing },
  { label: "Field Reports", icon: FileWarning },
  { label: "Analytics", icon: TrendingUp },
];

function riskClass(level: RiskLevel) {
  return `risk-${level.toLowerCase()}`;
}

function App() {
  const [activeNav, setActiveNav] = useState("Overview");
  const [sites, setSites] = useState<Site[]>(demoSites);
  const [apiOnline, setApiOnline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [searchText, setSearchText] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [alerts, setAlerts] = useState(initialAlerts);
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  const refreshDashboard = useCallback(async () => {
    setLoading(true);

    const online = await checkBackend();
    setApiOnline(online);

    if (online) {
      try {
        // These endpoints require authentication in the Day 2 backend.
        // If no token is stored, demo data remains visible.
        const [locationResult, predictionResult, alertResult] =
          await Promise.allSettled([
            api.get("/locations"),
            api.get("/predictions"),
            api.get("/alerts"),
          ]);

        if (locationResult.status === "fulfilled") {
          const rows = locationResult.value.data;
          if (Array.isArray(rows) && rows.length > 0) {
            setSites((previous) => {
              const byName = new Map(previous.map((site) => [site.name, site]));

              return rows.map((row: Record<string, unknown>, index: number) => {
                const name = String(row.name ?? `Monitoring Site ${index + 1}`);
                const existing = byName.get(name);

                return {
                  name,
                  district: String(
                    row.district ?? row.state ?? "Registered location",
                  ),
                  rainfall: existing?.rainfall ?? 0,
                  moisture: existing?.moisture ?? 0,
                  score: existing?.score ?? 0,
                  risk: existing?.risk ?? "LOW",
                  latitude: Number(row.latitude ?? 0),
                  longitude: Number(row.longitude ?? 0),
                };
              });
            });
          }
        }

        if (alertResult.status === "fulfilled") {
          const rows = alertResult.value.data;
          if (Array.isArray(rows) && rows.length > 0) {
            setAlerts(
              rows.map((row: Record<string, unknown>, index: number) => ({
                id: Number(row.id ?? index + 1),
                level: String(
                  row.severity ?? "MODERATE",
                ).toUpperCase() as RiskLevel,
                title: String(row.message ?? "Monitoring alert"),
                location: `Alert #${String(row.id ?? index + 1)}`,
                time: "From backend",
                message: "Retrieved from the backend API.",
              })),
            );
          }
        }

        // Prediction endpoint is checked for connectivity. Model predictions
        // will be displayed once the prediction API and response schema exist.
        if (predictionResult.status === "fulfilled") {
          // Intentionally do not invent predictions from an empty response.
        }
      } catch {
        // Keep the last visible data if a request fails.
      }
    }

    setLastUpdated(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refreshDashboard();

    const intervalId = window.setInterval(() => {
      void refreshDashboard();
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [refreshDashboard]);

  const filteredSites = sites.filter((site) =>
    `${site.name} ${site.district}`
      .toLowerCase()
      .includes(searchText.toLowerCase()),
  );

  const highRiskCount = sites.filter(
    (site) => site.risk === "HIGH" || site.risk === "CRITICAL",
  ).length;

  const averageRisk = sites.length
    ? Math.round(
        sites.reduce((total, site) => total + site.score, 0) / sites.length,
      )
    : 0;

  const criticalCount = sites.filter(
    (site) => site.risk === "CRITICAL",
  ).length;

  function selectNav(label: string) {
    setActiveNav(label);
    setMenuOpen(false);
  }

  return (
    <div className="app-shell">
      {menuOpen && (
        <button
          className="mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-symbol">
            <Mountain size={25} strokeWidth={2.2} />
            <span />
          </div>
          <div>
            <div className="brand-name">
              TERRA<span>GUARD</span>
            </div>
            <div className="brand-subtitle">AI RISK INTELLIGENCE</div>
          </div>
          <button
            className="icon-button mobile-close"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          >
            <X size={19} />
          </button>
        </div>

        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace-card">
          <div className="workspace-icon">
            <Compass size={18} />
          </div>
          <div className="workspace-copy">
            <strong>NER Operations</strong>
            <span>Regional monitoring</span>
          </div>
          <ChevronDown size={15} className="muted-icon" />
        </div>

        <div className="nav-heading">MONITORING</div>
        <nav className="nav-list">
          {navItems.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={`nav-item ${activeNav === label ? "nav-active" : ""}`}
              onClick={() => selectNav(label)}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
              {label === "Early Warnings" && (
                <span className="nav-count">{alerts.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="system-card">
            <div className="system-card-top">
              <span className={`status-dot ${apiOnline ? "online" : ""}`} />
              <span>Backend status</span>
              <strong>{apiOnline ? "Online" : "Offline"}</strong>
            </div>
            <div className="system-bar">
              <span className={apiOnline ? "bar-online" : ""} />
            </div>
            <p>
              {apiOnline
                ? "FastAPI health check successful"
                : "Waiting for FastAPI connection"}
            </p>
          </div>

          <div className="sidebar-footer">
            <ShieldCheck size={15} />
            <span>TerraGuard AI · Prototype</span>
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button menu-toggle"
              onClick={() => setMenuOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <div className="breadcrumb">
              <span>TerraGuard AI</span>
              <span className="breadcrumb-slash">/</span>
              <strong>{activeNav}</strong>
            </div>
          </div>

          <div className="topbar-actions">
            <div className="system-live">
              <span className={`status-dot ${apiOnline ? "online" : ""}`} />
              {apiOnline ? "API CONNECTED" : "DEMO MODE"}
            </div>
            <button
              className={`icon-button refresh-button ${loading ? "spinning" : ""}`}
              onClick={() => void refreshDashboard()}
              aria-label="Refresh dashboard"
              title="Refresh dashboard"
            >
              <RefreshCw size={17} />
            </button>
            <div className="profile-chip">
              <div className="profile-avatar">TG</div>
              <div className="profile-info">
                <strong>Operations</strong>
                <span>Monitoring team</span>
              </div>
              <ChevronDown size={15} className="muted-icon" />
            </div>
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-line" />
                LANDSLIDE INTELLIGENCE PLATFORM
              </div>
              <h1>{activeNav === "Overview" ? "Risk Overview" : activeNav}</h1>
              <p className="page-description">
                Regional slope monitoring, environmental signals and risk
                intelligence for Northeast India.
              </p>
            </div>
            <div className="heading-meta">
              <div className="updated-label">
                <Activity size={14} />
                <span>Last refreshed</span>
              </div>
              <strong>
                {lastUpdated.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </strong>
              <span className="demo-disclaimer">Prototype data view</span>
            </div>
          </div>

          <div className="notice-banner">
            <div className="notice-icon">
              <AlertTriangle size={17} />
            </div>
            <div>
              <strong>Prototype / demonstration environment</strong>
              <span>
                Site readings and risk scores shown below are illustrative
                demo values unless marked as backend data. Not an official
                warning service.
              </span>
            </div>
            <span className="demo-badge">DEMO DATA</span>
          </div>

          <section className="metrics-grid">
            <MetricCard
              label="MONITORED LOCATIONS"
              value={String(sites.length).padStart(2, "0")}
              subtext="Sites in current view"
              icon={<LocateFixed size={19} />}
              tone="blue"
              trend="Site registry"
            />
            <MetricCard
              label="ELEVATED RISK SITES"
              value={String(highRiskCount).padStart(2, "0")}
              subtext="High + critical demo sites"
              icon={<AlertTriangle size={19} />}
              tone="orange"
              trend="Needs review"
            />
            <MetricCard
              label="CRITICAL RISK SITES"
              value={String(criticalCount).padStart(2, "0")}
              subtext="Illustrative classifications"
              icon={<Siren size={19} />}
              tone="red"
              trend="Priority review"
            />
            <MetricCard
              label="AVERAGE RISK SCORE"
              value={String(averageRisk)}
              suffix="/100"
              subtext="Mean of displayed demo scores"
              icon={<Gauge size={19} />}
              tone="purple"
              trend="Prototype score"
            />
          </section>

          <section className="primary-grid">
            <div className="panel rainfall-panel">
              <div className="panel-header">
                <div>
                  <div className="section-kicker">ENVIRONMENTAL SIGNALS</div>
                  <h2>Rainfall monitoring</h2>
                  <p>Illustrative hourly rainfall readings</p>
                </div>
                <div className="panel-icon blue-icon">
                  <CloudRain size={19} />
                </div>
              </div>

              <div className="chart-summary">
                <div>
                  <span className="summary-value">35.0 <small>mm</small></span>
                  <span className="summary-label">Example latest reading</span>
                </div>
                <div className="chart-legend">
                  <span><i className="legend-rain" /> Rainfall</span>
                  <span><i className="legend-threshold" /> Reference line</span>
                </div>
              </div>

              <div className="rainfall-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={rainfallHistory}
                    margin={{ top: 10, right: 6, left: -18, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="rainFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4c8dff" stopOpacity={0.24} />
                        <stop offset="95%" stopColor="#4c8dff" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 5"
                      vertical={false}
                      stroke="#e7edf5"
                    />
                    <XAxis
                      dataKey="time"
                      tick={{ fill: "#8491a5", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      dy={8}
                    />
                    <YAxis
                      tick={{ fill: "#8491a5", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 10,
                        border: "1px solid #e8edf4",
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="threshold"
                      stroke="#e7a347"
                      strokeDasharray="5 5"
                      strokeWidth={1.5}
                      fill="none"
                      dot={false}
                      name="Reference line"
                    />
                    <Area
                      type="monotone"
                      dataKey="rainfall"
                      stroke="#3b82f6"
                      strokeWidth={2.5}
                      fill="url(#rainFill)"
                      activeDot={{ r: 4 }}
                      name="Rainfall (mm)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="chart-footer">
                <div className="footer-insight">
                  <TrendingUp size={15} />
                  <span>Example trend — not a live weather feed</span>
                </div>
                <span className="footer-source">DEMO SERIES</span>
              </div>
            </div>

            <div className="panel distribution-panel">
              <div className="panel-header">
                <div>
                  <div className="section-kicker">RISK CLASSIFICATION</div>
                  <h2>Site risk distribution</h2>
                  <p>Current illustrative site classifications</p>
                </div>
                <div className="panel-icon purple-icon">
                  <Layers3 size={19} />
                </div>
              </div>

              <div className="risk-distribution">
                {(["CRITICAL", "HIGH", "MODERATE", "LOW"] as RiskLevel[]).map(
                  (level) => {
                    const count = sites.filter((site) => site.risk === level).length;
                    const percentage = sites.length
                      ? Math.round((count / sites.length) * 100)
                      : 0;

                    return (
                      <div className="distribution-row" key={level}>
                        <div className="distribution-label">
                          <span className={`risk-indicator ${riskClass(level)}`} />
                          <span>{level}</span>
                          <strong>{count}</strong>
                        </div>
                        <div className="distribution-track">
                          <span
                            className={`distribution-fill ${riskClass(level)}`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  },
                )}
              </div>

              <div className="risk-note">
                <div className="risk-note-icon">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <strong>Risk interpretation</strong>
                  <p>
                    Illustrative score bands only. Calibrate thresholds using
                    validated local data before operational use.
                  </p>
                </div>
              </div>

              <div className="panel-mini-footer">
                <Database size={14} />
                <span>
                  {apiOnline
                    ? "Backend health check succeeded"
                    : "Sample data displayed"}
                </span>
                <span className="mini-footer-dot" />
              </div>
            </div>
          </section>

          <section className="panel sites-panel">
            <div className="panel-header sites-header">
              <div>
                <div className="section-kicker">REGIONAL OBSERVATIONS</div>
                <h2>Monitoring locations</h2>
                <p>Site registry and illustrative environmental readings</p>
              </div>
              <div className="table-actions">
                <div className="search-box">
                  <Search size={15} />
                  <input
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="Search locations..."
                    aria-label="Search locations"
                  />
                  {searchText && (
                    <button
                      onClick={() => setSearchText("")}
                      aria-label="Clear search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <button
                  className="secondary-button"
                  onClick={() => void refreshDashboard()}
                >
                  <RefreshCw size={14} />
                  Refresh
                </button>
              </div>
            </div>

            <div className="table-scroll">
              <table className="sites-table">
                <thead>
                  <tr>
                    <th>MONITORING SITE</th>
                    <th>RAINFALL</th>
                    <th>SOIL MOISTURE</th>
                    <th>RISK SCORE</th>
                    <th>RISK LEVEL</th>
                    <th>COORDINATES</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSites.map((site) => (
                    <tr key={site.name}>
                      <td>
                        <div className="site-cell">
                          <div className="site-icon">
                            <Mountain size={17} />
                          </div>
                          <div>
                            <strong>{site.name}</strong>
                            <span>{site.district}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="reading">
                          <CloudRain size={15} />
                          {site.rainfall.toFixed(1)} <small>mm</small>
                        </span>
                      </td>
                      <td>
                        <span className="reading">
                          <Waves size={15} />
                          {site.moisture}% 
                        </span>
                      </td>
                      <td>
                        <div className="score-cell">
                          <strong>{site.score}</strong>
                          <span className="score-track">
                            <span
                              className={riskClass(site.risk)}
                              style={{ width: `${site.score}%` }}
                            />
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`risk-pill ${riskClass(site.risk)}`}>
                          <span />
                          {site.risk}
                        </span>
                      </td>
                      <td className="coordinates">
                        {site.latitude.toFixed(4)}, {site.longitude.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                  {filteredSites.length === 0 && (
                    <tr>
                      <td colSpan={6} className="empty-state">
                        No matching monitoring locations.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="table-footer">
              <span>
                Showing <strong>{filteredSites.length}</strong> of{" "}
                <strong>{sites.length}</strong> locations
              </span>
              <span className="demo-footer-label">
                <span /> DEMO VALUES MAY BE DISPLAYED
              </span>
            </div>
          </section>

          <section className="bottom-grid">
            <div className="panel alerts-panel">
              <div className="panel-header">
                <div>
                  <div className="section-kicker">EARLY WARNING CENTRE</div>
                  <h2>Recent alerts</h2>
                  <p>Example alerts for the software prototype</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => setShowAllAlerts((value) => !value)}
                >
                  {showAllAlerts ? "Show less" : "View all"}
                </button>
              </div>

              <div className="alerts-list">
                {(showAllAlerts ? alerts : alerts.slice(0, 3)).map((alert) => (
                  <div className="alert-item" key={alert.id}>
                    <div className={`alert-symbol ${riskClass(alert.level)}`}>
                      {alert.level === "CRITICAL" ? (
                        <Siren size={17} />
                      ) : alert.level === "HIGH" ? (
                        <AlertTriangle size={17} />
                      ) : (
                        <BellRing size={17} />
                      )}
                    </div>
                    <div className="alert-copy">
                      <div className="alert-title-row">
                        <strong>{alert.title}</strong>
                        <span className={`risk-pill ${riskClass(alert.level)}`}>
                          <span />
                          {alert.level}
                        </span>
                      </div>
                      <p>{alert.location} · {alert.time}</p>
                      <span className="alert-detail">{alert.message}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="alerts-footnote">
                <AlertTriangle size={14} />
                <span>Prototype notifications; not delivered SMS messages.</span>
              </div>
            </div>

            <div className="panel conditions-panel">
              <div className="panel-header">
                <div>
                  <div className="section-kicker">SENSOR STATUS</div>
                  <h2>Data connectivity</h2>
                  <p>Application and data-source health</p>
                </div>
                <div className="panel-icon green-icon">
                  <Radio size={19} />
                </div>
              </div>

              <div className="condition-row">
                <div className="condition-icon">
                  <Activity size={17} />
                </div>
                <div className="condition-copy">
                  <strong>FastAPI backend</strong>
                  <span>Health endpoint</span>
                </div>
                <span className={`connection-badge ${apiOnline ? "connected" : ""}`}>
                  <span />
                  {apiOnline ? "Connected" : "Offline"}
                </span>
              </div>

              <div className="condition-row">
                <div className="condition-icon">
                  <Database size={17} />
                </div>
                <div className="condition-copy">
                  <strong>Database</strong>
                  <span>SQLite / API-managed</span>
                </div>
                <span className="connection-badge pending">
                  <span />
                  API dependent
                </span>
              </div>

              <div className="condition-row">
                <div className="condition-icon">
                  <CloudSun size={17} />
                </div>
                <div className="condition-copy">
                  <strong>Weather feed</strong>
                  <span>External integration</span>
                </div>
                <span className="connection-badge pending">
                  <span />
                  Not configured
                </span>
              </div>

              <div className="condition-row">
                <div className="condition-icon">
                  <Wind size={17} />
                </div>
                <div className="condition-copy">
                  <strong>IoT sensors</strong>
                  <span>Hardware integration</span>
                </div>
                <span className="connection-badge pending">
                  <span />
                  Simulation planned
                </span>
              </div>

              <div className="connectivity-note">
                <CheckCircle2 size={15} />
                <span>
                  Dashboard refreshes its API status every 30 seconds.
                </span>
              </div>
            </div>
          </section>

          <footer className="page-footer">
            <div>
              <span className="footer-brand-mark"><Mountain size={15} /></span>
              <strong>TERRAGUARD AI</strong>
              <span>AI-powered landslide risk monitoring prototype</span>
            </div>
            <span>Software demonstration · Not an official alert system</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

type MetricCardProps = {
  label: string;
  value: string;
  suffix?: string;
  subtext: string;
  icon: React.ReactNode;
  tone: string;
  trend: string;
};

function MetricCard({
  label,
  value,
  suffix,
  subtext,
  icon,
  tone,
  trend,
}: MetricCardProps) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <span className={`metric-icon ${tone}`}>{icon}</span>
      </div>
      <div className="metric-value">
        {value}
        {suffix && <small>{suffix}</small>}
      </div>
      <div className="metric-bottom">
        <span>{subtext}</span>
        <span className={`metric-trend ${tone}`}>{trend}</span>
      </div>
    </div>
  );
}

export default App;
