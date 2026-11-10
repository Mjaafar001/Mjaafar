import { getCurrentUser } from "@/lib/auth/current-user";
import { can } from "@/lib/rbac/authorize";
import { attendanceReport } from "@/lib/services/attendance-report";
import { toCsv } from "@/lib/csv";
import { audit } from "@/lib/audit";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.mfaPending || user.mfaSetupRequired) return new Response("Unauthorized", { status: 401 });
  if (!can(user, "attendance.view", "attendance.record")) return new Response("Forbidden", { status: 403 });
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return new Response("Invalid range", { status: 400 });
  const rows = await attendanceReport(user, { from, to, ageGroupId: sp.get("group") || undefined });
  await audit({ actorId: user.id, action: "attendance.export", entityType: "Attendance", summary: `${from} to ${to}` });
  const csv = toCsv(rows.map((r) => ({ "Academy ID": r.player.academyId, Player: `${r.player.firstName} ${r.player.lastName}`, "Age group": r.player.ageGroup?.name ?? "", Present: r.present, Late: r.late, Absent: r.absent, Excused: r.excused, Injured: r.injured, Sessions: r.total, "Attendance %": r.rate ?? "" })));
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="attendance-${from}-to-${to}.csv"`, "cache-control": "no-store" } });
}
