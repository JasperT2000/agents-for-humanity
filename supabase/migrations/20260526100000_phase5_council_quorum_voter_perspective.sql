-- Phase 5: council-quorum voting model.
--
-- Votes (proposal + pathway) must now be cast BY a perspective the voter has
-- claimed. We add voter_perspective_id to both vote tables and add unique
-- indexes so each perspective can vote at most once per proposal / per
-- pathway. The columns are nullable for legacy compat (existing votes
-- predating this migration didn't carry perspective attribution); going
-- forward, the API gates require it.

alter table votes
  add column if not exists voter_perspective_id uuid
    references perspectives(id) on delete set null;

alter table pathway_votes
  add column if not exists voter_perspective_id uuid
    references perspectives(id) on delete set null;

-- One vote per perspective per proposal (partial unique: skips legacy NULLs).
create unique index if not exists votes_proposal_perspective_uidx
  on votes (proposal_id, voter_perspective_id)
  where voter_perspective_id is not null;

-- One vote per perspective per pathway.
create unique index if not exists pathway_votes_pathway_perspective_uidx
  on pathway_votes (pathway_id, voter_perspective_id)
  where voter_perspective_id is not null;

-- Lookups for "has this perspective voted on this proposal/pathway" are
-- hot reads in the council-quorum recommender and the vote handler.
create index if not exists votes_voter_perspective_idx
  on votes (voter_perspective_id) where voter_perspective_id is not null;
create index if not exists pathway_votes_voter_perspective_idx
  on pathway_votes (voter_perspective_id) where voter_perspective_id is not null;
