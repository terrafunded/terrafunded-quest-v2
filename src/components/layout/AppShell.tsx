import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Award, BookOpen, Coins, Crown, Eye, Landmark, LogOut, Map, ScrollText, ShieldAlert, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/data/auth";
import { Button } from "@/components/ui/button";

export const NAV = [
  { to: "/", label: "Throne Room", short: "Throne", icon: Crown },
  { to: "/realm", label: "The Realm", short: "Realm", icon: Map },
  { to: "/quests", label: "Quests", short: "Quests", icon: ScrollText },
  { to: "/sponsors", label: "Sponsors", short: "Sponsors", icon: Users },
  { to: "/treasury", label: "Treasury", short: "Treasury", icon: Coins },
  { to: "/oracle", label: "Oracle", short: "Oracle", icon: Eye },
  { to: "/chronicle", label: "Chronicle", short: "Chronicle", icon: BookOpen },
  { to: "/trophies", label: "Trophies", short: "Trophies", icon: Award },
  { to: "/quality", label: "Data Quality", short: "Quality", icon: ShieldAlert },
] as const;

export function AppShell() {
  const { session, signOut } = useAuth();
  const location = useLocation();

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border/70 bg-card/40 backdrop-blur md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <Landmark className="h-5 w-5 text-gold" />
          <div>
            <div className="font-display text-sm uppercase tracking-[0.25em] text-gold">Exodus</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Quest v2</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3" aria-label="Primary">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground",
                  isActive && "bg-secondary text-gold",
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border/70 p-3 text-xs text-muted-foreground">
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
            <Landmark className="h-4 w-4 text-gold" />
            <span className="font-display text-xs uppercase tracking-[0.25em] text-gold">Exodus</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void signOut()} aria-label="Sign out">
            <LogOut />
          </Button>
        </header>

        <main key={location.pathname} className="flex-1 px-4 pb-24 pt-5 sm:px-6 md:pb-10 lg:px-10" id="main">
          <div className="mx-auto w-full max-w-7xl">
            <Outlet />
          </div>
        </main>

        <nav
          className="fixed inset-x-0 bottom-0 z-40 flex justify-between overflow-x-auto border-t border-border/70 bg-card/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
          aria-label="Primary"
        >
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex min-w-[60px] flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] text-muted-foreground",
                  isActive && "text-gold",
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.short}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
