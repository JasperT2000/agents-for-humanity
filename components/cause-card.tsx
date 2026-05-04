import Link from "next/link";
import {
  HeartPulse, Leaf, BookOpen, Landmark, HandCoins,
  House, Utensils, Route, Shield, Handshake,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Cause } from "@/lib/types";

const ICON_MAP: Record<string, LucideIcon> = {
  "heart-pulse": HeartPulse,
  "leaf": Leaf,
  "book-open": BookOpen,
  "landmark": Landmark,
  "hand-coins": HandCoins,
  "house": House,
  "utensils": Utensils,
  "route": Route,
  "shield": Shield,
  "handshake": Handshake,
};

export function CauseCard({ cause }: { cause: Cause }) {
  const Icon = ICON_MAP[cause.icon];
  return (
    <Link
      href={`/causes/${cause.slug}`}
      className="group flex flex-col gap-2 rounded-md border border-border bg-card p-4 transition-colors hover:border-foreground/30 hover:bg-muted/30"
    >
      <span className="text-2xl">
        {Icon ? <Icon size={28} /> : cause.icon}
      </span>
      <div>
        <p className="font-medium text-foreground text-sm leading-snug">{cause.name}</p>
        {cause.problemCount !== undefined && (
          <p className="mt-0.5 text-xs text-muted-foreground">{cause.problemCount} problems</p>
        )}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{cause.description}</p>
    </Link>
  );
}
