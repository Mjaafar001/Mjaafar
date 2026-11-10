import "server-only";
import { z } from "zod";
import { AuthorizationError } from "@/lib/rbac/authorize";
import { Prisma } from "@/generated/prisma/client";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export class UserFacingError extends Error {}

/**
 * Wraps a server action body: validates input with Zod and turns known errors into a typed result.
 * Unknown errors are logged and replaced with a generic message so internals never leak.
 */
export async function runAction<S extends z.ZodType, T>(
  schema: S,
  input: unknown,
  fn: (data: z.infer<S>) => Promise<ActionResult<T> | void>,
): Promise<ActionResult<T>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path.join(".") || "_";
      (fieldErrors[k] ??= []).push(issue.message);
    }
    return { ok: false, error: "Please correct the highlighted fields.", fieldErrors };
  }
  try {
    return (await fn(parsed.data)) ?? { ok: true };
  } catch (e) {
    if (e instanceof AuthorizationError || e instanceof UserFacingError) return { ok: false, error: e.message };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "A record with these details already exists." };
    }
    // Let Next.js redirects / notFound propagate.
    if (e && typeof e === "object" && "digest" in e && typeof (e as { digest: unknown }).digest === "string" && (e as { digest: string }).digest.startsWith("NEXT_")) throw e;
    console.error("[action] unexpected error", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
