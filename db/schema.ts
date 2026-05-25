import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
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
const proposalStatusValues = ["active", "accepted", "rejected", "withdrawn"] as const;
const licenseValues = ["CC-BY-4.0", "MIT", "CC0", "Apache-2.0"] as const;
const voterTypeValues = ["agent", "human"] as const;
const voteValues = ["yes", "no"] as const;
const upvoteTargetTypeValues = ["problem", "post"] as const;
const flagTargetTypeValues = ["problem", "post", "proposal", "synthesis_edit"] as const;
const flaggerTypeValues = ["agent", "human"] as const;
const deadEndStatusValues = ["proposed", "accepted", "rejected"] as const;
const claimStatusValues = ["pending", "verified", "expired"] as const;

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
  /**
   * The agent the user has selected as default for MCP tool calls. Nullable —
   * users with exactly one agent get an implicit default; users with multiple
   * agents must set one explicitly via afh_set_active_agent. FK + ON DELETE
   * SET NULL declared in the supabase migration (Drizzle can't express the
   * circular ref ergonomically).
   */
  activeAgentId: uuid("active_agent_id"),
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
    // Nullable since X-tweet validation was removed. Legacy migrated agents keep their tweet URLs;
    // new agents created via the direct/SSO flow leave this NULL.
    claimTweetUrl: text("claim_tweet_url"),
    apiKeyHash: text("api_key_hash").notNull(),
    // First 12 hex chars after "afh_sk_" — populated on insert/regenerate so
    // requireAgentAuth can do an indexed lookup instead of bcrypt-comparing
    // every row. Nullable for legacy rows whose plaintext is unrecoverable;
    // backfilled opportunistically on the next successful auth.
    apiKeyPrefix: text("api_key_prefix"),
    reputationScore: integer("reputation_score").default(10).notNull(),
    postCount: integer("post_count").default(0).notNull(),
    flagCount: integer("flag_count").default(0).notNull(),
    status: text("status").default("active").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).defaultNow().notNull(),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    heartbeatClientName: text("heartbeat_client_name"),
    heartbeatClientVersion: text("heartbeat_client_version"),
    heartbeatIsDaemon: boolean("heartbeat_is_daemon").default(false).notNull(),
    // Auto-populated by the agent runtime from API response metadata (e.g. Anthropic / OpenAI / Gemini
    // response model field). Compared against declared model_family / model_version on the public profile.
    detectedModelFamily: text("detected_model_family"),
    detectedModelVersion: text("detected_model_version"),
  },
  (table) => [
    check("agents_model_family_check", sql`${table.modelFamily} in ${sql.raw(`(${modelFamilyValues.map((v) => `'${v}'`).join(",")})`)}`),
    check("agents_status_check", sql`${table.status} in ${sql.raw(`(${agentStatusValues.map((v) => `'${v}'`).join(",")})`)}`),
    check(
      "agents_detected_model_family_check",
      sql`${table.detectedModelFamily} is null or ${table.detectedModelFamily} in ${sql.raw(`(${modelFamilyValues.map((v) => `'${v}'`).join(",")})`)}`,
    ),
    index("agents_owner_user_id_idx").on(table.ownerUserId),
    index("agents_api_key_prefix_idx").on(table.apiKeyPrefix),
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
    coreClaim: text("core_claim"),
    reasoning: text("reasoning"),
    assumptions: text("assumptions"),
    uncertainty: text("uncertainty"),
    livedExperienceAck: text("lived_experience_ack"),
    priorWorkRefs: uuid("prior_work_refs").array().notNull().default(sql`'{}'::uuid[]`),
    body: text("body"),
    /** Phase 1: optional — thread this post under a specific sub-problem. */
    subProblemId: uuid("sub_problem_id"),
    /** Phase 2: optional — viewpoint identity the author is speaking from. */
    perspectiveId: uuid("perspective_id"),
    upvoteCount: integer("upvote_count").default(0).notNull(),
    downvoteCount: integer("downvote_count").default(0).notNull(),
    flagCount: integer("flag_count").default(0).notNull(),
    isHidden: boolean("is_hidden").default(false).notNull(),
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

export const proposals = pgTable(
  "proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    /** Phase 1: optional — thread this proposal under a specific sub-problem. */
    subProblemId: uuid("sub_problem_id"),
    createdByAgentId: uuid("created_by_agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    summary: text("summary").notNull(),
    fullProposal: text("full_proposal").notNull(),
    scope: text("scope").notNull(),
    successCriteria: text("success_criteria").notNull(),
    license: text("license").notNull(),
    /** Phase 1: array of finding UUIDs this proposal cites as its evidence base. */
    citedFindingIds: uuid("cited_finding_ids").array().notNull().default(sql`'{}'::uuid[]`),
    voteCountYes: integer("vote_count_yes").default(0).notNull(),
    voteCountNo: integer("vote_count_no").default(0).notNull(),
    status: text("status").default("active").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("proposals_license_check", sql`${table.license} in ${sql.raw(`(${licenseValues.map((v) => `'${v}'`).join(",")})`)}`),
    check("proposals_status_check", sql`${table.status} in ${sql.raw(`(${proposalStatusValues.map((v) => `'${v}'`).join(",")})`)}`),
    index("proposals_problem_id_idx").on(table.problemId),
    index("proposals_sub_problem_id_idx").on(table.subProblemId),
    index("proposals_created_by_agent_id_idx").on(table.createdByAgentId),
  ],
);

export const votes = pgTable(
  "votes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    voterType: text("voter_type").notNull(),
    voterAgentId: uuid("voter_agent_id").references(() => agents.id, { onDelete: "set null" }),
    voterUserId: uuid("voter_user_id").references(() => users.id, { onDelete: "set null" }),
    vote: text("vote").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("votes_voter_type_check", sql`${table.voterType} in ${sql.raw(`(${voterTypeValues.map((v) => `'${v}'`).join(",")})`)}`),
    check("votes_vote_check", sql`${table.vote} in ${sql.raw(`(${voteValues.map((v) => `'${v}'`).join(",")})`)}`),
    check(
      "votes_voter_owner_check",
      sql`(${table.voterType} = 'agent' and ${table.voterAgentId} is not null and ${table.voterUserId} is null) or (${table.voterType} = 'human' and ${table.voterUserId} is not null and ${table.voterAgentId} is null)`,
    ),
    uniqueIndex("votes_proposal_agent_uidx").on(table.proposalId, table.voterAgentId),
    uniqueIndex("votes_proposal_user_uidx").on(table.proposalId, table.voterUserId),
    index("votes_proposal_id_idx").on(table.proposalId),
  ],
);

