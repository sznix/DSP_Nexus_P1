@[Magic Link Authentication Flow] is a [Codemap]:
Codemap title: Magic Link Authentication Flow
Codemap ID: 'Magic_Link_Authentication_Flow_20251231_112352'
Codemap description: End-to-end flow for passwordless authentication via magic links, covering request validation, dual-layer rate limiting (IP + email), open redirect prevention, and Supabase OTP email dispatch. Key security checkpoints at [1b], [2f], [3c], and [3d].

Trace ID: 1
Title: Request Entry & Validation
Description: API route handler that validates incoming POST requests for magic link generation

Trace text diagram:
POST /api/auth/magic-link
└── POST(request) handler <-- 1a
    ├── Request validation
    │   ├── Check Content-Length header <-- 1b
    │   ├── Parse JSON body <-- 1c
    │   └── Validate email field exists <-- route.ts:46
    ├── Email sanitization & validation
    │   ├── Trim & lowercase email <-- 1d
    │   └── Test against regex pattern <-- 1e
    │       └── Return 400 if invalid <-- route.ts:59
    └── Continue to rate limiting...

Location ID: 1a
Title: POST Handler Entry
Description: Main entry point for magic link requests
Path:LineNumber: DSP_Nexus_P1\src\app\api\auth\magic-link\route.ts:28
Location ID: 1b
Title: Body Size Guard
Description: Defense-in-depth check to reject oversized requests (>10KB)
Path:LineNumber: DSP_Nexus_P1\src\app\api\auth\magic-link\route.ts:33
Location ID: 1c
Title: Parse JSON Body
Description: Extract email and redirectTo from request payload
Path:LineNumber: DSP_Nexus_P1\src\app\api\auth\magic-link\route.ts:38
Location ID: 1d
Title: Email Sanitization
Description: Normalize email to lowercase and remove whitespace
Path:LineNumber: DSP_Nexus_P1\src\app\api\auth\magic-link\route.ts:54
Location ID: 1e
Title: Email Format Validation
Description: Reject malformed email addresses with 400 response
Path:LineNumber: DSP_Nexus_P1\src\app\api\auth\magic-link\route.ts:58

Trace ID: 2
Title: Dual Rate Limiting Protection
Description: Rate limiting system using Upstash Redis to prevent abuse by IP and email

Trace text diagram:
Magic Link API Route (route.ts)
├── POST handler validates request <-- route.ts:28
│   ├── Extract client IP <-- 2a
│   └── Check IP rate limit <-- 2c
│       └── calls checkRateLimit() <-- rate-limit.ts:95
└── Check email rate limit <-- 2g
    └── calls checkRateLimit() <-- rate-limit.ts:95

Rate Limiting System (rate-limit.ts)
└── checkRateLimit(identifier) <-- rate-limit.ts:95
    ├── Read proxy headers <-- 2b
    │   └── returns IP string <-- rate-limit.ts:204
    ├── Route to Upstash Redis <-- 2d
    │   └── checkUpstashRateLimit() <-- rate-limit.ts:129
    │       ├── Build Redis pipeline <-- rate-limit.ts:143
    │       ├── Fetch from Upstash <-- 2e
    │       ├── Parse response count <-- rate-limit.ts:170
    │       └── Enforce limit check <-- 2f
    └── Fallback: in-memory limiter (dev only) <-- rate-limit.ts:122

Location ID: 2a
Title: Extract Client IP
Description: Get real client IP from proxy headers for rate limiting
Path:LineNumber: DSP_Nexus_P1\src\app\api\auth\magic-link\route.ts:66
Location ID: 2b
Title: Read Forwarded IP Header
Description: Extract client IP from Vercel or standard proxy headers
Path:LineNumber:DSP_Nexus_P1\src\lib\rate-limit.ts:201
Location ID: 2c
Title: Check IP Rate Limit
Description: First layer: prevent single IP from spamming requests
Path:LineNumber: DSP_Nexus_P1\src\app\api\auth\magic-link\route.ts:69
Location ID: 2d
Title: Route to Upstash
Description: Use Redis-based rate limiting in production
Path:LineNumber: DSP_Nexus_P1\src\lib\rate-limit.ts:103
Location ID: 2e
Title: Execute Redis Pipeline
Description: Atomic operations: remove old entries, add current, count total
Path:LineNumber: DSP_Nexus_P1\src\lib\rate-limit.ts:150
Location ID: 2f
Title: Enforce Rate Limit
Description: Block if request count exceeds threshold (default: 5 per 15min)
Path:LineNumber: DSP_Nexus_P1\src\lib\rate-limit.ts:172
Location ID: 2g
Title: Check Email Rate Limit
Description: Second layer: prevent targeting specific email addresses
Path:LineNumber:DSP_Nexus_P1\src\app\api\auth\magic-link\route.ts:88

