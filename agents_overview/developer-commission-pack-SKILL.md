---
name: developer-commission-pack
description: Produce a complete four-document commission package for any new software build Aamir is commissioning — project brief, build specification, domain-specific appendix, and developer kickoff protocol. Trigger whenever Aamir says he wants to brief a developer on a new build, commission a developer, hand off a project, write a spec for someone to build, get a developer started, or anything similar. Use for Attunic, Nuggts, Agents for Humanity evolutions, Sarazi Label tooling, EM client projects where Aamir is briefing another developer, or any new build where a developer needs to understand the why, the what, the how, and the working protocol. Do NOT use for updating an existing codebase's documentation, writing READMEs for shipped code, or writing internal technical docs for Aamir himself.
---

# Developer Commission Pack

## Purpose

When Aamir commissions a developer to build something, he needs four documents that together form a complete handoff package. This skill produces all four, in a consistent shape, tuned for Claude Code–driven development (which is Aamir's default assumption for new builds).

This pattern was developed during the Agents for Humanity commission in April 2026. It works. Use it.

## The four documents

1. **Project Brief** — the why and what. Audience: Aamir, the developer, anyone Aamir shows it to (advisor, potential co-founder, investor). ~1500–2500 words. Written so a reader understands the project in five minutes.

2. **Build Specification** — the phase-by-phase how. Audience: the developer feeding Claude Code. ~3000–6000 words. Structured as numbered phases, each with acceptance criteria, so Claude Code can be directed one phase at a time.

3. **Domain-specific appendix** — a third document that captures domain knowledge the developer needs that doesn't belong in the brief or build spec. For Agents for Humanity this was the role briefs. For Attunic it might be the persona taxonomy. For Nuggts it might be the format output specifications. *Identify what the analog is for this project and draft it.*

4. **Developer Kickoff Protocol** — the working rules. Audience: the developer. ~1000–1500 words. Covers how to direct Claude Code effectively, what the developer can and can't decide, communication with Aamir (including his prayer/Jummah/family boundaries), security non-negotiables, scope defence, when to slow down.

## Process

### Step 1: Confirm the commission is real

Before drafting, confirm Aamir has committed to the build. Don't produce a four-document commission pack for an exploration. Signs the commission is real:

- He has said yes explicitly
- A developer is identified or about to be engaged
- There's a budget or timeline attached
- He's ready to register a domain or has already

If any of these are missing, pause and flag. A commission pack for a fantasy is wasted tokens.

### Step 2: Extract or elicit the essentials

Before drafting, confirm or elicit:

- **Project name** (locked, not a placeholder)
- **Domain** (registered or in-flight)
- **Core concept** in one sentence the user can repeat back
- **Architectural principles** — the 3–6 non-negotiable rules (e.g., "no platform-paid compute," "open by default," "mobile-first")
- **Target build time** (weeks)
- **Budget ceiling** (AUD)
- **Primary tech stack** — default to Next.js + Postgres + Vercel unless Aamir indicates otherwise
- **Audience for each document** — confirm the brief audience, developer background, appendix domain

If any essential is missing, ask. Do not invent.

### Step 3: Draft in order

Draft in this sequence. Each document informs the next.

1. **Brief first.** It locks positioning and scope. Every later document cites it.
2. **Domain-specific appendix second.** It surfaces the domain knowledge the build spec needs to reference.
3. **Build spec third.** Phase-by-phase. References the brief and appendix. Includes data model, API endpoints, acceptance criteria, anti-patterns, testing requirements, cost estimate.
4. **Kickoff protocol fourth.** References all three prior documents. Customised for this build's specific risks and scope defences.

### Step 4: Consistency pass

Before presenting, verify:

- Project name, domain, and tagline are identical across all four documents
- Version numbers match (usually v0.1 or v0.2)
- Budget ceiling matches between brief and build spec
- Timeline matches between brief and build spec
- Architectural principles in the brief are reinforced in the kickoff protocol
- Scope boundaries (what's in v0.1 vs. v0.2) are identical across all documents
- Aamir's personal operating constraints (prayer, Jummah, family) appear in the kickoff protocol

### Step 5: Present as files, not chat

Use `create_file` + `present_files` to deliver all four documents. Do not paste the content inline — Aamir will send these to the developer as files, and they need to be file-shaped.

## Document templates

### Brief structure

```
# [Project Name] — Project Brief
Version, founder, domain, status

1. What it is (one sentence + one paragraph)
2. Why it exists (3 structural facts, hypothesis worth testing)
3. What's honestly possible, and what isn't (anti-overclaiming)
4. Architectural principles (non-negotiable, numbered)
5. Product shape — v0.1 (sub-sections per surface)
   5.x What v0.1 explicitly does NOT include
6. [Contract/protocol/core-rules, if applicable]
7. Quality infrastructure (how quality is enforced)
8. Interoperability / distribution
9. Success criteria (numbered targets + failure conditions + cost ceiling)
10. Out of scope for this brief (what it doesn't cover)
11. Commitment (who revises this brief)
```

### Build spec structure

```
# [Project Name] — v0.1 Build Specification
Version, audience, build time, budget

How to use this document (Claude Code direction)
Tech stack (decided, with security non-negotiables)

Phase 0: Foundations (1 week)
Phase 1: Data model
Phase 2: [Domain-specific critical phase]
Phase 3: [API layer — read]
Phase 4: [API layer — write]
Phase 5: Frontend — read experience
Phase 6: Frontend — write experience
Phase 7: [Domain-specific feature — often the hardest]
Phase 8: [Distribution / CLI / package]
Phase 9: Admin + moderation
Phase 10: Launch prep

Each phase includes:
- Objective
- Build steps
- Acceptance criteria

Appendix A: Anti-patterns (what not to do)
Appendix B: Testing
Appendix C: Cost estimate (production steady state)
```

### Kickoff protocol structure

```
# [Project Name] — Developer Kickoff Protocol

What you're being asked to do
The mental model, in one paragraph (core architectural principle)

Principle 1: Phase discipline
Principle 2: Claude Code direction (plan → approve → execute → review)
Principle 3: What Claude Code does NOT decide
Principle 4: Communication with Aamir (including prayer/Jummah/family)
Principle 5: Security is non-negotiable
Principle 6: Scope defence (park for v0.2)
Principle 7: When to slow down
Principle 8: The one-line test
Principle 9: [Project-specific most-important-thing reminder]

Day 1 setup checklist
One final note
```

## Critical rules

**Scope defence is the single most important thing the kickoff protocol enforces.** Aamir will drift; the developer needs written cover to push back. Always include an explicit `v0.2-ideas.md` instruction and the three-question test (brief? build spec? park).

**Security patterns must be explicit.** If Aamir's project has any auth, user data, or API keys, include specific anti-patterns (like "no service keys in client JS — Moltbook's fatal mistake") in both the build spec and the kickoff protocol. Implicit security warnings do not work with vibe-coded builds.

**The kickoff protocol must name Aamir's personal boundaries.** Five prayers, Jummah, family time after hours. The developer cannot respect them if they don't know them.

**Name the one architectural principle the developer must defend even against Aamir.** For Agents for Humanity it was "no platform-paid agentic compute." Every project has one. Identify it and elevate it in the protocol.

**If the project has a heavier feature (like synthesis documents or build orchestration), give it its own phase in the build spec.** Don't embed complex features in a general phase — they get under-scoped.

## What this skill does NOT do

- Does not write SOWs, contracts, or legal documents
- Does not vet developer candidates
- Does not write pitch decks or investor materials
- Does not replace a conversation with the developer — it's input to that conversation

## Output format

Four files in `/home/claude/`, then presented via `present_files`:

- `[project-slug]-brief.md`
- `[project-slug]-build-spec.md`
- `[project-slug]-[appendix-name].md`
- `[project-slug]-developer-kickoff.md` (or just `developer-kickoff.md` if unambiguous)

Present them in the order the developer should read: kickoff protocol → brief → appendix → build spec.

## When to flag issues to Aamir instead of drafting

- If the project is not yet concrete enough to commission (no name, no domain, no developer, no timeline) — ask Aamir to firm it up first
- If Aamir has not committed yet ("still exploring") — do not draft; flag and ask
- If a key architectural decision hasn't been made (e.g., "we'll figure out the tech stack later") — ask Aamir to decide or default, don't ship ambiguous specs
- If the build is larger than ~12 weeks at reasonable scope — suggest breaking into v0.1 + v0.2 before drafting
- If Aamir names a feature that creates a significant operating cost (platform-paid compute, inference costs, expensive third-party APIs) — confirm he understands the ongoing cost before drafting
