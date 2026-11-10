import { db } from "@/lib/db";
import { storage } from "@/lib/storage";

/** The academy logo is public branding (shown on the sign-in page), so no auth is required. */
export async function GET() {
  const s = await db.academySettings.findUnique({ where: { id: "default" }, select: { logoKey: true } });
  if (!s?.logoKey) return new Response("Not found", { status: 404 });
  const buf = await storage().get(s.logoKey);
  const type = s.logoKey.endsWith(".png") ? "image/png" : s.logoKey.endsWith(".webp") ? "image/webp" : "image/jpeg";
  return new Response(new Uint8Array(buf), { headers: { "content-type": type, "cache-control": "public, max-age=86400" } });
}
