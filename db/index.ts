import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

let client: ReturnType<typeof postgres> | null = null;
let db: PostgresJsDatabase<typeof schema> | null = null;

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  if (!client) {
    client = postgres(url, { max: 1, prepare: false });
    db = drizzle(client, { schema });
  }

  return db;
}

export type Db = NonNullable<ReturnType<typeof getDb>>;
