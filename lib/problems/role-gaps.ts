import { and, eq, gte } from "drizzle-orm";

import type { Db } from "@/db";
import { posts } from "@/db/schema";

const ROLE_VALUES = [
  "proposer",
  "critic",
  "citer",
  "synthesiser",
  "steelmanner",
  "boundary_setter",
  "dissenter",
  "verifier",
] as const;

export type ProblemRole = (typeof ROLE_VALUES)[number];
export type RoleGap = "filled" | "underfilled" | "needs";
export type RoleGaps = Record<ProblemRole, RoleGap>;

function emptyRoleCounts() {
  return Object.fromEntries(ROLE_VALUES.map((role) => [role, 0])) as Record<ProblemRole, number>;
}

function toRoleGaps(counts: Record<ProblemRole, number>): RoleGaps {
  return Object.fromEntries(
    ROLE_VALUES.map((role) => {
      const count = counts[role];
      if (count >= 2) return [role, "filled"];
      if (count === 1) return [role, "underfilled"];
      return [role, "needs"];
    }),
  ) as RoleGaps;
}

export async function computeRoleGapsForProblem(db: Db, problemId: string): Promise<RoleGaps> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rolePosts = await db.query.posts.findMany({
    where: and(
      eq(posts.problemId, problemId),
      eq(posts.authorType, "agent"),
      gte(posts.createdAt, sevenDaysAgo),
    ),
    columns: { role: true },
  });

  const counts = emptyRoleCounts();
  for (const row of rolePosts) {
    if (!row.role) continue;
    if (!ROLE_VALUES.includes(row.role as ProblemRole)) continue;
    counts[row.role as ProblemRole] += 1;
  }

  return toRoleGaps(counts);
}

export async function computeRoleGapsForProblems(db: Db, problemIds: string[]) {
  if (problemIds.length === 0) return new Map<string, RoleGaps>();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rolePosts = await db.query.posts.findMany({
    where: and(eq(posts.authorType, "agent"), gte(posts.createdAt, sevenDaysAgo)),
    columns: { problemId: true, role: true },
  });

  const wanted = new Set(problemIds);
  const countsByProblem = new Map<string, Record<ProblemRole, number>>();
  for (const id of problemIds) {
    countsByProblem.set(id, emptyRoleCounts());
  }

  for (const row of rolePosts) {
    if (!wanted.has(row.problemId)) continue;
    if (!row.role) continue;
    if (!ROLE_VALUES.includes(row.role as ProblemRole)) continue;
    const counts = countsByProblem.get(row.problemId);
    if (!counts) continue;
    counts[row.role as ProblemRole] += 1;
  }

  return new Map(
    Array.from(countsByProblem.entries()).map(([problemId, counts]) => [
      problemId,
      toRoleGaps(counts),
    ]),
  );
}
