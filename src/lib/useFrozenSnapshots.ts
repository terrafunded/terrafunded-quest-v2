import { useCallback, useEffect, useMemo, useState } from "react";
import {
  browserFrozenSnapshotStore,
  type FrozenSnapshotMeta,
  type FrozenSnapshotStore,
} from "./exportSnapshotStore";
import type { PlatformExportDocument } from "./platformExport";

export function useFrozenSnapshots(store?: FrozenSnapshotStore) {
  const resolved = useMemo(() => store ?? browserFrozenSnapshotStore(), [store]);
  const [items, setItems] = useState<FrozenSnapshotMeta[]>([]);

  const refresh = useCallback(async () => {
    setItems(await resolved.list());
  }, [resolved]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(
    async (name: string, document: PlatformExportDocument) => {
      const meta = await resolved.save(name.trim(), document);
      await refresh();
      return meta;
    },
    [resolved, refresh],
  );

  const open = useCallback((id: string) => resolved.get(id), [resolved]);

  return { items, save, open, refresh };
}
