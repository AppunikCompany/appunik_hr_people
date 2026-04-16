# HR Management System — HR Suite

A custom HR Management System built for an IT company (~50 employees) with a hybrid work model (WFO + WFH).

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19 + Vite + Tailwind CSS + shadcn/ui |
| **Backend** | Express.js 5 (TypeScript) |
| **Database** | **MySQL** (via Drizzle ORM) |
| **State Management** | TanStack React Query |
| **Routing** | Wouter (client-side) |
| **Email** | Resend (transactional emails) |
| **Auth** | Replit Auth (OpenID Connect) |
| **Validation** | Zod |
| **Package Manager** | pnpm (monorepo with workspaces) |

> **Note:** The current project uses **MySQL** as the database with **Drizzle ORM** for type-safe queries and migrations.

## Project Structure

```
HR-Suite/
├── artifacts/
│   ├── api-server/          # Express.js backend API
│   │   └── src/
│   │       ├── routes/      # All API route handlers
│   │       ├── lib/         # Auth, automations, ownership helpers
│   │       └── middlewares/  # Auth middleware (RBAC)
│   └── hr-system/           # React frontend (Vite)
│       └── src/
│           ├── pages/       # All page components
│           ├── components/  # Shared + shadcn/ui components
│           └── hooks/       # API hooks (React Query)
├── lib/
│   ├── db/                  # Drizzle schema & DB connection
│   ├── api-spec/            # OpenAPI spec
│   ├── api-zod/             # Zod validation schemas (generated)
│   └── api-client-react/    # Auto-generated API client
└── scripts/                 # Build & post-merge scripts
```

## Roles & Access Control

The system supports 5 roles: **Super Admin**, **HR Admin**, **IT Admin**, **Manager**, **Employee**

---

## Module Status — What's Developed vs What's Remaining

### 1. Employee Management

| Feature ID | Feature | Status |
|------------|---------|--------|
| EM-01 | Employee Profile (name, DOB, gender, contact, address, emergency contact) | ✅ Done |
| EM-02 | Employment Details (designation, department, manager, type, joining date) | ✅ Done |
| EM-03 | Probation Tracking (probation end date field + automation reminder) | ✅ Done |
| EM-04 | Document Vault (upload/download with verification tracking) | ✅ Done |
| EM-05 | Org Chart (visual hierarchy API endpoint) | ✅ Done |
| EM-06 | Employment Status (Active / On Leave / Notice / Terminated) | ✅ Done |
| EM-07 | Promotion/Transfer History (employee_history table + API) | ✅ Done |
| EM-08 | Exit Management (resignation date, LWD, FnF status fields) | ✅ Done |
| EM-09 | Employee ID Generation (auto EMP-001 format) | ✅ Done |
| EM-10 | Bulk Import (CSV with row-level validation) | ✅ Done |

### 2. Attendance & WFH Tracking

| Feature ID | Feature | Status |
|------------|---------|--------|
| AT-01 | Web Clock In/Out (browser-based with timestamp) | ✅ Done |
| AT-02 | WFH Marking (before 10 AM cutoff enforced) | ✅ Done |
| AT-03 | WFO vs WFH Calendar (monthly view) | ✅ Done |
| AT-04 | Late Arrival Flag (after 9:30 AM grace period) | ✅ Done |
| AT-05 | Half Day Logic (auto-detect if <4 hrs or clock-in after 1 PM) | ✅ Done |
| AT-06 | Monthly Summary (present/absent/WFH/LOP) | ✅ Done |
| AT-07 | Team Dashboard (daily attendance at a glance) | ✅ Done |
| AT-08 | Holiday Calendar (national + company holidays CRUD) | ✅ Done |
| AT-09 | Overtime Tracking (log extra hours) | ✅ Done |
| AT-10 | Bulk Attendance Export (CSV/Excel for all employees) | ✅ Done |

### 3. Leave Management

