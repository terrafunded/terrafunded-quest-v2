import { describe, expect, it } from "vitest";
import raw from "../../domain/__fixtures__/payments.json";
import type { PaymentsSnapshot } from "../../domain/types";
import { buildRealm } from "../../domain/realm";
import { computeCouncil } from "../../domain/council";
import { CHRONICLE_UI } from "../chronicle";
import { COMMON_UI } from "../common";
import { COUNCIL_UI } from "../council";
import { ENGINE_UI } from "../engine";
import { EXODUS_UI } from "../exodus";
import { LOGIN_UI } from "../login";
import { NAV_UI } from "../nav";
import { ORACLE_UI } from "../oracle";
import { PIPELINE_UI } from "../pipeline";
import { QUALITY_UI } from "../quality";
import { QUESTS_UI } from "../quests";
import { REALM_UI } from "../realm";
import { REALM_MAP_UI } from "../realmMap";
import { SPONSORS_UI } from "../sponsors";
import { THRONE_ROOM_UI } from "../throneRoom";
import { TREASURY_UI } from "../treasury";
import { TROPHIES_UI } from "../trophies";
import { WAR_PLAN_UI } from "../warPlan";
import { buildPlatformExport } from "../../lib/platformExport";

/**
 * User-visible copy must not use the retired medieval / game vocabulary.
 * Keys, routes, types and comments are out of scope — only rendered strings.
 *
 * Allowed proper nouns: Quest, Exodus, Sponsor(s), Pipeline, Payments.
 */

type Dict = Record<string, unknown>;

const DICTIONARIES: Record<string, { en: Dict; es: Dict }> = {
  CHRONICLE_UI: CHRONICLE_UI as unknown as { en: Dict; es: Dict },
  COMMON_UI: COMMON_UI as unknown as { en: Dict; es: Dict },
  COUNCIL_UI: COUNCIL_UI as unknown as { en: Dict; es: Dict },
  ENGINE_UI: ENGINE_UI as unknown as { en: Dict; es: Dict },
  EXODUS_UI: EXODUS_UI as unknown as { en: Dict; es: Dict },
  LOGIN_UI: LOGIN_UI as unknown as { en: Dict; es: Dict },
  NAV_UI: NAV_UI as unknown as { en: Dict; es: Dict },
  ORACLE_UI: ORACLE_UI as unknown as { en: Dict; es: Dict },
  PIPELINE_UI: PIPELINE_UI as unknown as { en: Dict; es: Dict },
  QUALITY_UI: QUALITY_UI as unknown as { en: Dict; es: Dict },
  QUESTS_UI: QUESTS_UI as unknown as { en: Dict; es: Dict },
  REALM_UI: REALM_UI as unknown as { en: Dict; es: Dict },
  REALM_MAP_UI: REALM_MAP_UI as unknown as { en: Dict; es: Dict },
  SPONSORS_UI: SPONSORS_UI as unknown as { en: Dict; es: Dict },
  THRONE_ROOM_UI: THRONE_ROOM_UI as unknown as { en: Dict; es: Dict },
  TREASURY_UI: TREASURY_UI as unknown as { en: Dict; es: Dict },
  TROPHIES_UI: TROPHIES_UI as unknown as { en: Dict; es: Dict },
  WAR_PLAN_UI: WAR_PLAN_UI as unknown as { en: Dict; es: Dict },
};

const BANNED: { id: string; re: RegExp }[] = [
  { id: "throne room", re: /\bthrone room\b/i },
  { id: "the realm", re: /\bthe realm\b/i },
  { id: "the council", re: /\bthe council\b/i },
  { id: "the engine", re: /\bthe engine\b/i },
  { id: "war plan", re: /\bwar plan\b/i },
  { id: "oracle", re: /\boracle\b/i },
  { id: "chronicle", re: /\bchronicle\b/i },
  { id: "treasury", re: /\btreasury\b/i },
  { id: "trophies", re: /\btrophies\b/i },
  { id: "trophy", re: /\btrophy\b/i },
  { id: "oxygen", re: /\boxygen\b/i },
  { id: "quests", re: /\bquests\b/i },
  { id: "pledged", re: /\bpledged\b/i },
  { id: "conquered", re: /\bconquered\b/i },
  { id: "under siege", re: /\bunder siege\b/i },
  { id: "losing ground", re: /\blosing ground\b/i },
  { id: "the stuck list", re: /\bthe stuck list\b/i },
  { id: "latest breath", re: /\blatest breath\b/i },
  { id: "deepest breath", re: /\bdeepest breath\b/i },
  { id: "liberation", re: /\bliberation\b/i },
  { id: "liberated", re: /\bliberated\b/i },
  { id: "hostage", re: /\bhostages?\b/i },
  { id: "the ledger", re: /\bthe ledger\b/i },
  { id: "first blood", re: /\bfirst blood\b/i },
  { id: "scribes", re: /\bscribes\b/i },
  { id: "chroniclers", re: /\bchroniclers\b/i },
  { id: "war chest", re: /\bwar chest\b/i },
  { id: "nine realms", re: /\bnine realms\b/i },
  { id: "sala del trono", re: /\bsala del trono\b/i },
  { id: "trono", re: /\btrono\b/i },
  { id: "reino", re: /\breino\b/i },
  { id: "oráculo", re: /\boráculo\b/i },
  { id: "crónica", re: /\bcrónica\b/i },
  { id: "tesorería", re: /\btesorería\b/i },
  { id: "trofeo", re: /\btrofeos?\b/i },
  { id: "oxígeno", re: /\boxígeno\b/i },
  { id: "misiones", re: /\bmisiones\b/i },
  { id: "embudo", re: /\bembudo\b/i },
  { id: "conquistad", re: /conquistad/i },
  { id: "asedio", re: /\basedio\b/i },
  { id: "perdiendo terreno", re: /\bperdiendo terreno\b/i },
  { id: "rehenes", re: /\brehenes?\b/i },
  { id: "respiro", re: /\brespiros?\b/i },
  { id: "liberación", re: /\bliberación\b/i },
  { id: "liberado", re: /\bliberad[oa]s?\b/i },
  { id: "el libro", re: /\bel libro\b/i },
  { id: "plan de guerra", re: /\bplan de guerra\b/i },
  { id: "el motor", re: /\bel motor\b/i },
  { id: "el consejo", re: /\bel consejo\b/i },
];

