import { describe, expect, it } from "vitest";
import { ACCESS_DENIED_MESSAGE, ADMIN_ROLE, decideAccess, normalizeEmail } from "../access";

const QUESTBOT = "questbot@example.com";

describe("decideAccess — Quest is for Payments staff", () => {
  it("lets an admin in whatever the e-mail", () => {
    expect(decideAccess({ role: "admin", email: "anyone@example.com", allowedTestEmail: "" })).toEqual({ allowed: true, via: "admin" });
    expect(decideAccess({ role: ADMIN_ROLE, email: null, allowedTestEmail: undefined })).toEqual({ allowed: true, via: "admin" });
  });

  it.each(["investor", "viewer", "note_buyer", "", "Admin", "ADMIN", " admin"])("refuses role %j with the team-only message", (role) => {
    expect(decideAccess({ role, email: "someone@example.com", allowedTestEmail: QUESTBOT })).toEqual({
      allowed: false,
      message: ACCESS_DENIED_MESSAGE,
    });
  });

  it("refuses a user with no profiles row", () => {
    expect(decideAccess({ role: null, email: "someone@example.com", allowedTestEmail: QUESTBOT })).toEqual({ allowed: false, message: ACCESS_DENIED_MESSAGE });
    expect(decideAccess({ role: undefined, email: "someone@example.com", allowedTestEmail: QUESTBOT })).toEqual({ allowed: false, message: ACCESS_DENIED_MESSAGE });
  });

  it("lets the named test account in even though its role is viewer", () => {
    expect(decideAccess({ role: "viewer", email: QUESTBOT, allowedTestEmail: QUESTBOT })).toEqual({ allowed: true, via: "test-account" });
  });

  it("matches the test account e-mail case-insensitively and ignores surrounding whitespace", () => {
    expect(decideAccess({ role: "viewer", email: " QuestBot@Example.com ", allowedTestEmail: QUESTBOT })).toEqual({ allowed: true, via: "test-account" });
    expect(decideAccess({ role: "viewer", email: QUESTBOT, allowedTestEmail: `  ${QUESTBOT.toUpperCase()}\n` })).toEqual({ allowed: true, via: "test-account" });
  });

  it("never treats an empty or unset QUEST_ALLOWED_TEST_EMAIL as a wildcard", () => {
    for (const allowedTestEmail of ["", "   ", null, undefined]) {
      expect(decideAccess({ role: "viewer", email: "", allowedTestEmail }).allowed).toBe(false);
      expect(decideAccess({ role: "viewer", email: null, allowedTestEmail }).allowed).toBe(false);
      expect(decideAccess({ role: "viewer", email: QUESTBOT, allowedTestEmail }).allowed).toBe(false);
    }
  });

  it("refuses a different e-mail than the allowed one, even with the viewer role", () => {
    expect(decideAccess({ role: "viewer", email: "other@example.com", allowedTestEmail: QUESTBOT }).allowed).toBe(false);
    expect(decideAccess({ role: "viewer", email: "questbot@example.com.evil", allowedTestEmail: QUESTBOT }).allowed).toBe(false);
  });

  it("normalizeEmail lower-cases and trims, and maps null/undefined to the empty string", () => {
    expect(normalizeEmail(" A@B.CO ")).toBe("a@b.co");
    expect(normalizeEmail(null)).toBe("");
    expect(normalizeEmail(undefined)).toBe("");
  });

  it("the message is the exact sentence shown on /login", () => {
    expect(ACCESS_DENIED_MESSAGE).toBe("Quest is for the TerraFunded team only.");
  });
});
