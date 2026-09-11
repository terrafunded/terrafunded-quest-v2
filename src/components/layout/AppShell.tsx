import { NavLink, Outlet, useLocation } from "react-router-dom";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/data/auth";
import { Button } from "@/components/ui/button";
import { SinceLastVisit } from "@/components/realm/SinceLastVisit";
import { PageTransition } from "@/components/layout/PageTransition";
import { ThemeMenu } from "@/theme/ThemeMenu";
import { useTheme } from "@/theme/ThemeProvider";
import { themeIcon, type IconName } from "@/theme/icons";

const NAV: readonly { to: string; label: string; short: string; icon: IconName }[] = [
  { to: "/", label: "Throne Room", short: "Throne", icon: "throne" },
  { to: "/realm", label: "The Realm", short: "Realm", icon: "realm" },
  { to: "/quests", label: "Quests", short: "Quests", icon: "quests" },
  { to: "/pipeline", label: "Pipeline", short: "Pipeline", icon: "pipeline" },
  { to: "/sponsors", label: "Sponsors", short: "Sponsors", icon: "sponsors" },
  { to: "/treasury", label: "Treasury", short: "Treasury", icon: "treasury" },
  { to: "/oracle", label: "Oracle", short: "Oracle", icon: "oracle" },
  { to: "/chronicle", label: "Chronicle", short: "Chronicle", icon: "chronicle" },
  { to: "/trophies", label: "Trophies", short: "Trophies", icon: "trophies" },
  { to: "/quality", label: "Data Quality", short: "Quality", icon: "quality" },
];

export function AppShell() {
  const { session, signOut } = useAuth();
  const location = useLocation();
  const { themeId } = useTheme();
  const Brand = themeIcon(themeId, "brand");

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border/70 bg-card/40 backdrop-blur md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <Brand className="h-5 w-5 text-gold" />
          <div>
            <div className="font-display text-sm uppercase tracking-[0.25em] text-gold">Exodus</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Quest v2</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3" aria-label="Primary">
          {NAV.map((item) => {
            const Icon = themeIcon(themeId, item.icon);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "nav-item flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground",
                    isActive && "bg-secondary text-gold",
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="border-t border-border/70 p-3 text-xs text-muted-foreground">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="stat-label">Skin</span>
            <ThemeMenu variant="compact" />
          </div>
          <div className="truncate" title={session?.user.email ?? ""}>
            {session?.user.email}
          </div>
          <Button variant="ghost" size="sm" className="mt-1 w-full justify-start px-2" onClick={() => void signOut()}>
            <LogOut /> Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border/70 bg-card/40 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center gap-2">
            <Brand className="h-4 w-4 text-gold" />
            <span className="font-display text-xs uppercase tracking-[0.25em] text-gold">Exodus</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeMenu variant="compact" />
            <Button variant="ghost" size="sm" onClick={() => void signOut()} aria-label="Sign out">
              <LogOut />
            </Button>
          </div>
        </header>

        <main className="flex-1 px-4 pb-24 pt-5 sm:px-6 md:pb-10 lg:px-10" id="main">
          <div className="mx-auto w-full max-w-7xl">
            <PageTransition routeKey={location.pathname}>
              <Outlet />
            </PageTransition>
          </div>
        </main>

        <nav
          className="fixed inset-x-0 bottom-0 z-40 flex justify-between overflow-x-auto border-t border-border/70 bg-card/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
          aria-label="Primary"
        >
          {NAV.map((item) => {
            const Icon = themeIcon(themeId, item.icon);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "nav-item flex min-h-[52px] min-w-[64px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] text-muted-foreground",
                    isActive && "text-gold",
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {item.short}
              </NavLink>
            );
          })}
        </nav>
      </div>
      <SinceLastVisit />
    </div>
  );
}
