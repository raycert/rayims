"use client";

import { LogOut } from "lucide-react";
import { useFormStatus } from "react-dom";
import { signOut } from "@/lib/mutations/auth";
import { Button } from "@/components/ui/button";

function SubmitButton({ className }: { className?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      className={className}
      disabled={pending}
      aria-busy={pending}
    >
      <LogOut className="size-4" aria-hidden />
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}

/** Signs out this device only (other devices keep their session). */
export function SignOutButton({ className }: { className?: string }) {
  return (
    <form action={signOut}>
      <SubmitButton className={className} />
    </form>
  );
}
