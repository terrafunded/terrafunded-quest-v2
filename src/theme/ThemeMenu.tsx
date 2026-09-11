import { Check } from "lucide-react";
import { THEME_IDS, THEMES, type ThemeId } from "./themes";
import { useTheme } from "./ThemeProvider";
import { cn } from "@/lib/utils";

interface ThemeMenuProps {
  /** `full` shows name, tagline and swatches; `compact` is a row of three swatch buttons. */
  variant?: "full" | "compact";
  className?: string;
}

/** The skin picker. Same data, same layouts; only the theme changes. Persisted in localStorage. */
export function ThemeMenu({ variant = "full", className }: ThemeMenuProps) {
  const { themeId, setTheme } = useTheme();

  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-1", className)} role="radiogroup" aria-label="Theme" data-testid="theme-menu-compact">
        {THEME_IDS.map((id) => (
          <SwatchButton key={id} id={id} active={id === themeId} onSelect={setTheme} />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("grid gap-2", className)} role="radiogroup" aria-label="Theme" data-testid="theme-menu">
      {THEME_IDS.map((id) => {
        const t = THEMES[id];
        const active = id === themeId;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            data-theme-option={id}
            onClick={() => setTheme(id)}
            className={cn(
              "flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
              active ? "border-gold/60 bg-secondary/70" : "border-border/70 hover:border-gold/40 hover:bg-secondary/40",
            )}
          >
            <span className="flex shrink-0 -space-x-1.5">
              {t.swatches.map((c, i) => (
                <span key={i} className="inline-block h-5 w-5 rounded-full border border-background/60 shadow" style={{ background: c }} />
              ))}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-heading text-sm leading-tight">{t.name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{t.tagline}</span>
            </span>
            {active && <Check className="h-4 w-4 shrink-0 text-gold" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

function SwatchButton({ id, active, onSelect }: { id: ThemeId; active: boolean; onSelect: (id: ThemeId) => void }) {
  const t = THEMES[id];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={t.name}
      title={t.name}
      data-theme-option={id}
      onClick={() => onSelect(id)}
      className="swatch-button group flex h-8 w-8 items-center justify-center rounded-full"
    >
      <span
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full border transition-colors",
          active ? "border-gold ring-2 ring-gold/40" : "border-border/70 group-hover:border-gold/50",
        )}
      >
        <span className="h-4 w-4 rounded-full" style={{ background: `linear-gradient(135deg, ${t.swatches[0]}, ${t.swatches[1]} 55%, ${t.swatches[2]})` }} />
      </span>
    </button>
  );
}
