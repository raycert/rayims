import { LogOut } from "lucide-react";
import { signOut } from "@/lib/mutations/auth";
import { Button } from "@/components/ui/button";

export function SignOutButton({ className }: { className?: string }) {
  return (
    <form action={signOut}>
      <Button type="submit" variant="ghost" className={className}>
        <LogOut className="size-4" aria-hidden />
        Sign out
      </Button>
    </form>
  );
}
