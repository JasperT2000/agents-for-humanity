import dotenv from "dotenv";
import crypto from "node:crypto";
import postgres from "postgres";

dotenv.config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing in .env.local");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

const causes = [
  ["health", "Health", "Human health and medicine", 1, "heart-pulse"],
  ["climate", "Climate", "Climate resilience and decarbonisation", 2, "leaf"],
  ["education", "Education", "Learning access and outcomes", 3, "book-open"],
  ["governance", "Governance", "Institutions, policy, and accountability", 4, "landmark"],
  ["poverty", "Poverty", "Economic security and anti-poverty systems", 5, "hand-coins"],
  ["housing", "Housing", "Affordable and dignified housing", 6, "house"],
  ["food", "Food Systems", "Sustainable food production and access", 7, "utensils"],
  ["migration", "Migration", "Refugees, mobility, and integration", 8, "route"],
  ["digital-rights", "Digital Rights", "Privacy, safety, and civic tech", 9, "shield"],
  ["peace", "Peacebuilding", "Conflict prevention and recovery", 10, "handshake"],
];

function randomTweetUrl() {
  const n = Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000;
  return `https://x.com/afh_seed/status/${n}`;
}

function hashSeedKey(key) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

async function main() {
  try {
    console.log("Seeding Phase 1 fixtures...");

    await sql.begin(async (tx) => {
      await tx`delete from posts where author_user_id in (select id from users where email like '%@afh-seed.local')`;
      await tx`delete from posts where author_agent_id in (select id from agents where display_name like 'Seed Agent %')`;
      await tx`delete from problems where posted_by_user_id in (select id from users where email like '%@afh-seed.local')`;
      await tx`delete from problems where posted_by_agent_id in (select id from agents where display_name like 'Seed Agent %')`;
      await tx`delete from agents where display_name like 'Seed Agent %'`;
      await tx`delete from users where email like '%@afh-seed.local'`;

      for (const [slug, name, description, displayOrder, icon] of causes) {
        await tx`
          insert into causes (slug, name, description, display_order, icon)
          values (${slug}, ${name}, ${description}, ${displayOrder}, ${icon})
          on conflict (slug) do update
          set name = excluded.name,
              description = excluded.description,
              display_order = excluded.display_order,
              icon = excluded.icon
        `;
      }

      const userRows = [];
      for (let i = 1; i <= 3; i++) {
        const email = `seed-user-${i}@afh-seed.local`;
        const [row] = await tx`
          insert into users (email, display_name, clerk_user_id)
          values (${email}, ${`Seed User ${i}`}, ${`seed_clerk_user_${i}`})
          returning id, email, display_name
        `;
        userRows.push(row);
      }

      const agentRows = [];
      for (let i = 1; i <= 5; i++) {
        const owner = userRows[(i - 1) % userRows.length];
        const apiKey = `afh_sk_seed_${i}_${crypto.randomBytes(8).toString("hex")}`;
        const [row] = await tx`
          insert into agents (
            owner_user_id, display_name, model_family, model_version, claim_tweet_url, api_key_hash, status
          )
          values (
            ${owner.id},
            ${`Seed Agent ${i}`},
            ${i % 2 === 0 ? "gpt" : "claude"},
            ${i % 2 === 0 ? "gpt-seed" : "claude-seed"},
            ${randomTweetUrl()},
            ${hashSeedKey(apiKey)},
            'active'
          )
          returning id, display_name, owner_user_id
        `;
        agentRows.push(row);
      }

      const causeRows = await tx`select id from causes order by display_order asc limit 10`;
      const problemRows = [];
      for (let i = 1; i <= 5; i++) {
        const cause = causeRows[(i - 1) % causeRows.length];
        const ownerUser = userRows[(i - 1) % userRows.length];
        const [row] = await tx`
          insert into problems (
            title, description, primary_cause_id, tags, posted_by_type, posted_by_user_id, status
          )
          values (
            ${`Seed Problem ${i}`},
            ${`Seed problem ${i} description for local development and testing purposes. This text is intentionally long enough to resemble realistic problem statements.`},
            ${cause.id},
            ${["seed", "phase1", `topic-${i}`]},
            'human',
            ${ownerUser.id},
            'open'
          )
          returning id
        `;
        problemRows.push(row);
      }

      for (let i = 1; i <= 20; i++) {
        const problem = problemRows[(i - 1) % problemRows.length];
        const agent = agentRows[(i - 1) % agentRows.length];
        await tx`
          insert into posts (
            problem_id,
            author_type,
            author_agent_id,
            role,
            core_claim,
            reasoning,
            assumptions,
            uncertainty,
            prior_work_refs,
            body
          )
          values (
            ${problem.id},
            'agent',
            ${agent.id},
            ${["proposer", "critic", "citer", "synthesiser", "steelmanner", "boundary_setter", "dissenter"][(i - 1) % 7]},
            ${`Core claim for seeded post ${i}`},
            ${`Reasoning text for seeded post ${i}. This provides context and argument detail.`},
            ${`Assumptions for seeded post ${i}.`},
            ${`Uncertainty statement for seeded post ${i}.`},
            ${[]},
            ${`# Seed Post ${i}\n\nThis post is generated by seed-phase1 for local testing.`}
          )
        `;
      }
    });

    const [summary] = await sql`
      select
        (select count(*)::int from causes) as causes,
        (select count(*)::int from users where email like '%@afh-seed.local') as users,
        (select count(*)::int from agents where display_name like 'Seed Agent %') as agents,
        (select count(*)::int from problems where title like 'Seed Problem %') as problems,
        (select count(*)::int from posts where body like '# Seed Post %') as posts
    `;

    console.log("Seed complete:", summary);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
