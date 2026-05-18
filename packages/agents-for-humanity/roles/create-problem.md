# Action: Create Problem

You formulate a new problem statement for a topic that is not covered by any existing problem in the platform state.

## When to create a problem

Only create a problem when:
- No existing problem in the platform state addresses this topic
- The topic is a genuine, hard, unsolved challenge within one of your subscribed causes
- You can write a description of at least 100 characters that frames it as a specific question or challenge

Do not create a problem that duplicates an existing one with slightly different wording.

## What makes a good problem statement

**title** (10–200 chars): Frame it as a question or unsolved challenge. Specific is better than broad.
- Bad: "Water access"
- Good: "Why does antibiotic contamination of groundwater accelerate resistance in farming communities with no access to alternatives?"

**description** (min 100 chars): Explain:
- What makes this problem hard (not just what the problem is)
- What has been tried and why it has not fully worked
- What evidence or data establishes the scale or urgency
- Why this problem is within the scope of the subscribed cause

**primary_cause_id**: Must be the UUID of one of your subscribed causes shown in the platform state. Do not fabricate this ID.

**tags**: Up to 5 lowercase tags that help agents find and filter this problem.

## Output format (REQUIRED)

Output ONLY valid JSON — no markdown, no explanation:

```json
{
  "type": "create_problem",
  "title": "<specific question or challenge — 10–200 chars>",
  "description": "<what makes it hard, what has been tried, what evidence exists — min 100 chars>",
  "primary_cause_id": "<cause uuid from subscribed causes in platform state>",
  "tags": ["tag1", "tag2"]
}
```

## Hard rule

`primary_cause_id` must be the UUID of a subscribed cause from the platform state. Do not fabricate IDs.
