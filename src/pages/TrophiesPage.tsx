import { useRealm } from "@/data/useRealm";
import { Trophies } from "@/components/realm/Trophies";
import { StreaksPanel } from "@/components/realm/StreaksPanel";
import { ErrorState, LoadingState, PageHeader, TableErrorsBanner } from "@/components/realm/PageStates";
import { useTrophiesStrings } from "@/i18n/trophies";

export default function TrophiesPage() {
  const { data, isLoading, error, refetch } = useRealm();
  const t = useTrophiesStrings();
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) return null;
  const earned = data.realm.trophies.filter((tr) => tr.earned).length;
  const byRarity = ["legendary", "epic", "rare", "common"].map((r) => ({
    r,
    earned: data.realm.trophies.filter((tr) => tr.rarity === r && tr.earned).length,
    total: data.realm.trophies.filter((tr) => tr.rarity === r).length,
  }));
  const rarityLine = byRarity.map((x) => `${x.earned}/${x.total} ${t.rarity[x.r] ?? x.r}`).join(" · ");
  return (
    <div className="space-y-8">
      <div>
        <PageHeader title={t.title} subtitle={t.subtitle(earned, data.realm.trophies.length, rarityLine)} />
        <TableErrorsBanner errors={data.tableErrors} />
      </div>
      <StreaksPanel streaks={data.realm.streaks} kind="closing" />
      <StreaksPanel streaks={data.realm.reservationStreaks} kind="reservation" />
      <Trophies trophies={data.realm.trophies} />
    </div>
  );
}
