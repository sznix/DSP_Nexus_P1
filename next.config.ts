import type { NextConfig } from "next";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

// Base security headers (applied in all environments)
const baseSecurityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

// CSP directives shared between dev and prod
const cspDirectives = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "style-src 'self' 'unsafe-inline'", // TODO: Replace with nonces (see docs/SECURITY_TODO.md)
];

// Build environment-specific CSP
function buildCspHeader(): { key: string; value: string } {
  if (IS_PRODUCTION) {
    // Production: Enforced CSP without 'unsafe-eval'
    // 'unsafe-inline' is still needed until nonces are implemented
    const prodCsp = [
      ...cspDirectives,
      "script-src 'self' 'unsafe-inline'", // No 'unsafe-eval' in production
    ].join("; ");

    return {
      key: "Content-Security-Policy",
      value: prodCsp,
    };
  }

  // Development: Report-only mode with 'unsafe-eval' for HMR/React DevTools
  const devCsp = [
    ...cspDirectives,
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  ].join("; ");

  return {
    key: "Content-Security-Policy-Report-Only",
    value: devCsp,
  };
}

const securityHeaders = [...baseSecurityHeaders, buildCspHeader()];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
