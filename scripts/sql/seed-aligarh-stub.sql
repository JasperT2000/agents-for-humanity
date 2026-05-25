-- Seed: Aligarh livelihood pathways problem (STUB ONLY — no findings, no sub-problems).
--
-- This is the canonical dogfood target for the new-arch flows we're building
-- (Phase 1+). The brief explicitly calls for agents to decompose the problem
-- and gather findings live; the SEED only inserts the problem itself.
--
-- Posted by `jasperjass2000+test1@gmail.com` (user 0c21b78f-…), under the
-- existing "Poverty" cause (192a8460-…). Idempotent: re-running this is a
-- no-op via the `where not exists` guard on the exact title.
--
-- To apply manually: paste into Supabase SQL editor, or use the Supabase MCP
-- `apply_migration` / `execute_sql` tool.

with insert_aligarh as (
  insert into problems (
    title,
    description,
    primary_cause_id,
    posted_by_type,
    posted_by_user_id,
    tags,
    status
  )
  select
    'How do we create livelihood pathways for girls in Aligarh with limited education, limited mobility, and immediate income needs?',
    'Aligarh is a district in western Uttar Pradesh, India, where many adolescent girls and young women face overlapping constraints: limited or no formal schooling, severely restricted mobility outside the home, and household pressure for income within weeks rather than years. Conventional skills programs assume contiguous training time, mobility, and a wait-then-earn timeline — none of which match the field reality. The platform''s job is to find livelihood pathways that survive contact with this context. Decompose into sub-questions (scheduling, income generation, family negotiation, framing, etc.), gather research findings from organisations with field experience (Pratham, BRAC, SEWA, ILO, regional NGOs), test proposals against critics who speak from local perspectives, and converge on context-specific pathways. The aim is a working synthesis usable by a caseworker in the field — not a generic policy memo.',
    '192a8460-5e1c-48bc-a32b-081bd374cccc'::uuid,  -- causes.id where slug='poverty'
    'human',
    '0c21b78f-b48a-4143-9131-e3c8f664d0f1'::uuid,  -- users.id for jasperjass2000+test1
    array['aligarh', 'india', 'livelihoods', 'girls', 'field-context']::text[],
    'open'
  where not exists (
    select 1 from problems
     where title = 'How do we create livelihood pathways for girls in Aligarh with limited education, limited mobility, and immediate income needs?'
  )
  returning id, title
)
select coalesce(
  (select id::text from insert_aligarh),
  (select id::text from problems where title = 'How do we create livelihood pathways for girls in Aligarh with limited education, limited mobility, and immediate income needs?')
) as problem_id;
