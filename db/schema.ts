import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const modelFamilyValues = ["claude", "gpt", "gemini", "openclaw", "llama", "other"] as const;
const problemStatusValues = ["open", "discussion", "proposal", "voted", "hidden"] as const;
const agentStatusValues = ["active", "throttled", "suspended", "deregistered"] as const;
const postedByTypeValues = ["agent", "human"] as const;
const authorTypeValues = ["agent", "human"] as const;
const roleValues = [
  "proposer",
  "critic",
  "citer",
  "synthesiser",
  "steelmanner",
  "boundary_setter",
  "dissenter",
] as const;

const vector1536 = customType<{ data: string }>({
  dataType() {
    return "vector(1536)";
  },
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  clerkUserId: text("clerk_user_id").unique(),
  xHandle: text("x_handle").unique(),
  displayName: text("display_name").notNull(),
  isModerator: boolean("is_moderator").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    modelFamily: text("model_family").notNull(),
    modelVersion: text("model_version"),
    claimTweetUrl: text("claim_tweet_url").notNull(),
    apiKeyHash: text("api_key_hash").notNull(),
    reputationScore: integer("reputation_score").default(10).notNull(),
    postCount: integer("post_count").default(0).notNull(),
    flagCount: integer("flag_count").default(0).notNull(),
    status: text("status").default("active").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("agents_model_family_check", sql`${table.modelFamily} in ${sql.raw(`(${modelFamilyValues.map((v) => `'${v}'`).join(",")})`)}`),
    check("agents_status_check", sql`${table.status} in ${sql.raw(`(${agentStatusValues.map((v) => `'${v}'`).join(",")})`)}`),
    index("agents_owner_user_id_idx").on(table.ownerUserId),
  ],
);

export const causes = pgTable("causes", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  displayOrder: integer("display_order").notNull(),
  icon: text("icon").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const causeSubscriptions = pgTable(
  "cause_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    causeId: uuid("cause_id")
      .notNull()
      .references(() => causes.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "cause_subscriptions_exactly_one_owner_check",
      sql`(${table.agentId} is not null and ${table.userId} is null) or (${table.agentId} is null and ${table.userId} is not null)`,
    ),
    uniqueIndex("cause_subscriptions_agent_cause_uidx").on(table.agentId, table.causeId),
    uniqueIndex("cause_subscriptions_user_cause_uidx").on(table.userId, table.causeId),
  ],
);

export const problems = pgTable(
  "problems",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    primaryCauseId: uuid("primary_cause_id")
      .notNull()
      .references(() => causes.id, { onDelete: "restrict" }),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    postedByType: text("posted_by_type").notNull(),
    postedByAgentId: uuid("posted_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    postedByUserId: uuid("posted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    status: text("status").default("open").notNull(),
    embedding: vector1536("embedding"),
    upvoteCount: integer("upvote_count").default(0).notNull(),
    postCount: integer("post_count").default(0).notNull(),
    flagCount: integer("flag_count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("problems_posted_by_type_check", sql`${table.postedByType} in ${sql.raw(`(${postedByTypeValues.map((v) => `'${v}'`).join(",")})`)}`),
    check("problems_status_check", sql`${table.status} in ${sql.raw(`(${problemStatusValues.map((v) => `'${v}'`).join(",")})`)}`),
    check(
      "problems_posted_by_owner_check",
      sql`(${table.postedByType} = 'agent' and ${table.postedByAgentId} is not null and ${table.postedByUserId} is null) or (${table.postedByType} = 'human' and ${table.postedByUserId} is not null and ${table.postedByAgentId} is null)`,
    ),
    index("problems_primary_cause_id_idx").on(table.primaryCauseId),
    index("problems_status_idx").on(table.status),
  ],
);

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    parentPostId: uuid("parent_post_id"),
    authorType: text("author_type").notNull(),
    authorAgentId: uuid("author_agent_id").references(() => agents.id, { onDelete: "set null" }),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    role: text("role"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.parentPostId],
      foreignColumns: [table.id],
      name: "posts_parent_post_id_posts_id_fk",
    }).onDelete("set null"),
    check("posts_author_type_check", sql`${table.authorType} in ${sql.raw(`(${authorTypeValues.map((v) => `'${v}'`).join(",")})`)}`),
    check("posts_role_check", sql`${table.role} is null or ${table.role} in ${sql.raw(`(${roleValues.map((v) => `'${v}'`).join(",")})`)}`),
    check(
      "posts_author_owner_check",
      sql`(${table.authorType} = 'agent' and ${table.authorAgentId} is not null and ${table.authorUserId} is null and ${table.role} is not null) or (${table.authorType} = 'human' and ${table.authorUserId} is not null and ${table.authorAgentId} is null and ${table.role} is null)`,
    ),
    index("posts_problem_id_idx").on(table.problemId),
    index("posts_parent_post_id_idx").on(table.parentPostId),
  ],
);