Trace ID: 3
Title: Safe Redirect URL Construction
Description: Sanitizes redirect path and builds trusted callback URL to prevent open redirect attacks

Trace text diagram:
Magic Link API Route (route.ts)
├── POST handler validates request <-- route.ts:28
│   └── safeRedirect = safeNextPath() <-- 3a
│       │
│       └─────────────────────────────────┐
                                          │
Path Validation Utility (utils.ts)       │
└── safeNextPath() function entry <-- 3b │
    ├── Reject protocols & // URLs <-- utils.ts:32
    ├── Enforce /app prefix check <-- 3c │
    └── Return sanitized path <-- utils.ts:51
                                          │
Magic Link API Route (route.ts)          │
└── Build trusted callback URL           │
    ├── siteUrl = getSiteUrl() <-- 3d    │
    │   │                                 │
    │   └───────────────────────────┐    │
    │                               │    │
    │   Environment Config (env.ts) │    │
    │   └── getRequiredEnvAny() <-- 3e   │
    │       └── Returns SITE_URL ────────┘
    │                                     │
    └── Construct emailRedirectTo <-- 3f │
        = siteUrl + /auth/callback?next=safeRedirect

Location ID: 3a
Title: Sanitize Redirect Path
Description: Validate user-provided redirect to prevent open redirect vulnerability
Path:LineNumber:DSP_Nexus_P1\src\app\api\auth\magic-link\route.ts:107
Location ID: 3b
Title: Path Validation Logic
Description: Rejects absolute URLs, protocol-relative URLs, and paths not starting with...
Path:LineNumber: DSP_Nexus_P1\src\lib\utils.ts:24
Location ID: 3c
Title: Enforce /app Prefix
Description: Extra safety: only allow redirects within /app namespace
Path:LineNumber: DSP_Nexus_P1\src\lib\utils.ts:47
Location ID: 3d
Title: Get Trusted Site URL
Description: Use server-configured URL instead of trusting request origin header
Path:LineNumber: DSP_Nexus_P1\src\app\api\auth\magic-link\route.ts:112
Location ID: 3e
Title: Retrieve Site URL from Env
Description: Prefer server-only SITE_URL, fallback to public env var
Path:LineNumber: DSP_Nexus_P1\src\lib\env.ts:44
Location ID: 3f
Title: Build Callback URL
Description: Construct full redirect URL for magic link email
Path:LineNumber: DSP_Nexus_P1\src\app\api\auth\magic-link\route.ts:113

Trace ID: 4
Title: Supabase Magic Link Dispatch
Description: Creates Supabase client and sends OTP email with callback URL

Trace text diagram:
Magic Link Dispatch Flow
├── POST handler validates request <-- route.ts:28
│   └── getSupabaseAuthClient() call <-- 4a
│       └── createClient() instantiation <-- 4b
│           ├── getSupabaseUrl() from env <-- route.ts:9
│           └── getSupabaseAnonKey() from env <-- route.ts:9
├── supabase.auth.signInWithOtp() call <-- 4c
│   ├── email: sanitizedEmail <-- route.ts:118
│   └── options: { emailRedirectTo } <-- route.ts:119
│       └── Supabase sends OTP email
├── Error handling check <-- 4d
│   ├── if (error.message.includes("rate")) <-- route.ts:128
│   │   └── return 429 rate limit response <-- route.ts:129
│   └── else return 500 generic error <-- route.ts:135
└── Success path
    └── jsonNoStore() success response <-- 4e
        ├── { success: true, message: "..." } <-- route.ts:142
        └── Cache-Control: no-store header <-- route.ts:18

