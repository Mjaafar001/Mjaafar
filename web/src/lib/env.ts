import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v || v === "REPLACE") throw new Error(`Missing required environment variable ${name}. See .env.example.`);
  return v;
}

export const env = {
  get databaseUrl() { return required("DATABASE_URL"); },
  get appUrl() { return process.env.APP_URL ?? "http://localhost:3000"; },
  get dataEncryptionKey() { return required("DATA_ENCRYPTION_KEY"); },
  get sessionSecret() { return required("SESSION_SECRET"); },
  get isProduction() { return process.env.NODE_ENV === "production"; },
  /** When true, privileged roles must enrol in MFA before using the app. Defaults to true in production. */
  get mfaEnforced() {
    const v = process.env.MFA_ENFORCE;
    return v ? v === "true" : process.env.NODE_ENV === "production";
  },
  get storageDriver() { return (process.env.STORAGE_DRIVER ?? "local") as "local" | "s3"; },
  get storageLocalDir() { return process.env.STORAGE_LOCAL_DIR ?? "./storage"; },
  get smtpUrl() { return process.env.SMTP_URL; },
  get emailFrom() { return process.env.EMAIL_FROM ?? "MJ Football Academy <no-reply@localhost>"; },
};
