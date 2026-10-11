import { NavLink } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  ClipboardList,
  Cog,
  Database,
  FileBarChart,
  FileText,
  Gauge,
  Layers,
  Map as MapIcon,
  MonitorCog,
  Radar,
  Route,
  Send,
  Settings as SettingsIcon,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Table2,
  TrendingUp,
  Waves,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SectionLabel } from "./ui";
import { useIsDesktop } from "../hooks/useMediaQuery";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badgeKey?: "alerts" | "incidents" | "critical";
}

export interface NavSection {
  section: string;
  items: NavItem[];
}

/* Canonical sidebar structure per project spec (20 items, 6 sections). */
export const NAV_SECTIONS: NavSection[] = [
  {
    section: "OVERVIEW",
    items: [{ to: "/dashboard", label: "Dashboard", icon: Gauge }],
  },
  {
    section: "MONITORING",
    items: [
      { to: "/ai-prediction", label: "AI Prediction", icon: Activity },
      { to: "/early-alerts", label: "Early Alerts", icon: AlertTriangle, badgeKey: "alerts" },
      { to: "/gis-monitor", label: "GIS Monitor", icon: MapIcon },
      { to: "/weather-radar", label: "Weather Radar", icon: Radar },
      { to: "/soil-moisture", label: "Soil Moisture", icon: Waves },
    ],
  },
  {
    section: "FIELD / INCIDENTS",
    items: [
      { to: "/report-incident", label: "Report Incident", icon: Send },
      { to: "/field-incidents", label: "Field Incidents", icon: ClipboardList, badgeKey: "incidents" },
      { to: "/road-corridors", label: "Road Corridors", icon: Route },
      { to: "/critical-infrastructure", label: "Critical Infrastructure", icon: Building2 },
    ],
  },
  {
    section: "ANALYTICS",
    items: [
      { to: "/risk-analytics", label: "Risk Analytics", icon: BarChart3 },
      { to: "/risk-simulator", label: "Risk Simulator", icon: SlidersHorizontal },
      { to: "/model-analysis", label: "Model Analysis", icon: Layers },
      { to: "/temporal-analysis", label: "Temporal Analysis", icon: TrendingUp },
    ],
  },
  {
    section: "REPORTING",
    items: [
      { to: "/report-export", label: "Report Export", icon: FileText },
      { to: "/incident-reports", label: "Incident Reports", icon: FileBarChart },
      { to: "/analytics-reports", label: "Analytics Reports", icon: Table2 },
    ],
  },
  {
    section: "SYSTEM",
    items: [
      { to: "/model-governance", label: "Model Governance", icon: ShieldCheck },
      { to: "/data-pipeline", label: "Data Pipeline", icon: Database },
      { to: "/admin-data", label: "Admin / Data", icon: MonitorCog },
      { to: "/settings", label: "Settings", icon: SettingsIcon },
    ],
  },
];

export const NAV_ICON_MAP: Record<string, LucideIcon> = {
  "TERRAGUARD AI": Cog,
  Sun,
};

export function Sidebar({
  badges,
  collapsed,
  onToggle,
  mobileOpen,
  onCloseMobile,
}: {
  badges: Partial<Record<"alerts" | "incidents" | "critical", number>>;
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  // On phones/tablets the sidebar is an overlay drawer and always shown expanded;
  // the collapsed rail is a desktop-only affordance.
  const isDesktop = useIsDesktop();
  const showFull = !collapsed || !isDesktop;

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      <aside
        className={[
          "bg-panel2 border-r border-line2 flex-col flex-shrink-0 overflow-y-auto transition-[width] duration-200 z-40",
          // Mobile: fixed overlay drawer below the header, never reflows the page.
          "fixed left-0 top-[53px] bottom-0 w-64",
          // Desktop: back into normal flow as a docked, sticky rail.
          "lg:sticky lg:left-auto lg:bottom-auto lg:top-[53px] lg:h-[calc(100vh-53px)]",
          collapsed && isDesktop ? "lg:w-[64px]" : "lg:w-64",
          mobileOpen ? "flex" : "hidden",
          "lg:flex",
        ].join(" ")}
        aria-label="Primary navigation"
      >
        <div className="lg:hidden flex items-center justify-between px-3 py-2 border-b border-line2">
          <span className="text-[10px] font-mono tracking-[0.2em] text-slate-400">NAVIGATION</span>
          <button
            onClick={onCloseMobile}
            className="px-2 py-1 rounded text-[10px] font-mono text-slate-400 hover:text-white hover:bg-slate-800/60"
            aria-label="Close navigation"
          >
            ✕ CLOSE
          </button>
        </div>

        <div className={`px-3 py-4 space-y-5 ${showFull ? "" : "px-1.5"}`}>
          {NAV_SECTIONS.map((sec) => (
            <div key={sec.section} className="space-y-1">
              {showFull ? (
                <SectionLabel>{sec.section}</SectionLabel>
              ) : (
                <div className="h-px bg-line2 mx-1.5 mb-1" />
              )}
              <div className="space-y-0.5">
                {sec.items.map((item) => {
                  const Icon = item.icon;
                  const badge =
                    item.badgeKey !== undefined && badges[item.badgeKey] !== undefined
                      ? badges[item.badgeKey]!
                      : 0;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={onCloseMobile}
                      title={showFull ? undefined : item.label}
                      className={({ isActive }) =>
                        `group flex items-center gap-2.5 rounded px-3 py-1.5 text-[12px] font-mono transition-all border-l-2 ${
                          showFull ? "" : "justify-center px-1.5"
                        } ${
                          isActive
                            ? "bg-emerald-950/50 border-l-emerald-400 text-emerald-300 font-bold"
                            : "border-l-transparent text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 hover:border-l-slate-600"
                        }`
                      }
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {showFull && <span className="truncate">{item.label}</span>}
                      {showFull && badge > 0 && (
                        <span className="ml-auto px-1.5 py-[1px] rounded bg-red-600/80 text-white text-[9px] font-bold tabular-nums blink">
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {showFull && (
          <div className="mt-auto p-3 border-t border-line2 bg-ink text-[11px] text-slate-400 font-mono space-y-1.5">
            <div className="flex items-center justify-between">
              <span>ENGINE</span>
              <span className="text-emerald-400">PROTOTYPE</span>
            </div>
            <div className="flex items-center justify-between">
              <span>RISK BANDS</span>
              <span className="text-slate-300">5-LEVEL</span>
            </div>
            <div className="flex items-center justify-between">
              <span>REGION</span>
              <span className="text-slate-300">NER, INDIA</span>
            </div>
          </div>
        )}

        <button
          onClick={onToggle}
          className="hidden lg:flex items-center justify-center gap-1 py-2 border-t border-line2 text-[10px] font-mono text-slate-500 hover:text-emerald-400 hover:bg-slate-800/50 transition-colors sticky bottom-0 bg-panel2"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? "»" : "« COLLAPSE"}
        </button>
      </aside>
    </>
  );
}
