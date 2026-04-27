import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// DATABASE_URL must be set in .env.local (never hard-coded here)
const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client);
