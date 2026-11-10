import type { AttendanceStatus, SessionStatus } from "@/generated/prisma/enums";

export type CreditPolicy = { deductStatuses: AttendanceStatus[] };

/** Whether an attendance mark should consume one session credit. */
export function shouldDeduct(
  status: AttendanceStatus,
  session: { status: SessionStatus; countsTowardCredits: boolean },
  policy: CreditPolicy,
) {
  if (!session.countsTowardCredits || session.status === "CANCELLED") return false;
  return policy.deductStatuses.includes(status);
}

/**
 * Given the net credits already posted for an attendance record (0 or -1) and whether it
 * should now be deducted, returns the ledger delta to post: -1 deduct, +1 reverse, 0 nothing.
 */
export function creditDelta(netPosted: number, deduct: boolean): -1 | 0 | 1 {
  if (deduct && netPosted >= 0) return -1;
  if (!deduct && netPosted < 0) return 1;
  return 0;
}
