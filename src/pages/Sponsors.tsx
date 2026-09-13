import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { useRealm } from "@/data/useRealm";
import type { RealmEvent } from "@/domain";
import { Button } from "@/components/ui/button";
import { CapitalDonut } from "@/components/realm/CapitalDonut";
import { SponsorCard } from "@/components/realm/SponsorCard";
import { Celebration } from "@/components/realm/Celebration";
import { LiberationBoard } from "@/components/realm/Liberation";
import { EmptyState, ErrorState, LoadingState, PageHeader, TableErrorsBanner } from "@/components/realm/PageStates";
import { useSponsorsStrings } from "@/i18n/sponsors";
import { useTheme } from "@/theme/ThemeProvider";

const SEEN_KEY = "quest.liberations.seen";
const cardId = (investorId: string) => `sponsor-${investorId}`;
/** How long a card stays lit after its arc is clicked. */
const HIGHLIGHT_MS = 1800;

export default function Sponsors() {
  const { data, isLoading, error, refetch } = useRealm();
  const t = useSponsorsStrings();
  const { reducedMotion } = useTheme();
  const [fanfare, setFanfare] = useState<RealmEvent[] | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const events = data?.realm.events;
  const liberationEvents = useMemo(() => events?.filter((e) => e.kind === "liberation" && !e.future), [events]);
  const checked = useRef(false);

  // Full-screen liberation the first time this browser sees a freed position.
  useEffect(() => {
    if (!liberationEvents || liberationEvents.length === 0 || checked.current) return;
    checked.current = true;
    let seen: string[] = [];
    try {
      const raw = localStorage.getItem(SEEN_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      seen = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
    } catch {
      seen = [];
    }
    const fresh = liberationEvents.filter((e) => !seen.includes(e.id));
    if (fresh.length === 0) return;
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, ...fresh.map((e) => e.id)]));
    } catch {
      // ignore
    }
    setFanfare(fresh);
  }, [liberationEvents]);

  useEffect(
    () => () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    },
    [],
  );

  const selectSponsor = useCallback(
    (investorId: string) => {
      document.getElementById(cardId(investorId))?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
      setHighlight(investorId);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlight(null), HIGHLIGHT_MS);
    },
    [reducedMotion],
  );

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) return null;

  const funded = data.realm.investors.filter((i) => i.farms.length > 0);
  const others = data.realm.investors.filter((i) => i.farms.length === 0);

  return (
    <div>
      <PageHeader title={t.title} subtitle={t.subtitle}>
        {liberationEvents && liberationEvents.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setFanfare(liberationEvents)}>
            <Sparkles /> {t.replay}
          </Button>
        )}
      </PageHeader>
      <TableErrorsBanner errors={data.tableErrors} />
      {funded.length > 0 && (
        <div className="mb-6">
          <CapitalDonut composition={data.realm.capitalComposition} liberation={data.realm.liberation} onSelect={selectSponsor} />
        </div>
      )}
      <div className="mb-6">
        <LiberationBoard liberation={data.realm.liberation} />
      </div>
      {fanfare && <Celebration events={fanfare} narrative={data.realm.narrative} onDone={() => setFanfare(null)} />}
      {funded.length === 0 ? (
        <EmptyState title={t.emptyTitle} body={t.emptyBody} />
      ) : (
        <div className="grid items-stretch gap-4 lg:grid-cols-2" data-testid="sponsor-cards">
          {funded.map((inv, i) => (
            <SponsorCard key={inv.investorId} id={cardId(inv.investorId)} inv={inv} index={i} t={t} highlighted={highlight === inv.investorId} />
          ))}
        </div>
      )}
      {others.length > 0 && (
        <footer className="mt-6 rounded-lg border border-border/50 bg-muted/20 px-5 py-3 text-xs text-muted-foreground" data-testid="sponsors-footnote">
          {t.footnote(others.map((o) => o.name).join(", "))}
        </footer>
      )}
    </div>
  );
}
