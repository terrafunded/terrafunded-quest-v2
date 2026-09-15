import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "src");
/** App chrome and Radix already portal (or are the viewport header). Quality's copy helper is a hidden textarea on document.body. */
const ALLOW = new Set(["AppShell.tsx", "sheet.tsx", "Quality.tsx"]);

const CLASS_FIXED = /class(?:Name)?\s*=\s*(?:\{[^}]*["'`][^"'`]*\bfixed\b|\s*["'`][^"'`]*\bfixed\b)/;
const STYLE_FIXED = /(?:style\.position\s*=\s*["']fixed["']|position:\s*["']fixed["'])/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(name)) out.push(full);
  }
  return out;
}

function usesFixed(src: string): boolean {
  return src.split("\n").some((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return false;
    return CLASS_FIXED.test(line) || STYLE_FIXED.test(line);
  });
}

function portals(src: string): boolean {
  return src.includes("createPortal") || src.includes("DialogPrimitive.Portal") || src.includes(".Portal");
}

describe("fixed overlays portal to document.body", () => {
  it("does not use position:fixed in page content without a portal", () => {
    const hits: string[] = [];
    for (const file of [...walk(join(ROOT, "components")), ...walk(join(ROOT, "pages"))]) {
      const name = file.split("/").pop() ?? file;
      if (ALLOW.has(name)) continue;
      const src = readFileSync(file, "utf8");
      if (usesFixed(src) && !portals(src)) {
        hits.push(file.replace(process.cwd() + "/", ""));
      }
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });
});
