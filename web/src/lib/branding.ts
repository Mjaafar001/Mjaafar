import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";

const SAFE_HEX = /^#[0-9a-fA-F]{6}$/;

/** Public-safe branding values (used on login and public application pages too). */
export const getBranding = cache(async () => {
  const s = await db.academySettings.findUnique({ where: { id: "default" } }).catch(() => null);
  return {
    name: s?.name ?? "MJ Football Academy",
    shortName: s?.shortName ?? "MJ Academy",
    primaryColor: s?.primaryColor && SAFE_HEX.test(s.primaryColor) ? s.primaryColor : "#13804f",
    accentColor: s?.accentColor && SAFE_HEX.test(s.accentColor) ? s.accentColor : "#f2b705",
    hasLogo: !!s?.logoKey,
    logoVersion: s?.updatedAt?.getTime() ?? 0,
  };
});
