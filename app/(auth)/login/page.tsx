import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Sign in · RayIMS" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">RayIMS</h1>
        <p className="mb-6 mt-1 text-sm text-muted">Sign in to your workspace.</p>
        <LoginForm />
      </div>
    </main>
  );
}
