import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { deadlineForHorizon, type ExitHorizon } from "@/config/goal";
import { HORIZON_STORAGE_KEY, readStoredHorizon } from "./horizon";

interface HorizonContextValue {
  horizon: ExitHorizon;
  /** ISO date (`YYYY-12-31`) the whole realm is measured against. */
  deadline: string;
  setHorizon: (h: ExitHorizon) => void;
}

const HorizonContext = createContext<HorizonContextValue | null>(null);

/**
 * Global exit horizon. Persistence matches ThemeProvider: `readStored*`, a `storage`
 * listener for other tabs, and try/catch around `setItem`.
 */
export function HorizonProvider({ children }: { children: ReactNode }) {
  const [horizon, setHorizonState] = useState<ExitHorizon>(() => readStoredHorizon());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === HORIZON_STORAGE_KEY) setHorizonState(readStoredHorizon());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setHorizon = useCallback((h: ExitHorizon) => {
    setHorizonState(h);
    try {
      localStorage.setItem(HORIZON_STORAGE_KEY, String(h));
    } catch {
      /* storage unavailable: the choice still applies for this session */
    }
  }, []);

  const value = useMemo<HorizonContextValue>(
    () => ({ horizon, deadline: deadlineForHorizon(horizon), setHorizon }),
    [horizon, setHorizon],
  );

  return <HorizonContext.Provider value={value}>{children}</HorizonContext.Provider>;
}

export function useHorizon(): HorizonContextValue {
  const ctx = useContext(HorizonContext);
  if (!ctx) throw new Error("useHorizon must be used inside <HorizonProvider>");
  return ctx;
}
