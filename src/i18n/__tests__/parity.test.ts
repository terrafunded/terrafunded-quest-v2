import { describe, expect, it } from "vitest";
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

/**
 * EN/ES key-parity guard for every `*_UI` dictionary in `src/i18n/`.
 * Functions count as leaves. A missing key on either side fails with the full list.
 */

type Dict = Record<string, unknown>;

const DICTIONARIES: Record<string, { en: Dict; es: Dict }> = {
  CHRONICLE_UI: CHRONICLE_UI as { en: Dict; es: Dict },
  COMMON_UI: COMMON_UI as { en: Dict; es: Dict },
  COUNCIL_UI: COUNCIL_UI as { en: Dict; es: Dict },
  ENGINE_UI: ENGINE_UI as { en: Dict; es: Dict },
  EXODUS_UI: EXODUS_UI as { en: Dict; es: Dict },
  LOGIN_UI: LOGIN_UI as { en: Dict; es: Dict },
  NAV_UI: NAV_UI as { en: Dict; es: Dict },
  ORACLE_UI: ORACLE_UI as { en: Dict; es: Dict },
  PIPELINE_UI: PIPELINE_UI as { en: Dict; es: Dict },
  QUALITY_UI: QUALITY_UI as { en: Dict; es: Dict },
  QUESTS_UI: QUESTS_UI as { en: Dict; es: Dict },
  REALM_UI: REALM_UI as { en: Dict; es: Dict },
  REALM_MAP_UI: REALM_MAP_UI as { en: Dict; es: Dict },
  SPONSORS_UI: SPONSORS_UI as { en: Dict; es: Dict },
  THRONE_ROOM_UI: THRONE_ROOM_UI as { en: Dict; es: Dict },
  TREASURY_UI: TREASURY_UI as { en: Dict; es: Dict },
  TROPHIES_UI: TROPHIES_UI as { en: Dict; es: Dict },
  WAR_PLAN_UI: WAR_PLAN_UI as { en: Dict; es: Dict },
};

/** Recursively collect leaf key paths. Functions and primitives are leaves. */
function leafPaths(value: unknown, prefix = ""): string[] {
  if (typeof value === "function") return prefix ? [prefix] : [];
  if (value === null || typeof value !== "object") return prefix ? [prefix] : [];
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => leafPaths(item, prefix ? `${prefix}[${i}]` : `[${i}]`));
  }
  const keys = Object.keys(value as Dict).sort();
  return keys.flatMap((key) => {
    const next = prefix ? `${prefix}.${key}` : key;
    return leafPaths((value as Dict)[key], next);
  });
}

function diffKeys(enPaths: string[], esPaths: string[]): { missingInEs: string[]; missingInEn: string[] } {
  const en = new Set(enPaths);
  const es = new Set(esPaths);
  return {
    missingInEs: enPaths.filter((p) => !es.has(p)),
    missingInEn: esPaths.filter((p) => !en.has(p)),
  };
}

describe("i18n EN/ES key parity", () => {
  it("covers every *_UI dictionary export", () => {
    expect(Object.keys(DICTIONARIES).sort()).toEqual([
      "CHRONICLE_UI",
      "COMMON_UI",
      "COUNCIL_UI",
      "ENGINE_UI",
      "EXODUS_UI",
      "LOGIN_UI",
      "NAV_UI",
      "ORACLE_UI",
      "PIPELINE_UI",
      "QUALITY_UI",
      "QUESTS_UI",
      "REALM_MAP_UI",
      "REALM_UI",
      "SPONSORS_UI",
      "THRONE_ROOM_UI",
      "TREASURY_UI",
      "TROPHIES_UI",
      "WAR_PLAN_UI",
    ]);
  });

  for (const [name, dict] of Object.entries(DICTIONARIES)) {
    it(`${name}: en and es share identical key paths`, () => {
      expect(dict.en, `${name}.en`).toBeTypeOf("object");
      expect(dict.es, `${name}.es`).toBeTypeOf("object");
      const { missingInEs, missingInEn } = diffKeys(leafPaths(dict.en), leafPaths(dict.es));
      const problems: string[] = [];
      if (missingInEs.length) problems.push(`missing in es (${missingInEs.length}):\n  - ${missingInEs.join("\n  - ")}`);
      if (missingInEn.length) problems.push(`missing in en (${missingInEn.length}):\n  - ${missingInEn.join("\n  - ")}`);
      expect(problems, problems.join("\n\n")).toEqual([]);
    });
  }
});
