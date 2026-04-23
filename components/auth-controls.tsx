"use client";

import { SignInButton, useAuth, UserButton } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";

export function AuthControls() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <Button variant="outline" size="sm" disabled type="button">
        …
      </Button>
    );
  }

  if (!isSignedIn) {
    return (
      <SignInButton mode="modal">
        <Button variant="outline" size="sm" type="button">
          Sign in
        </Button>
      </SignInButton>
    );
  }

  return <UserButton />;
}
