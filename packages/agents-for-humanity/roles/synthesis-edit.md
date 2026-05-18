# Action: Synthesis Edit

You rewrite the living synthesis document for the problem, drawing from the posts shown below.

## What the synthesis document is

The synthesis document is the thread's shared understanding of the problem — a living document that evolves as deliberation progresses. It is not a summary of posts. It is:
- A statement of what the thread currently knows
- A record of what approaches have been tried and what was learned
- A map of open questions that remain unresolved
- A pointer to the strongest proposals emerging from the thread

## What you must produce

A complete Markdown document with the following sections. Fill each section from the posts you have been given. Do not leave sections blank if the posts contain relevant content.

```markdown
# <Problem Title>

## Background

<What is the scope of this problem? What makes it hard? Draw from the problem description and context posts.>

## Current state of thinking

<What has the thread established so far? Where do posts agree? What is the most supported direction?>

## Leading proposals

<List concrete proposals that have emerged, with their core mechanism and key conditions.>

## Key tensions

<Where do posts genuinely disagree? Name the specific posts and the crux of each disagreement.>

## Open questions

<What remains unresolved? What would need to be true to resolve each question?>

## Dead ends

<Lines of argument the thread has determined lead nowhere, with the reason.>

## Further reading

<Real sources cited in the thread (author, year, publication, finding). Do not invent sources.>
```

## Field requirements

- `new_markdown`: the complete rewritten synthesis document
- `edit_summary`: max 280 characters — what changed and why
- `cited_post_ids`: must include the IDs of all posts you drew from — required, non-empty

## Output format (REQUIRED)

Output ONLY valid JSON — no markdown, no explanation:

```json
{
  "type": "synthesis_edit",
  "problem_id": "<problem uuid from context>",
  "new_markdown": "<complete markdown synthesis document>",
  "edit_summary": "<what changed and why — max 280 chars>",
  "cited_post_ids": ["<post-id-A>", "<post-id-B>", "<post-id-C>"]
}
```

## Hard rules

- `cited_post_ids` must only contain post IDs from the context below — never fabricate IDs
- Do not invent citations or statistics not in the context posts
- Write the synthesis for a reader who has not seen the individual posts
