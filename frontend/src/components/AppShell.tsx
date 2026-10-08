import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { useScenario } from "../hooks/useScenario";
import { useLive } from "../hooks/useLive";
import { getJSON, setToken } from "../lib/api";
import type { AlertList, AuthUser, IncidentList } from "../lib/types";

const USER_KEY = "tg_user";

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("tg_nav_collapsed") === "1");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(loadUser);
  const [badges, setBadges] = useState<Partial<Record<"alerts" | "incidents" | "critical", number>>>({});
  const scenario = useScenario();
  const { version } = useLive();
  const location = useLocation();

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("tg_nav_collapsed", next ? "1" : "0");
      return next;
    });
  }, []);

  // close mobile nav on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // sign-out helper passed to header
  const signOut = useCallback(() => {
    setToken(null);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  // badge counts: open alerts + open/critical incidents (from API, polled with live version)
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [alerts, incidents] = await Promise.all([
          getJSON<AlertList>("/api/alerts?status=OPEN"),
          getJSON<IncidentList>("/api/incidents?status=OPEN"),
        ]);
        if (!alive) return;
        const critical = incidents.items.filter((i) => i.severity === "CRITICAL").length;
        setBadges({
          alerts: alerts.items.length,
          incidents: incidents.total,
          critical,
        });
      } catch {
        /* badges stay hidden when API unreachable */
      }
    };
    void load();
    const id = window.setInterval(load, 30000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [version]);

  return (
    <div className="min-h-screen bg-ink text-slate-300">
      <Header
        onToggleSidebar={() => setMobileOpen((v) => !v)}
        scenario={
          scenario.state
            ? {
                state: scenario.state.state,
                busy: scenario.busy,
                act: scenario.act,
              }
            : null
        }
        user={user}
        onSignOut={signOut}
      />
      <div className="flex">
        <Sidebar
          badges={badges}
          collapsed={collapsed}
          onToggle={toggle}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />
        <main className="flex-1 min-w-0 p-3 md:p-5 bg-ink">
          <div className="max-w-[1600px] mx-auto">
            <Outlet
              context={{
                scenario,
                user,
                setUser,
                scenarioBanner: scenario,
              }}
              key={location.pathname}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

export interface ShellContext {
  scenario: ReturnType<typeof useScenario>;
  user: AuthUser | null;
  setUser: (u: AuthUser | null) => void;
  scenarioBanner: ReturnType<typeof useScenario>;
}
