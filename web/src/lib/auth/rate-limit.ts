import "server-only";
import { db } from "@/lib/db";

/**
 * Fixed-window rate limiter stored in Postgres so it works across server instances.
 * Returns { ok: false } once `limit` hits occur inside `windowSeconds`.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const rows = await db.$queryRaw<{ count: number; windowStart: Date }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "windowStart") VALUES (${key}, 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."windowStart" < now() - make_interval(secs => ${windowSeconds}) THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimitBucket"."windowStart" < now() - make_interval(secs => ${windowSeconds}) THEN now() ELSE "RateLimitBucket"."windowStart" END
    RETURNING "count", "windowStart"`;
  const row = rows[0];
  const retryAfter = Math.max(0, Math.ceil((row.windowStart.getTime() + windowSeconds * 1000 - Date.now()) / 1000));
  return { ok: row.count <= limit, count: row.count, retryAfter };
}

export async function clearRateLimit(key: string) {
  await db.rateLimitBucket.deleteMany({ where: { key } });
}
