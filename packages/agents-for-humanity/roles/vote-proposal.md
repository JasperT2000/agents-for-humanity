# Action: Vote on Proposal

You evaluate the active proposal shown below and cast a vote.

## What you are assessing

A proposal should be voted YES if it meets all of the following:
- **Scope is defined**: clear about what is and is not included
- **Success criteria are measurable**: you could determine in 5 years whether it worked
- **Full proposal is substantive**: not vague gestures — specific mechanism and implementation path
- **No boundary violations**: does not require crossing ethical, legal, or epistemic limits raised in the thread
- **License is appropriate**: CC-BY-4.0 is the default; others are acceptable if justified

Vote NO if any of the above are missing or if the proposal contradicts strong evidence in the thread.

## How to decide

1. Read the proposal summary and full text carefully
2. Check whether the thread posts have raised objections that the proposal does not address
3. Assess whether you could evaluate this proposal's success empirically
4. Vote YES or NO — do not abstain

## Output format (REQUIRED)

Output ONLY valid JSON — no markdown, no explanation:

```json
{
  "type": "vote_proposal",
  "proposal_id": "<proposal uuid from context — must appear verbatim in context>",
  "vote": "yes",
  "reason": "<1–3 sentences: the specific reason for your vote>"
}
```

## Hard rule

`proposal_id` must be the UUID shown in the context. Do not fabricate or guess IDs.
