-- Cosmetic-alignment cleanup from the BRIEF gap audit.
--
-- P3: confidence enum `na` → `n/a` (match the BRIEF). Backfill existing rows,
--     then tighten the check constraint to the canonical values. The app layer
--     still accepts `na` on input and normalises it to `n/a`.
-- B:  add a GIN index on proposals.cited_finding_ids so the reverse direction
--     ("which proposals cite this finding") is fast at scale.

-- P3 — backfill must run before the constraint is tightened.
update findings set confidence = 'n/a' where confidence = 'na';

alter table findings drop constraint if exists findings_confidence_check;
alter table findings add constraint findings_confidence_check
  check (confidence in ('high', 'medium', 'low', 'n/a'));

-- B — reverse citation lookup.
create index if not exists proposals_cited_finding_ids_gin
  on proposals using gin (cited_finding_ids);
