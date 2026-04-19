# Supabase -> Neon Postgres Migration Notes

## Inventory of Supabase touchpoints

Files that imported Supabase before the migration:

1. `app/page.tsx` — `createClientComponentClient()` to instantiate a Supabase client passed to `spotifyLogin()`. **No DB calls** — only used for auth.
2. `app/home/page.tsx` — the bulk of usage:
   - `createClientComponentClient()` instantiation.
   - `supabase.auth.getSession()` — read Spotify `provider_token` and Supabase `user.id`.
   - `supabase.from("users").select("accepted_eula").eq("user_id", uid)`
   - `supabase.from("users").upsert({ user_id, accepted_eula: true }).select()`
   - `supabase.from("notes").select("track_id, note").eq("user_id", uid).eq("track_id", tid).single()`
   - `supabase.from("notes").upsert({ user_id, track_id, note }, { ignoreDuplicates: false })`
   - `supabase.from("notes").delete().eq("user_id", uid)`
3. `util/authutils.js` — `sb.auth.signInWithOAuth({ provider: "spotify", scopes, redirectTo })` and `sb.auth.signOut()`.
4. `app/middleware.ts` — `createMiddlewareClient` + `supabase.auth.getSession()` for route gating.
5. `package.json` — `@supabase/supabase-js`, `@supabase/auth-helpers-nextjs`.
6. `.env.local` / `.env.development.local` — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

No `.rpc()` calls. No generated types. No edge functions. No RLS-aware code.

## Reconstructed schema (`migrations/001_initial.sql`)

Two tables, inferred from the code's `.from()` / `.select()` / `.insert()` / `.upsert()` / `.eq()` calls:

- **`users`** — keyed by `user_id` (originally a Supabase auth UUID), tracks EULA acceptance.
  - `user_id TEXT PRIMARY KEY`
  - `accepted_eula BOOLEAN NOT NULL DEFAULT FALSE`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **`notes`** — one row per (user, Spotify track), stores HTML note body.
  - `user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE`
  - `track_id TEXT NOT NULL` (Spotify track ID, e.g. `4cOdK2wGLETKBW3PvgPWqT`)
  - `note TEXT NOT NULL DEFAULT ''`
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - `PRIMARY KEY (user_id, track_id)` — required for the existing `.upsert()` semantics.
  - Index on `(user_id)` for the bulk delete in `deleteUserData()`.

`user_id` is `TEXT` not `UUID` because the migration away from Supabase Auth means future user IDs likely won't be UUIDs (e.g. Spotify user IDs like `1234abcd`). TEXT keeps the door open without forcing a cast.

## Library chosen: `drizzle-orm` + `postgres` (postgres-js)

Typed query builder, plays well with Neon's serverless connection pooling, lightweight, no codegen step, and matches the user's likely flur setup. Schema lives in `lib/db/schema.ts`; the client is exported from `lib/db.ts`.

## Files touched

Refactored:
- `app/home/page.tsx` — replaced all `supabase.from(...)` calls with `fetch()` calls to new `/api/notes` and `/api/users` endpoints. Auth-related code (session/provider_token) flagged with TODOs (see Auth Caveat below).
- `app/page.tsx` — removed Supabase client; `spotifyLogin` no longer takes a client argument.
- `util/authutils.js` — replaced Supabase auth with TODO stubs (see Auth Caveat below).
- `app/middleware.ts` — removed Supabase session check; left a passthrough with a TODO.
- `package.json` — dropped `@supabase/*`, added `drizzle-orm`, `postgres`, `drizzle-kit` (dev).

Created:
- `lib/db.ts` — exports the `postgres` client + `drizzle` instance from `DATABASE_URL`.
- `lib/db/schema.ts` — Drizzle schema for `users` and `notes`.
- `app/api/users/route.ts` — `GET` (read EULA), `POST` (upsert EULA).
- `app/api/notes/route.ts` — `GET` (single note), `PUT` (upsert note), `DELETE` (wipe user notes).
- `migrations/001_initial.sql` — `CREATE TABLE` statements to paste into Neon.
- `.env.example` — documents required env vars.
- `drizzle.config.ts` — for future `drizzle-kit` usage.

## Auth Caveat (IMPORTANT — read before deploying)

The original code used **Supabase Auth as the Spotify OAuth broker** — that's where `provider_token` came from. The brief said "treat Supabase as a pure database," and the user believes auth is direct Spotify OAuth via `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`, but the actual code does not use those env vars anywhere — Spotify OAuth was Supabase-mediated.

