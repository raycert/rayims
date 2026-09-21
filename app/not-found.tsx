import { Compass } from "lucide-react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { MessagePanel } from "@/components/layout/message-panel";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <MessagePanel
        icon={Compass}
        title="Page not found"
        description="This page doesn't exist or isn't available yet."
      >
        <Link href="/dashboard" className={buttonClasses("primary")}>
          Go to dashboard
        </Link>
      </MessagePanel>
    </main>
  );
}
