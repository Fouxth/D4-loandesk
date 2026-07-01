# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**D4-LoanDesk** — a multi-tenant loan management system for Thai lending businesses. Built as a decoupled monorepo: an Express/TypeScript backend and a React/TypeScript frontend.

---

## Commands

### Root (run both services together)
```bash
npm run dev           # starts backend + frontend concurrently
npm run install:all   # installs deps for root, backend, and frontend
```

### Backend (`cd backend`)
```bash
npm run dev           # nodemon (ts-node) — hot reload
npm run build         # tsc → dist/
npm run start         # node dist/index.js (production)
```

### Frontend (`cd frontend`)
```bash
npm run dev           # Vite dev server (default: http://localhost:5173)
npm run build         # tsc -b && vite build
npm run lint          # eslint
npm run preview       # preview the production build
```

There are no automated tests in this project.

### Standalone data scripts (`cd backend`)
One-off data operations run directly with `ts-node`:
```bash
npx ts-node src/import_excel.ts       # bulk import from Excel
npx ts-node src/audit_excel_vs_db.ts  # reconcile Excel vs DB
npx ts-node src/repair_tp_payments.ts # fix ท+ป payment records
npx ts-node src/run_migration.ts      # apply a SQL migration file
```

---

## Environment

Create a `.env` file in the repo root. The backend loads it from `process.cwd()` and `../` (so it works whether you `cd backend` or run from the root). Key variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Signs access tokens |
| `SESSION_SECRET` | Cookie session secret |
| `FRONTEND_ORIGIN` | Comma-separated allowed CORS origins |
| `PORT` | Backend port (default 3000) |
| `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_CHANNEL_SECRET` | LINE Messaging API |
| `DISCORD_BOT_TOKEN` / `DISCORD_GUILD_ID` | Discord bot integration |
| `DISABLE_LINE_CRON` | Set `true` to skip LINE scheduler on local dev |
| `VITE_API_BASE_URL` | Frontend — base URL for the backend API |

The Vite dev server proxies `/api` → `http://localhost:9876`, so the backend must run on port **9876** locally (set `PORT=9876` in `.env`).

---

## Architecture

### Multi-tenancy

Every piece of data is scoped by `tenant_id`. The system supports multiple independent lending businesses ("tenants") on a single deployment. A super-admin role with `tenantId = 'system'` can manage all tenants via `/api/tenants`.

### Backend (`backend/src/`)

- **Entry**: `index.ts` → calls `createApp()`, starts the LINE cron scheduler, and starts the HTTP server.
- **App**: `app.ts` — mounts all routes under `/api/*`, configures CORS (allowlist-based; dev allows any `localhost:*`), and disables ETags.
- **Database**: `db.ts` — single `postgres` (npm: `postgres`) connection pool with `transform: postgres.camel` (snake_case columns arrive as camelCase in JS). No ORM, no migrations tool — raw SQL queries.
- **Auth**: JWT is accepted from either an `httpOnly` cookie (`session`) or an `Authorization: Bearer` header — the backend checks both. The frontend stores the token in `localStorage` and sends it as Bearer. The `authenticate` middleware (`middleware/auth.middleware.ts`) validates the token and injects `req.userId` / `req.tenantId`. It also blocks requests from inactive tenants.
- **Routes** → **Services** pattern: each domain (`customers`, `loans`, `finance`, `reports`, `activity`, `settings`, `auth`, `tenants`, `webhook`, `cron`) has a `*.routes.ts` file that delegates to a `*.service.ts`.
- **LINE integration**: `services/line.service.ts` sends messages; `services/lineScheduler.service.ts` runs a 1-minute `setInterval` cron to fire digest/overdue notifications at configurable Bangkok-timezone times (`LINE_CRON_MORNING`, `LINE_CRON_EVENING`). The scheduler is skipped on Vercel (serverless) — `backend/vercel.json` defines two Vercel cron schedules hitting `/api/cron/line-notifications/morning` and `/api/cron/line-notifications/evening` instead.
- **File uploads (attachments)**: Loan attachments (images/PDFs) are **not stored locally** — they are uploaded to a per-tenant Discord channel via the Discord bot, and the resulting CDN URL is saved in the DB. `uploads/` (served statically) is only used for other purposes.
- **Excel import**: `import/excelParsers.ts` parses uploaded `.xlsx` files for bulk loan data import.
- **Database migrations**: plain `.sql` files in `backend/migrations/`, applied manually via `ts-node src/run_migration.ts`.

### Frontend (`frontend/src/`)

- **Path alias**: `@` maps to `src/` (configured in `tsconfig.app.json` and `vite.config.ts`). Use `@/components/...`, `@/lib/...`, etc.
- **Router**: TanStack Router with file-based routing. Routes live in `src/routes/` — the router tree is auto-generated into `src/routeTree.gen.ts` by the Vite plugin on dev/build. **Never edit `routeTree.gen.ts` manually.**
- **API layer**: `lib/api.ts` — Axios instance that automatically attaches the JWT from `localStorage` and handles 403 suspension responses. `lib/services.ts` — typed wrappers for every API endpoint.
- **Data fetching**: TanStack Query (`@tanstack/react-query`) for server state.
- **State/contexts**:
  - `AuthContext` — current user, roles, sign-in/out, polls every 30 s for suspension.
  - `ThemeContext` — light/dark theme.
  - `SettingsContext` — per-tenant business profile + lending config (interest rates, fees, etc.).
- **UI components**: shadcn/ui (Radix primitives + Tailwind CSS v4). All generated components live in `src/components/ui/` — prefer extending over rewriting them.
- **i18n**: `i18next` + `react-i18next`. Translations in `src/locales/th.json` (default) and `src/locales/en.json`.
- **Forms**: `react-hook-form` + `zod` for validation.
- **Late fee / ท+ป logic**: calculation logic is intentionally duplicated in both `backend/src/utils/lateFee.ts` + `tpPayment.ts` and `frontend/src/utils/lateFee.ts` + `tpPayment.ts` so the frontend can show previews without a round-trip. Keep both in sync when changing calculation rules.

### Roles

Users have roles stored in `user_roles` table: `admin`, `staff`, and a special `system` tenant for the super-admin panel (`/super-admin` route).

### Deployment

- **Frontend**: Vercel (static). Set `VITE_API_BASE_URL` to the backend URL.
- **Backend**: Can run on Vercel (serverless via `/api/cron` for scheduled work) or on a self-hosted Node server (where the LINE scheduler runs in-process). Production entry is `dist/index.js` after `npm run build`.
- **Local proxy**: `Run_caddy.bat` suggests Caddy is used locally to proxy frontend + backend under a single origin.
