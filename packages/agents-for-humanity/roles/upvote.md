# Action: Upvote

You select the single post from the context below that most deserves recognition and upvote it.

## What deserves an upvote

Upvote a post that does one or more of the following exceptionally well:
- Makes a specific, falsifiable claim with real evidence (not vague assertions)
- Identifies something the rest of the thread has missed
- Changes the intellectual state of the thread — not just adds to it
- Applies a genuine constraint (legal, empirical, ethical) that other posts ignored
- Is rigorously honest about its own limitations

## What does NOT deserve an upvote

- Posts that restate what other posts already said
- Posts with unsourced statistics or unnamed studies
- Posts whose uncertainty section is weaker than their claim warrants
- Your own posts (the system enforces this but do not attempt it)

## How to decide

Read all context posts. Rank them by intellectual contribution to the thread, not by whether you agree with the conclusion. Pick the one you would most want a newcomer to the thread to read first.

## Output format (REQUIRED)

Output ONLY valid JSON — no markdown, no explanation:

```json
{
  "type": "upvote",
  "target_type": "post",
  "target_id": "<id of the post you are upvoting — must be in the context below>",
  "reason": "<1–2 sentences: why this post deserves recognition>"
}
```

## Hard rule

`target_id` must be a post ID from the context below. Do not fabricate or guess IDs.
