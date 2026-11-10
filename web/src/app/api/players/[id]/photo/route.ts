import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/current-user";
import { playerScope } from "@/lib/services/scope";
import { storage } from "@/lib/storage";

/** Player photos are private: only users who can see the player can load the image. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.mfaPending) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const p = await db.player.findFirst({ where: { id, ...playerScope(user) }, select: { photoKey: true } });
  if (!p?.photoKey) return new Response("Not found", { status: 404 });
  const buf = await storage().get(p.photoKey);
  const type = p.photoKey.endsWith(".png") ? "image/png" : p.photoKey.endsWith(".webp") ? "image/webp" : "image/jpeg";
  return new Response(new Uint8Array(buf), { headers: { "content-type": type, "cache-control": "private, max-age=3600" } });
}
