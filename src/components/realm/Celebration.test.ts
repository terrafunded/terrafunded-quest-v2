import { describe, expect, it } from "vitest";
import type { RealmEvent } from "@/domain";
import { REALM_UI } from "@/i18n/realm";
import { celebrationHeadline, celebrationUsesDate } from "./Celebration";

function ev(over: Partial<RealmEvent> & Pick<RealmEvent, "id" | "kind" | "date">): RealmEvent {
  return {
    title: over.kind,
    description: "",
    amount: 12_000,
    farmName: "Lamar",
    lotName: "Lot 1",
    propertyId: "p1",
    cumulativeNetProfit: 0,
    milestone: null,
    future: false,
    ...over,
  };
}

const now = new Date("2026-09-15T12:00:00Z");
const format = (iso: string) => iso;

describe("celebration headline", () => {
  it("uses the just-worded kind when a single event is fewer than 7 days old", () => {
    const events = [ev({ id: "c1", kind: "closing", date: "2026-09-12" })];
    expect(celebrationUsesDate(events, false, now)).toBe(false);
    expect(celebrationHeadline(events, REALM_UI.en.celebration, false, now, format)).toBe("A lot just sold");
    expect(celebrationHeadline(events, REALM_UI.es.celebration, false, now, format)).toBe("Un lote acaba de venderse");
  });

  it("uses the date instead of just/acaba de when the event is 7 or more days old", () => {
    const events = [ev({ id: "c1", kind: "liberation", date: "2026-09-01" })];
    expect(celebrationUsesDate(events, false, now)).toBe(true);
    const en = celebrationHeadline(events, REALM_UI.en.celebration, false, now, format);
    const es = celebrationHeadline(events, REALM_UI.es.celebration, false, now, format);
    expect(en).toBe("Capital returned on 2026-09-01");
    expect(es).toBe("Capital devuelto el 2026-09-01");
    expect(en.toLowerCase()).not.toMatch(/\bjust\b/);
    expect(es.toLowerCase()).not.toMatch(/acaba de/);
  });

  it("uses the date on replay even when the event is fresh", () => {
    const events = [ev({ id: "c1", kind: "closing", date: "2026-09-14" })];
    expect(celebrationUsesDate(events, true, now)).toBe(true);
    const en = celebrationHeadline(events, REALM_UI.en.celebration, true, now, format);
    const es = celebrationHeadline(events, REALM_UI.es.celebration, true, now, format);
    expect(en).toBe("A lot sold on 2026-09-14");
    expect(es).toBe("Un lote se vendió el 2026-09-14");
    expect(en.toLowerCase()).not.toMatch(/\bjust\b/);
    expect(es.toLowerCase()).not.toMatch(/acaba de/);
  });

  it("does not say just on a multi-event replay", () => {
    const events = [
      ev({ id: "a", kind: "liberation", date: "2026-09-14" }),
      ev({ id: "b", kind: "liberation", date: "2026-08-01" }),
    ];
    const en = celebrationHeadline(events, REALM_UI.en.celebration, true, now, format);
    const es = celebrationHeadline(events, REALM_UI.es.celebration, true, now, format);
    expect(en).toBe("2 capital returns");
    expect(es).toBe("2 capitales devueltos");
    expect(en.toLowerCase()).not.toMatch(/\bjust\b/);
    expect(es.toLowerCase()).not.toMatch(/acaba de/);
  });
});