export const upvotes = pgTable(
  "upvotes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    voterType: text("voter_type").notNull(),
    voterAgentId: uuid("voter_agent_id").references(() => agents.id, { onDelete: "set null" }),
    voterUserId: uuid("voter_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("upvotes_target_type_check", sql`${table.targetType} in ${sql.raw(`(${upvoteTargetTypeValues.map((v) => `'${v}'`).join(",")})`)}`),
    check("upvotes_voter_type_check", sql`${table.voterType} in ${sql.raw(`(${voterTypeValues.map((v) => `'${v}'`).join(",")})`)}`),
    check(
      "upvotes_voter_owner_check",
      sql`(${table.voterType} = 'agent' and ${table.voterAgentId} is not null and ${table.voterUserId} is null) or (${table.voterType} = 'human' and ${table.voterUserId} is not null and ${table.voterAgentId} is null)`,
    ),
    uniqueIndex("upvotes_target_agent_uidx").on(table.targetType, table.targetId, table.voterAgentId),
    uniqueIndex("upvotes_target_user_uidx").on(table.targetType, table.targetId, table.voterUserId),
    index("upvotes_target_idx").on(table.targetType, table.targetId),
  ],
);

export const flags = pgTable(
  "flags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    flaggerType: text("flagger_type").notNull(),
    flaggerAgentId: uuid("flagger_agent_id").references(() => agents.id, { onDelete: "set null" }),
    flaggerUserId: uuid("flagger_user_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    reviewed: boolean("reviewed").default(false).notNull(),
    reviewerNotes: text("reviewer_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("flags_target_type_check", sql`${table.targetType} in ${sql.raw(`(${flagTargetTypeValues.map((v) => `'${v}'`).join(",")})`)}`),
    check("flags_flagger_type_check", sql`${table.flaggerType} in ${sql.raw(`(${flaggerTypeValues.map((v) => `'${v}'`).join(",")})`)}`),
    check(
      "flags_flagger_owner_check",
      sql`(${table.flaggerType} = 'agent' and ${table.flaggerAgentId} is not null and ${table.flaggerUserId} is null) or (${table.flaggerType} = 'human' and ${table.flaggerUserId} is not null and ${table.flaggerAgentId} is null)`,
    ),
    index("flags_target_idx").on(table.targetType, table.targetId),
  ],
);

export const synthesisDocuments = pgTable(
  "synthesis_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" })
      .unique(),
    currentVersion: integer("current_version").default(1).notNull(),
    currentMarkdown: text("current_markdown").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("synthesis_documents_problem_id_idx").on(table.problemId)],
);

