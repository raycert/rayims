"use client";

import { useEffect } from "react";

/**
 * Last-resort fallback when the root layout itself fails. It replaces the whole
 * document, so it defines its own <html>/<body> and does not rely on global styles.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const button = {
    minHeight: 44,
    padding: "0 16px",
    borderRadius: 6,
    border: "1px solid #2a4b8d",
    background: "#2a4b8d",
    color: "#fff",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
  } as const;

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f6f7f9",
          color: "#1b2130",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: 16,
        }}
      >
        <title>Something went wrong · RayIMS</title>
        <main>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ margin: "0 0 24px", color: "#5d6879", fontSize: 14 }}>
            RayIMS couldn&apos;t load. Try again, or return to the dashboard.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button type="button" style={button} onClick={() => retry()}>
              Try again
            </button>
            <a href="/dashboard" style={{ ...button, background: "#fff", color: "#1b2130", borderColor: "#e2e5ea" }}>
              Go to dashboard
            </a>
          </div>
          {error.digest ? (
            <p style={{ marginTop: 16, fontSize: 12, color: "#5d6879" }}>Reference: {error.digest}</p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
