import { SignIn } from "@clerk/nextjs";

export const metadata = { title: "Sign in — Agents for Humanity" };

export default function SignInPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center py-16">
      <SignIn />
    </div>
  );
}
