import { useRealm } from "@/data/useRealm";
import { Trophies } from "@/components/realm/Trophies";
import { ErrorState, LoadingState, PageHeader, TableErrorsBanner } from "@/components/realm/PageStates";

export default function TrophiesPage() {
  const { data, isLoading, error, refetch } = useRealm();
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) return null;
  const earned = data.realm.trophies.filter((t) => t.earned).length;
  return (
    <div>
      <PageHeader title="Trophies" subtitle={`${earned} of ${data.realm.trophies.length} achievements earned. Every one is computed from real rows — nothing is awarded by hand.`} />
      <TableErrorsBanner errors={data.tableErrors} />
      <Trophies trophies={data.realm.trophies} />
    </div>
  );
}
