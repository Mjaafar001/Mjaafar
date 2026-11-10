import { Secret, TOTP } from "otpauth";

export function newTotpSecret() {
  return new Secret({ size: 20 }).base32;
}

function totp(secret: string, label: string) {
  return new TOTP({ issuer: "MJ Football Academy", label, algorithm: "SHA1", digits: 6, period: 30, secret: Secret.fromBase32(secret) });
}

export function totpUri(secret: string, label: string) {
  return totp(secret, label).toString();
}

export function verifyTotp(secret: string, token: string) {
  const clean = token.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  return totp(secret, "verify").validate({ token: clean, window: 1 }) !== null;
}
