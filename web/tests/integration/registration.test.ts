import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/crypto";
import { approveRegistration } from "@/lib/services/registrations";
import { makeBranch, makeGroup, makeUser } from "../helpers/factory";

let branchId: string, groupId: string, actorId: string;
let n = 0;

async function application(guardianPhone: string, guardianEmail: string | null, child = `Kid${++n}`) {
  const payload = {
    branchId, type: "FULL",
    child: { firstName: child, lastName: "Okafor", dateOfBirth: "2016-03-01", gender: "MALE" },
    guardians: [{ firstName: "Amaka", lastName: "Okafor", relationship: "Mother", phone: guardianPhone, email: guardianEmail ?? undefined }],
    emergencyContacts: [], consents: { participation: true, medicalTreatment: true, dataProcessing: true, photo: true, video: false, signedName: "Amaka Okafor" },
  };
  const reg = await db.registration.create({
    data: {
      reference: `APP-T-${Date.now()}-${n}`, branchId, childFirstName: child, childLastName: "Okafor", childDateOfBirth: new Date(Date.UTC(2016, 2, 1)), childGender: "MALE",
      guardianFirstName: "Amaka", guardianLastName: "Okafor", guardianPhone, guardianEmail, payload, medicalEnc: encrypt(JSON.stringify({ allergies: "Peanuts" })),
    },
  });
  await db.consentRecord.create({ data: { registrationId: reg.id, type: "PARTICIPATION", granted: true, version: "test", signedName: "Amaka Okafor" } });
  return reg;
}

beforeAll(async () => {
  branchId = (await makeBranch()).id;
  groupId = (await makeGroup(branchId, { capacity: 3 })).id;
  actorId = (await makeUser("ADMIN", branchId)).id;
});

describe("admissions workflow", () => {
  it("approval creates player, academy ID, guardian, parent account, encrypted medical record and links consents", async () => {
    const reg = await application("08030000001", "amaka.one@example.com");
    const r = await approveRegistration(reg.id, groupId, actorId);
    expect(r.academyId).toMatch(/^MJA-\d{2}-\d{4}$/);
    expect(r.parentSetupToken).toBeTruthy();
    const player = await db.player.findUniqueOrThrow({ where: { id: r.playerId }, include: { guardians: { include: { guardian: true } }, medical: true, consents: true } });
    expect(player.ageGroupId).toBe(groupId);
    expect(player.guardians[0]!.guardian.userId).toBeTruthy();
    expect(player.medical!.allergiesEnc).not.toContain("Peanuts");
    expect(decrypt(player.medical!.allergiesEnc)).toBe("Peanuts");
    expect(player.consents).toHaveLength(1);
    const parentRoles = await db.userRole.findMany({ where: { userId: player.guardians[0]!.guardian.userId! }, include: { role: true } });
    expect(parentRoles.map((x) => x.role.key)).toEqual(["PARENT"]);
    expect((await db.registration.findUniqueOrThrow({ where: { id: reg.id } })).status).toBe("APPROVED");
  });

  it("links a sibling to the existing guardian instead of duplicating the parent", async () => {
    const first = await application("08030000002", "amaka.two@example.com");
    const sibling = await application("08030000002", "amaka.two@example.com");
    const a = await approveRegistration(first.id, groupId, actorId);
    const b = await approveRegistration(sibling.id, groupId, actorId);
    const guardians = await db.guardian.findMany({ where: { phone: "08030000002" }, include: { players: true } });
    expect(guardians).toHaveLength(1);
    expect(guardians[0]!.players.map((p) => p.playerId).sort()).toEqual([a.playerId, b.playerId].sort());
    expect(b.parentSetupToken).toBeNull(); // parent account already exists
  });

  it("refuses approval when the age group is full and never double-approves", async () => {
    const full = await application("08030000003", null);
    await expect(approveRegistration(full.id, groupId, actorId)).rejects.toThrow(/at capacity/);
    const roomy = (await makeGroup(branchId)).id;
    const ok = await approveRegistration(full.id, roomy, actorId);
    expect(ok.parentSetupToken).toBeNull(); // no email → no portal invite
    await expect(approveRegistration(full.id, roomy, actorId)).rejects.toThrow(/already been approved/);
  });

  it("issues unique academy IDs under concurrent approvals", async () => {
    const roomy = (await makeGroup(branchId)).id;
    const regs = await Promise.all(Array.from({ length: 5 }, (_, i) => application(`0803100000${i}`, null)));
    const results = await Promise.all(regs.map((r) => approveRegistration(r.id, roomy, actorId)));
    expect(new Set(results.map((r) => r.academyId)).size).toBe(5);
  });
});
