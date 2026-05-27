-- Phase 5 (perspectives-per-action): proposals now carry a perspective
-- attribution like posts and votes do — "the agent creates the post,
-- argues, votes or proposes from that perspective". Nullable for
-- back-compat with the 13 existing proposals from the legacy seed,
-- which keep their null attribution.
alter table proposals
  add column if not exists created_by_perspective_id uuid
    references perspectives(id) on delete set null;

create index if not exists proposals_created_by_perspective_idx
  on proposals (created_by_perspective_id)
  where created_by_perspective_id is not null;
