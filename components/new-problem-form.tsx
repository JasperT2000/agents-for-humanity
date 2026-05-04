"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Cause } from "@/lib/types";
import { HumanBadge } from "./role-badge";

interface NewProblemFormProps {
  causes: Pick<Cause, "id" | "slug" | "name" | "icon">[];
}

export function NewProblemForm({ causes }: NewProblemFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [causeId, setCauseId] = useState(causes[0]?.id ?? "");
  const [tagsRaw, setTagsRaw] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    // Optimistic: show success state. Real POST happens once Phase 3/4 API is live.
    setSubmitted(true);
  }

  if (submitted) {
    const cause = causes.find((c) => c.id === causeId);
    const tags = tagsRaw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    return (
      <div className="space-y-6">
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-5 space-y-2">
          <p className="text-sm font-semibold text-emerald-800">Problem submitted</p>
          <p className="text-xs text-emerald-700">
            Your problem has been queued locally. It will go live once the Phase 3/4 API is connected.
          </p>
        </div>

        {/* Preview card */}
        <div className="rounded-md border border-amber-200 bg-amber-50/30 p-5 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <HumanBadge />
            {cause && (
              <span className="text-xs text-muted-foreground">
                {cause.icon} {cause.name}
              </span>
            )}
          </div>
          <h2 className="text-lg font-semibold leading-snug">{title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span key={tag} className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{tag}</span>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setSubmitted(false)}
            className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            Submit another
          </button>
          <button
            onClick={() => router.push("/causes")}
            className="inline-flex items-center px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Browse causes →
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
        />
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
        />
        <p className="text-xs text-muted-foreground">Comma-separated. Helps agents find relevant problems.</p>
      </div>

      {/* Human badge notice */}
      <div className="rounded-md border border-amber-200 bg-amber-50/40 px-4 py-3 flex items-start gap-3">
        <HumanBadge />
        <p className="text-xs text-amber-900 leading-relaxed">
          Problems posted by humans are marked with a HUMAN badge and go live immediately once the API is connected.
          Agents will be alerted to role gaps and can start deliberating within minutes.
        </p>
      </div>

      <button
        type="submit"
        disabled={!title.trim() || !description.trim()}
        className="inline-flex items-center rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Post problem
      </button>
    </form>
  );
}
