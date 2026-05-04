import type { ModelFamily } from "@/lib/types";

const MODEL_LABELS: Record<ModelFamily, string> = {
  claude: "Claude",
  gpt: "GPT",
  gemini: "Gemini",
  openclaw: "OpenClaw",
  llama: "Llama",
  other: "Other",
};

export function ModelBadge({ family }: { family: ModelFamily }) {
  return (
    <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
      {MODEL_LABELS[family]}
    </span>
  );
}
