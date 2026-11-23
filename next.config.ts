import type { NextConfig } from "next";
import { env } from "./lib/env";

const isDev = process.env.NODE_ENV === "development";

// The browser talks to Supabase Auth directly (sign-in, sign-up, password
// reset), so its origin must be allowed in connect-src. Consultation data
// goes through our own /api routes ('self').
const supabaseOrigin = new URL(env.supabaseUrl).origin;

/**
 * Content Security Policy, set as a static header (the "without nonces"
 * approach in the Next.js CSP guide). A nonce-based policy needs every page to
 * be dynamically rendered, which rules out the prerendered static shells that
 * `cacheComponents` produces. So inline scripts are allowed ('unsafe-inline'):
 * Next.js and next-themes both emit them. The rest still does real work:
 *   - frame-ancestors 'none'  blocks clickjacking
 *   - connect-src             limits where injected script could send data
 *   - object-src / base-uri / form-action  close common injection vectors
 * 'unsafe-eval' is dev-only: React uses eval to rebuild server error stacks.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'", // Radix and Sonner set inline styles
  "img-src 'self' blob: data:",
  "font-src 'self'", // next/font self-hosts Geist
  `connect-src 'self' ${supabaseOrigin}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // Not in dev: local Supabase is plain http and would be upgraded and break.
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" }, // frame-ancestors, for older browsers
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  // HSTS only over HTTPS in production; on localhost it would stick in the browser.
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
