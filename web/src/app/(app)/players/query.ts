import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/lib/auth/current-user";
import { playerScope } from "@/lib/services/scope";
import { scopedBranchWhere } from "@/lib/branch-context";
import { PLAYER_STATUSES } from "@/lib/validators/player";

export type PlayerListParams = { q?: string; status?: string; group?: string; archived?: string; sort?: string; dir?: string; page?: string };

/** Shared by the list page and CSV export so both apply identical scoping and filters. */
export async function playerListQuery(user: CurrentUser, sp: PlayerListParams) {
  const q = sp.q?.trim();
  const where: Prisma.PlayerWhereInput = {
    AND: [
      playerScope(user),
      await scopedBranchWhere(user),
      sp.archived === "1" ? { archivedAt: { not: null } } : { archivedAt: null },
      sp.status && (PLAYER_STATUSES as readonly string[]).includes(sp.status) ? { status: sp.status as (typeof PLAYER_STATUSES)[number] } : {},
      sp.group ? { ageGroupId: sp.group } : {},
      q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { preferredName: { contains: q, mode: "insensitive" } },
              { academyId: { contains: q, mode: "insensitive" } },
              { guardians: { some: { guardian: { OR: [{ phone: { contains: q } }, { lastName: { contains: q, mode: "insensitive" } }] } } } },
            ],
          }
        : {},
    ],
  };
  const dir: Prisma.SortOrder = sp.dir === "desc" ? "desc" : "asc";
  const orderBy: Prisma.PlayerOrderByWithRelationInput[] =
    sp.sort === "dob" ? [{ dateOfBirth: dir }] : sp.sort === "registered" ? [{ registrationDate: dir }] : sp.sort === "id" ? [{ academyId: dir }] : [{ firstName: dir }, { lastName: dir }];
  return { where, orderBy };
}
