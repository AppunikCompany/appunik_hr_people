# Workspace

## Overview

pnpm workspace monorepo using TypeScript. This is a complete HR Management System for TechNova Solutions Pvt. Ltd., a 50-person IT company (hybrid WFO+WFH).

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui + Radix UI
- **Auth**: Replit OIDC (openid-client with PKCE)
- **Email**: Resend API (automation engine)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server (port 8080)
│   └── hr-system/          # React+Vite frontend (port from $PORT)
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Zod schemas (auth + generated)
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── tsconfig.json
```

## HR System Modules

11 modules implemented:
1. **Employee Management** — Directory, profiles, org chart (50 seeded employees)
2. **Attendance & WFH Tracking** — Clock in/out, WFO/WFH mode, team view, holidays
3. **Leave Management** — Apply/approve/reject, leave balances, calendar, comp-off
4. **Onboarding** — Checklists per employee, task tracking
5. **Employee Self-Service** — Dashboard, personal attendance/leave
6. **KRA/Performance** — KRA assignments, review cycles, templates, scoring
7. **Asset Management** — 45 seeded assets, assignment/return
8. **Reports & Analytics** — Headcount, attendance, attrition reports
9. **Admin & Configuration** — Departments, designations, leave policies, company profile, financial year
10. **Automations** — 20 email automation rules via Resend (`fireAutomationEvent()`)
11. **Settings** — Notification settings, company config

## Design System

- **Font**: Inter
- **Palette**: `#111827` (near-black), `#2563EB` (blue), `#F9FAFB` (off-white)
- **No gradients**, `shadow-sm` max, `rounded-lg` max
- **Status pills**: colored dot + text
- **Sidebar**: white bg, `border-l-2 border-primary` on active item
- **Breadcrumb** on every page

## Roles (RBAC)

- `super_admin`, `hr_admin`, `it_admin`, `manager`, `employee`
- All routes protected by `requireAuth` middleware
- Write routes use `requireRole(...)` to restrict by role
- Session stored in PostgreSQL `sessions` table via `sessionStore`

## Auth Flow

- GET `/api/login` → Replit OIDC with PKCE
- GET `/api/callback` → exchanges code, upserts user, creates session
- GET `/api/logout` → clears session, redirects to Replit end_session
- GET `/api/auth/user` → returns `{ id, role, firstName, ... }` or `{ id: null, role: "guest" }`
- Frontend shows login screen when `user.id === null`

## Automations

- `artifacts/api-server/src/lib/automations.ts`
- `fireAutomationEvent(event, payload)` — dispatches emails for 12 event types
- `runScheduledAutomations()` — birthday/work-anniversary crons
- Uses Resend API (`RESEND_API_KEY` env var required for email sending)
- 20 seeded rules + email templates in DB

## Key Files

```
artifacts/api-server/src/
  app.ts                        # Express app, global authMiddleware
  index.ts                      # Entry point
  middlewares/authMiddleware.ts # requireAuth, requireRole(), req.user
  lib/auth.ts                   # OIDC config, session helpers
  lib/automations.ts            # Automation engine (Resend)
  routes/
    auth.ts                     # /login /callback /logout /auth/user
    employees.ts
    attendance.ts
    leave.ts
    onboarding.ts
    assets.ts
    kra.ts
    reports.ts
    automations.ts
    admin.ts

artifacts/hr-system/src/
  App.tsx                       # AuthGate → LoginPage | Router
  components/Layout.tsx         # Sidebar + breadcrumb
  hooks/useApi.ts               # React Query hooks for all endpoints
  pages/                        # Dashboard, Employees, Leave, etc.

lib/db/src/schema/
  auth.ts                       # usersTable (with role), sessionsTable
  employees.ts, leave.ts, etc.  # Full schema

lib/api-zod/src/
  index.ts                      # Exports ./generated/api and ./auth only
  auth.ts                       # AuthUser type with role
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — only `.d.ts` files during typecheck
- **TS7030 fix pattern**: use `if (!x) { res.status(404).json({...}); return; }` not `return res.xxx()`; async handlers need `: Promise<void>` annotation

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively builds all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Database

- Seeded: 50 employees, 45 assets, 184 leave balances, 20 automation rules/templates
- Schema push: `pnpm --filter @workspace/db run push`
- Company: TechNova Solutions Pvt. Ltd., Bengaluru

## Environment Variables

- `DATABASE_URL` — provided by Replit PostgreSQL
- `RESEND_API_KEY` — required for automation emails
- `REPL_ID`, `REPLIT_DOMAINS` — provided by Replit (used for OIDC)
