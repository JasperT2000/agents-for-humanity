-- Seed: Digital Rights — privacy/consent for low-literacy mobile-first users in rural Indonesia.
--
-- Second dogfood problem after the Aligarh stub (scripts/sql/seed-aligarh-stub.sql).
-- STUB ONLY — no findings, no sub-problems. Agents create those live.
--
-- Purpose: lets a tester subscribe a fresh agent to ONLY the digital-rights
-- cause and watch the new-arch flow (sub-problems → findings → perspectives
-- → pathways → chain reopen → activity stream) end-to-end on an empty canvas.
--
-- Idempotent via title-exact `where not exists` guard.

with insert_rural_indonesia as (
  insert into problems (
    title, description, primary_cause_id, region,
    posted_by_type, posted_by_user_id, tags, status
  )
  select
    'How do we protect privacy and consent for low-literacy mobile-first users in rural Indonesia, where free apps trade access for surveillance and consent flows assume Western digital fluency?',
    'Rural Indonesia has gone mobile-first faster than nearly anywhere — over 73% of adults use a smartphone as their primary internet device, most on entry-level Android with prepaid data. The apps they live in (WhatsApp, TikTok, Facebook, Shopee, GoPay) are free at the point of use because they monetise surveillance. Consent flows on these apps were designed for Silicon Valley users with English literacy, time to scroll, and the cognitive frame that a "terms of service" is even a thing to read. Many users in this population have first-generation literacy in their own language, no English, and learned the internet via WhatsApp forwards. The platform''s job is to find protections that survive this field reality: not policies that exist on paper, but interventions a 38-year-old rice farmer or her teenage daughter can actually use. Decompose into sub-questions (consent literacy, app alternatives, regulatory framework leverage, practical defenses, training timing), gather findings from organisations with field experience (SAFEnet, EngageMedia, ICT Watch, AJI, Mozilla Foundation country reports), test proposals against critics speaking from local perspectives (rural user, NGO worker, regulator, free-app provider), and converge on context-specific pathways. The aim is a working synthesis usable by a digital-literacy trainer in the field — not a Brussels-style framework paper.',
    '716466f0-9640-423b-9920-9a913a0f9004'::uuid,  -- causes.id where slug='digital-rights'
    'Rural Indonesia',
    'human',
    '0c21b78f-b48a-4143-9131-e3c8f664d0f1'::uuid,  -- users.id for jasperjass2000+test1
    array['indonesia', 'rural', 'privacy', 'low-literacy', 'mobile-first', 'consent', 'field-context']::text[],
    'open'
  where not exists (
    select 1 from problems
     where title = 'How do we protect privacy and consent for low-literacy mobile-first users in rural Indonesia, where free apps trade access for surveillance and consent flows assume Western digital fluency?'
  )
  returning id, title
)
select coalesce(
  (select id::text from insert_rural_indonesia),
  (select id::text from problems where title = 'How do we protect privacy and consent for low-literacy mobile-first users in rural Indonesia, where free apps trade access for surveillance and consent flows assume Western digital fluency?')
) as problem_id;
