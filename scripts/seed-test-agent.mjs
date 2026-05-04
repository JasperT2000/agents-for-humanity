/**
 * DEV ONLY — seeds a test agent directly into the DB, bypassing X/Twitter
 * claim-tweet verification. Use this when you don't have an X account or
 * when you want a quick API key for local testing.
 *
 * Usage:
 *   node scripts/seed-test-agent.mjs
 *
 * Outputs an afh_sk_... key you can use immediately with any Phase 4 endpoint.
 * Run as many times as you like — each run creates a fresh agent.
 */

import { randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is missing in .env.local");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

const API_KEY_PREFIX = "afh_sk_";
const TEST_USER_EMAIL = "dev-test@localhost";
const BCRYPT_ROUNDS = 12;

async function main() {
  // ── 1. Ensure a test user exists ─────────────────────────────────────────
  const [user] = await sql`
    INSERT INTO users (email, display_name, is_moderator)
    VALUES (${TEST_USER_EMAIL}, 'Dev Test User', false)
    ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
    RETURNING id, email, display_name
  `;

  console.log(`\nTest user: ${user.display_name} (${user.id})`);

  // ── 2. Generate and hash a fresh API key ──────────────────────────────────
  const plaintextKey = `${API_KEY_PREFIX}${randomBytes(32).toString("hex")}`;
  const apiKeyHash = await bcrypt.hash(plaintextKey, BCRYPT_ROUNDS);

  // ── 3. Insert the test agent ──────────────────────────────────────────────
  const [agent] = await sql`
    INSERT INTO agents (
      owner_user_id,
      display_name,
      model_family,
      model_version,
      claim_tweet_url,
      api_key_hash,
      reputation_score,
      status
    ) VALUES (
      ${user.id},
      'Dev Test Agent',
      'claude',
      'dev-bridge',
      'https://x.com/dev_test/status/0000000000000000000',
      ${apiKeyHash},
      10,
      'active'
    )
    RETURNING id, display_name, model_family, status, created_at
  `;

  // ── 4. Print results ──────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(60)}`);
  console.log("TEST AGENT CREATED");
  console.log(`${"─".repeat(60)}`);
  console.log(`Agent ID   : ${agent.id}`);
  console.log(`Name       : ${agent.display_name}`);
  console.log(`Model      : ${agent.model_family}`);
  console.log(`Status     : ${agent.status}`);
  console.log(`Created    : ${agent.created_at}`);
  console.log(`${"─".repeat(60)}`);
  console.log("API KEY (copy this — it will NOT be shown again):");
  console.log(`\n  ${plaintextKey}\n`);
  console.log(`${"─".repeat(60)}`);
  console.log("Quick test:");
  console.log(`  curl -X POST http://localhost:3000/api/v1/problems \\`);
  console.log(`    -H "Authorization: Bearer ${plaintextKey}" \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -d '{"title":"Test problem title here (min 10 chars)","description":"This is a test description that is long enough to pass the 100 character minimum validation requirement for the description field.","primary_cause_id":"<cause-uuid>","tags":[]}'`);
  console.log(`${"─".repeat(60)}\n`);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
