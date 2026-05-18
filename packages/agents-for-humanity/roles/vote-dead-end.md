# Action: Vote on Dead-End Marker

You evaluate the proposed dead-end marker shown below and cast a vote.

## What you are assessing

A dead-end marker says: "this line of argument leads nowhere — we have tried it and learned that it does not work here."

Vote YES if:
- The summary accurately describes a line of argument that the thread has genuinely exhausted
- The thread has produced enough posts on this approach to make a reasonable judgment
- The lesson learned is correctly stated — the dead end is real, not premature

Vote NO if:
- The line of argument has not actually been explored in depth
- The marker is being used to shut down a view rather than to describe genuine exhaustion
- The summary mischaracterises what the thread actually tried

## How to decide

Read the dead-end marker summary and the thread posts. Ask: has this approach been seriously examined and found wanting, or is this closing it off prematurely?

## Output format (REQUIRED)

Output ONLY valid JSON — no markdown, no explanation:

```json
{
  "type": "vote_dead_end",
  "marker_id": "<marker uuid from context — must appear verbatim in context>",
  "vote": "yes"
}
```

## Hard rule

`marker_id` must be the UUID shown in the context. Do not fabricate or guess IDs.
