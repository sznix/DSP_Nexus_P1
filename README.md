# DSP Nexus - Fleet Intelligence Platform

The "Digital Twin" Fleet Intelligence Platform for Amazon Delivery Service Partners. DSP Nexus is a next-generation logistics tool designed to solve the chaos of the daily dispatch parking lot.

## Phase 1: Authentication & App Shell

This phase implements:
- **Supabase SSR Authentication** using `@supabase/ssr` with magic link login
- **Protected Routes** with middleware-based authentication
- **Role-Based Navigation** (Admin, Manager, Dispatcher, Mechanic)
- **Snake Walk Dispatch View** - sorted by zone and spot for efficient walking paths

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Authentication**: Supabase Auth SSR
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL with RLS)

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project with the required tables

### Environment Variables

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=your_supabase_anon_key

# Optional: Default timezone for date calculations (defaults to America/Los_Angeles)
NEXT_PUBLIC_DEFAULT_TIMEZONE=America/Los_Angeles
```

### Database Requirements

The following tables should exist in your Supabase project with RLS enabled:

- `tenants` - Tenant/organization data
- `tenant_members` - User-tenant relationships with roles (admin, manager, dispatcher, mechanic)
- `work_days` - Work day records
- `daily_assignments` - Daily dispatch assignments
- `lot_zones` - Parking lot zones with `sort_order`
- `lot_spots` - Parking spots with `sort_index`
- `vans` - Fleet vehicles
- `drivers` - Driver records

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

### Production Build

```bash
npm run build
npm start
```

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/              # Auth API routes
│   │   ├── dispatch/          # Dispatch API routes
│   │   └── import-airlock/    # Import Airlock API (create, map, diff, publish)
│   ├── app/                   # Protected app routes
│   │   ├── admin/             # Admin panel (admin, manager only)
│   │   │   └── import-airlock/ # Import wizard (upload → map → diff → publish)
│   │   ├── dispatch/          # Snake Walk dispatch view (admin, manager, dispatcher)
│   │   ├── mechanic/          # Mechanic view (mechanic only)
│   │   ├── error.tsx          # Error boundary for /app routes
│   │   ├── loading.tsx        # Loading UI for /app routes
│   │   ├── logout-button.tsx  # Client-side logout component
│   │   └── page.tsx           # Dashboard with role-based navigation
│   ├── auth/
│   │   └── callback/          # OAuth callback handler (with open redirect protection)
│   ├── login/                 # Login page with magic link
│   ├── error.tsx              # Global error boundary
│   ├── layout.tsx             # Root layout
│   └── page.tsx               # Root redirect
├── components/
│   ├── AppHeader.tsx          # Shared header component
│   └── ErrorDisplay.tsx       # Shared error display component
├── lib/
│   ├── import-airlock/        # Import Airlock utilities (parsers, name resolution, types)
│   ├── utils.ts               # Utility functions (env helpers, date helpers, path validation)
│   └── supabase/
│       ├── client.ts          # Browser client (createBrowserClient)
│       ├── server.ts          # Server client (createServerClient)
│       └── middleware.ts      # Session management (updateSession)
└── middleware.ts              # Auth protection middleware
```

## Authentication Flow

1. User visits `/login`
2. Enters email and requests magic link
3. Clicks magic link in email
4. Redirected to `/auth/callback` which exchanges code for session
5. Redirected to `/app` dashboard
6. Role-based navigation displayed based on `tenant_members.role`

## Key Features

### Middleware Protection

All `/app/*` routes are protected by middleware that:
- Uses `supabase.auth.getClaims()` to validate the session
- Redirects unauthenticated users to `/login`
- Redirects authenticated users from `/login` to `/app`

### Cookie Handling

Following Supabase SSR best practices:
- Uses ONLY `getAll()` and `setAll()` for cookie operations
- Never uses deprecated `get`, `set`, `remove` methods
- Properly handles cookie updates in both Server Components and Route Handlers
- Middleware stashes cookies to apply to redirect responses (prevents auth loops)

### Security Features

- **Open Redirect Protection**: Auth callback validates redirect paths to prevent external redirects
- **Role-Based Access Control**: Each protected page enforces role checks (not just navigation)
  - `/app/admin`: admin, manager
  - `/app/dispatch`: admin, manager, dispatcher
  - `/app/mechanic`: mechanic
- **Environment Variable Validation**: Runtime checks for required environment variables
- **Email Sanitization**: Login form trims and lowercases email before submission

### Snake Walk View

The dispatch page queries daily assignments and sorts them by:
1. Zone `sort_order` (ascending)
2. Spot `sort_index` (ascending)

This creates an efficient walking path through the parking lot.

### Timezone Handling

Date queries use timezone-aware helpers to ensure the displayed date matches the queried date, regardless of server timezone. Configure via `NEXT_PUBLIC_DEFAULT_TIMEZONE` environment variable (defaults to `America/Los_Angeles`).

## Roadmap

- [x] Phase 1: Authentication & App Shell
- [x] Phase 2: Import Airlock (Admin data import)
- [ ] Phase 3: Real-time Dispatch Updates
- [ ] Phase 4: Mechanic Issue Tracking
- [ ] Phase 5: Mobile PWA Optimization

## License

Apache 2.0
