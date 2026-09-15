import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SKIP_DIR = new Set(["node_modules", ".git"]);

function walkFiles(root: string, skipFile: (rel: string) => boolean): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIR.has(name)) continue;
      const full = join(dir, name);
      const rel = relative(root, full).replaceAll("\\", "/");
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      if (!skipFile(rel)) out.push(full);
    }
  };
  walk(root);
  return out;
}

function filesContaining(root: string, pattern: RegExp, skipFile: (rel: string) => boolean): string[] {
  return walkFiles(root, skipFile).filter((file) => pattern.test(readFileSync(file, "utf8")));
}

describe("the Anthropic key never reaches the client", () => {
  it("client source has no provider key, env name, or api.anthropic.com", () => {
    const skip = (rel: string) => rel.includes("/__tests__/") || rel.endsWith(".test.ts");
    expect(filesContaining("src", /sk-ant/, skip)).toEqual([]);
    expect(filesContaining("src", /ANTHROPIC_API_KEY/, skip)).toEqual([]);
    expect(filesContaining("src", /api\.anthropic\.com/, skip)).toEqual([]);
  });

  it("the built client bundle has zero sk-ant matches", (ctx) => {
    if (!existsSync("dist")) {
      ctx.skip("explicitly skipped: dist/ is missing — run the production build before asserting the bundle");
    }
    const skip = () => false;
    expect(filesContaining("dist", /sk-ant/, skip)).toEqual([]);
    expect(filesContaining("dist", /ANTHROPIC_API_KEY/, skip)).toEqual([]);
    expect(filesContaining("dist", /api\.anthropic\.com/, skip)).toEqual([]);
  });
});
