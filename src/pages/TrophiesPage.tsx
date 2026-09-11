import { useRealm } from "@/data/useRealm";
import { Trophies } from "@/components/realm/Trophies";
import { StreaksPanel } from "@/components/realm/StreaksPanel";
import { ErrorState, LoadingState, PageHeader, TableErrorsBanner } from "@/components/realm/PageStates";

export default function TrophiesPage() {
  const { data, isLoading, error, refetch } = useRealm();
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) return null;
  const earned = data.realm.trophies.filter((t) => t.earned).length;
  const byRarity = ["legendary", "epic", "rare", "common"].map((r) => ({
    r,
    earned: data.realm.trophies.filter((t) => t.rarity === r && t.earned).length,
    total: data.realm.trophies.filter((t) => t.rarity === r).length,
  }));
  return (
    <div className="space-y-8">
      <div>
        <PageHeader
          title="Trophies"
          subtitle={`${earned} of ${data.realm.trophies.length} achievements earned — ${byRarity.map((x) => `${x.earned}/${x.total} ${x.r}`).join(" · ")}. Every one is computed from real rows; nothing is awarded by hand.`}
        />
        <TableErrorsBanner errors={data.tableErrors} />
      </div>
      <StreaksPanel streaks={data.realm.streaks} />
      <Trophies trophies={data.realm.trophies} />
    </div>
  );
}
