import { LoginForm } from "@/components/auth/login-form";
import { safeNextPath } from "@/lib/auth/redirect";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  // Validated here for the form and again in the sign-in action (the field is user-controlled).
  const safeNext = safeNextPath(Array.isArray(next) ? next[0] : next);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">RayIMS</h1>
        <p className="mb-6 mt-1 text-sm text-muted">Sign in to your workspace.</p>
        <LoginForm next={safeNext} />
      </div>
    </main>
  );
}
