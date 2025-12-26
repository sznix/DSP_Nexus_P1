# Security Architecture

This document describes the security architecture of DSP Nexus, including authentication, authorization, and data isolation mechanisms.

## Overview

DSP Nexus is a multi-tenant application where tenant isolation is critical. Security is enforced at multiple layers:

1. **Application Layer** - Next.js middleware and page-level role checks
2. **Database Layer** - PostgreSQL Row Level Security (RLS) policies
3. **Network Layer** - Security headers and rate limiting

## Authentication

### Magic Link Authentication

- Users authenticate via passwordless magic links sent to their email
- Magic links are sent through Supabase Auth's OTP system
- Server-side rate limiting prevents OTP spam (5 requests per 15 minutes per IP/email)
- Session tokens are stored in HTTP-only cookies managed by Supabase SSR

### Session Management

- Sessions are validated on every protected request via middleware
- Token refresh happens automatically through `supabase.auth.getClaims()`
- Expired sessions redirect users to `/login` with the original path preserved

## Authorization

### Role-Based Access Control (RBAC)

DSP Nexus uses a role-based system with the following roles:

| Role | Access Level |
|------|--------------|
| `admin` | Full access to all features |
| `manager` | Administrative features, dispatch view |
| `dispatcher` | Dispatch view only |
| `mechanic` | Mechanic view only |

### Application-Level Enforcement

Each protected page enforces role checks:

```typescript
// Example from dispatch/page.tsx
const ALLOWED_ROLES = ["admin", "manager", "dispatcher"] as const;

if (!ALLOWED_ROLES.includes(role)) {
  redirect("/app");
}
```

**Important**: Application-level role checks are a secondary defense. The primary defense should be RLS policies in the database.

### Middleware Protection

The Next.js middleware:
- Runs on all routes except static assets and API routes
- Validates session tokens via `getClaims()`
- Redirects unauthenticated users to `/login?next=<original_path>`
- Redirects authenticated users away from `/login`

## Multi-Tenant Isolation

### Tenant Structure

```
users (Supabase Auth)
  └── tenant_members (role, tenant_id)
        └── tenants (name, settings)
```

### Data Isolation

Tenant isolation relies on PostgreSQL Row Level Security (RLS). **All tables containing tenant data MUST have RLS policies enforcing tenant isolation.**

### Required RLS Policies

The following tables require RLS policies:

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `tenants` | Own tenant only | Admin | Admin | - |
| `tenant_members` | Own tenant members | Admin | Admin | Admin |
| `daily_assignments` | admin, manager, dispatcher | admin, manager | admin, manager | admin |
| `lot_zones` | Own tenant | admin, manager | admin, manager | admin |
| `lot_spots` | Own tenant | admin, manager | admin, manager | admin |
| `vans` | Own tenant | admin, manager | admin, manager | admin |
| `drivers` | Own tenant | admin, manager | admin, manager | admin |
| `work_days` | Own tenant | admin, manager | admin, manager | admin |
| `imports` | admin, manager | admin, manager | admin, manager | admin |
| `van_reports` | admin, manager, mechanic | admin, manager, dispatcher | admin, manager | admin |

See `supabase/rls_role_policies.sql` for example policy implementations.

## Rate Limiting

### Magic Link Rate Limiting

The `/api/auth/magic-link` endpoint implements rate limiting:

- **Limit**: 5 requests per 15 minutes
- **Scope**: Per IP address AND per email address
- **Implementation**:
  - Production: Upstash Redis (sliding window)
  - Development: In-memory Map (not suitable for serverless)

### Environment Variables

```env
# Required for production rate limiting
UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

## Security Headers

The following security headers are applied to all routes via `next.config.ts`:

| Header | Value |
|--------|-------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Content-Security-Policy-Report-Only` | See next.config.ts |

### Content Security Policy

CSP is currently in report-only mode to avoid breaking Next.js functionality:

```
default-src 'self';
base-uri 'self';
frame-ancestors 'none';
form-action 'self';
img-src 'self' data: blob: https:;
connect-src 'self' https://*.supabase.co wss://*.supabase.co;
style-src 'self' 'unsafe-inline';
script-src 'self' 'unsafe-inline' 'unsafe-eval';
```

**TODO**: Implement nonce-based CSP to remove 'unsafe-inline' and 'unsafe-eval'.

## Open Redirect Prevention

The `safeNextPath()` utility function validates redirect paths:

- Must start with `/`
- Must not contain `://` (prevents protocol redirects)
- Must not start with `//` (prevents protocol-relative URLs)
- Must start with `/app` (restricts to app routes)

## Security Checklist for New Features

When adding new features, ensure:

1. [ ] RLS policies exist for any new tables
2. [ ] RLS policies enforce tenant isolation
3. [ ] RLS policies check user roles for sensitive operations
4. [ ] Application-level role checks are added to protected pages
5. [ ] API routes validate input and sanitize data
6. [ ] Rate limiting is applied to public-facing endpoints
7. [ ] Sensitive data is not exposed in client-side code

## Reporting Security Issues

If you discover a security vulnerability, please report it privately to the maintainers. Do not open a public issue.
