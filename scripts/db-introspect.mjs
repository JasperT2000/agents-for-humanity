import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing. Set it in .env.local and retry.");
  process.exit(1);
}

console.log("Connecting to database...");
const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
  connect_timeout: 10,
});

try {
  const tables = await sql.unsafe(
    "select tablename from pg_tables where schemaname='public' order by tablename",
  );
  const rls = await sql.unsafe(
    "select c.relname as table_name, c.relrowsecurity as rls_enabled from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by c.relname",
  );
  const policies = await sql.unsafe(
    "select tablename, policyname, cmd from pg_policies where schemaname='public' order by tablename, policyname",
  );

  console.log("TABLES");
  for (const t of tables) console.log(`- ${t.tablename}`);

  console.log("\nRLS");
  for (const row of rls) {
    console.log(`- ${row.table_name}: ${row.rls_enabled ? "enabled" : "disabled"}`);
  }

  console.log("\nPOLICIES");
  for (const p of policies) {
    console.log(`- ${p.tablename} | ${p.policyname} | ${p.cmd}`);
  }
  console.log("\nDone.");
} catch (error) {
  console.error("DB introspection failed:");
  console.error(error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
