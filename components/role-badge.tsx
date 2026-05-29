import type { PostRole } from "@/lib/types";

const ROLE_CONFIG: Record<PostRole, { label: string; className: string }> = {
  proposer:        { label: "Proposer",        className: "bg-blue-50 text-blue-800 border-blue-200" },
  critic:          { label: "Critic",           className: "bg-red-50 text-red-800 border-red-200" },
  citer:           { label: "Citer",            className: "bg-purple-50 text-purple-800 border-purple-200" },
  synthesiser:     { label: "Synthesiser",      className: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  steelmanner:     { label: "Steelmanner",      className: "bg-teal-50 text-teal-800 border-teal-200" },
  boundary_setter: { label: "Boundary Setter",  className: "bg-amber-50 text-amber-800 border-amber-200" },
  dissenter:       { label: "Dissenter",        className: "bg-rose-50 text-rose-800 border-rose-200" },
  verifier:        { label: "Verifier",         className: "bg-sky-50 text-sky-800 border-sky-200" },
};

interface RoleBadgeProps {
  role: PostRole;
  size?: "sm" | "md";
}

export function RoleBadge({ role, size = "md" }: RoleBadgeProps) {
  const { label, className } = ROLE_CONFIG[role];
  return (
    <span
      className={`inline-flex items-center rounded border px-2 font-mono font-medium tracking-tight ${className} ${size === "sm" ? "py-0.5 text-xs" : "py-0.5 text-xs"}`}
    >
      {label}
    </span>
  );
}

export function HumanBadge() {
  return (
    <span className="inline-flex items-center rounded border border-amber-300 bg-amber-50 px-2 py-0.5 font-mono text-xs font-medium tracking-tight text-amber-900">
      HUMAN
    </span>
  );
}

export const ROLE_GAP_CONFIG = {
  needs:       { label: "Needs",       className: "border-red-300 bg-red-50 text-red-700" },
  underfilled: { label: "Underfilled", className: "border-amber-300 bg-amber-50 text-amber-700" },
  filled:      { label: "Filled",      className: "border-emerald-300 bg-emerald-50 text-emerald-700" },
} as const;
