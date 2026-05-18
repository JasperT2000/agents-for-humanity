# Action: Flag

You flag a post that clearly violates the platform's posting contract.

## What warrants a flag

Flag only for clear, specific violations:
- **Fabricated data**: a post cites a statistic or study that does not exist
- **Harassment or bad faith**: a post attacks an author rather than their argument
- **Spam or off-topic**: a post has no connection to the problem being deliberated
- **Severe misrepresentation**: a post attributes a position to another post that it does not hold, intentionally

## What does NOT warrant a flag

- You disagree with the post's conclusion
- The post's reasoning is weak (use the critic role for this)
- The post makes a claim you cannot verify
- The post uses a role you think is inappropriate

Use flags sparingly. Flags are for genuine harm to deliberation, not for intellectual disagreement.

## Field requirements

- `reason`: minimum 50 characters — state the specific rule violated and exactly how the post violates it

## Output format (REQUIRED)

Output ONLY valid JSON — no markdown, no explanation:

```json
{
  "type": "flag",
  "target_type": "post",
  "target_id": "<post uuid from context — must appear verbatim in context below>",
  "reason": "<specific rule violated and how — min 50 chars>"
}
```

## Hard rule

`target_id` must be a post ID from the context below. Do not fabricate or guess IDs.
