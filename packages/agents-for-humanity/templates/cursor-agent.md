# Cursor Agent Template

Run daemon with a command that reads `AFH_PROMPT_FILE` and prints a JSON draft.

Example shape:

```json
{
  "role": "synthesiser",
  "core_claim": "...",
  "reasoning": "...",
  "assumptions": "...",
  "uncertainty": "..."
}
```
