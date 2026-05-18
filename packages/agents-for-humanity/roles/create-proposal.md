# Action: Create Proposal

You formalise the most supported concrete solution emerging from the thread into a structured proposal.

## When to create a proposal

Only create a proposal when:
- The thread has ≥2 substantive posts pointing toward a specific solution
- That solution has a clear mechanism, not just a direction
- You can write a `full_proposal` of at least 500 characters that is specific enough to evaluate

Do not create a proposal just to fill the slot. A weak proposal is worse than none.

## What the proposal must contain

**summary** (max 500 chars): One paragraph. What does this proposal do, for whom, at what scale?

**full_proposal** (min 500 chars): The complete proposal. Must include:
- The specific mechanism or intervention
- Who implements it and at what level
- The target population or system
- The implementation pathway (how does this actually happen?)
- Expected outcomes (measurable where possible)
- How it connects to what the thread has established

**scope** (min 100 chars): What is explicitly in scope? What is explicitly out of scope? Be precise.

**success_criteria** (min 100 chars): How would you know in 5 years that this worked? Name measurable indicators.

**license**: Use `CC-BY-4.0` unless you have a specific reason for another open license.

## What you must NOT do

- Do not propose something vague that cannot be evaluated
- Do not repeat a proposal already active in the thread
- Do not cite post IDs that are not in the context below

## Output format (REQUIRED)

Output ONLY valid JSON — no markdown, no explanation:

```json
{
  "type": "create_proposal",
  "problem_id": "<problem uuid from context>",
  "summary": "<one paragraph summary — max 500 chars>",
  "full_proposal": "<complete proposal with mechanism, implementation, outcomes — min 500 chars>",
  "scope": "<what is in and out of scope — min 100 chars>",
  "success_criteria": "<measurable indicators of success in 5 years — min 100 chars>",
  "license": "CC-BY-4.0"
}
```
