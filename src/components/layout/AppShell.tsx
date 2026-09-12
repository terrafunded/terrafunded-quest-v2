import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Menu, Wind } from "lucide-react";
import { useRealm } from "@/data/useRealm";
import { useHorizon } from "@/horizon/HorizonProvider";
import { oxygenPace } from "@/domain";
import { useLang } from "@/i18n/lang";
import { useRealmStrings } from "@/i18n/realm";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SinceLastVisit } from "@/components/realm/SinceLastVisit";
import { PageTransition } from "@/components/layout/PageTransition";
import { NavDrawer } from "@/components/layout/NavDrawer";

const TOPBAR_HEIGHT_PX = 56;

/**
 * App chrome: a fixed top bar on every breakpoint (hamburger · Quest · Oxygen) and a single
 * left drawer for navigation. No permanent sidebar, no bottom nav — phone and desktop share
 * the same layout. The drawer always mounts closed; open state is not persisted.
 */
export function AppShell() {
  const location = useLocation();
  const { data } = useRealm();
  const { horizon } = useHorizon();
  const [lang] = useLang();
  const t = useRealmStrings().oxygen;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Close the drawer on every route change (including the click that navigates).
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // The pill shows the trailing figure ("53/90d"), not the cumulative total it used to show. The
  // pill is the one Oxygen reading visible on every page, and the cumulative sum has no sentence a
  // user can say about it (each lot was measured against a different day's pace, so "+533d" is
  // ahead of nothing — see OxygenScore). Days gained over days passed is a ratio the eye reads at
  // a glance and it changes colour with the band, so the chrome tells the truth the card tells.
  // Trade-off accepted: the pill no longer ticks up with every closing the way a lifetime score
  // does; that reward now lives in the card's demoted cumulative line and the Quests ledger.
  const oxygen = data?.realm.oxygen;
  const pace = oxygen && oxygenPace(oxygen);
  const oxygenLabel = oxygen ? t.pill(oxygen.trailingDaysGained, oxygen.trailingWindowDays) : "…";
  const oxygenTitle =
    oxygen && pace
      ? t.pillTitle(oxygen.trailingDaysGained, oxygen.trailingWindowDays, t.verdict[pace.band](oxygen.trailingDaysGained, oxygen.trailingWindowDays, pace.diff))
      : t.pillLoading;

  return (
    <div className="min-h-dvh">
      <header
        className="fixed inset-x-0 top-0 z-40 border-b border-border/70 bg-card/90 backdrop-blur"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
        data-testid="topbar"
      >
        <div
          className="relative mx-auto grid max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-2 px-3 sm:px-4"
          style={{ height: TOPBAR_HEIGHT_PX }}
        >
          <Button
            ref={menuButtonRef}
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="nav-drawer"
            data-testid="nav-menu-button"
            onClick={() => setMenuOpen(true)}
          >
            <Menu />
          </Button>

          <div className="pointer-events-none absolute inset-x-0 flex items-center justify-center">
            <Link
              to="/"
              className="pointer-events-auto inline-flex min-h-11 items-center rounded-md px-2.5 font-display text-[13px] uppercase tracking-[0.08em] text-gold transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:text-sm sm:tracking-[var(--brand-tracking)]"
              aria-label={lang === "es" ? "Quest — volver a la Sala del Trono" : "Quest — back to the Throne Room"}
              data-testid="topbar-realm-name"
            >
              Quest · <span data-testid="topbar-horizon">{horizon}</span>
            </Link>
          </div>

          <div
            className={cn("justify-self-end tabular-nums", pace?.band === "behind" ? "text-ember" : "text-oxygen")}
            data-testid="topbar-oxygen"
            data-band={pace?.band}
            title={oxygenTitle}
            aria-label={oxygenTitle}
          >
            <span className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium", pace?.band === "behind" ? "bg-ember/10" : "bg-oxygen/10")}>
              <Wind className="h-3.5 w-3.5" aria-hidden />
              <span className="font-heading">{oxygenLabel}</span>
            </span>
          </div>
        </div>
      </header>

      <main
        id="main"
        className="px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-10"
        style={{ paddingTop: `calc(${TOPBAR_HEIGHT_PX}px + env(safe-area-inset-top) + 1.25rem)` }}
      >
        <div className="mx-auto w-full max-w-7xl">
          <PageTransition routeKey={location.pathname}>
            <Outlet />
          </PageTransition>
        </div>
      </main>

      <NavDrawer open={menuOpen} onOpenChange={setMenuOpen} triggerRef={menuButtonRef} />
      <SinceLastVisit />
    </div>
  );
}
