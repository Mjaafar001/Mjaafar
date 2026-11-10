import { describe, expect, it } from "vitest";
import { fitsBand, suggestAgeGroup } from "@/lib/services/age-group-rules";
import { detectConflicts, expandRecurrence, overlaps } from "@/lib/services/schedule-rules";
import { creditDelta, shouldDeduct } from "@/lib/services/credit-rules";
import { ageOn, localDayBounds, localToUtc } from "@/lib/dates";

const groups = [
  { id: "u8", name: "Under-8", minAge: 5, maxAgeExclusive: 8, isActive: true, sortOrder: 0 },
  { id: "u10", name: "Under-10", minAge: 8, maxAgeExclusive: 10, isActive: true, sortOrder: 1 },
  { id: "u12", name: "Under-12", minAge: 10, maxAgeExclusive: 12, isActive: true, sortOrder: 2 },
  { id: "old", name: "Inactive", minAge: 5, maxAgeExclusive: 20, isActive: false, sortOrder: 3 },
];

describe("age groups", () => {
  it("computes age on a date correctly around birthdays", () => {
    const dob = new Date(Date.UTC(2015, 5, 15));
    expect(ageOn(dob, new Date(Date.UTC(2026, 5, 14)))).toBe(10);
    expect(ageOn(dob, new Date(Date.UTC(2026, 5, 15)))).toBe(11);
  });
  it("fitsBand respects inclusive min and exclusive max", () => {
    expect(fitsBand(8, { minAge: 8, maxAgeExclusive: 10 })).toBe(true);
    expect(fitsBand(10, { minAge: 8, maxAgeExclusive: 10 })).toBe(false);
    expect(fitsBand(4, { minAge: 5, maxAgeExclusive: null })).toBe(false);
  });
  it("suggests the youngest active group using the cutoff date", () => {
    const ref = new Date(Date.UTC(2026, 10, 1));
    // Born March 2017 → age 9 on 1 Jan 2026 → Under-10
    expect(suggestAgeGroup(new Date(Date.UTC(2017, 2, 1)), groups, { month: 1, day: 1 }, ref)?.id).toBe("u10");
    // Born Dec 2015 → age 10 on 1 Jan 2026 → Under-12
    expect(suggestAgeGroup(new Date(Date.UTC(2015, 11, 1)), groups, { month: 1, day: 1 }, ref)?.id).toBe("u12");
    // Never suggests inactive groups; returns null if nothing fits
    expect(suggestAgeGroup(new Date(Date.UTC(2005, 0, 1)), groups, { month: 1, day: 1 }, ref)).toBeNull();
  });
});

describe("scheduling", () => {
  it("detects overlap but not back-to-back sessions", () => {
    const a = { startsAt: new Date("2026-11-10T15:00:00Z"), endsAt: new Date("2026-11-10T16:30:00Z") };
    expect(overlaps(a, { startsAt: new Date("2026-11-10T16:00:00Z"), endsAt: new Date("2026-11-10T17:00:00Z") })).toBe(true);
    expect(overlaps(a, { startsAt: new Date("2026-11-10T16:30:00Z"), endsAt: new Date("2026-11-10T18:00:00Z") })).toBe(false);
  });
  it("expands weekly recurrences in Lagos time, skipping holidays", () => {
    const occ = expandRecurrence({ weekdays: [2, 4], intervalWeeks: 1, startDate: "2026-11-01", endDate: "2026-11-30", startTime: "16:00", durationMinutes: 90, skipDates: new Set(["2026-11-10"]) });
    expect(occ.map((o) => o.date)).toEqual(["2026-11-03", "2026-11-05", "2026-11-12", "2026-11-17", "2026-11-19", "2026-11-24", "2026-11-26"]);
    // 16:00 WAT = 15:00 UTC
    expect(occ[0]!.startsAt.toISOString()).toBe("2026-11-03T15:00:00.000Z");
    expect(occ[0]!.endsAt.getTime() - occ[0]!.startsAt.getTime()).toBe(90 * 60000);
  });
  it("supports fortnightly schedules", () => {
    const occ = expandRecurrence({ weekdays: [6], intervalWeeks: 2, startDate: "2026-11-01", endDate: "2026-11-30", startTime: "08:00", durationMinutes: 60 });
    expect(occ.map((o) => o.date)).toEqual(["2026-11-07", "2026-11-21"]);
  });
  it("reports coach, venue and age-group double bookings", () => {
    const existing = [{ id: "s1", title: "U10", startsAt: new Date("2026-11-10T15:00:00Z"), endsAt: new Date("2026-11-10T16:30:00Z"), coachId: "c1", venueId: "v1", ageGroupId: "g1" }];
    const c = detectConflicts({ startsAt: new Date("2026-11-10T16:00:00Z"), endsAt: new Date("2026-11-10T17:00:00Z"), coachId: "c1", venueId: "v2", ageGroupId: "g1" }, existing);
    expect(c.map((x) => x.kind).sort()).toEqual(["ageGroup", "coach"]);
    // The session itself is never a conflict (rescheduling)
    expect(detectConflicts(existing[0]!, existing)).toEqual([]);
  });
  it("computes local day bounds for Lagos", () => {
    const { start, end, day } = localDayBounds(new Date("2026-11-10T23:30:00Z"));
    expect(day).toBe("2026-11-11");
    expect(start.toISOString()).toBe("2026-11-10T23:00:00.000Z");
    expect(end.getTime() - start.getTime()).toBe(86400000);
    expect(localToUtc("2026-11-11", "00:00").toISOString()).toBe("2026-11-10T23:00:00.000Z");
  });
});

describe("credit rules", () => {
  const policy = { deductStatuses: ["PRESENT", "LATE"] as ("PRESENT" | "LATE")[] };
  const live = { status: "SCHEDULED" as const, countsTowardCredits: true };
  it("deducts only for configured statuses on credit-bearing, non-cancelled sessions", () => {
    expect(shouldDeduct("PRESENT", live, policy)).toBe(true);
    expect(shouldDeduct("ABSENT", live, policy)).toBe(false);
    expect(shouldDeduct("PRESENT", { ...live, status: "CANCELLED" }, policy)).toBe(false);
    expect(shouldDeduct("PRESENT", { ...live, countsTowardCredits: false }, policy)).toBe(false);
  });
  it("never posts more than one net deduction", () => {
    expect(creditDelta(0, true)).toBe(-1);
    expect(creditDelta(-1, true)).toBe(0);
    expect(creditDelta(-1, false)).toBe(1);
    expect(creditDelta(0, false)).toBe(0);
  });
});