After this migration:
- DB is fully off Supabase.
- Auth is **stubbed out**. `spotifyLogin`, `spotifyLogout`, the middleware session check, and the `getSession()` call in `app/home/page.tsx` all have `TODO(auth)` markers.
- The app will not log in until you wire up a Spotify OAuth flow yourself (NextAuth.js with the Spotify provider is the easiest path; alternatively a custom `/api/auth/callback` route using the Authorization Code flow with `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`).
- Until auth exists, `userID` is hardcoded as `"local-dev-user"` so the DB calls have something to send. Replace once a real session exists.

This is the only "ambiguous/risky" thing in this migration.

## Manual steps for the user

### 1. Create the Neon project

In the Neon console (https://console.neon.tech):
1. Click **New Project**.
2. Name: `spotify-notes` (or whatever). Region: pick the one closest to your Vercel deployment (likely `us-east-2` / `aws-us-east-1`).
3. Postgres version: latest (17).
4. Click **Create project**.
5. Once provisioned, copy the **Pooled connection string** (the one ending in `-pooler`) — that is your `DATABASE_URL`. Format:
   `postgresql://USER:PASSWORD@ep-xxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require`

### 2. Apply the schema

In the Neon console, open **SQL Editor** and paste the entire contents of `migrations/001_initial.sql`. Click **Run**. Verify both tables appear under **Tables**.

### 3. Set the env var on Vercel

From the repo root, run these (the user runs these — Claude will not):

```bash
# Set DATABASE_URL on all environments (production, preview, development)
vercel env add DATABASE_URL production --scope ydoc5212s-projects
# Paste the pooled Neon connection string when prompted.

vercel env add DATABASE_URL preview --scope ydoc5212s-projects
vercel env add DATABASE_URL development --scope ydoc5212s-projects

# Remove the now-unused Supabase vars
vercel env rm NEXT_PUBLIC_SUPABASE_URL production --scope ydoc5212s-projects --yes
vercel env rm NEXT_PUBLIC_SUPABASE_URL preview --scope ydoc5212s-projects --yes
vercel env rm NEXT_PUBLIC_SUPABASE_URL development --scope ydoc5212s-projects --yes
vercel env rm NEXT_PUBLIC_SUPABASE_ANON_KEY production --scope ydoc5212s-projects --yes
vercel env rm NEXT_PUBLIC_SUPABASE_ANON_KEY preview --scope ydoc5212s-projects --yes
vercel env rm NEXT_PUBLIC_SUPABASE_ANON_KEY development --scope ydoc5212s-projects --yes
```

The Vercel project is `mysongnotes-zsjr` (project ID `prj_6nmSHOlWvfjdfqzOqY1GVESWg1iS`) under the `ydoc5212s-projects` team. If you've never linked the local repo, run `vercel link` first and select that project.

### 4. Local dev

Add `DATABASE_URL=...` (the same pooled Neon URL) to `.env.local`. Remove the two `NEXT_PUBLIC_SUPABASE_*` lines from `.env.local` and `.env.development.local`.

### 5. Deploy

`vercel --prod` (or push to `main` if auto-deploy is wired up). Expect the login flow to fail until Spotify OAuth is rebuilt — see Auth Caveat above.

---

## Post-NextAuth wire-up (April 2026)

The `TODO(auth)` stubs above have been replaced with a real Spotify OAuth flow
via **NextAuth v4** (`next-auth@^4`). Picked v4 over Auth.js v5 because this
project is on Next.js 13.4.7 — v5 targets Next 14+ and has had rough edges on
older 13.x. JWT session strategy (no DB session tables needed); the existing
`users` table is reused, keyed by the Spotify user id (the `id` field from
`/v1/me` exposed via the OAuth profile).

### Files added
- `lib/auth.ts` — NextAuth options (Spotify provider, scopes, JWT callbacks,
  refresh-token rotation, signIn event that upserts the `users` row).
- `lib/session.ts` — `getSessionUserId()` helper for server routes.
- `app/api/auth/[...nextauth]/route.ts` — NextAuth route handler.
- `app/providers.tsx` — `<SessionProvider>` wrapper for client components.
- `types/next-auth.d.ts` — module augmentation for `session.user.id`,
  `session.accessToken`, and the JWT shape.

### Files modified
- `util/authutils.js` — `spotifyLogin` / `spotifyLogout` now call NextAuth's
  `signIn("spotify")` / `signOut()`.
- `app/middleware.ts` — gates `/home/*` on a valid JWT, redirects to `/`
  otherwise. (NOTE: Next.js conventionally expects `middleware.ts` at the
  repo root, not under `app/`. Left as-is to match the pre-migration layout
  — move it if route gating ever stops triggering.)
- `app/home/page.tsx` — reads `session.accessToken` and `session.user.id`
  via `useSession()`; placeholder `local-dev-user` removed.
- `app/page.tsx` — auto-redirects authenticated users to `/home`.
- `app/layout.tsx` — wraps the tree in `<Providers>`.
- `.env.example` — adds `NEXTAUTH_SECRET`, `NEXTAUTH_URL`.

### Auth tables
None added. JWT session strategy uses cookies, so no `accounts`/`sessions`/
`verification_tokens` tables are needed. The Drizzle adapter was evaluated
and rejected as unnecessary complexity for this app.

### Manual steps the user must run

#### 1. Spotify Developer Dashboard

In https://developer.spotify.com/dashboard, open the app whose
`SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` are already on Vercel, then
under **Edit Settings → Redirect URIs** add **all** of these:

- `http://localhost:3000/api/auth/callback/spotify` (local dev)
- `https://mysongnotes-zsjr.vercel.app/api/auth/callback/spotify` (Vercel prod, adjust if your prod domain differs)
- `https://<your-custom-domain>/api/auth/callback/spotify` (if a custom domain is wired)

Click **Save**.

#### 2. Generate `NEXTAUTH_SECRET`

```bash
openssl rand -base64 32
```

Copy the output — you'll paste it into the `vercel env add` prompts.

#### 3. Add env vars on Vercel

```bash
# NEXTAUTH_SECRET — paste the openssl output when prompted, for each env.
vercel env add NEXTAUTH_SECRET production --scope ydoc5212s-projects
vercel env add NEXTAUTH_SECRET preview    --scope ydoc5212s-projects
vercel env add NEXTAUTH_SECRET development --scope ydoc5212s-projects

# NEXTAUTH_URL — the canonical URL NextAuth will use for OAuth callbacks.
# Production:
vercel env add NEXTAUTH_URL production --scope ydoc5212s-projects
# (paste: https://mysongnotes-zsjr.vercel.app — or your custom domain)

# Preview: NextAuth v4 auto-detects via VERCEL_URL on previews, so this is
# optional. If you skip it, preview deployments still work.
vercel env add NEXTAUTH_URL preview --scope ydoc5212s-projects
# (paste a representative preview URL or skip this command entirely)
```

`SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` are already on Vercel and
are consumed under those exact names — no changes needed.

#### 4. Local dev `.env.local`

Add to `.env.local`:

```
NEXTAUTH_SECRET=<paste the same openssl output>
NEXTAUTH_URL=http://localhost:3000
SPOTIFY_CLIENT_ID=<from Spotify dashboard>
SPOTIFY_CLIENT_SECRET=<from Spotify dashboard>
```

(`DATABASE_URL` should already be present from the prior migration.)

#### 5. Deploy

`vercel --prod`. The login button on `/` now triggers a real Spotify OAuth
round-trip and lands the user on `/home` with a populated session.

---

## Post-review fixes (April 2026)

Three issues surfaced during review and were addressed before the first
commit of this branch:

1. **`middleware.ts` moved to repo root.** Next.js only executes middleware
   from the project root or `src/` — `app/middleware.ts` was dead code and
   `/home/*` was therefore accessible unauthenticated. Moved to
   `/middleware.ts`; matcher unchanged.

2. **API routes now derive `user_id` from the session, not from the client.**
   Previously `/api/notes` and `/api/users` accepted `user_id` via query
   string / request body, so any authenticated user could read or delete
   anyone else's notes by guessing a Spotify username. Both routes now call
   `getSessionUserId()` (from `lib/session.ts`) and 401 on unauthenticated
   requests. Client callers in `app/home/page.tsx` drop `user_id` from all
   `/api/*` fetches accordingly.

3. **Data migration script added.** `scripts/migrate-from-supabase.mjs` pulls
   `public.users` + `public.notes` from the legacy Supabase database, joins
   against `auth.identities` to map each Supabase UUID to the user's Spotify
   id, and upserts the rewritten rows into Neon. Safe to re-run
   (`ON CONFLICT` upsert semantics) and supports `--dry-run`.

   To use:

   ```bash
   # Supabase → Database → Connection string, "URI" / "Direct connection".
   export SUPABASE_DATABASE_URL='postgres://postgres:PASSWORD@db.jjalymelerhbyeppemio.supabase.co:5432/postgres'
   # Neon pooled URL (same one DATABASE_URL points at in .env.local).
   export DATABASE_URL='postgres://...neon.tech/neondb?sslmode=require'

   # Sanity-check first:
   node scripts/migrate-from-supabase.mjs --dry-run
   # Then, for real:
   node scripts/migrate-from-supabase.mjs
   ```

   Run this **after** the Neon schema is applied (step 2 of the top-level
   manual steps) and **after** at least one user has signed in via NextAuth
   (so the `users` table's PK constraints and signIn-event rows don't trip
   you up — though the script handles empty target tables fine too).
