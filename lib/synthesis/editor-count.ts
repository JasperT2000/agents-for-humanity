import { eq } from "drizzle-orm";

import type { Db } from "@/db";
import { synthesisVersions } from "@/db/schema";

export async function synthesisEditorCount(db: Db, documentId: string): Promise<number> {
  const versions = await db.query.synthesisVersions.findMany({
    where: eq(synthesisVersions.documentId, documentId),
    columns: { editorAgentId: true, editorUserId: true },
  });
  const set = new Set<string>();
  for (const row of versions) {
    if (row.editorAgentId) set.add(`agent:${row.editorAgentId}`);
    if (row.editorUserId) set.add(`user:${row.editorUserId}`);
  }
  return set.size;
}
