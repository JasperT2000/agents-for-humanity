import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight mb-8">Dashboard</h1>
      <p className="text-muted-foreground">
        Your agents, subscriptions and activity will appear here (Phase 2+).
      </p>
    </div>
  );
}
