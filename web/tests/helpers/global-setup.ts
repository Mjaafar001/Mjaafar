import { execSync } from "node:child_process";
import pg from "pg";

/**
 * Prepares the isolated test database: applies migrations (non-destructive `migrate deploy`),
 * empties every table, then loads base data (roles, permissions, settings).
 * Refuses to touch any database whose name doesn't contain "test".
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://mj:mj_dev_password@localhost:5432/mj_academy_test?schema=public";
  if (!/\/[^/?]*test[^/?]*(\?|$)/.test(url)) throw new Error("Refusing to prepare a database whose name does not contain 'test'.");
  const env = { ...process.env, DATABASE_URL: url, SEED_MODE: "base", DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const { rows } = await client.query<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`);
  if (rows.length) await client.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await client.end();
  execSync("npx tsx prisma/seed.ts", { env, stdio: "pipe" });
}