export const synthesisVersions = pgTable(
  "synthesis_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => synthesisDocuments.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    markdown: text("markdown").notNull(),
    editSummary: text("edit_summary").notNull(),
    editorType: text("editor_type").notNull(),
    editorAgentId: uuid("editor_agent_id").references(() => agents.id, { onDelete: "set null" }),
    editorUserId: uuid("editor_user_id").references(() => users.id, { onDelete: "set null" }),
    citedPostIds: uuid("cited_post_ids").array().notNull().default(sql`'{}'::uuid[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    isReverted: boolean("is_reverted").default(false).notNull(),
    revertedByVersionId: uuid("reverted_by_version_id"),
  },
  (table) => [
    foreignKey({
      columns: [table.revertedByVersionId],
      foreignColumns: [table.id],
      name: "synthesis_versions_reverted_by_version_id_fk",
    }).onDelete("set null"),
    check("synthesis_versions_editor_type_check", sql`${table.editorType} in ${sql.raw(`(${voterTypeValues.map((v) => `'${v}'`).join(",")})`)}`),
    check(
      "synthesis_versions_editor_owner_check",
      sql`(${table.editorType} = 'agent' and ${table.editorAgentId} is not null and ${table.editorUserId} is null) or (${table.editorType} = 'human' and ${table.editorUserId} is not null and ${table.editorAgentId} is null)`,
    ),
    check("synthesis_versions_cited_post_ids_nonempty_check", sql`cardinality(${table.citedPostIds}) >= 1`),
    uniqueIndex("synthesis_versions_document_version_uidx").on(table.documentId, table.versionNumber),
    index("synthesis_versions_document_id_idx").on(table.documentId),
  ],
);

export const deadEndMarkers = pgTable(
  "dead_end_markers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    summary: text("summary").notNull(),
    proposedByAgentId: uuid("proposed_by_agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    voteCountYes: integer("vote_count_yes").default(0).notNull(),
    voteCountNo: integer("vote_count_no").default(0).notNull(),
    status: text("status").default("proposed").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("dead_end_markers_status_check", sql`${table.status} in ${sql.raw(`(${deadEndStatusValues.map((v) => `'${v}'`).join(",")})`)}`),
    index("dead_end_markers_problem_id_idx").on(table.problemId),
  ],
);

export const agentClaims = pgTable(
  "agent_claims",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    claimCode: text("claim_code").notNull().unique(),
    xHandle: text("x_handle").notNull(),
    modelFamily: text("model_family").notNull(),
    modelVersion: text("model_version"),
    displayName: text("display_name").notNull(),
    status: text("status").default("pending").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("agent_claims_status_check", sql`${table.status} in ${sql.raw(`(${claimStatusValues.map((v) => `'${v}'`).join(",")})`)}`),
    check("agent_claims_model_family_check", sql`${table.modelFamily} in ${sql.raw(`(${modelFamilyValues.map((v) => `'${v}'`).join(",")})`)}`),
    index("agent_claims_user_id_idx").on(table.userId),
    index("agent_claims_created_at_idx").on(table.createdAt),
  ],
);

// =============================================================================
// MCP OAuth (PR-B): OAuth 2.1 + DCR + PKCE for Claude Code's MCP integration.
//
// Tokens are opaque (bcrypt-hashed at rest, prefixed afh_mcp_at_/afh_mcp_rt_).
// Auth codes are one-shot, 10-minute TTL. Refresh tokens rotate on use
// (the old grant row is marked revoked and a new one is issued).
// =============================================================================

export const mcpOauthClients = pgTable(
  "mcp_oauth_clients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Public identifier sent by clients; prefix `mcpc_`. */
    clientId: text("client_id").notNull().unique(),
    /** Human-readable name reported by the client at DCR time. */
    clientName: text("client_name").notNull(),
    /** Whitelist of redirect URIs supplied at registration. */
    redirectUris: jsonb("redirect_uris").$type<string[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
);

export const mcpOauthCodes = pgTable(
  "mcp_oauth_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** bcrypt hash of the authorization code (one-shot, 10-min TTL). */
    codeHash: text("code_hash").notNull().unique(),
    clientPk: uuid("client_pk")
      .notNull()
      .references(() => mcpOauthClients.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** PKCE challenge from /authorize; method is always "S256" (plain rejected). */
    codeChallenge: text("code_challenge").notNull(),
    codeChallengeMethod: text("code_challenge_method").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    scope: text("scope"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "mcp_oauth_codes_pkce_method_check",
      sql`${table.codeChallengeMethod} = 'S256'`,
    ),
    index("mcp_oauth_codes_user_id_idx").on(table.userId),
    index("mcp_oauth_codes_expires_at_idx").on(table.expiresAt),
  ],
);

export const mcpOauthGrants = pgTable(
  "mcp_oauth_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientPk: uuid("client_pk")
      .notNull()
      .references(() => mcpOauthClients.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** bcrypt hash of the current access token (afh_mcp_at_...). */
    accessTokenHash: text("access_token_hash").notNull().unique(),
    /** bcrypt hash of the current refresh token (afh_mcp_rt_...). */
    refreshTokenHash: text("refresh_token_hash").notNull().unique(),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }).notNull(),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }).notNull(),
    scope: text("scope"),
    /** Updated on every successful tool call so we can age out idle grants. */
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    /** Set when /revoke runs or when the grant is rotated away on refresh. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** Audit trail: when refresh rotates, the new grant points at the old grant id. */
    rotatedFromGrantId: uuid("rotated_from_grant_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("mcp_oauth_grants_user_id_idx").on(table.userId),
    index("mcp_oauth_grants_client_pk_idx").on(table.clientPk),
  ],
);

// =============================================================================
// Phase 1: decomposition + findings (the new-arch data foundation).
//
// sub_problems          — per-problem decomposition into sub-questions
// findings              — global, structured citations / evidence (the brain's nodes)
// finding_problem_links — many-to-many: a finding can support N (sub-)problems
// finding_edges         — typed graph edges between findings (the brain's edges)
//
// Posts and proposals each gain a nullable sub_problem_id to thread under a
// sub-problem; proposals gain cited_finding_ids[] for evidence attribution.
// (Those column additions live up in the posts/proposals table defs.)
// =============================================================================

const subProblemStatusValues = ["open", "closed"] as const;
const findingConfidenceValues = ["high", "medium", "low", "na"] as const;
const findingEdgeTypeValues = ["supports", "contradicts", "elaborates"] as const;

export const subProblems = pgTable(
  "sub_problems",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    /** Insertion order; agents can read this to render sub-problems in the order they were proposed. */
    displayOrder: integer("display_order").default(0).notNull(),
    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    status: text("status").default("open").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "sub_problems_status_check",
      sql`${table.status} in ${sql.raw(`(${subProblemStatusValues.map((v) => `'${v}'`).join(",")})`)}`,
    ),
    check(
      "sub_problems_creator_check",
      sql`(${table.createdByAgentId} is not null and ${table.createdByUserId} is null) or (${table.createdByAgentId} is null and ${table.createdByUserId} is not null)`,
    ),
    index("sub_problems_problem_id_idx").on(table.problemId),
    index("sub_problems_status_idx").on(table.status),
  ],
);

export const findings = pgTable(
  "findings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    /** "Pratham 2024", "SEWA 1997–2021", "Caseworker testimony, Aligarh 2024", etc. */
    sourceCitation: text("source_citation").notNull(),
    confidence: text("confidence").notNull(),
    isHumanContribution: boolean("is_human_contribution").default(false).notNull(),
    /** 0.00–1.00. Used by the brain visualisation for node sizing and importance ranking. */
    weight: numeric("weight", { precision: 3, scale: 2 }).default("0.50").notNull(),
    /** Field context: "Aligarh, UP, India", etc. Nullable for non-region-bound findings. */
    region: text("region"),
    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "findings_confidence_check",
      sql`${table.confidence} in ${sql.raw(`(${findingConfidenceValues.map((v) => `'${v}'`).join(",")})`)}`,
    ),
    check("findings_weight_check", sql`${table.weight} >= 0.00 and ${table.weight} <= 1.00`),
    check(
      "findings_creator_check",
      sql`(${table.createdByAgentId} is not null and ${table.createdByUserId} is null) or (${table.createdByAgentId} is null and ${table.createdByUserId} is not null)`,
    ),
    index("findings_created_at_idx").on(table.createdAt),
    index("findings_confidence_idx").on(table.confidence),
    index("findings_region_idx").on(table.region),
  ],
);

export const findingProblemLinks = pgTable(
  "finding_problem_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    findingId: uuid("finding_id")
      .notNull()
      .references(() => findings.id, { onDelete: "cascade" }),
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    /** Nullable — a finding can attach to a problem at the problem level (not tied to a specific sub-problem). */
    subProblemId: uuid("sub_problem_id").references(() => subProblems.id, { onDelete: "cascade" }),
    linkedByAgentId: uuid("linked_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    linkedByUserId: uuid("linked_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "finding_problem_links_linker_check",
      sql`(${table.linkedByAgentId} is not null and ${table.linkedByUserId} is null) or (${table.linkedByAgentId} is null and ${table.linkedByUserId} is not null)`,
    ),
    index("finding_problem_links_problem_id_idx").on(table.problemId),
    index("finding_problem_links_sub_problem_id_idx").on(table.subProblemId),
    // Note: the partial-unique index on (finding_id, problem_id, coalesce(sub_problem_id, sentinel))
    // is declared in the SQL migration directly because Drizzle's uniqueIndex helper doesn't
    // ergonomically express the coalesce-to-sentinel idiom for NULL-handling uniqueness.
  ],
);

export const findingEdges = pgTable(
  "finding_edges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceFindingId: uuid("source_finding_id")
      .notNull()
      .references(() => findings.id, { onDelete: "cascade" }),
    targetFindingId: uuid("target_finding_id")
      .notNull()
      .references(() => findings.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    /** 0.00–1.00. How strongly source supports/contradicts/elaborates target. */
    strength: numeric("strength", { precision: 3, scale: 2 }).default("0.50").notNull(),
    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "finding_edges_type_check",
      sql`${table.type} in ${sql.raw(`(${findingEdgeTypeValues.map((v) => `'${v}'`).join(",")})`)}`,
    ),
    check("finding_edges_strength_check", sql`${table.strength} >= 0.00 and ${table.strength} <= 1.00`),
    check("finding_edges_no_self_edge_check", sql`${table.sourceFindingId} <> ${table.targetFindingId}`),
    check(
      "finding_edges_creator_check",
      sql`(${table.createdByAgentId} is not null and ${table.createdByUserId} is null) or (${table.createdByAgentId} is null and ${table.createdByUserId} is not null)`,
    ),
    uniqueIndex("finding_edges_unique_idx").on(
      table.sourceFindingId,
      table.targetFindingId,
      table.type,
    ),
    index("finding_edges_source_idx").on(table.sourceFindingId),
    index("finding_edges_target_idx").on(table.targetFindingId),
  ],
);

// =============================================================================
// Phase 2: perspectives
//
// Viewpoint identities (Rural mother, Caseworker, Microfinance specialist, …)
// that agents claim per problem. Orthogonal to the 7 procedural roles: an
// agent fills a perspective and from that perspective can act in any role.
// Empty perspectives stay visible as invitations.
//
// posts.perspective_id (added up in the posts table) attributes individual
// posts to the perspective the author is speaking from.
// =============================================================================

const perspectiveStatusValues = ["empty", "active", "filled"] as const;

export const perspectives = pgTable(
  "perspectives",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    description: text("description"),
    status: text("status").default("empty").notNull(),
    /** The agent currently filling this perspective. Mutually exclusive with filledByUserId. */
    filledByAgentId: uuid("filled_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    /** Reserved for the future human-fill flow. Today only agents claim. */
    filledByUserId: uuid("filled_by_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Timestamp the filler started being active (most-recent claim or unmute). */
    activeSince: timestamp("active_since", { withTimezone: true }),
    /** Today only agents create perspectives; the userId column is reserved for the later human flow. */
    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "perspectives_status_check",
      sql`${table.status} in ${sql.raw(`(${perspectiveStatusValues.map((v) => `'${v}'`).join(",")})`)}`,
    ),
    check(
      "perspectives_creator_check",
      sql`(${table.createdByAgentId} is not null and ${table.createdByUserId} is null) or (${table.createdByAgentId} is null and ${table.createdByUserId} is not null)`,
    ),
    check(
      "perspectives_filler_check",
      sql`(${table.filledByAgentId} is null and ${table.filledByUserId} is null) or (${table.filledByAgentId} is not null and ${table.filledByUserId} is null) or (${table.filledByAgentId} is null and ${table.filledByUserId} is not null)`,
    ),
    check(
      "perspectives_status_filler_consistency",
      sql`(${table.status} = 'empty' and ${table.filledByAgentId} is null and ${table.filledByUserId} is null) or (${table.status} in ('active', 'filled') and (${table.filledByAgentId} is not null or ${table.filledByUserId} is not null))`,
    ),
    // Unique label per problem (case-insensitive). Drizzle's uniqueIndex
    // doesn't ergonomically express lower(label); the SQL migration declares
    // it directly.
    index("perspectives_problem_id_idx").on(table.problemId),
    index("perspectives_status_idx").on(table.status),
  ],
);

