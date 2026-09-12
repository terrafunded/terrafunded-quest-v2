import { useCallback, useEffect, useId, useRef, type RefObject, type TouchEvent as ReactTouchEvent } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LogOut, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/data/auth";
import { Button } from "@/components/ui/button";
import { ThemeMenu } from "@/theme/ThemeMenu";
import { useTheme } from "@/theme/ThemeProvider";
import { themeIcon, type IconName } from "@/theme/icons";
import { useLang } from "@/i18n/lang";
import { EXIT_HORIZONS } from "@/config/goal";
import { useHorizon } from "@/horizon/HorizonProvider";
import type { QualityLang } from "@/domain/quality_human";

const LANG_OPTIONS: readonly { id: QualityLang; label: string; name: string }[] = [
  { id: "es", label: "ES", name: "Español" },
  { id: "en", label: "EN", name: "English" },
];

const NAV_ITEMS: readonly { to: string; label: string; icon: IconName }[] = [
  { to: "/", label: "Throne Room", icon: "throne" },
  { to: "/warplan", label: "War Plan", icon: "warplan" },
  { to: "/exodus", label: "Exodus", icon: "exodus" },
  { to: "/realm", label: "The Realm", icon: "realm" },
  { to: "/quests", label: "Quests", icon: "quests" },
  { to: "/pipeline", label: "Pipeline", icon: "pipeline" },
  { to: "/sponsors", label: "Sponsors", icon: "sponsors" },
  { to: "/treasury", label: "Treasury", icon: "treasury" },
  { to: "/oracle", label: "Oracle", icon: "oracle" },
  { to: "/chronicle", label: "Chronicle", icon: "chronicle" },
  { to: "/trophies", label: "Trophies", icon: "trophies" },
  { to: "/quality", label: "Data Quality", icon: "quality" },
];

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

interface NavDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Element that opened the drawer; receives focus when it closes. */
  triggerRef: RefObject<HTMLButtonElement | null>;
}

/**
 * Left-edge navigation drawer. Framer Motion slides it in; a dim backdrop sits behind.
 * Closes on backdrop tap, Escape, swipe-left, and route change (caller). Focus is trapped
 * while open and returned to the hamburger on close. Nothing is persisted — always starts closed.
 */
export function NavDrawer({ open, onOpenChange, triggerRef }: NavDrawerProps) {
  const { session, signOut } = useAuth();
  const { themeId, d } = useTheme();
  const [lang, setLang] = useLang();
  const { horizon, setHorizon } = useHorizon();
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  // Focus trap + initial focus + Escape.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);

    const initial = panel.querySelector<HTMLElement>("[data-drawer-close]") ?? focusables()[0];
    initial?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const triggerEl = triggerRef.current;
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      if (triggerEl) triggerEl.focus();
      else previouslyFocused?.focus?.();
    };
  }, [open, close, triggerRef]);

  const onTouchStart = (e: ReactTouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    touchStart.current = { x: t.clientX, y: t.clientY };
  };

  const onTouchEnd = (e: ReactTouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    const t = e.changedTouches[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (dx < -56 && Math.abs(dx) > Math.abs(dy) * 1.4) close();
  };

  if (typeof document === "undefined") return null;

  const duration = reduceMotion ? 0 : d(0.28);

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50" data-testid="nav-drawer-root">
          <motion.button
            type="button"
            aria-label="Close menu"
            data-testid="nav-backdrop"
            tabIndex={-1}
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration }}
            onClick={close}
          />
          <motion.aside
            ref={panelRef}
            id="nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            data-testid="nav-drawer"
            className="absolute inset-y-0 left-0 flex h-[100dvh] max-h-[100dvh] w-[min(280px,100vw)] flex-col border-r border-border/70 bg-card shadow-2xl md:w-[320px]"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration, ease: [0.22, 1, 0.36, 1] }}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <div className="flex min-h-14 shrink-0 items-center justify-between border-b border-border/70 px-4 pt-[env(safe-area-inset-top)]">
              <h2 id={titleId} className="font-display text-sm uppercase tracking-[var(--brand-tracking)] text-gold">
                Quest
              </h2>
              <Button type="button" variant="ghost" size="icon" aria-label="Close menu" data-drawer-close onClick={close}>
                <X />
              </Button>
            </div>

            <nav className="flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-3 py-3" aria-label="Primary">
              <div className="mb-3">
                <div className="stat-label mb-2">Horizonte · Exit</div>
                <div
                  role="radiogroup"
                  aria-label="Exit horizon"
                  className="grid grid-cols-3 gap-2"
                  data-testid="horizon-toggle"
                  data-horizon={horizon}
                >
                  {EXIT_HORIZONS.map((year) => (
                    <button
                      key={year}
                      type="button"
                      role="radio"
                      aria-checked={horizon === year}
                      aria-label={`Exit ${year}`}
                      data-testid={`horizon-${year}`}
                      onClick={() => setHorizon(year)}
                      className={cn(
                        "flex min-h-11 items-center justify-center rounded-md border px-3 text-sm transition-colors",
                        horizon === year
                          ? "border-gold/60 bg-secondary/70 text-gold"
                          : "border-border/70 text-muted-foreground hover:border-gold/40 hover:bg-secondary/40 hover:text-foreground",
                      )}
                    >
                      <span className="font-heading">{year}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground" data-testid="horizon-caption">
                  {lang === "es"
                    ? `Toda cifra requerida en cada pantalla se mide contra el 31 dic ${horizon}.`
                    : `Every required figure on every page is measured against Dec 31, ${horizon}.`}
                </p>
              </div>
              {NAV_ITEMS.map((item) => {
                const Icon = themeIcon(themeId, item.icon);
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    onClick={close}
                    className={({ isActive }) =>
                      cn(
                        "nav-item flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground",
                        isActive && "bg-secondary text-gold",
                      )
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    {item.label}
                  </NavLink>
                );
              })}
            </nav>

            <div className="shrink-0 space-y-3 border-t border-border/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div>
                <div className="stat-label mb-2">Skin</div>
                <ThemeMenu />
              </div>
              <div>
                <div className="stat-label mb-2">Idioma · Language</div>
                <div role="radiogroup" aria-label="Language" className="grid grid-cols-2 gap-2" data-testid="lang-toggle" data-lang={lang}>
                  {LANG_OPTIONS.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      role="radio"
                      aria-checked={lang === o.id}
                      data-lang-option={o.id}
                      onClick={() => setLang(o.id)}
                      className={cn(
                        "flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 text-sm transition-colors",
                        lang === o.id ? "border-gold/60 bg-secondary/70 text-gold" : "border-border/70 text-muted-foreground hover:border-gold/40 hover:bg-secondary/40 hover:text-foreground",
                      )}
                    >
                      <span className="font-heading">{o.label}</span>
                      <span className="text-xs">{o.name}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">Data Quality follows this; the rest of Quest stays in English.</p>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <div className="min-w-0 truncate" title={session?.user.email ?? ""} data-testid="nav-user-email">
                  {session?.user.email}
                </div>
                <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => void signOut()} aria-label="Sign out">
                  <LogOut /> Sign out
                </Button>
              </div>
            </div>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
