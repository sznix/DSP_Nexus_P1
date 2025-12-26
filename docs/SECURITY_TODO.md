# Security TODO

Staged security improvements for DSP Nexus. Each item represents a prioritized enhancement to the security posture.

## Current Status

| Area | Status | Notes |
|------|--------|-------|
| HSTS | Done | Enforced with preload |
| X-Frame-Options | Done | DENY |
| X-Content-Type-Options | Done | nosniff |
| Referrer-Policy | Done | strict-origin-when-cross-origin |
| Permissions-Policy | Done | camera, mic, geo disabled |
| CSP | Partial | 'unsafe-inline' still required |
| Rate Limiting | Done | Fail-closed in production |
| Magic Link Origin | Done | Uses NEXT_PUBLIC_SITE_URL |

## Phase 1: Nonce-Based CSP (High Priority)

### Goal
Remove `'unsafe-inline'` from `script-src` and `style-src` by implementing cryptographic nonces.

### Why This Matters
- `'unsafe-inline'` allows any inline script to execute, defeating XSS protection
- Nonces ensure only scripts/styles with a valid, per-request token can run
- This is the industry standard for modern CSP implementations

### Implementation Steps

1. **Create nonce generation utility**
   ```typescript
   // src/lib/csp-nonce.ts
   import { randomBytes } from 'crypto';

   export function generateNonce(): string {
     return randomBytes(16).toString('base64');
   }
   ```

2. **Add nonce to request context**
   - Use Next.js middleware or a custom `headers()` function
   - Store nonce in request context for access by Server Components
   - Pass nonce to client components via props or context

3. **Update layout.tsx**
   ```tsx
   // Add nonce to all <script> and <style> tags
   <script nonce={nonce} src="...">
   ```

4. **Update next.config.ts**
   - Dynamically insert nonce into CSP header
   - Remove 'unsafe-inline' from script-src and style-src
   ```typescript
   `script-src 'self' 'nonce-${nonce}'`
   ```

5. **Handle third-party scripts**
   - Audit all third-party scripts (analytics, etc.)
   - Add their hashes to CSP or migrate to nonce-based loading

### Challenges
- Next.js inline scripts for hydration
- Styled-components/Tailwind CSS inline styles
- Hot Module Replacement (HMR) in development

### Resources
- [MDN: CSP nonce](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/script-src#unsafe_inline_script)
- [Next.js CSP guide](https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy)

## Phase 2: Strict-Dynamic CSP

### Goal
Implement `'strict-dynamic'` to allow trusted scripts to load additional scripts.

### Why This Matters
- Simplifies CSP for complex applications
- Eliminates need to whitelist every script URL
- Maintains security while improving developer experience

### Implementation
```typescript
`script-src 'nonce-${nonce}' 'strict-dynamic'`
```

## Phase 3: Report-URI / Reporting API

### Goal
Set up CSP violation reporting for monitoring and debugging.

### Implementation
1. Set up a reporting endpoint or use a service (e.g., report-uri.com, Sentry)
2. Add `report-uri` or `report-to` directive to CSP
3. Monitor violations in production before enforcing stricter policies

## Phase 4: Subresource Integrity (SRI)

### Goal
Add integrity hashes to all external scripts and stylesheets.

### Implementation
```html
<script src="..." integrity="sha384-..." crossorigin="anonymous">
```

## Environment Variables Reference

### Required for Production

```env
# Site URL (used for magic link redirects)
NEXT_PUBLIC_SITE_URL=https://your-domain.com

# Rate limiting
UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token

# Optional rate limit tuning
RATE_LIMIT_REQUESTS=5          # Max requests per window (default: 5)
RATE_LIMIT_WINDOW_MS=900000    # Window in ms (default: 15 minutes)
```

## Security Audit Checklist

Before each release, verify:

- [ ] All API routes use `requireRole()` for authorization
- [ ] No secrets in client-side code
- [ ] Rate limiting is configured and tested
- [ ] CSP violations are monitored
- [ ] RLS policies are applied to all tenant tables
- [ ] Magic link redirects use NEXT_PUBLIC_SITE_URL
- [ ] HTTPS is enforced with HSTS

## Timeline

| Phase | Priority | Complexity | Status |
|-------|----------|------------|--------|
| Nonce-Based CSP | High | Medium | Not Started |
| Strict-Dynamic CSP | Medium | Low | Not Started |
| Report-URI | Medium | Low | Not Started |
| SRI | Low | Low | Not Started |

---

*Last updated: 2025-12-26*
