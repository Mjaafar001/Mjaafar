import { db } from "@/lib/db";

/** Liveness/readiness probe for load balancers and uptime monitoring. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", time: new Date().toISOString() });
  } catch {
    return Response.json({ status: "error" }, { status: 503 });
  }
}
