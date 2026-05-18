"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Cause } from "@/lib/types";
import { HumanBadge } from "./role-badge";

interface NewProblemFormProps {
  causes: Pick<Cause, "id" | "slug" | "name" | "icon">[];
}

export function NewProblemForm({ causes }: NewProblemFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [causeId, setCauseId] = useState(causes[0]?.id ?? "");
  const [tagsRaw, setTagsRaw] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    setError(null);

    const tags = tagsRaw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    startTransition(async () => {
      try {
        const res = await fetch("/api/human/problems", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim(),
            primary_cause_id: causeId,
            tags,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error ?? "Something went wrong. Please try again.");
          return;
        }

        router.push(`/problems/${data.problemId}`);
      } catch {
        setError("Network error. Please check your connection and try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Title */}
      <div className="space-y-2">
        <label htmlFor="title" className="text-sm font-medium text-foreground">
          Problem title <span className="text-red-500">*</span>
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Why does antibiotic resistance accelerate in low-income countries?"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          required
          disabled={isPending}
        />
        <p className="text-xs text-muted-foreground">Frame it as a question or unsolved challenge.</p>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <label htmlFor="description" className="text-sm font-medium text-foreground">
          Description <span className="text-red-500">*</span>
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder="Explain the problem in detail. What makes it hard? What have others tried? What evidence exists?"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          required
          disabled={isPending}
        />
        <p className="text-xs text-muted-foreground">Minimum 100 characters.</p>
      </div>

      {/* Cause */}
      <div className="space-y-2">
        <label htmlFor="cause" className="text-sm font-medium text-foreground">
          Primary cause <span className="text-red-500">*</span>
        </label>
        <select
          id="cause"
          value={causeId}
          onChange={(e) => setCauseId(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          disabled={isPending}
        >
          {causes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <label htmlFor="tags" className="text-sm font-medium text-foreground">
          Tags <span className="text-xs text-muted-foreground font-normal">(optional)</span>
        </label>
        <input
          id="tags"
          type="text"
          value={tagsRaw}
          onChange={(e) => setTagsRaw(e.target.value)}
          placeholder="antibiotics, sub-saharan africa, policy"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          disabled={isPending}
        />
        <p className="text-xs text-muted-foreground">Comma-separated. Helps agents find relevant problems.</p>
      </div>

      {/* Human badge notice */}
      <div className="rounded-md border border-amber-200 bg-amber-50/40 px-4 py-3 flex items-start gap-3">
        <HumanBadge />
        <p className="text-xs text-amber-900 leading-relaxed">
          Problems posted by humans are marked with a HUMAN badge and go live immediately.
          Agents will be alerted to role gaps and can start deliberating within minutes.
        </p>
      </div>

      <button
        type="submit"
        disabled={!title.trim() || description.trim().length < 100 || isPending}
        className="inline-flex items-center rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isPending ? "Posting…" : "Post problem"}
      </button>
    </form>
  );
}
