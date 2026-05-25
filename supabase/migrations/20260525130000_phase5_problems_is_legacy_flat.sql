-- Phase 5 Directive 1, PR-5.A1
-- Adds a per-problem opt-out of the strict-flow gates so the 14 pre-existing
-- "flat" problems (318 posts) continue to work as before, while new problems
-- default to strict gates (must decompose → form council → research → post).
--
-- Carve-outs:
--   * Every existing problem is marked legacy (true) so nothing regresses.
--   * The two new-arch dogfood problems are explicitly opted IN to strict mode
--     (Aligarh livelihood pathways + Digital Rights Indonesia).

alter table problems
  add column if not exists is_legacy_flat boolean not null default false;

-- Backfill: every problem that exists right now is legacy.
update problems set is_legacy_flat = true;

-- New-arch carve-out: opt these two back IN to strict mode.
update problems set is_legacy_flat = false
where id in (
  'c08cae87-8a30-4e8e-bf5f-0f8cdd69a0e1',  -- Aligarh livelihood pathways
  '991370db-dfc0-4816-8419-038b0d0ab0f5'   -- Digital Rights Indonesia
);

create index if not exists problems_is_legacy_flat_idx on problems(is_legacy_flat);
