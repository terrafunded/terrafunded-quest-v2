import { describe, expect, it } from "vitest";
import { buildRealm } from "../realm";
import { computeConversion } from "../pipeline";
import { deriveEngineDefaults, runEngine } from "../engine";
import { reconcileThroneAndEngine } from "../reconcile";
import { computeRotationBenchmark } from "../warplan";
import { DAYS_PER_MONTH } from "../../config/goal";
import { round2 } from "../math";
import { ASOF, farm, fileCase, investor, note, noteSale, property, snapshot } from "./builders";

/**
 * Numeric defects 1, 2, 4 — Throne↔Engine reconcile, shared rotation months, resolved conversion.
 */

function inventoryRichRealm(deadline = "2028-12-31") {
  const kevin = investor({ name: "Kevin Concua" });
  const alpha = farm({
    farm_name: "Alpha",
    total_lots: 40,
    total_acres: 400,
    investor_id: kevin.id,
    investor_capital: 2_000_000,
    deal_type: "fixed_interest",
    annual_interest_rate: 20,
    funding_date: "2026-01-01",
    closing_date: "2026-01-01",
  });
  const properties = [];
  const fileCases = [];
  const notes = [];
  const noteSales = [];
  const closes = [
    "2026-06-20",
    "2026-07-01",
    "2026-07-15",
    "2026-07-30",
    "2026-08-10",
    "2026-08-20",
    "2026-08-30",
    "2026-09-05",
    "2026-09-08",
    "2026-09-10",
  ];
  for (let i = 1; i <= 40; i++) {
    const p = property(alpha.id, i, { name: `Alpha — Lot ${i}` });
    properties.push(p);
    if (i <= 10) {
      const close = closes[i - 1] as string;
      fileCases.push(
        fileCase(p.id, {
          status: "completed",
          reservation_date: "2026-05-01",
          closing_date: close,
          sale_price: 120_000,
        }),
      );
      const n = note(p.id, { start_date: close, original_amount: 120_000, is_sold: i <= 5 });
      notes.push(n);
      if (i <= 5) noteSales.push(noteSale(n.id, { sale_date: "2026-09-01", sale_price: 91_200 }));
    } else if (i <= 14) {
      fileCases.push(
        fileCase(p.id, {
          status: "active",
          reservation_date: "2026-05-01",
          closing_date: null,
          sale_price: 120_000,
        }),
      );
    } else if (i === 15) {
      fileCases.push(
        fileCase(p.id, {
          status: "cancelled",
          reservation_date: "2026-04-01",
          closing_date: null,
          sale_price: 120_000,
        }),
      );
    }
  }
  return buildRealm(
    snapshot({
      farmAcquisitions: [alpha],
      properties,
      fileCases,
      notes,
      noteSales,
      investors: [kevin],
    }),
    ASOF,
    { deadline },
  );
}

describe("defect 4: resolved conversion excludes still-open reservations", () => {
  it("reports resolved, blended, and still-open separately; forecasts use resolved", () => {
    const realm = inventoryRichRealm();
    const c = computeConversion(realm.lots, ASOF);
    expect(c.closed).toBe(10);
    expect(c.stillReserved).toBe(4);
    expect(c.cancelled).toBe(1);
    expect(c.cohort).toBe(14);
    expect(c.pct).toBe(round2((10 / 14) * 100));
    expect(c.resolvedDenominator).toBe(11);
    expect(c.resolvedPct).toBe(round2((10 / 11) * 100));
    expect(c.resolvedPct).toBeGreaterThan(c.pct as number);

    expect(realm.expected.conversionSource).toBe("resolved");
    expect(realm.expected.conversionPct).toBe(c.resolvedPct);
    expect(realm.warPlanDefaults.inputs.conversionPct).toBe(c.resolvedPct);

    const eng = deriveEngineDefaults(realm);
    expect(eng.inputs.conversionPct).toBe(c.resolvedPct);
  });
});

describe("defect 2: rotation benchmark months match Engine cycle from the same median", () => {
  it("cycleMonths === cycleDays / DAYS_PER_MONTH; Engine defaults read the same months", () => {
    const realm = inventoryRichRealm();
    const rot = computeRotationBenchmark(realm);
    const eng = deriveEngineDefaults(realm);

    if (rot.cycleDays !== null && rot.cycleMonths !== null) {
      expect(rot.cycleMonths).toBe(round2(rot.cycleDays / DAYS_PER_MONTH));
      expect(eng.inputs.cycleMonths).toBe(rot.cycleMonths);
      expect(eng.real.cycleMonths).toBe(rot.cycleMonths);
    } else {
      expect(eng.inputs.cycleMonths).toBeGreaterThan(0);
    }
  });
});

describe("defect 1: Throne Room and Engine either agree or differ by a stated reason", () => {
  it("reconcileThroneAndEngine returns equal figures or a non-empty computed reason", () => {
    const realm = inventoryRichRealm("2028-12-31");
    const defaults = deriveEngineDefaults(realm);
    expect(defaults.inputs.profitBasis).toBe("era");
    const engine = runEngine(defaults.inputs, { ...realm, referencePace: defaults.referencePace });
    const rec = reconcileThroneAndEngine(realm.goal, engine, "era");

    if (rec.dollarsAgree) {
      expect(rec.dollarReason).toBeNull();
      expect(rec.dollarGap === null || Math.abs(rec.dollarGap) < 1).toBe(true);
    } else {
      expect(rec.dollarReason).toMatch(/Engine caps sales|Throne Room assumes lots/i);
      expect(rec.dollarGap).not.toBeNull();
    }

    if (rec.farmsAgree) {
      expect(rec.farmReason).toBeNull();
    } else {
      expect(rec.farmReason).toMatch(/inventory gap|capital-turn schedule/i);
    }
  });

  it("lifetime vs era bases both reconcile with an explicit reason when they diverge from the Engine", () => {
    const realm = inventoryRichRealm("2027-12-31");
    const defaults = deriveEngineDefaults(realm);
    for (const basis of ["era", "lifetime"] as const) {
      const engine = runEngine(
        { ...defaults.inputs, profitBasis: basis },
        { ...realm, referencePace: defaults.referencePace },
      );
      const rec = reconcileThroneAndEngine(realm.goal, engine, basis);
      expect(rec.basis).toBe(basis);
      expect(rec.dollarsAgree || !!rec.dollarReason).toBe(true);
      expect(rec.farmsAgree || !!rec.farmReason).toBe(true);
    }
  });
});
