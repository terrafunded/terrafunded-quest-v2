import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DATA_CAT, DATA_INTEREST, DATA_INVENTORY, DATA_OWED, DATA_PROFIT_FRESH, DATA_PROFIT_INVENTORY, DATA_PROFIT_RECYCLED } from "../chartTokens";

const ROOT = join(process.cwd(), "src");
const SKIP = new Set(["chartTokens.ts", "chartTokens.tsx", "realmTokens.ts"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(name) && !SKIP.has(name)) out.push(full);
  }
  return out;
}

/** Hex or hsl() used as a chart fill/stroke (JSX attr or style key). */
const LITERAL = /(?:fill|stroke|stopColor)\s*[:=]\s*(?:\{\s*)?["'`](#(?:[0-9a-fA-F]{3,8})|hsl\s*\()/;

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sn = s / 100;
  const ln = l / 100;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return ln - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function relLum([r, g, b]: [number, number, number]): number {
  const lin = [r, g, b].map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const l1 = relLum(a);
  const l2 = relLum(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

function parseHslChannels(css: string, name: string): [number, number, number] {
  const re = new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*([0-9.]+)\\s+([0-9.]+)%\\s+([0-9.]+)%`);
  const m = css.match(re);
  if (!m) throw new Error(`missing ${name} in tokens.css`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

describe("semantic chart palette", () => {
  it("does not use a raw hex or hsl() literal as a chart fill or stroke", () => {
    const hits: string[] = [];
    for (const file of [...walk(join(ROOT, "components")), ...walk(join(ROOT, "pages"))]) {
      const src = readFileSync(file, "utf8");
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
        if (LITERAL.test(line)) hits.push(`${file.replace(process.cwd() + "/", "")}:${i + 1}: ${trimmed}`);
      });
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });

  it("profit, owed, interest and inventory tokens are distinct and contrast ≥ 3:1 against Iron Crown --card", () => {
    const css = readFileSync(join(process.cwd(), "src/theme/tokens.css"), "utf8");
    const iron = css.slice(css.indexOf('[data-theme="iron-crown"]'), css.indexOf('[data-theme="gilded-realm"]'));
    const card = parseHslChannels(iron, "--card");
    const names = [
      "--data-profit-inventory",
      "--data-profit-recycled",
      "--data-profit-fresh",
      "--data-owed",
      "--data-interest",
      "--data-inventory",
    ] as const;
    const channels = names.map((n) => parseHslChannels(iron, n));
    const encoded = channels.map((c) => c.join(","));
    expect(new Set(encoded).size).toBe(names.length);

    const cardRgb = hslToRgb(...card);
    for (let i = 0; i < names.length; i++) {
      const ratio = contrast(hslToRgb(...channels[i]!), cardRgb);
      expect(ratio, `${names[i]} contrast ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3);
    }

    const exported = [DATA_PROFIT_INVENTORY, DATA_PROFIT_RECYCLED, DATA_PROFIT_FRESH, DATA_OWED, DATA_INTEREST, DATA_INVENTORY];
    expect(new Set(exported).size).toBe(6);
    expect(DATA_CAT.every((c) => !exported.includes(c))).toBe(true);
  });
});
