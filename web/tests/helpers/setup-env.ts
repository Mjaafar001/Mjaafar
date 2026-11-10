// Point every test at the isolated test database and give it deterministic keys.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://mj:mj_dev_password@localhost:5432/mj_academy_test?schema=public";
process.env.DATA_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.SESSION_SECRET ??= Buffer.alloc(32, 9).toString("base64");
process.env.TZ = "UTC";
