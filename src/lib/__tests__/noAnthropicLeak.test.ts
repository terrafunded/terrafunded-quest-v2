import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

function rg(pattern: string, root: string, extra: string[] = []): string {
  const args = ["rg", "-n", "--hidden", "-g", "!node_modules", "-g", "!.git", ...extra, pattern, root];
  try {
    return execSync(args.join(" "), { encoding: "utf8" });
  } catch (err) {
    const e = err as { status?: number; stdout?: string };
    if (e.status === 1) return "";
    throw err;
  }
}

describe("the Anthropic key never reaches the client", () => {
  it("client source has no provider key, env name, or api.anthropic.com", () => {
    const extra = ["-g", "!**/__tests__/**", "-g", "!**/*.test.ts"];
    expect(rg("sk-ant", "src", extra)).toBe("");
    expect(rg("ANTHROPIC_API_KEY", "src", extra)).toBe("");
    expect(rg("api.anthropic.com", "src", extra)).toBe("");
  });

  it("the built client bundle has zero sk-ant matches", () => {
    if (!existsSync("dist")) return;
    expect(rg("sk-ant", "dist")).toBe("");
    expect(rg("ANTHROPIC_API_KEY", "dist")).toBe("");
    expect(rg("api.anthropic.com", "dist")).toBe("");
  });
});
