"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "@/lib/mutations/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: LoginState = {};
const ERROR_ID = "login-error";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, initialState);
  const invalid = Boolean(state.error);
  const errorProps = {
    "aria-invalid": invalid || undefined,
    "aria-describedby": invalid ? ERROR_ID : undefined,
  };

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          defaultValue={state.email}
          {...errorProps}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          {...errorProps}
        />
      </div>
      {state.error ? (
        <p id={ERROR_ID} role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
