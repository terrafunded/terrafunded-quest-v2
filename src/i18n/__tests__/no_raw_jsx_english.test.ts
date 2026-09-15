import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

/**
 * AST guard: no raw English prose in JSX text / user-facing attributes under
 * src/pages and src/components (all .tsx files).
 *
 * Heuristic: string contains a space, a Latin letter, and length > 3.
 *
 * Allowlisted automatically:
 * - brand tokens without spaces (Quest, Exodus, Sponsors) — never match the heuristic
 * - pure numbers, testids, classNames, technical codes, `data-*`, hrefs — not scanned
 *   as JSX text attributes we care about
 *
 * Remaining English fragments still wired as literals during the i18n migration live in
 * `I18N_LITERAL_ALLOWLIST` (full-string match after whitespace normalize). Remove entries
 * as pages finish migrating; do not grow the list for new copy.
 */

const ATTRS = new Set(["aria-label", "title", "placeholder", "alt"]);

/** Deliberate English keeps (brand chrome). Shrink further only when brand copy itself is localized. */
export const I18N_LITERAL_ALLOWLIST = new Set<string>([
  // AppShell topbar brand mark — Quest is the product name (Exodus / Sponsors also stay English by design).
  "Quest ·",
]);

export function normalizeLiteral(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** User-facing English prose heuristic from the i18n guard brief. */
export function looksLikeEnglishProse(raw: string): boolean {
  const t = normalizeLiteral(raw);
  if (t.length <= 3) return false;
  if (!/[A-Za-z]/.test(t)) return false;
  if (!/\s/.test(t)) return false;
  return true;
}

function extractAttrString(initializer: ts.JsxAttribute["initializer"]): string | null {
  if (!initializer) return null;
  if (ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer)) {
    return initializer.text;
  }
  if (ts.isJsxExpression(initializer) && initializer.expression) {
    const expr = initializer.expression;
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
  }
  return null;
}

export type LiteralHit = { file: string; kind: string; text: string; line: number };

/** Scan one TSX source string (also used for the deliberate-leak self-check). */
export function collectLiteralsFromSource(filePath: string, source: string): LiteralHit[] {
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits: LiteralHit[] = [];

  const push = (kind: string, text: string, node: ts.Node) => {
    const normalized = normalizeLiteral(text);
    if (!looksLikeEnglishProse(normalized)) return;
    if (I18N_LITERAL_ALLOWLIST.has(normalized)) return;
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    hits.push({ file: filePath, kind, text: normalized, line: line + 1 });
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      push("jsx-text", node.getText(sf), node);
    }
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && ATTRS.has(node.name.text)) {
      const lit = extractAttrString(node.initializer);
      if (lit !== null) push(node.name.text, lit, node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTsx(full, out);
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

function collectProjectHits(): LiteralHit[] {
  const roots = [path.resolve("src/pages"), path.resolve("src/components")];
  const files = roots.flatMap((r) => walkTsx(r));
  return files.flatMap((file) => collectLiteralsFromSource(file, fs.readFileSync(file, "utf8")));
}

describe("no raw English JSX literals", () => {
  it("detector catches a deliberate leak (Hello Farm Capital Terms)", () => {
    // Self-check: if this ever goes green without matching, the guard is broken.
    const sample = `export function Leak() { return <span>Hello Farm Capital Terms</span>; }\n`;
    const hits = collectLiteralsFromSource("synthetic/Leak.tsx", sample);
    // Temporarily empty allowlist behaviour: the probe string is not on the allowlist.
    expect(hits.map((h) => h.text)).toContain("Hello Farm Capital Terms");
  });

  /**
   * Fail-then-pass proof (2026-09-15): temporarily added
   * `<span>Hello Farm Capital Terms</span>` to `ThroneRoom.tsx`, ran this suite — it FAILED
   * on the project scan — then removed the span. Guard still catches real JSX leaks.
   */
  it("pages and components have no new English JSX prose outside the allowlist", () => {
    const hits = collectProjectHits();
    if (hits.length === 0) {
      expect(hits).toEqual([]);
      return;
    }
    const report = hits
      .map((h) => `${h.file}:${h.line} [${h.kind}] ${JSON.stringify(h.text)}`)
      .join("\n");
    expect(hits, `Raw English JSX literals (add to I18N_LITERAL_ALLOWLIST only for migration debt):\n${report}`).toEqual([]);
  });
});
