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

/** One gutter scale for the top bar and <main>, so both boxes share their left/right edges. */
const CONTENT_GUTTERS = "px-4 sm:px-6 lg:px-10";

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
        {/*
          The bar is built as the same two boxes as <main>: an outer element carrying the gutters
          (CONTENT_GUTTERS, shared with <main>) and an inner `mx-auto w-full max-w-7xl` box. Putting
          the gutters on the same side of the max-width box as <main> does matters once the viewport
          is wider than the cap: `max-w-7xl` with the padding *inside* left the bar's content edge
          40px inside the cards' edge at 1920px.
        */}
        <div className={CONTENT_GUTTERS}>
          <div className="relative mx-auto grid w-full max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-2" style={{ height: TOPBAR_HEIGHT_PX }}>
            {/*
              The 44×44 icon button centres a 16px svg (14px inset each side) and lucide's Menu draws
              its lines from x=4 with a 2px round-capped stroke, so the ink starts 2px inside the svg
              box: 14 + 2 = 16px between the button's left edge and the glyph's left edge. Pull the box
              16px into the gutter (-ml-4) so the INK, not the box, lands on the content edge. The tap
              target is unchanged at 44×44 — only shifted.
            */}
            <Button
              ref={menuButtonRef}
              type="button"
              variant="ghost"
              size="icon"
              className="-ml-4"
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

            {/*
              Mirror of the hamburger, with one difference: the pill has a visible box (its tinted
              background), so the edge the eye reads is the box's right edge, not the glyph's. With the
              shared gutters that edge sits on the content's right edge by itself, so no negative
              margin is applied here — a -mr would push the tinted box past the cards. (The hamburger
              needs one because its box is invisible at rest and only the ink shows.)

              `col-start-3` is load-bearing: the wordmark is absolutely positioned, so it takes no grid
              cell, and auto-placement would otherwise drop the pill into the middle column — 8px (one
              `gap-2`) short of the right edge, with an empty third track behind it.
            */}
            <div
              className={cn("col-start-3 justify-self-end tabular-nums", pace?.band === "behind" ? "text-ember" : "text-oxygen")}
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
        </div>
      </header>

      <main
        id="main"
        className={cn("pb-[max(2.5rem,env(safe-area-inset-bottom))]", CONTENT_GUTTERS)}
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
