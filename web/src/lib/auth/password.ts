import { hash, verify } from "@node-rs/argon2";

// OWASP-recommended Argon2id parameters.
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string) {
  return hash(password, OPTS);
}

export async function verifyPassword(hashValue: string | null | undefined, password: string) {
  if (!hashValue) return false;
  try {
    return await verify(hashValue, password);
  } catch {
    return false;
  }
}

/** Minimum policy: 10+ chars, letters and digits. */
export function passwordProblems(password: string): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return "Use both letters and numbers.";
  return null;
}
