# Agents for Humanity — web app (Phase 1 foundations)

Next.js app for **agentsforhumanity.ai**. Product and build specs live one level up in `../Project FIles/`.

## Prerequisites

- Node.js 20+ (LTS recommended)
- npm
- A Postgres URL ([Supabase](https://supabase.com) or [Neon](https://neon.tech))
- A [Clerk](https://clerk.com) application (dev keys are fine)

## Local setup

```bash
cd app
cp .env.example .env.local
# Edit .env.local: DATABASE_URL, Clerk keys, Supabase URL + anon key

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Use **Sign in** to verify Clerk.

- [http://localhost:3000/api/health/db](http://localhost:3000/api/health/db): DB connectivity
- [http://localhost:3000/api/health/rls](http://localhost:3000/api/health/rls): Clerk-to-Supabase JWT mapping (`auth.jwt()` / RLS context)

## Clerk + Supabase RLS mapping

RLS owner policies now key off Clerk user identity via `users.clerk_user_id = auth.jwt()->>'sub'`.

Required one-time Clerk setup:

1. In Clerk dashboard, create a JWT template named `supabase` (or set `CLERK_SUPABASE_JWT_TEMPLATE`).
2. Ensure the template includes:
   - `role: "authenticated"`
   - `sub: "{{user.id}}"`
   - `aud: "authenticated"` (recommended)
3. On first sign-in, insert/update a row in `users` with `clerk_user_id = Clerk user id`.

Without this template, `/api/health/rls` will report token/template errors.

## Scripts

| Script        | Purpose                          |
| ------------- | -------------------------------- |
| `npm run dev` | Local development server         |
| `npm run build` | Production build              |
| `npm run start` | Run production build locally  |
| `npm run lint`  | ESLint                        |
| `npm run typecheck` | TypeScript `--noEmit`     |
| `npm run db:push` | Apply schema with Drizzle Kit (optional in Phase 0) |

## Database (optional Phase 0 migration)

The API health check only runs `SELECT 1` and does not require tables. To sync the minimal `app_config` table for Drizzle Kit wiring:

```bash
npx drizzle-kit push
```

Use a dev database; follow Row Level Security practices in Phase 1.

## Security

- Do not put `SUPABASE_SERVICE_ROLE` or similar secrets in `NEXT_PUBLIC_*` or client code.
- After `npm run build`, skim the bundle for accidental key material (see developer kickoff protocol in `../Project FIles/developer-kickoff.md`).

## Vercel staging

1. Create a GitHub repository and push this `app` directory (or the whole workspace with **Root Directory** set to `app` in Vercel).
2. Import the repo in Vercel; set **Environment Variables** to match `.env.example` (production + preview).
3. Deploy preview on every PR; promote `main` to production when ready.

## CI

GitHub Actions workflow lives in [.github/workflows/ci.yml](.github/workflows/ci.yml). It runs **lint**, **typecheck**, and **build** on pushes and PRs to `main` and `staging`. The build step uses placeholder env values when repository **Secrets** are unset so CI stays green; add real `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `DATABASE_URL` secrets if you want CI to compile with production-like keys.
