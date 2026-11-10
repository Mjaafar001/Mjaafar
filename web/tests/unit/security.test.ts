import { describe, expect, it } from "vitest";
import { decrypt, encrypt, safeEqual, sha256 } from "@/lib/crypto";
import { hashPassword, passwordProblems, verifyPassword } from "@/lib/auth/password";
import { newTotpSecret, verifyTotp } from "@/lib/auth/totp";
import { TOTP, Secret } from "otpauth";
import { toCsv } from "@/lib/csv";
import { DEFAULT_ROLE_GRANTS, ALL_PERMISSIONS } from "@/lib/rbac/permissions";
import { applicationSchema } from "@/lib/validators/registration";
import { phone } from "@/lib/validators/common";

describe("field encryption", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encrypt("Peanut allergy")!;
    const b = encrypt("Peanut allergy")!;
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("Peanut allergy");
    expect(encrypt("")).toBeNull();
  });
  it("rejects tampered ciphertext", () => {
    const c = encrypt("secret")!.split(":");
    c[3] = Buffer.from("tampered!").toString("base64");
    expect(() => decrypt(c.join(":"))).toThrow();
  });
  it("hashes tokens deterministically and compares in constant time", () => {
    expect(sha256("x")).toHaveLength(64);
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
  });
});

describe("passwords & MFA", () => {
  it("hashes with argon2id and verifies", async () => {
    const h = await hashPassword("CorrectHorse42");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "CorrectHorse42")).toBe(true);
    expect(await verifyPassword(h, "wrong")).toBe(false);
    expect(await verifyPassword(null, "x")).toBe(false);
  });
  it("enforces the password policy", () => {
    expect(passwordProblems("short1")).toMatch(/10/);
    expect(passwordProblems("onlyletterslong")).toMatch(/numbers/);
    expect(passwordProblems("Letters1234")).toBeNull();
  });
  it("verifies TOTP codes and rejects malformed ones", () => {
    const secret = newTotpSecret();
    const code = new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 }).generate();
    expect(verifyTotp(secret, code)).toBe(true);
    expect(verifyTotp(secret, "12345")).toBe(false);
    expect(verifyTotp(secret, code === "000000" ? "111111" : "000000")).toBe(false);
  });
});

describe("CSV export", () => {
  it("neutralises spreadsheet formula injection and escapes quotes", () => {
    const csv = toCsv([{ name: '=HYPERLINK("evil")', note: 'a "quote", here' }]);
    expect(csv).toContain(`"'=HYPERLINK(""evil"")"`);
    expect(csv).toContain(`"a ""quote"", here"`);
  });
});

describe("default role grants", () => {
  it("gives the president everything except coach-scoped viewing", () => {
    expect(DEFAULT_ROLE_GRANTS.SUPER_ADMIN.length).toBe(ALL_PERMISSIONS.filter((p) => !p.startsWith("portal.") && p !== "players.view.assigned").length);
  });
  it("keeps parents and players inside their portals", () => {
    expect(DEFAULT_ROLE_GRANTS.PARENT).toEqual(["portal.parent"]);
    expect(DEFAULT_ROLE_GRANTS.PLAYER).toEqual(["portal.player"]);
  });
  it("limits coaches to assigned players and keeps finance away from them", () => {
    expect(DEFAULT_ROLE_GRANTS.COACH).toContain("players.view.assigned");
    expect(DEFAULT_ROLE_GRANTS.COACH).not.toContain("players.view");
    expect(DEFAULT_ROLE_GRANTS.COACH).not.toContain("finance.view");
    expect(DEFAULT_ROLE_GRANTS.COACH).not.toContain("attendance.correct");
  });
});

describe("validation", () => {
  it("accepts Nigerian phone formats", () => {
    expect(phone.parse("0803 123 4567")).toBe("08031234567");
    expect(phone.parse("+234 803 123 4567")).toBe("+2348031234567");
    expect(phone.safeParse("12345").success).toBe(false);
  });
  it("requires mandatory consents on applications", () => {
    const base = {
      branchId: "b", type: "FULL",
      child: { firstName: "Ada", lastName: "Obi", dateOfBirth: "2016-04-01", gender: "FEMALE" },
      guardians: [{ firstName: "Ngozi", lastName: "Obi", relationship: "Mother", phone: "08031234567" }],
      medical: {},
      consents: { participation: true, medicalTreatment: true, dataProcessing: false, photo: false, video: false, signedName: "Ngozi Obi" },
    };
    const r = applicationSchema.safeParse(base);
    expect(r.success).toBe(false);
    expect(r.error!.issues.some((i) => i.path.join(".") === "consents.dataProcessing")).toBe(true);
    expect(applicationSchema.safeParse({ ...base, consents: { ...base.consents, dataProcessing: true } }).success).toBe(true);
  });
});
