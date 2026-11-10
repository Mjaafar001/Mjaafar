import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/current-user";
import { can } from "@/lib/rbac/authorize";
import { playerScope } from "@/lib/services/scope";
import { storage } from "@/lib/storage";
import { audit } from "@/lib/audit";

/** Authenticated document download. Every access to a sensitive document is audited. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.mfaPending || user.mfaSetupRequired) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc || doc.deletedAt) return new Response("Not found", { status: 404 });

  let allowed = false;
  if (doc.playerId) {
    const visible = await db.player.count({ where: { id: doc.playerId, ...playerScope(user) } });
    const staffAccess = can(user, "documents.view") && (!doc.isSensitive || can(user, "medical.view"));
    const parentAccess = (user.permissions.has("portal.parent") || user.permissions.has("portal.player")) && !doc.isSensitive;
    allowed = visible > 0 && (staffAccess || parentAccess);
  } else if (doc.staffId) {
    allowed = can(user, "staff.manage") || user.staffId === doc.staffId;
  } else if (doc.registrationId) {
    allowed = can(user, "registrations.view");
  }
  if (!allowed) return new Response("Forbidden", { status: 403 });

  if (doc.isSensitive) await audit({ actorId: user.id, action: "document.view", entityType: "Document", entityId: doc.id, summary: doc.title });
  const buf = await storage().get(doc.storageKey);
  const ext = doc.mimeType === "application/pdf" ? "pdf" : doc.mimeType.split("/")[1];
  return new Response(new Uint8Array(buf), {
    headers: { "content-type": doc.mimeType, "content-disposition": `inline; filename="${doc.title.replace(/[^\w .-]/g, "_")}.${ext}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
  });
}
