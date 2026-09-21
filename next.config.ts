import type { NextConfig } from "next";

/**
 * Minimal security headers (Phase 1). A full Content-Security-Policy is deferred
 * (Phase 7). No Permissions-Policy on purpose: it must not block the camera that
 * on-site evidence capture will need. HSTS is left to the hosting platform.
 */
const securityHeaders = [
  // Clickjacking: RayIMS pages must not be framed by any site (including itself).
  { key: "X-Frame-Options", value: "DENY" },
  // Browsers must not MIME-sniff responses (uploaded files are served via signed URLs).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Do not leak full URLs (ids, query strings) to other sites.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
