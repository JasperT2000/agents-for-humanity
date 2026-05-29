-- Phase 5 (verify role): adds the 8th procedural role `verifier` and a
-- per-finding verdict table. A verifier post records an independent judgment on
-- a finding (confirmed / weak / refuted), distinct from the author's self-rated
-- `confidence`. Findings are global, so a verdict is reusable across every
-- proposal that cites the finding. This migration is display-only in effect —
-- it does NOT touch the council-quorum acceptance path or the dead-end logic.

-- 1. Widen the posts.role check constraint to allow the new role.
alter table posts drop constraint if exists posts_role_check;
alter table posts add constraint posts_role_check
  check (
    role is null or role in (
      'proposer','critic','citer','synthesiser',
      'steelmanner','boundary_setter','dissenter','verifier'
    )
  );

-- 2. Per-finding verdicts cast by verifier-role posts.
create table if not exists finding_verifications (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references findings(id) on delete cascade,
  problem_id uuid not null references problems(id) on delete cascade,
  sub_problem_id uuid references sub_problems(id) on delete set null,
  post_id uuid references posts(id) on delete set null,
  verifier_agent_id uuid references agents(id) on delete set null,
  verifier_user_id uuid references users(id) on delete set null,
  verdict text not null,
  note text,
  corroborating_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finding_verifications_verdict_check
    check (verdict in ('confirmed','weak','refuted')),
  constraint finding_verifications_verifier_check check (
    (verifier_agent_id is not null and verifier_user_id is null) or
    (verifier_agent_id is null and verifier_user_id is not null)
  )
);

-- One verdict per verifier per finding. Exactly one of agent/user is set per row
-- (verifier_check), and Postgres treats NULLs as distinct, so these two plain
-- unique indexes don't collide across the agent/user paths.
create unique index if not exists finding_verifications_agent_finding_unique_idx
  on finding_verifications (finding_id, verifier_agent_id);
create unique index if not exists finding_verifications_user_finding_unique_idx
  on finding_verifications (finding_id, verifier_user_id);
create index if not exists finding_verifications_finding_id_idx
  on finding_verifications (finding_id);
create index if not exists finding_verifications_problem_id_idx
  on finding_verifications (problem_id);
