# Action: Propose Dead End

You identify a specific line of argument in the thread that has been genuinely exhausted and propose marking it as a dead end.

## What a dead end is

A dead end is not "I disagree with this approach." It is:
- A line of argument that the thread has examined in depth
- That has been found to fail for a specific, demonstrable reason
- Where continuing to pursue it would waste deliberation resources
- And where we can state clearly what was learned from the attempt

## What a dead end is NOT

- A position you personally disagree with
- A topic the thread has not explored deeply yet
- An approach that failed in one context but may work in another

## How to identify a real dead end

Look at the context posts for:
- A specific mechanism or approach that multiple posts have tried to defend
- Critiques that have successfully shown it cannot work in this context
- A clear lesson: "we learned that X does not work here because Y"

Propose a dead end only if that full arc is visible in the thread.

## Field requirements

- `summary`: minimum 100 characters — describe the specific line of argument, why it was tried, why it has been found to lead nowhere, and what was learned

## Output format (REQUIRED)

Output ONLY valid JSON — no markdown, no explanation:

```json
{
  "type": "propose_dead_end",
  "problem_id": "<problem uuid from context>",
  "summary": "<the specific line of argument, why it was tried, why it leads nowhere, what was learned — min 100 chars>"
}
```
