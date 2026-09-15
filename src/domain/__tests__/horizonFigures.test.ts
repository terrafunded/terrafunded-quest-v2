/**
 * Permanent horizon regression guard.
 *
 * Captures every displayed figure at 2027 / 2028 / 2029 against the same fixture and asserts:
 * - every HISTORICAL figure is byte-identical across all three
 * - every HORIZON-DEPENDENT figure moves in its declared direction
 * - every DELIBERATELY INDEPENDENT figure carries an on-screen note (`labeled: true`)
 * - Throne farmsStillNeeded and the Engine shared formula never drift apart
 *
 * A new figure that silently ignores the horizon fails CI here rather than reaching production.
 */
import { describe, expect, it } from "vitest";
import raw from "../__fixtures__/payments.json";
import type { PaymentsSnapshot } from "../types";
import { buildRealm } from "../realm";
import { deadlineForHorizon, EXIT_HORIZONS, type ExitHorizon } from "../../config/goal";
import {
  captureHorizonFigures,
  findHorizonViolations,
  formatHorizonTable,
  sharedFarmsStillNeeded,
} from "../horizonFigures";

const fixture = raw as unknown as PaymentsSnapshot;
const ASOF = new Date("2026-09-11T00:00:00Z");

function at(h: ExitHorizon) {
  return buildRealm(fixture, ASOF, { deadline: deadlineForHorizon(h) });
}

describe("horizon figure catalog", () => {
  const realms = Object.fromEntries(EXIT_HORIZONS.map((h) => [h, at(h)])) as Record<
    ExitHorizon,
    ReturnType<typeof buildRealm>
  >;
  const sets = Object.fromEntries(
    EXIT_HORIZONS.map((h) => [h, captureHorizonFigures(realms[h]!, h)]),
  ) as Record<ExitHorizon, ReturnType<typeof captureHorizonFigures>>;

  it("covers every major surface (Throne, Engine, War Plan, Council, Oracle, Exodus, Quests, Realm, trophies, topbar, drawer)", () => {
    const pages = new Set(sets[2027]!.figures.map((f) => f.page));
    for (const page of [
      "/",
      "/engine",
      "/warplan",
      "/council",
      "/pipeline",
      "/sponsors",
      "/treasury",
      "/trophies",
      "/chronicle",
      "/quality",
      "/quests",
      "/realm",
      "/oracle",
      "/exodus",
      "topbar",
      "drawer",
    ]) {
      expect(pages.has(page), `missing page ${page}`).toBe(true);
    }
    expect(sets[2027]!.figures.length).toBeGreaterThan(80);
  });

  it("asserts historical / horizon-dependent / deliberately-independent invariants across all three horizons", () => {
    const violations = findHorizonViolations(sets[2027]!, sets[2028]!, sets[2029]!);
    if (violations.length > 0) {
      const table = formatHorizonTable(sets[2027]!, sets[2028]!, sets[2029]!);
      const detail = violations.map((v) => `${v.id}: ${v.reason} ${JSON.stringify(v.values)}`).join("\n");
      expect.fail(`${violations.length} horizon invariant breach(es):\n${detail}\n\n${table}`);
    }
  });

  it("keeps Throne farmsStillNeeded and the shared formula identical (no dual-source drift)", () => {
    for (const h of EXIT_HORIZONS) {
      const realm = realms[h]!;
      expect(sharedFarmsStillNeeded(realm)).toBe(realm.goal.farmsStillNeeded);
      const sharedFig = sets[h]!.figures.find((f) => f.id === "/.farmsStillNeededShared");
      const throneFig = sets[h]!.figures.find((f) => f.id === "/.farmsStillNeeded");
      const engineFig = sets[h]!.figures.find((f) => f.id === "/engine.farmsStillNeededShared");
      expect(sharedFig?.value).toBe(throneFig?.value);
      expect(engineFig?.value).toBe(throneFig?.value);
    }
    // Longer horizon → fewer farms (capital turns).
    expect(sets[2027]!.figures.find((f) => f.id === "/.farmsStillNeeded")!.value).toBeGreaterThan(
      sets[2028]!.figures.find((f) => f.id === "/.farmsStillNeeded")!.value as number,
    );
    expect(sets[2028]!.figures.find((f) => f.id === "/.farmsStillNeeded")!.value).toBeGreaterThan(
      sets[2029]!.figures.find((f) => f.id === "/.farmsStillNeeded")!.value as number,
    );
  });

  it("classifies lotsStillNeeded as deliberately independent and labeled", () => {
    const lots = sets[2027]!.figures.find((f) => f.id === "/.lotsStillNeeded");
    expect(lots?.classification).toBe("deliberately_independent");
    expect(lots?.labeled).toBe(true);
    expect(sets[2027]!.figures.find((f) => f.id === "/.lotsStillNeeded")!.value).toBe(
      sets[2029]!.figures.find((f) => f.id === "/.lotsStillNeeded")!.value,
    );
  });
});