| Feature ID | Feature | Status |
|------------|---------|--------|
| LV-01 | Leave Types Setup (CL, SL, EL, Maternity, Comp-off, LOP) | ✅ Done |
| LV-02 | Leave Balance (per-employee per-type, yearly) | ✅ Done |
| LV-03 | Apply Leave (with dates, reason, type) | ✅ Done |
| LV-04 | Approve / Reject (manager action with comments) | ✅ Done |
| LV-05 | Auto LOP (when balance exhausted) | ✅ Done |
| LV-06 | Comp-off Management (log work → credit comp-off) | ✅ Done |
| LV-07 | Leave Calendar (team calendar showing who's on leave) | ✅ Done |
| LV-08 | Leave Encashment (encash EL at year-end) | ❌ Not Done |
| LV-09 | Leave Policy Rules (no CL in probation, min notice, etc.) | ✅ Done |
| LV-10 | Leave History (full history with status) | ✅ Done |

### 4. Onboarding

| Feature ID | Feature | Status |
|------------|---------|--------|
| OB-01 | New Hire Checklist (assign tasks to IT/HR/Manager) | ✅ Done |
| OB-02 | Welcome Email (auto-send on joining date) | ✅ Done — Template seeded, Resend wired |
| OB-03 | Document Submission Tracker (employee uploads, HR verifies) | ✅ Done |
| OB-04 | Account Setup Checklist (email, Slack, GitHub tracking) | ✅ Done |
| OB-05 | Probation Reminder (alert HR + Manager 15 days before) | ✅ Done (automation) |
| OB-06 | Asset Assignment on Joining (auto-trigger) | ✅ Done |

### 5. Self-Service Portal

| Feature ID | Feature | Status |
|------------|---------|--------|
| SS-01 | Profile Update (employee edits own info) | ✅ Done |
| SS-02 | Leave Application (apply, view balance, history) | ✅ Done |
| SS-03 | Payslip Access (view/download payslips) | ❌ Not Done — Payroll is a separate module |
| SS-04 | WFH Marking | ✅ Done |
| SS-05 | Document Download (own offer letter, Form 16, etc.) | ✅ Done |
| SS-06 | Submit Reimbursement (upload bill, track status) | ✅ Done |
| SS-07 | View Assigned Assets | ✅ Done |
| SS-08 | KRA Dashboard (view own KRAs, ratings, review status) | ✅ Done |
| SS-09 | Investment Declaration (80C, HRA, LTA for TDS) | ✅ Done |
| SS-10 | Bulk Data Export (own attendance/leave as CSV) | ✅ Done |

### 6. KRA / Performance

| Feature ID | Feature | Status |
|------------|---------|--------|
| KR-01 | KRA Setup (define KRAs per designation/individual) | ✅ Done |
| KR-02 | KRA Assignment (assign with weightage, must sum to 100%) | ✅ Done |
| KR-03 | Target Setting (measurable targets per KRA) | ✅ Done |
| KR-04 | Self Assessment (employee rates with comments) | ✅ Done |
| KR-05 | Manager Rating (1-5 scale with comments) | ✅ Done |
| KR-06 | Weighted Score Calculation (auto-calculate) | ✅ Done |
| KR-07 | Review Cycle Management (open/close cycles) | ✅ Done |
| KR-08 | Review Dashboard (pending/completed, scores by dept) | ⚠️ Partial — Basic KRA summary in reports |
| KR-09 | Appraisal Outcome (link score to salary revision) | ❌ Not Done |
| KR-10 | Review History (archive past cycles per employee) | ❌ Not Done |
| KR-11 | KRA Templates (save/reuse by designation/dept) | ✅ Done |

### 7. Asset Management

| Feature ID | Feature | Status |
|------------|---------|--------|
| AM-01 | Asset Registry (master list with details) | ✅ Done |
| AM-02 | Asset Categories (Laptop, Monitor, Phone, etc.) | ✅ Done |
| AM-03 | Asset Assignment (assign to employee with date) | ✅ Done |
| AM-04 | Asset Return (return date, condition, re-availability) | ✅ Done |
| AM-05 | Asset Status (Available/Assigned/Under Repair/Retired/Lost) | ✅ Done |
| AM-06 | Asset History (full assignment/return history) | ⚠️ Partial — DB table exists, no dedicated UI |
| AM-07 | Employee Asset View | ✅ Done |
| AM-08 | Asset Acknowledgment (digital acknowledgment) | ✅ Done |
| AM-09 | Depreciation Tracking (purchase date, cost, depreciation) | ✅ Done |
| AM-10 | Exit Asset Checklist (auto-trigger on resignation) | ✅ Done |
| AM-11 | Asset Report (inventory: assigned/available/retired) | ✅ Done |
| AM-12 | Bulk Asset Import (CSV/Excel) | ✅ Done |

### 8. Bulk Import / Export

| Feature ID | Feature | Status |
|------------|---------|--------|
| BI-01 | Employee Bulk Import (Excel with validation) | ✅ Done |
| BI-02 | Employee Bulk Export (CSV) | ✅ Done |
| BI-03 | Attendance Bulk Export | ✅ Done |
| BI-04 | Leave Data Export | ✅ Done |
| BI-05 | Payroll Bulk Export | ❌ Not Done — Payroll is separate |
| BI-06 | Asset Bulk Import | ✅ Done |
| BI-07 | Asset Bulk Export | ✅ Done |
| BI-08 | KRA Bulk Import | ✅ Done |
| BI-09 | Import Validation (row-level error highlighting) | ✅ Done |
| BI-10 | Import Template Download (pre-formatted CSV templates) | ✅ Done |
| BI-11 | Import History Log | ✅ Done |

### 9. Reports & Analytics

| Feature ID | Feature | Status |
|------------|---------|--------|
| RP-01 | Headcount Report (by dept/designation/type) | ✅ Done |
| RP-02 | Attendance Report (monthly per employee & team) | ✅ Done |
| RP-03 | Leave Utilization (taken vs balance, by type) | ✅ Done |
| RP-04 | LOP Report (LOP days per employee) | ✅ Done |
| RP-05 | Payroll Summary | ❌ Not Done — Payroll is separate |
| RP-06 | WFH vs WFO Ratio (per employee & team) | ✅ Done |
| RP-07 | Attrition Report (exits per quarter, tenure) | ✅ Done |
| RP-08 | Asset Inventory Report | ✅ Done |
| RP-09 | KRA Performance Report (dept-wise scores) | ✅ Done |
| RP-10 | Form 16 Tracker | ❌ Not Done |

### 10. Admin & Configuration

| Feature ID | Feature | Status |
|------------|---------|--------|
| AD-01 | Department Master (CRUD) | ✅ Done |
| AD-02 | Designation Master (CRUD) | ✅ Done |
| AD-03 | Holiday Calendar Config | ✅ Done |
| AD-04 | Leave Policy Config (accrual, carry-forward, eligibility) | ✅ Done |
| AD-05 | Salary Component Config | ❌ Not Done — Payroll is separate |
| AD-06 | Role & Permission Matrix (access level management) | ✅ Done |
| AD-07 | Notification Settings (email toggle per event) | ✅ Done |
| AD-08 | Company Profile (name, logo, address) | ✅ Done |
| AD-09 | KRA Review Cycle Config | ✅ Done |
| AD-10 | Asset Category Config (categories + depreciation rates) | ✅ Done |
| AD-11 | Financial Year Config (April–March) | ✅ Done |

### 11. Automations & Email Notifications

| Feature ID | Feature | Status |
|------------|---------|--------|
| AU-01 | Birthday Email | ✅ Done — Template seeded, Resend wired |
| AU-02 | Work Anniversary Email | ✅ Done — Template seeded, Resend wired |
| AU-03 | Welcome Email — New Joiner | ✅ Done — Template seeded, Resend wired |
| AU-04 | Onboarding Checklist Email | ✅ Done — Template seeded, Resend wired |
| AU-05 | Probation End Reminder | ✅ Done — Template seeded, Resend wired |
| AU-06 | Probation Confirmation Email | ✅ Done — Template seeded, Resend wired |
| AU-07 | Leave Approval/Rejection Email | ✅ Done — Template seeded, Resend wired |
| AU-08 | Leave Reminder (year-end) | ✅ Done — Template seeded, Resend wired |
| AU-09 | Payslip Delivery Email | ❌ Not Done — Payroll is separate |
| AU-10 | Form 16 Delivery | ❌ Not Done |
| AU-11 | Asset Assignment Notification | ✅ Done — Template seeded, Resend wired |
| AU-12 | Asset Return Reminder | ✅ Done — Template seeded, Resend wired |
| AU-13 | KRA Review Reminder | ✅ Done — Template seeded, Resend wired |
| AU-14 | Document Expiry Alert | ✅ Done — Expiry date on docs, CRON endpoint |
| AU-15 | New Employee Announcement | ✅ Done — Template seeded, Resend wired |
| AU-16 | Exit/Offboarding Email | ✅ Done — Template seeded, Resend wired |
| AU-17 | Salary Revision Notification | ❌ Not Done — Payroll is separate |
| AU-18 | Attendance Regularization | ✅ Done — Daily missed-punch check endpoint |
| AU-19 | WFH Approval (Manager) | ✅ Done — Config toggle + approval flow |
| AU-20 | Holiday Announcement | ✅ Done — Monthly upcoming holidays email |

> **Automation Note:** The automation engine is fully built and activated — 15 email templates seeded via `POST /automations/seed-templates`, Resend SDK wired for delivery, event-based triggers via `fireAutomationEvent()`, and CRON-style endpoints for daily/monthly jobs. Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` env vars to enable live sending.

---

## Summary

| Category | Done | Partial | Not Done | Total |
|----------|------|---------|----------|-------|
| Employee Management | 10 | 0 | 0 | 10 |
| Attendance & WFH | 10 | 0 | 0 | 10 |
| Leave Management | 9 | 0 | 1 | 10 |
| Onboarding | 6 | 0 | 0 | 6 |
| Self-Service Portal | 9 | 0 | 1 | 10 |
| KRA / Performance | 8 | 1 | 2 | 11 |
| Asset Management | 10 | 1 | 1 | 12 |
| Bulk Import / Export | 10 | 0 | 1 | 11 |
| Reports & Analytics | 7 | 0 | 3 | 10 |
| Admin & Config | 9 | 0 | 2 | 11 |
| Automations | 15 | 0 | 5 | 20 |
| **Total** | **103** | **1** | **17** | **121** |

**Overall Progress: ~86% complete** (counting partial as 50%)

---

## Key Remaining Work

1. **Payroll** — Documented separately in `Payroll_Specification.xlsx`. Not part of this codebase (covers AU-09, AU-10, AU-17, AD-05, BI-05, RP-05, SS-03).
2. **Leave Encashment (LV-08)** — Year-end encashment of earned leave or carry-forward logic.
3. **KRA Enhancements (KR-08, KR-09, KR-10)** — Full review dashboard, appraisal outcome, review history archive.
4. **Form 16 Tracker (RP-10)** — Track which employees have Form 16 generated.
5. **Phase 6: Migration + Go-Live** — Data migration from Zoho, UAT, and production deployment.

---

## Frontend Pages

All major module pages are built with full UI:
- **Dashboard** — Stats cards, today's attendance, headcount by department
- **Employees** — List, search, filters, detail view, org chart, bulk import/export
- **Attendance** — Clock in/out, WFH, monthly calendar, team view, holidays
- **Leave** — Requests, balances, calendar, comp-off management
- **Onboarding** — Checklist management, task completion
- **Assets** — Registry, categories, assign/return
- **Performance** — KRA templates, review cycles, assignments, ratings
- **Reports** — Headcount, attendance, WFH ratio, LOP, attrition, asset inventory, KRA summary
- **Automations** — Rules, email templates, logs
- **Settings** — Departments, designations, leave policies, company profile, notifications, financial year
- **Self-Service** — Profile, attendance, leave summary, assigned assets

---

## Getting Started

```bash
# Install dependencies
pnpm install

# Set up environment
export DATABASE_URL="mysql://hr_people_app:hr_people_app_pass@127.0.0.1:3306/appunik"

# Run database migrations
pnpm --filter @workspace/db run push

# Start dev server
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/hr-system run dev
```

## Deployment

Use a dedicated deploy flow for shared databases. Do not run migration on every process boot.

```bash
pnpm run deploy:start
```

`deploy:start` runs:

```bash
pnpm run db:guard:shared
pnpm run db:migrate:deploy
pnpm run start:api
```

Deployment environments must provide one of:

- `MIGRATE_DATABASE_URL` preferred, using a DB user with DDL privileges for `drizzle-kit push`
- `DATABASE_URL` with the same schema migration privileges if `MIGRATE_DATABASE_URL` is not set

Shared DB safety contract:

- Only `people_*` tables are managed by this app.
- Never rename/drop/delete tables in shared DB migration flows.
- Never use `push-force` in automation.
- Existing `portal_*`, `recruit_*`, and other non-`people_*` tables must remain untouched.

Validation checks for each deploy:

1. `pnpm run db:guard:shared` passes.
2. Migration logs show only `people_*` table operations.
3. Existing non-`people_*` tables are unchanged.
4. API starts and role seeding succeeds after migration.

`pnpm start` now runs API only. Keep runtime and migration steps separate in platform configuration.

## Build Timeline (from spec)

| Phase | Modules | Est. Time | Status |
|-------|---------|-----------|--------|
| Phase 1 | Foundation (DB, Auth, Employee CRUD, Admin) | 5-7 days | ✅ Done |
| Phase 2 | Attendance + Leave | 7-8 days | ✅ Done |
| Phase 3 | Onboarding + Self-Service | 5-6 days | ⚠️ Partial |
| Phase 4 | KRA + Asset Management | 8-10 days | ✅ Done |
| Phase 5 | Reports + Polish | 4-5 days | ⚠️ Partial |
| Phase 6 | Migration + Go-Live | 7-10 days | ❌ Not Started |