interface Hit {
  path: string;
  banned: string;
  text: string;
}

function collectLeaves(value: unknown, prefix: string, out: { path: string; text: string }[]): void {
  if (typeof value === "function") {
    const fn = value as (...args: unknown[]) => unknown;
    const trials: unknown[][] = [
      Array.from({ length: Math.max(fn.length, 1) }, () => "X"),
      Array.from({ length: Math.max(fn.length, 1) }, () => 1),
      [1, 2, 3, "X", "Y", "Z", "ahead"],
      [0, "X", "Y"],
      ["X", null],
    ];
    for (const args of trials) {
      try {
        const result = fn(...args);
        if (typeof result === "string") out.push({ path: prefix, text: result });
      } catch {
        /* dummy args may not satisfy every signature */
      }
    }
    return;
  }
  if (typeof value === "string") {
    out.push({ path: prefix, text: value });
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => collectLeaves(item, `${prefix}[${i}]`, out));
    return;
  }
  for (const [key, child] of Object.entries(value as Dict)) {
    collectLeaves(child, prefix ? `${prefix}.${key}` : key, child === undefined ? out : out);
  }
}

function findBanned(path: string, text: string): Hit[] {
  const hits: Hit[] = [];
  for (const ban of BANNED) {
    if (ban.re.test(text)) hits.push({ path, banned: ban.id, text });
  }
  return hits;
}

describe("banned medieval / game vocabulary", () => {
  it("no *_UI leaf in either language contains a banned term", () => {
    const hits: Hit[] = [];
    for (const [name, dict] of Object.entries(DICTIONARIES)) {
      for (const lang of ["en", "es"] as const) {
        const leaves: { path: string; text: string }[] = [];
        collectLeaves(dict[lang], `${name}.${lang}`, leaves);
        for (const leaf of leaves) hits.push(...findBanned(leaf.path, leaf.text));
      }
    }
    expect(hits, hits.map((h) => `${h.path} [${h.banned}]: ${h.text}`).join("\n")).toEqual([]);
  });

  it("domain-produced UI (council, story, trophies, narratives, verdict) is clean in both languages", () => {
    const fixture = raw as unknown as PaymentsSnapshot;
    const hits: Hit[] = [];
    for (const lang of ["en", "es"] as const) {
      const realm = buildRealm(fixture, new Date("2026-09-11T00:00:00Z"), { lang });
      for (const insight of computeCouncil(realm, lang)) {
        hits.push(...findBanned(`council.${lang}.${insight.id}.title`, insight.title));
        hits.push(...findBanned(`council.${lang}.${insight.id}.body`, insight.body));
      }
      for (const card of realm.story.cards) {
        hits.push(...findBanned(`story.${lang}.${card.id}.kicker`, card.kicker));
        hits.push(...findBanned(`story.${lang}.${card.id}.line`, card.line));
      }
      for (const trophy of realm.trophies) {
        hits.push(...findBanned(`trophy.${lang}.${trophy.id}.title`, trophy.title));
        hits.push(...findBanned(`trophy.${lang}.${trophy.id}.description`, trophy.description));
      }
      hits.push(...findBanned(`goal.${lang}.verdict`, realm.goal.verdict));
      for (const [id, line] of realm.narrative) {
        hits.push(...findBanned(`narrative.${lang}.${id}`, line));
      }
      for (const campaign of realm.campaigns) {
        hits.push(...findBanned(`campaign.${lang}.${campaign.farmId}`, campaign.reason));
      }
    }
    expect(hits, hits.map((h) => `${h.path} [${h.banned}]: ${h.text}`).join("\n")).toEqual([]);
  });

  it("export figure labels and reconciliation copy are clean in both languages", () => {
    const fixture = raw as unknown as PaymentsSnapshot;
    const hits: Hit[] = [];
    for (const lang of ["en", "es"] as const) {
      const realm = buildRealm(fixture, new Date("2026-09-11T00:00:00Z"), { lang });
      const doc = buildPlatformExport(realm, { lang, exitHorizon: 2027 });
      for (const figure of doc.figures) {
        hits.push(...findBanned(`export.${lang}.${figure.id}.label`, figure.label));
        if (figure.subtitle) hits.push(...findBanned(`export.${lang}.${figure.id}.subtitle`, figure.subtitle));
      }
      for (const check of doc.reconciliations) {
        hits.push(...findBanned(`export.${lang}.${check.id}.name`, check.name));
        hits.push(...findBanned(`export.${lang}.${check.id}.failMeans`, check.failMeans));
      }
    }
    expect(hits, hits.map((h) => `${h.path} [${h.banned}]: ${h.text}`).join("\n")).toEqual([]);
  });
});
