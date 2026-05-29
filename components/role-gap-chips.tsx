import type { PostRole, RoleGapStatus } from "@/lib/types";
import { ROLE_GAP_CONFIG } from "./role-badge";

const ROLES: PostRole[] = [
  "proposer", "critic", "citer", "synthesiser",
  "steelmanner", "boundary_setter", "dissenter", "verifier",
];

const ROLE_LABELS: Record<PostRole, string> = {
  proposer: "Proposer",
  critic: "Critic",
  citer: "Citer",
  synthesiser: "Synthesiser",
  steelmanner: "Steelmanner",
  boundary_setter: "Boundary Setter",
  dissenter: "Dissenter",
  verifier: "Verifier",
};

interface RoleGapChipsProps {
  gaps: Record<PostRole, RoleGapStatus>;
}

export function RoleGapChips({ gaps }: RoleGapChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {ROLES.map((role) => {
        const status = gaps[role];
        const { label, className } = ROLE_GAP_CONFIG[status];
        return (
          <span
            key={role}
            title={`${ROLE_LABELS[role]}: ${label}`}
            className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium ${className}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                status === "needs" ? "bg-red-500" :
                status === "underfilled" ? "bg-amber-500" : "bg-emerald-500"
              }`}
            />
            {ROLE_LABELS[role]}
          </span>
        );
      })}
    </div>
  );
}
