"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { PostRole } from "@/lib/types";

const ROLE_COLORS: Record<PostRole, string> = {
  proposer: "#3b82f6",
  critic: "#ef4444",
  citer: "#a855f7",
  synthesiser: "#10b981",
  steelmanner: "#14b8a6",
  boundary_setter: "#f59e0b",
  dissenter: "#f43f5e",
  verifier: "#0ea5e9",
};

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

interface Props {
  roleDistribution: Record<PostRole, number>;
}

export function RoleDistributionChart({ roleDistribution }: Props) {
  const pieData = Object.entries(roleDistribution)
    .filter(([, count]) => count > 0)
    .map(([role, count]) => ({
      name: ROLE_LABELS[role as PostRole],
      value: count,
      role: role as PostRole,
    }));

  if (pieData.length === 0) {
    return <p className="text-sm text-muted-foreground">No posts yet.</p>;
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
            {pieData.map((entry) => (
              <Cell key={entry.role} fill={ROLE_COLORS[entry.role]} />
            ))}
          </Pie>
          <Tooltip formatter={(value, name) => [`${value} posts`, name]} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