Location ID: 4a
Title: Initialize Supabase Client
Description: Create server-side Supabase client for auth operations
Path:LineNumber: DSP_Nexus_P1\src\app\api\auth\magic-link\route.ts:116
Location ID: 4b
Title: Create Client with Credentials
Description: Instantiate client using environment-configured URL and anon key
Path:LineNumber: DSP_Nexus_P1\src\app\api\auth\magic-link\route.ts:9
Location ID: 4c
Title: Send Magic Link Email
Description: Call Supabase to generate and email OTP link to user
Path:LineNumber: DSP_Nexus_P1\src\app\api\auth\magic-link\route.ts:117
Location ID: 4d
Title: Handle Supabase Errors
Description: Log internal errors but return generic messages to client
Path:LineNumber: DSP_Nexus_P1\src\app\api\auth\magic-link\route.ts:124
Location ID: 4e
Title: Return Success Response
Description: Send 200 with no-cache headers confirming email was sent
Path:LineNumber:DSP_Nexus_P1\src\app\api\auth\magic-link\route.ts:141


--- Code snippets from Codemap files. If these seem wrong, it likely means this codemap is out of date with the state of the file. ---

File: DSP_Nexus_P1\src\app\api\auth\magic-link\route.ts

Lines: 7-11
// Create a Supabase client for server-side auth operations
function getSupabaseAuthClient() {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey());
}


Lines: 26-40
};

export async function POST(request: Request) {
  try {
    // Basic body size guard (defense-in-depth)
    const MAX_BODY_BYTES = 10_000;
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
      return jsonNoStore({ error: "Request too large" }, { status: 413 });
    }

    // Parse and validate request body
    const body = await request.json() as MagicLinkRequest;
    const { email, redirectTo } = body;


Lines: 52-60

    // Sanitize email
    const sanitizedEmail = email.trim().toLowerCase();

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(sanitizedEmail)) {
      return jsonNoStore(
        { error: "Invalid email format" },


Lines: 64-71

    // Get client IP for rate limiting
    const clientIp = getClientIp(request);

    // Check rate limit by IP
    const ipRateLimit = await checkRateLimit(`ip:${clientIp}`);
    if (!ipRateLimit.success) {
      return jsonNoStore(


Lines: 86-90

    // Check rate limit by email (prevents targeting specific email)
    const emailRateLimit = await checkRateLimit(`email:${sanitizedEmail}`);
    if (!emailRateLimit.success) {
      return jsonNoStore(


Lines: 105-119

    // Validate and sanitize redirect path
    const safeRedirect = safeNextPath(redirectToStr);

    // Construct the full redirect URL for the auth callback
    // SECURITY: Use SITE_URL instead of trusting request origin header
    // The origin header can be spoofed by attackers to redirect magic links ...
    const siteUrl = getSiteUrl();
    const emailRedirectTo = `${siteUrl}/auth/callback?next=${encodeURICompone...

    // Send magic link via Supabase
    const supabase = getSupabaseAuthClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: sanitizedEmail,
      options: {


Lines: 122-126
    });

    if (error) {
      console.error("[magic-link] Supabase error:", error.message);


Lines: 139-143
    }

    return jsonNoStore({
      success: true,
      message: "Magic link sent! Check your email.",

File: DSP_Nexus_P1\src\lib\rate-limit.ts

Lines: 101-105
  if (upstashUrl && upstashToken) {
    // Use Upstash Redis
    return checkUpstashRateLimit(identifier, upstashUrl, upstashToken);
  }


Lines: 148-152
    ];

    const response = await fetch(`${upstashUrl}/pipeline`, {
      method: "POST",
      headers: {


Lines: 170-174
    const count = results[2]?.result ?? 0;

    if (count > RATE_LIMIT_REQUESTS) {
      return {
        success: false,


Lines: 199-203
 */
export function getClientIp(request: Request): string {
  const vercelForwardedFor = request.headers.get("x-vercel-forwarded-for");
  if (vercelForwardedFor) {
    const firstIp = vercelForwardedFor.split(",")[0].trim();

File: DSP_Nexus_P1\src\lib\utils.ts

Lines: 22-26
 * Rejects absolute URLs, protocol-relative URLs, and paths not starting with...
 */
export function safeNextPath(nextParam: string | null): string {
  const defaultPath = "/app";


Lines: 45-49

  // Optional: restrict to /app prefix for extra safety
  if (!nextParam.startsWith("/app")) {
    return defaultPath;
  }

File: DSP_Nexus_P1\src\lib\env.ts

Lines: 42-46
 */
export function getSiteUrl(): string {
  return getRequiredEnvAny(["SITE_URL", "NEXT_PUBLIC_SITE_URL"]);
}
