# Contour Consultations: mini-LMS

A small consultation-booking LMS built with **Next.js 16 (App Router)**, **Supabase** (Postgres + Auth) and **shadcn/ui**.

- Students sign up, then book, reschedule, cancel and mark consultations complete or incomplete.
- Admins see every consultation in the system, read-only.

**Contents**
1. [Setup instructions](#1-setup-instructions), including special setup notes and a hosted-deployment checklist
2. [Implementation summary](#2-implementation-summary): architecture, API, database, access control, security
3. [Justifications](#3-justifications)
4. [Assumptions](#4-assumptions)
5. [What I'd do with more time](#5-what-id-do-with-more-time)

---

## 1. Setup instructions

### Prerequisites
- **Node.js 20.9+** (Next.js 16's minimum; developed on Node 24)
- **Docker Desktop**, running. The Supabase CLI uses it to run Postgres, Auth and the rest of the stack locally.

The Supabase CLI is a dev dependency, so there's nothing to install globally.

### Run it locally

```bash
npm install
npm run db:start          # starts local Supabase; a fresh install also applies migrations + seed
npx supabase status       # copy "API URL" and the "Publishable" key
cp .env.example .env.local   # paste the values in
npm run db:reset          # optional: re-applies migrations + seed for a clean database
npm run dev               # http://localhost:3000
```

On Windows PowerShell, use `Copy-Item .env.example .env.local` instead of `cp`.

### Special setup notes

- **Use the publishable key only.** `.env.local` needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`). The app never uses the secret / service-role key; don't add it. The app checks both variables at startup and stops with a clear message if either is missing or malformed.
- **Roles depend on a Custom Access Token Hook.** Locally it's enabled for you in `supabase/config.toml` (`[auth.hook.custom_access_token]`). On a hosted project it must be enabled by hand; see the checklist below.
- **Local auth settings live in `supabase/config.toml`.** Email confirmation is off, so sign-up signs you in straight away. Passwords need at least 8 characters, and password changes need a recent sign-in. Changes to `config.toml` take effect after `npm run db:stop && npm run db:start`.
- **Emails go to Mailpit**, not a real inbox: http://127.0.0.1:54324. That includes password-reset links.
- **Local ports:** app 3000, Supabase API 54321, Postgres 54322, Studio 54323, Mailpit 54324.
- **Windows:**
  - If `docker` isn't found after installing Docker Desktop, restart the terminal or VS Code.
  - If Vitest fails with `Cannot read properties of undefined (reading 'config')`, your shell's working directory has a lowercase drive letter (`c:\`), which is common in VS Code terminals. `cd C:\...` with an uppercase drive letter and re-run.
  - Keep the project out of OneDrive. Syncing `node_modules` makes the dev server recompile constantly.

### Demo accounts (from `supabase/seed.sql`)

| Email | Password | Role |
|---|---|---|
| `admin@example.com` | `password123` | admin |
| `student@example.com` | `password123` | student |
| `student2@example.com` | `password123` | student |

You can also sign up at `/auth/sign-up`. New accounts are always students.

### Promote a user to admin

Roles can only be changed by a privileged database role, never through the app's API:

```sql
update public.user_roles set role = 'admin'
where user_id = (select id from auth.users where email = 'someone@example.com');
```

Run this in Studio (http://127.0.0.1:54323 → SQL editor). The database applies the new role to data access immediately. The app's routing (which pages they're sent to) follows on their next token refresh, or at once if they sign out and back in.

### Tests and checks

```bash
npm run db:test     # pgTAP: roles, RLS access matrix, lifecycle, booking limits, hardening (needs db:start)
npm test            # Vitest: validation, cursors, error mapping, request limits, redirect safety, auth rules, API client
npm run typecheck
npm run lint        # includes a rule that UI code can't import Supabase directly
npm run db:types    # regenerate lib/database.types.ts after changing migrations
```

### Deploying to a hosted Supabase project

`supabase/config.toml` only configures the local stack. On a hosted project:

1. **Apply the schema:** `npx supabase link --project-ref <ref>`, then `npx supabase db push`. **Don't run `seed.sql`**: it creates accounts with known passwords.
2. **Enable the hook:** Dashboard → Authentication → Hooks → Custom Access Token → `public.custom_access_token_hook`. Without it, everyone is routed as a student. Data access stays correct even then, because RLS reads roles from the table.
3. **Auth settings:**
   - Turn on **email confirmation**. This also stops sign-up from revealing which emails already have accounts.
   - Turn on **secure password change**.
   - Set the minimum password length to 8.
4. **URLs:** set the Site URL, and add `https://<your-domain>/auth/confirm` and `https://<your-domain>/auth/update-password` to the Redirect URLs.
5. **Environment variables** on the host: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` only.
6. **Serve over HTTPS.** Production builds send HSTS and upgrade insecure requests.
7. **First admin:** promote them with the SQL above, in the dashboard's SQL editor.

---

## 2. Implementation summary

### What's built

- **Students:** sign up with their name, then manage their own consultations from a dashboard.
  - Book: first name, last name, reason, date and time (in their own timezone).
  - Filter by status, and tick a checkbox to mark a consultation complete or incomplete.
  - Reschedule or cancel scheduled ones.
  - Lists load page by page ("Load more").
- **Admins:** a read-only table of every consultation, filterable by status. It shows both the booking account and the name the booking was made under.
- **Auth:** sign-up, login, logout, password reset by email. Pages and APIs are role-gated, and non-admins get a 404 on admin pages.

### Architecture

```
Components ───────── UI only; no Supabase imports (enforced by ESLint)
   ▼
hooks/ ───────────── TanStack Query: caching, pagination, invalidation
   ▼
<domain>/api-client  typed REST client (the only place with API URLs)
   │  fetch /api/*  (same-origin, Supabase auth cookies)
   ▼
proxy.ts ─────────── refreshes the session; UX redirects only (not a security boundary)
   ▼
Route Handlers ───── requireApiUser(role) → size-capped body → Zod validation → repository
   ▼
<domain>/repository  the only code that knows table/column names; maps rows ⇄ DTOs
   │  Supabase client with the *user's* JWT (never the service-role key)
   ▼
Postgres ─────────── GRANTs (columns) + RLS (rows) + trigger (lifecycle rules)
```

**Encapsulation.** Each domain in `lib/` (`consultations`, `profiles`, `auth`) owns its types, validation, data access and error mapping. Code outside a domain sees only camelCase DTOs and typed functions, never table names, SQLSTATEs or SDK calls. Auth works the same way in the browser: forms call `lib/auth/auth-client.ts`, not Supabase. A new feature, such as tutors, adds one more domain of the same shape without touching the others.

Every consultation read and write goes through REST Route Handlers, as the brief asks (APIs over Server Actions). Having one API to secure and test is simpler. Server Components are used only for page-level authorisation and to prefill the booking form from the profile. Authentication is the exception. Sign-in, sign-up, password reset and logout call Supabase Auth from the browser, through `lib/auth/auth-client.ts`. The email-link confirmation is a route handler (`/auth/confirm`).

### API

| Method | Route | Role | Purpose |
|---|---|---|---|
| `GET` | `/api/consultations?status=&cursor=&limit=` | student | Own consultations, soonest first |
| `POST` | `/api/consultations` | student | Book `{ firstName, lastName, reason, scheduledAt }` |
| `PATCH` | `/api/consultations/:id` | student (owner) | `{ status }` to complete, mark incomplete or cancel; `{ scheduledAt }` to reschedule |
| `GET` | `/api/admin/consultations?status=&cursor=&limit=` | admin | All consultations with the booking student's profile |

- **Errors always use one shape:** `{ error: { code, message, details? } }`.
  - `400`: malformed JSON or an invalid pagination cursor.
  - `401`: not signed in.
  - `403`: a student-only endpoint called by an admin.
  - `404`: unknown id, someone else's consultation, or a non-admin calling an admin endpoint.
  - `409`: a status change that isn't allowed, a time slot you've already booked, or the upcoming-bookings limit.
  - `413`: the body is over 16 KB.
  - `415`: the body isn't JSON.
  - `422`: validation failed, with field-level details.
- **Pagination uses opaque keyset cursors** over `(scheduled_at, id)`, backed by composite indexes.

### Database (`supabase/migrations`)

| Migration | Contents |
|---|---|
| `…01_roles.sql` | `app_role` enum, `user_roles` table, **Custom Access Token Hook**, `current_app_role()` / `is_admin()` helpers |
| `…02_profiles.sql` | `profiles` table, plus `security definer` triggers that create the profile and default role on sign-up and keep the email in sync |
| `…03_consultations.sql` | `consultations` table, `consultation_status` enum, CHECK constraints, indexes, lifecycle trigger |
| `…04_consultations_rls.sql` | Column-level GRANTs and RLS policies |
| `…05_live_role_checks.sql` | RLS role helpers read `user_roles` instead of the JWT claim, so role changes apply immediately |
| `…06_booking_limits.sql` | 365-day horizon, one scheduled consultation per slot, 10-upcoming quota |
| `…07_security_hardening.sql` | Rejects whitespace-only text, makes cancelled rows fully immutable, removes EXECUTE on the trigger function |

**Consultation lifecycle.** One `status` column, enforced by a trigger:

```
scheduled ⇄ completed        (mark complete / incomplete)
scheduled → cancelled         (cancel: terminal, a soft delete)
```

- `completed_at` and `cancelled_at` are set by the trigger, never by the client.
- New bookings and reschedules must be in the future and at most 365 days ahead.
- Only `scheduled` consultations can be rescheduled or cancelled. A cancelled consultation can't be changed at all.
- A student can't hold two scheduled consultations at the same time, or more than 10 upcoming ones.

### Roles and access control

**Where the role comes from**
- The role is stored in `user_roles`. Authenticated users can **read** their own row but have no grant to **write** it.
- On every token issue, a Supabase **Custom Access Token Hook** copies the role into the JWT as the `user_role` claim.
  - The proxy and guards read it from verified claims via `getClaims()`, for routing and early rejection.
  - RLS doesn't trust the claim. It reads the live role from `user_roles` (see "Justifications").
- The role is **never** taken from `user_metadata`. Users can edit their own metadata, so that would allow privilege escalation. The pgTAP suite tests a sign-up that claims `"role": "admin"` in its metadata.

**Four layers enforce access, from outside in:**

| Layer | What it does | Why it's there |
|---|---|---|
| `proxy.ts` | Redirects signed-out users to login, and signed-in users away from the auth pages | User experience only |
| Page guards (`requirePageUser`) | Students who open `/admin` get the **404 page with a real 404 status**. Admins are sent from `/dashboard` to `/admin`. | Correct pages and status codes |
| API guards (`requireApiUser`) | Return 401, 403 or 404 before any query runs | Fail fast with clear errors |
| **Postgres GRANTs + RLS + trigger** | The final guarantee | Holds even if every layer above has a bug |

**Access matrix (enforced in Postgres, tested with pgTAP):**

| | select | insert | update | delete |
|---|---|---|---|---|
| Student, own rows | ✓ | ✓ (`student_id` is always `auth.uid()`) | `status`, `scheduled_at` only | ✗ |
| Student, others' rows | ✗ | ✗ | ✗ | ✗ |
| Admin | all rows | ✗ | ✗ | ✗ |
| Anon | ✗ | ✗ | ✗ | ✗ |

### Security

Each measure below has unit or pgTAP tests unless marked otherwise.

**Data access**
- RLS on every table, plus column-level GRANTs. `anon` has no privileges on any table.
- The app has no service-role key, so every query runs as the user and passes through RLS.
- The role is read from `user_roles` at query time, so a forged or stale token claim grants nothing.
- Functions that create profiles or issue tokens aren't callable through the API. `security definer` functions pin `search_path = ''`.

**Input**
- Zod `strictObject` rejects unknown fields, preventing mass assignment, for example sending `studentId` or `status` on create.
- The database re-checks every rule (lengths, whitespace-only text, lifecycle, booking limits), so a direct Data API call can't skip validation.
- JSON bodies are capped at 16 KB. The cap counts the bytes actually received, not the declared `Content-Length`, so oversized requests are rejected before they're buffered.
- Pagination cursors are strictly validated before they're used in a PostgREST filter, which prevents filter injection. Ids must be UUIDs.

**Information leakage**
- "Not found" and "not yours" return the same 404, so consultation ids can't be probed.
- Non-admins get 404, not 403, on admin pages and APIs, so the admin area's existence isn't revealed.
- Unknown database errors are logged on the server and returned as a generic 500.
- `/auth/error` shows only fixed messages for known codes, never text from the URL, so nobody can craft a link that displays their own message.

**Browser**
- **CSRF:** mutating endpoints require `Content-Type: application/json`. On top of SameSite=Lax cookies, this blocks cross-site HTML forms.
- **Open redirect:** the template's `/auth/confirm` passed `?next=` straight to `redirect()`. `lib/auth/safe-redirect.ts` now parses `next` the way a browser would and checks its origin. A prefix check isn't enough: browsers strip tabs and newlines, so `/%09/evil.example` turns into `//evil.example`. The route also rejects unknown email-link types.
- **Security headers** on every response (`next.config.ts`): CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, and HSTS in production. Checked live; there's no automated test.
- **XSS:** React escapes all rendered data, and the app's own code never uses `dangerouslySetInnerHTML`. The CSP only allows script files from the app's own origin, and `connect-src` limits where any injected script could send data.
- **Shared browsers:** with `cacheComponents`, Next keeps visited routes alive in hidden React `<Activity>` trees. So `useState`, form inputs and the TanStack Query cache survive client-side navigation, including logout and login. To stop that state reaching the next user:
  - logout does a full page load rather than `router.push`, as the Next.js "Preserving UI state" guide recommends;
  - the dashboard and admin shells are keyed by user id;
  - the query cache is cleared whenever the signed-in user changes;
  - auth forms clear password fields once submitted.

  These are checked manually; there's no automated test.

**Accounts**
- Passwords need at least 8 characters.
- Password changes need a recent sign-in, so a stolen or unattended session can't take over the account. The reset-link flow still works, because the link counts as a fresh sign-in.
- Sessions are verified with `getClaims()`, which checks the JWT signature. Refresh tokens rotate, and logout revokes them.
- Abuse limits: at most 10 upcoming bookings per student, plus Supabase Auth's built-in rate limits on sign-in and sign-up.

**Known trade-offs**
- **Supabase's auth cookies aren't `HttpOnly`.** The browser client needs to read them; that's how `@supabase/ssr` works. The XSS protections above are what protect them.
- **The CSP allows inline scripts** (see "Justifications").
- **Per-request rate limiting on the app's API** isn't implemented (see "With more time").

---

## 3. Justifications

**Why RLS (and not only checks in the app).** Supabase exposes every `public` table through PostgREST, and the publishable key ships to the browser. Without RLS, anyone could open DevTools and call `/rest/v1/consultations` directly, skipping our API entirely. So RLS is the baseline, not an extra. The API adds validation, friendly errors and HTTP semantics on top. The API also runs as the user (publishable key plus their JWT), so the policies apply to it as well. **The service-role key isn't used anywhere in the app.**

**Why column-level GRANTs as well as RLS.** RLS filters *rows*. It can't stop a student changing the `reason`, `student_id` or `completed_at` on their own row. Column GRANTs close that gap: students can insert only the four booking fields and update only `status` and `scheduled_at`.

**Why lifecycle rules live in a trigger.** Anything enforced only in the API can be bypassed through the Data API. The trigger makes invalid status changes impossible for every client. It raises custom SQLSTATEs (`CN001` invalid transition, `CN002` outside the bookable window, `CN003` quota reached), which the API maps to 409, 422 and 409. The same rules are mirrored in Zod and the UI so users get feedback early.

**Why the role is in a JWT claim (access token hook), but RLS reads the table.** The proxy and the page/API guards read the `user_role` claim, so routing and early rejection cost no query. This is Supabase's recommended RBAC pattern, and adding a role (e.g. `tutor`) is one enum value plus policies. But a claim is a snapshot from when the token was issued: on its own, a demoted admin would keep admin access until the token refreshed (up to 1 hour). So the RLS helpers `current_app_role()` / `is_admin()` read `user_roles` directly (migration `…05`). Policies call them as `(select …)`, so it's one primary-key lookup per statement. The database, the final guarantee, always sees the live role. A stale claim only affects routing: a demoted admin can still open `/admin` until the token refreshes, but sees no data. pgTAP tests cover both a forged claim and a demotion.

**Why one `status` column (not `is_completed` / `is_cancelled` flags).** Booleans allow impossible states, such as both completed and cancelled. An enum plus a trigger-enforced state machine makes those unrepresentable. CHECK constraints tie `completed_at` / `cancelled_at` to the status, so the timestamps can't drift from it either.

**Why cancel is a soft delete.** It keeps the history for the admin view and for audit, and students don't need a DELETE grant at all.

**Why booking limits live in the database.** The 365-day horizon, one-booking-per-slot rule and 10-upcoming quota are business rules, so they follow the same principle as the lifecycle: enforced in the trigger and a unique index, then mirrored in Zod and the date pickers. Two simultaneous bookings can't both slip past the quota: the trigger takes a per-student lock first.

**Why REST Route Handlers + TanStack Query.** The brief asks for APIs. A REST layer gives real HTTP semantics (status codes, `Location` on create) and one place to validate and authorise. Any client can use it, not just this UI. On the client, TanStack Query owns server state: caching, keyset "load more", invalidation after writes, and an optimistic update for the complete checkbox, so it feels instant and rolls back on error. Components never hold fetched data in `useState`.

**Why shared Zod schemas and camelCase DTOs.** The same schema validates the request in the route handler and the form in the browser, so client and server rules can't diverge. `strictObject` rejects unknown fields. Length limits match the database CHECK constraints, and the database stays the final authority. The API speaks camelCase; snake_case never leaves the repositories, so a column rename touches one file.

**Why domain modules with enforced boundaries.** Each domain keeps its table names, error codes and SDK calls to itself, so changing one thing touches one file. For example, renaming a column touches only the repository, and changing an error mapping touches only the domain's `errors.ts`. ESLint enforces the key boundary: components and hooks can't import Supabase. All forms use one pattern (react-hook-form + Zod + `FormField`), so they behave and fail the same way.

**Why `getClaims()` (not `getSession()`).** `getSession()` returns whatever is in the cookie without verifying it. `getClaims()` verifies the JWT's signature, so the user id and role the server acts on can't be forged by editing a cookie.

**Why validated configuration.** `lib/env.ts` parses the environment with Zod once, at startup. A missing or malformed variable fails immediately with a clear message, instead of as an obscure error mid-request. It's also the only module that reads `process.env`.

**Why non-admins get 404 on admin routes.** It doesn't reveal that the admin area exists. The admin API does the same, for consistency.

**Why keyset pagination.** OFFSET slows down as you page deeper and can skip or duplicate rows when data changes between page loads. Cursors are validated strictly before they're used in a PostgREST filter, which prevents filter injection; there's a unit test for this.

**Why the role-gated pages block rendering.** These pages use `export const instant = false`. With Next 16 `cacheComponents`, the alternative is streaming them behind `<Suspense>`. Blocking lets the server decide on redirects and send a **real HTTP 404** before any HTML goes out. Pages that depend on the session's role gain little from a prerendered shell.

**Why a static CSP rather than nonces.** A nonce-based CSP needs every page rendered on each request, which would give up the static shells that `cacheComponents` prerenders (the auth pages are fully static). So the CSP allows inline scripts, which Next.js and next-themes emit. The rest of the policy still does real work: `frame-ancestors 'none'` blocks clickjacking, `connect-src` limits where injected script could send data, and `object-src`, `base-uri` and `form-action` close other common injection routes.

---

## 4. Assumptions

- **Anyone who signs up is a student.** Admins are promoted out-of-band (SQL, Studio or seed). There's no self-service admin creation.
- **Names are stored on each booking.** The brief asks the form for first and last name, so they're saved on the consultation, prefilled from the profile. A student may book under a different name, for example for a sibling.
- **Bookings and reschedules must be in the future**, and at most 365 days ahead. A student can't book two consultations at the same time. There's no time-slot availability, opening hours or cross-student double-booking check, because there's no tutor/consultant entity in scope.
- **Booking limits are product defaults** (365 days, 10 upcoming). The quota applies when booking; marking a completed consultation incomplete isn't blocked by it.
- **Marking complete is up to the student.** It's allowed regardless of the scheduled time, and it can be undone.
- **Only scheduled consultations** can be rescheduled or cancelled. Cancelling is final.
- **Admins don't book.** Admin accounts can't create or change consultations; the admin view is read-only by design.
- **Times are stored as `timestamptz` (UTC)**, entered and shown in the viewer's browser timezone.
- **A single deployment region and a single Postgres database** are enough at this scale. Keyset pagination, indexed queries and a stateless app server mean it scales horizontally without changes.

---

## 5. What I'd do with more time

- **Admin actions with an audit log.** An `audit_log` table written by trigger, recording who changed what and when.
- **Tutors and availability.** A `tutors` entity, slot booking, and a Postgres exclusion constraint (`tstzrange` + `btree_gist`) to prevent double-booking.
- **Rate limiting** on the app's API and auth pages, e.g. with Upstash or at the edge.
- **End-to-end tests** with Playwright, plus CI running `supabase db reset`, `db:test`, Vitest and lint on every PR.
- **Generated types in CI** (`npm run db:types`) with a diff check.
- **Email reminders** and calendar (ICS) invites.
- **Realtime updates** on the admin view; server-side search and sort.
- **Optimistic concurrency** on reschedule, using an `updated_at` precondition.
- **A stricter, nonce-based CSP** if the app moves to fully dynamic rendering, and `require_current_password` for password changes.

---

## Project layout

```
proxy.ts                              session refresh + UX redirects
next.config.ts                        security headers (CSP etc.)
app/
  api/consultations/route.ts          GET, POST  (student)
  api/consultations/[id]/route.ts     PATCH      (student, owner)
  api/admin/consultations/route.ts    GET        (admin)
  dashboard/page.tsx                  student dashboard
  admin/page.tsx                      admin view (404 for non-admins)
  auth/*                              auth pages (sign-up adds names), /auth/confirm email-link route
components/
  consultations/                      dashboard, admin table, dialogs
  form-field.tsx                      label + control + accessible error, used by every form
hooks/use-consultations.ts            TanStack Query hooks: caching, pagination, optimistic toggle
lib/
  env.ts         validated configuration (the only place that reads process.env)
  format.ts      display formatting (dates in the viewer's timezone)
  api/           shared wire types, generic error shape + Postgres error mapping,
                 size-capped request parsing, browser fetch wrapper
  auth/          roles.ts (role rules), session.ts, guards.ts (page/API guards),
                 auth-client.ts (browser auth operations), validation.ts,
                 safe-redirect.ts, auth-errors.ts (fixed error-page messages)
  consultations/ types.ts, validation.ts (shared Zod), repository.ts (data access),
                 errors.ts (domain DB errors), api-client.ts (browser REST client), cursor.ts
  profiles/      repository.ts (data access), validation.ts (name rules)
  supabase/      client/server/proxy clients, TypedSupabaseClient
supabase/
  migrations/  schema, roles, RLS, live role checks, booking limits, hardening
  tests/database/  pgTAP suites
  seed.sql     demo users and data (local only)
  config.toml  local stack config (token hook, password rules)
tests/         Vitest unit tests
```
