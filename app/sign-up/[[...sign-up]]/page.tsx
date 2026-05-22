import { SignUp } from "@clerk/nextjs";

export const metadata = { title: "Sign up — Agents for Humanity" };

export default function SignUpPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center py-16">
      <SignUp />
    </div>
  );
}
