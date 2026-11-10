/**
 * Seed script.
 *   SEED_MODE=base  → roles, permissions, academy settings, message templates and the first
 *                     president account (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD). Safe for production.
 *   SEED_MODE=demo  → base + fictional demo data (default). Refuses to run in production.
 *
 * All demo people are fictional.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type AttendanceStatus } from "../src/generated/prisma/client";
import { ALL_PERMISSIONS, DEFAULT_ROLE_GRANTS, PERMISSIONS, ROLE_DEFS, ROLE_KEYS } from "../src/lib/rbac/permissions";
import { hashPassword } from "../src/lib/auth/password";
import { encrypt } from "../src/lib/crypto";
import { expandRecurrence } from "../src/lib/services/schedule-rules";
import { addDaysToDateString } from "../src/lib/dates";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const MODE = process.env.SEED_MODE ?? "demo";
export const DEMO_PASSWORD = "Academy2026!";

async function seedBase() {
  await db.academySettings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });

  for (const key of ALL_PERMISSIONS) {
    const def = PERMISSIONS[key];
    await db.permission.upsert({ where: { key }, update: { module: def.module, description: def.description }, create: { key, module: def.module, description: def.description } });
  }
  const perms = await db.permission.findMany();
  const permId = new Map(perms.map((p) => [p.key, p.id]));

  for (const key of ROLE_KEYS) {
    const def = ROLE_DEFS[key];
    const existing = await db.role.findUnique({ where: { key } });
    const role = await db.role.upsert({
      where: { key },
      update: { name: def.name, description: def.description, rank: def.rank, privileged: def.privileged, isSystem: true },
      create: { key, name: def.name, description: def.description, rank: def.rank, privileged: def.privileged, isSystem: true },
    });
    // Only apply default grants to newly created roles, so admin edits are preserved on re-seed.
    // SUPER_ADMIN always holds every permission.
    if (!existing || key === "SUPER_ADMIN") {
      for (const p of DEFAULT_ROLE_GRANTS[key]) {
        await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permId.get(p)! } }, update: {}, create: { roleId: role.id, permissionId: permId.get(p)! } });
      }
    }
  }

  const templates = [
    { key: "payment_reminder", name: "Payment reminder", channel: "WHATSAPP" as const, body: "Dear Parent, your child's registered training sessions have been completed. Kindly renew the subscription to register your child for the upcoming training period." },
    { key: "training_reminder", name: "Training reminder", channel: "WHATSAPP" as const, body: "Dear Parent, this is a reminder that your child's training session is scheduled for tomorrow. Please ensure they arrive on time." },
    { key: "session_cancelled", name: "Session cancelled", channel: "WHATSAPP" as const, body: "Dear Parent, today's {{ageGroup}} training session at {{venue}} has been cancelled ({{reason}}). We apologise for the inconvenience." },
    { key: "registration_received", name: "Application received", channel: "EMAIL" as const, subject: "We received your application", body: "Dear {{guardianName}}, thank you for applying to {{academyName}}. Your reference is {{reference}}. We will be in touch shortly." },
    { key: "parent_invite", name: "Parent portal invitation", channel: "EMAIL" as const, subject: "Your parent portal account", body: "Dear {{guardianName}}, {{playerName}} has been registered at {{academyName}} (ID {{academyId}}). Set your password to access the parent portal: {{link}}" },
  ];
  for (const t of templates) await db.messageTemplate.upsert({ where: { key: t.key }, update: {}, create: t });

  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (email && password) {
    const role = await db.role.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } });
    const user = await db.user.upsert({
      where: { email: email.toLowerCase() },
      update: {},
      create: { email: email.toLowerCase(), name: process.env.SEED_ADMIN_NAME ?? "Academy President", passwordHash: await hashPassword(password), passwordChangedAt: new Date() },
    });
    const has = await db.userRole.findFirst({ where: { userId: user.id, roleId: role.id } });
    if (!has) await db.userRole.create({ data: { userId: user.id, roleId: role.id } });
    console.log(`✓ President account: ${email}`);
  }
  console.log("✓ Base data (settings, roles, permissions, templates)");
}

// ───────────── demo data ─────────────

const FIRST_M = ["Chidi", "Tunde", "Emeka", "Ayo", "Ibrahim", "Musa", "Segun", "Obinna", "Kelechi", "Femi", "Uche", "Dayo", "Yusuf", "Tobi", "Ikenna", "Sani", "Bayo", "Chinedu", "Kunle", "Abdul", "Nnamdi", "Damilare", "Efosa", "Osaze", "Babajide", "Gbenga", "Ifeanyi", "Somto"];
const FIRST_F = ["Amaka", "Zainab", "Funmi", "Ngozi", "Aisha", "Temi", "Chioma", "Halima", "Bisi", "Ada", "Kemi", "Fatima", "Ife", "Nneka"];
const LAST = ["Okafor", "Adeyemi", "Balogun", "Eze", "Bello", "Okonkwo", "Adebayo", "Nwosu", "Ogunleye", "Ibrahim", "Danjuma", "Afolabi", "Chukwu", "Olawale", "Usman", "Obi", "Akande", "Lawal", "Ekwueme", "Osagie", "Mohammed", "Oyelaran", "Uzor", "Fashola"];
const POS = ["Goalkeeper", "Centre-back", "Full-back", "Central midfielder", "Winger", "Striker", "Attacking midfielder", "Defensive midfielder"];

let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)]!;

function dobForAge(age: number) {
  const year = new Date().getUTCFullYear() - age;
  return new Date(Date.UTC(year, Math.floor(rand() * 12), 1 + Math.floor(rand() * 27)));
}

async function seedDemo() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to load demo data in production. Use SEED_MODE=base.");
  if ((await db.player.count()) > 0) {
    console.log("• Demo data already present — skipping (run `npm run db:reset` for a clean slate).");
    return;
  }
  const pw = await hashPassword(DEMO_PASSWORD);
  const roles = new Map((await db.role.findMany()).map((r) => [r.key, r.id]));

  await db.academySettings.update({
    where: { id: "default" },
    data: { contactEmail: "info@mjfootball.example", contactPhone: "+2348012345678", address: "Plot 12, Admiralty Way, Lekki Phase 1, Lagos", paymentInstructions: "Bank transfer: MJ Football Academy Ltd, Demo Bank, 0123456789. Use your child's academy ID as the reference." },
  });

  const lekki = await db.branch.create({ data: { name: "Lekki (Main)", code: "LEK", address: "Admiralty Way, Lekki Phase 1", city: "Lagos", state: "Lagos", phone: "+2348012345678" } });
  const abuja = await db.branch.create({ data: { name: "Abuja", code: "ABJ", address: "Wuse II", city: "Abuja", state: "FCT", phone: "+2348098765432" } });

  const venues = {
    pitchA: await db.venue.create({ data: { branchId: lekki.id, name: "Main Pitch", surface: "Artificial turf", capacity: 60, address: "Admiralty Way" } }),
    pitchB: await db.venue.create({ data: { branchId: lekki.id, name: "Mini Pitch", surface: "Artificial turf", capacity: 30 } }),
    abujaPitch: await db.venue.create({ data: { branchId: abuja.id, name: "Wuse Community Field", surface: "Grass", capacity: 40 } }),
  };
  await db.season.create({ data: { name: "2026/27", startDate: new Date(Date.UTC(2026, 8, 1)), endDate: new Date(Date.UTC(2027, 6, 31)), isCurrent: true } });

  const groupDefs = [
    { name: "Under-8", code: "U8", minAge: 5, max: 8, capacity: 24, color: "#0ea5e9" },
    { name: "Under-10", code: "U10", minAge: 8, max: 10, capacity: 24, color: "#13804f" },
    { name: "Under-12", code: "U12", minAge: 10, max: 12, capacity: 24, color: "#f59e0b" },
    { name: "Under-13", code: "U13", minAge: 12, max: 13, capacity: 20, color: "#8b5cf6" },
    { name: "Under-15", code: "U15", minAge: 13, max: 15, capacity: 24, color: "#ef4444" },
  ];
  const groups: Awaited<ReturnType<typeof db.ageGroup.create>>[] = [];
  for (const [i, g] of groupDefs.entries()) {
    groups.push(await db.ageGroup.create({ data: { branchId: lekki.id, name: g.name, code: g.code, minAge: g.minAge, maxAgeExclusive: g.max, capacity: g.capacity, color: g.color, sortOrder: i } }));
  }
  const abujaU12 = await db.ageGroup.create({ data: { branchId: abuja.id, name: "Under-12", code: "U12", minAge: 9, maxAgeExclusive: 12, capacity: 20, color: "#f59e0b" } });

  async function makeUser(email: string, name: string, roleKey: string, branchId: string | null) {
    const u = await db.user.create({ data: { email, name, passwordHash: pw, passwordChangedAt: new Date() } });
    await db.userRole.create({ data: { userId: u.id, roleId: roles.get(roleKey)!, branchId } });
    return u;
  }

  await makeUser("president@mjfootball.example", "Mohammed Jaafar (Demo)", "SUPER_ADMIN", null);
  const adminU = await makeUser("admin@mjfootball.example", "Grace Okoro", "ADMIN", lekki.id);
  await makeUser("accounts@mjfootball.example", "Peter Adewale", "ACCOUNTANT", null);
  const headU = await makeUser("headcoach@mjfootball.example", "Victor Ekene", "HEAD_COACH", lekki.id);
  const coach1U = await makeUser("coach@mjfootball.example", "Samuel Ojo", "COACH", lekki.id);
  const coach2U = await makeUser("coach2@mjfootball.example", "Blessing Nwachukwu", "COACH", lekki.id);
  const abujaU = await makeUser("abuja.coach@mjfootball.example", "Hassan Garba", "COACH", abuja.id);

  const staff = async (u: { id: string; name: string; email: string } | null, first: string, last: string, type: "HEAD_COACH" | "COACH" | "ADMINISTRATOR" | "FITNESS_COACH", branchId: string, groupIds: string[], quals: string) =>
    db.staffProfile.create({
      data: {
        userId: u?.id, branchId, firstName: first, lastName: last, email: u?.email, phone: "+23480" + String(10000000 + Math.floor(rand() * 89999999)),
        staffType: type, jobTitle: type === "HEAD_COACH" ? "Head Coach" : type === "ADMINISTRATOR" ? "Academy Administrator" : type === "FITNESS_COACH" ? "Fitness Coach" : "Coach",
        startDate: new Date(Date.UTC(2024, 0, 15)), qualifications: quals,
        ageGroups: { create: groupIds.map((ageGroupId) => ({ ageGroupId })) },
        availability: { create: [2, 4, 6].map((weekday) => ({ weekday, startTime: "15:00", endTime: "19:00" })) },
      },
    });
  const head = await staff(headU, "Victor", "Ekene", "HEAD_COACH", lekki.id, groups.map((g) => g.id), "CAF B Licence; NFF Grassroots Coaching");
  const coach1 = await staff(coach1U, "Samuel", "Ojo", "COACH", lekki.id, [groups[0]!.id, groups[1]!.id], "NFF Grassroots Coaching; First Aid (Red Cross)");
  const coach2 = await staff(coach2U, "Blessing", "Nwachukwu", "COACH", lekki.id, [groups[2]!.id, groups[3]!.id], "CAF C Licence");
  await staff(adminU, "Grace", "Okoro", "ADMINISTRATOR", lekki.id, [], "BSc Business Administration");
  const fitness = await staff(null, "Ahmed", "Yakubu", "FITNESS_COACH", lekki.id, [groups[4]!.id], "Sports Science Diploma");
  const abujaCoach = await staff(abujaU, "Hassan", "Garba", "COACH", abuja.id, [abujaU12.id], "CAF C Licence");
  await db.certification.createMany({
    data: [
      { staffId: head.id, name: "CAF B Licence", issuer: "Confederation of African Football", issuedAt: new Date(Date.UTC(2022, 5, 1)) },
      { staffId: coach1.id, name: "First Aid Certificate", issuer: "Nigerian Red Cross", issuedAt: new Date(Date.UTC(2025, 1, 10)), expiresAt: new Date(Date.UTC(2027, 1, 10)) },
      { staffId: coach2.id, name: "CAF C Licence", issuer: "Confederation of African Football", issuedAt: new Date(Date.UTC(2023, 8, 1)) },
    ],
  });
  const coachForGroup = [coach1, coach1, coach2, coach2, fitness];

  // Players: ~12 per Lekki group, 8 in Abuja. A few families have siblings.
  let seq = 0;
  const yy = String(new Date().getUTCFullYear()).slice(-2);
  const parentUserEmails = new Set<string>();
  const allPlayers: { id: string; ageGroupId: string; branchId: string }[] = [];

  async function addFamily(branchId: string, kids: { groupIndex: number | "abuja"; age: number }[]) {
    const lastName = pick(LAST);
    const gFirst = pick([...FIRST_M, ...FIRST_F]);
    const phone = "+23481" + String(10000000 + Math.floor(rand() * 89999999));
    const email = `${gFirst}.${lastName}${Math.floor(rand() * 900 + 100)}@example.com`.toLowerCase();
    const guardian = await db.guardian.create({ data: { firstName: gFirst, lastName, phone, whatsapp: phone, email, address: "Lekki, Lagos" } });
    for (const kid of kids) {
      seq++;
      const group = kid.groupIndex === "abuja" ? abujaU12 : groups[kid.groupIndex]!;
      const gender = rand() < 0.8 ? "MALE" : "FEMALE";
      const status = rand() < 0.06 ? "TRIAL" : rand() < 0.04 ? "INACTIVE" : "ACTIVE";
      const p = await db.player.create({
        data: {
          academyId: `MJA-${yy}-${String(seq).padStart(4, "0")}`,
          branchId, firstName: gender === "MALE" ? pick(FIRST_M) : pick(FIRST_F), lastName, dateOfBirth: dobForAge(kid.age), gender,
          status, ageGroupId: group.id, primaryCoachId: kid.groupIndex === "abuja" ? abujaCoach.id : coachForGroup[kid.groupIndex]!.id,
          preferredPosition: pick(POS), dominantFoot: rand() < 0.75 ? "RIGHT" : rand() < 0.8 ? "LEFT" : "BOTH",
          jerseyNumber: 1 + Math.floor(rand() * 30), jerseySize: kid.age < 9 ? "YS" : kid.age < 12 ? "YM" : "YL",
          registrationDate: new Date(Date.now() - Math.floor(rand() * 300) * 86400000),
          photoConsent: rand() < 0.85, videoConsent: rand() < 0.7, address: "Lekki, Lagos", city: "Lagos", state: "Lagos",
          guardians: { create: { guardianId: guardian.id, relationship: rand() < 0.5 ? "Mother" : "Father", isPrimary: true } },
          medical: {
            create: {
              allergiesEnc: rand() < 0.15 ? encrypt("Peanuts") : null,
              conditionsEnc: rand() < 0.1 ? encrypt("Mild asthma — carries inhaler") : null,
              emergencyInstructionsEnc: encrypt("Call parent first. Nearest hospital: Lekki General."),
              clearanceStatus: rand() < 0.85 ? "CLEARED" : "PENDING",
              clearanceExpiresAt: new Date(Date.UTC(new Date().getUTCFullYear() + 1, 0, 31)),
            },
          },
          consents: {
            create: [
              { type: "PARTICIPATION", granted: true, version: "2026-11", signedName: `${gFirst} ${lastName}`, guardianId: guardian.id },
              { type: "DATA_PROCESSING", granted: true, version: "2026-11", signedName: `${gFirst} ${lastName}`, guardianId: guardian.id },
            ],
          },
        },
      });
      allPlayers.push({ id: p.id, ageGroupId: group.id, branchId });
      // Opening credit balance so the ledger is meaningful before payments (Phase 3).
      await db.sessionCreditEntry.create({ data: { playerId: p.id, type: "ALLOCATION", delta: 12, reason: "Opening balance (demo data)", idempotencyKey: `demo-open:${p.id}` } });
    }
    return { guardian, email };
  }

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groupDefs[gi]!;
    for (let i = 0; i < 10; i++) await addFamily(lekki.id, [{ groupIndex: gi, age: g.max - 1 - Math.floor(rand() * 2) }]);
  }
  // Siblings: one family with kids in U8 and U12, one with U10 and U13.
  const fam1 = await addFamily(lekki.id, [{ groupIndex: 0, age: 7 }, { groupIndex: 2, age: 11 }]);
  await addFamily(lekki.id, [{ groupIndex: 1, age: 9 }, { groupIndex: 3, age: 12 }]);
  for (let i = 0; i < 8; i++) await addFamily(abuja.id, [{ groupIndex: "abuja", age: 10 + Math.floor(rand() * 2) }]);
  await db.counter.upsert({ where: { key: `academy-id:${yy}` }, update: { value: seq }, create: { key: `academy-id:${yy}`, value: seq } });

  // Demo parent login, linked to the sibling family.
  const parentUser = await db.user.create({ data: { email: "parent@mjfootball.example", name: `${fam1.guardian.firstName} ${fam1.guardian.lastName}`, passwordHash: pw, passwordChangedAt: new Date() } });
  await db.userRole.create({ data: { userId: parentUser.id, roleId: roles.get("PARENT")!, branchId: lekki.id } });
  await db.guardian.update({ where: { id: fam1.guardian.id }, data: { userId: parentUser.id, email: "parent@mjfootball.example" } });
  parentUserEmails.add("parent@mjfootball.example");

  // Training: Tue/Thu/Sat for each Lekki group, 4 weeks back and 4 weeks forward.
  const today = new Date().toISOString().slice(0, 10);
  const from = addDaysToDateString(today, -28);
  const to = addDaysToDateString(today, 28);
  const slots = [
    { gi: 0, time: "15:30", venue: venues.pitchB.id, days: [2, 6] },
    { gi: 1, time: "15:30", venue: venues.pitchA.id, days: [2, 4, 6] },
    { gi: 2, time: "17:00", venue: venues.pitchA.id, days: [2, 4, 6] },
    { gi: 3, time: "17:00", venue: venues.pitchB.id, days: [2, 4] },
    { gi: 4, time: "08:00", venue: venues.pitchA.id, days: [6, 3] },
  ];
  const statuses: AttendanceStatus[] = ["PRESENT", "PRESENT", "PRESENT", "PRESENT", "PRESENT", "PRESENT", "LATE", "ABSENT", "EXCUSED"];
  for (const s of slots) {
    const group = groups[s.gi]!;
    const coach = coachForGroup[s.gi]!;
    const rule = await db.recurrenceRule.create({
      data: { branchId: lekki.id, title: `${group.name} training`, ageGroupId: group.id, venueId: s.venue, coachId: coach.id, weekdays: s.days, startDate: new Date(from), endDate: new Date(to), startTime: s.time, durationMinutes: 90, objectives: "Technical development and small-sided games" },
    });
    const occ = expandRecurrence({ weekdays: s.days, intervalWeeks: 1, startDate: from, endDate: to, startTime: s.time, durationMinutes: 90 });
    for (const o of occ) {
      const past = o.endsAt < new Date();
      const session = await db.trainingSession.create({
        data: { branchId: lekki.id, title: `${group.name} training`, ageGroupId: group.id, venueId: s.venue, coachId: coach.id, startsAt: o.startsAt, endsAt: o.endsAt, recurrenceId: rule.id, status: past ? "COMPLETED" : "SCHEDULED", objectives: "Passing combinations, 4v4 rondos, finishing", createdById: adminU.id },
      });
      if (!past) continue;
      for (const p of allPlayers.filter((x) => x.ageGroupId === group.id)) {
        const st = pick(statuses);
        const att = await db.attendance.create({ data: { sessionId: session.id, playerId: p.id, status: st, method: "MANUAL", recordedById: coach.userId } });
        if (st === "PRESENT" || st === "LATE") {
          await db.sessionCreditEntry.create({ data: { playerId: p.id, attendanceId: att.id, type: "ATTENDANCE_DEDUCTION", delta: -1, reason: `Attended ${session.title}`, idempotencyKey: `att:${att.id}:1` } });
        }
      }
    }
  }

  // Pending applications.
  for (let i = 0; i < 5; i++) {
    const first = pick(FIRST_M);
    const last = pick(LAST);
    const gFirst = pick(FIRST_F);
    const age = 7 + Math.floor(rand() * 7);
    const dob = dobForAge(age);
    const payload = {
      branchId: lekki.id, type: i === 4 ? "TRIAL" : "FULL",
      child: { firstName: first, lastName: last, dateOfBirth: dob.toISOString().slice(0, 10), gender: "MALE", nationality: "Nigerian", preferredPosition: pick(POS), dominantFoot: "RIGHT" },
      guardians: [{ firstName: gFirst, lastName: last, relationship: "Mother", phone: "+23490" + String(10000000 + i * 1234567), email: `${gFirst}.${last}.app${i}@example.com`.toLowerCase() }],
      emergencyContacts: [], medical: {},
      consents: { participation: true, medicalTreatment: true, dataProcessing: true, photo: true, video: false, signedName: `${gFirst} ${last}` },
    };
    const reg = await db.registration.create({
      data: {
        reference: `APP-${yy}-${String(i + 1).padStart(5, "0")}`, branchId: lekki.id, type: i === 4 ? "TRIAL" : "FULL", status: i === 3 ? "UNDER_REVIEW" : "SUBMITTED",
        childFirstName: first, childLastName: last, childDateOfBirth: dob, childGender: "MALE", guardianFirstName: gFirst, guardianLastName: last,
        guardianEmail: payload.guardians[0]!.email, guardianPhone: payload.guardians[0]!.phone, payload, medicalEnc: encrypt(JSON.stringify({})),
        createdAt: new Date(Date.now() - i * 86400000),
      },
    });
    await db.consentRecord.createMany({ data: (["PARTICIPATION", "MEDICAL_TREATMENT", "DATA_PROCESSING", "PHOTO"] as const).map((type) => ({ type, granted: true, version: "2026-11", signedName: `${gFirst} ${last}`, registrationId: reg.id })) });
  }
  await db.counter.upsert({ where: { key: `registration:${yy}` }, update: { value: 5 }, create: { key: `registration:${yy}`, value: 5 } });

  console.log(`✓ Demo data: ${allPlayers.length} players, ${groups.length + 1} age groups, 2 branches`);
  console.log(`\n  Demo logins (password: ${DEMO_PASSWORD})`);
  for (const e of ["president", "admin", "headcoach", "coach", "accounts", "parent", "abuja.coach"]) console.log(`   • ${e}@mjfootball.example`);
}

async function main() {
  await seedBase();
  if (MODE === "demo") await seedDemo();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
