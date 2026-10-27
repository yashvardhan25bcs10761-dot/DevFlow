# DevFlow — Specification (v2, lean)

**Tagline:** Understand your repositories. Identify risks. Make better engineering decisions.

DevFlow analyzes public GitHub repositories, computes an explainable health score, flags stale issues and pull requests, generates rule-based recommendations, and stores analysis snapshots in MongoDB so users can see history.

The health score is a **DevFlow-defined heuristic**, not an official GitHub metric or a measure of code quality. This must be stated in the UI and README.

## 1. Principles

- GitHub is the source of truth for activity; MongoDB stores users, saved repos, preferences, and snapshots.
- Every score and recommendation must be explainable from measured data.
- Missing data is never silently zero. Bounded data is never presented as complete.
- Historical reports show stored snapshot values; never recompute them from live data.
- Works fully without any AI API.
- No fake data in production views.

## 2. Stack (fixed)

- Frontend: React + Vite, React Router, Lucide icons, plain CSS (or CSS modules). Recharts only for the history trend chart.
- Backend: Node 20+, Express, Mongoose, bcryptjs, jsonwebtoken, cookie-parser, helmet, express-rate-limit, zod (validation), cors.
- Tests: Vitest, Supertest, React Testing Library, `mongodb-memory-server` for backend integration tests (no real DB needed for tests).
- Modular monolith. Frontend never touches MongoDB.

## 3. Scope

### P0 — must work (MVP)

1. Register, login, logout, session persists across refresh
2. Public repo lookup by `owner/repo`
3. Save / list / remove repositories (no duplicates per user)
4. Run analysis; store snapshot
5. Dashboard with real data (health score, open issues, stale issues, open PRs, recent commits)
6. Repository detail page with score breakdown and recommendations
7. Issues page and Pull Requests page (filter, stale flag, pagination)
8. Analysis history list and open past report
9. Settings: stale issue days, stale PR days
10. Loading, empty, error, success states; responsive layout
11. Backend validation, ownership checks, centralized error handling
12. Tests for critical logic (section 11)
13. README, production build, deployment config

### Stretch (only after all P0 passes)

History trend chart, repository comparison, JSON/CSV export, cache controls, theme toggle, demo mode (explicitly labeled).

### Out of scope

OAuth, AI summaries, teams, notifications, scheduled jobs, org dashboards.

## 4. Repository structure

```
devflow/
  frontend/  src/{components,pages,contexts,services,utils}  .env.example  vite.config.js
  backend/   config/ controllers/ middleware/ models/ routes/ services/ validators/ tests/ app.js server.js .env.example
  .gitignore  README.md  package.json (root scripts)
```

Create folders only when they contain a file with a real purpose.

## 5. Environment variables

Backend `.env.example`:

```
NODE_ENV=development
PORT=5000
MONGODB_URI=
JWT_SECRET=
CLIENT_URL=http://localhost:5173
GITHUB_TOKEN=
BCRYPT_ROUNDS=12
```

Frontend `.env.example`:

```
VITE_API_URL=/api/v1
```

- `GITHUB_TOKEN` is **required** (unauthenticated GitHub allows only 60 req/hr). Use a fine-grained token with read-only public access. Backend-only.
- Server must exit with a clear message if `MONGODB_URI`, `JWT_SECRET`, or `GITHUB_TOKEN` is missing.
- `.gitignore`: `.env`, `.env.*` (except `.env.example`), `node_modules`, `dist`, logs.

## 6. Same-origin API strategy (decision)

To avoid third-party cookie problems between Vercel and Render:

- **Dev:** Vite dev server proxies `/api` to `http://localhost:5000`.
- **Prod:** Vercel `rewrites` proxy `/api/*` to the Render backend URL, so the browser only ever talks to the Vercel origin.
- Auth cookie: HttpOnly, `SameSite=Lax`, `Secure` in production, 7-day expiry.
- Frontend uses relative `/api/v1` and `credentials: "include"`.
- Render free tier sleeps when idle; the first request can take ~30–60s. Show a "server waking up" message on slow requests and document this.

## 7. Data models (Mongoose)

**User**: name, email (lowercase, unique index), passwordHash (never returned), timestamps.

**UserPreference**: userId (unique), staleIssueDays (int, default 14, range 1–365), stalePullRequestDays (int, default 7, range 1–365), defaultRepositoryId (optional), createdAt/updatedAt. Created lazily with defaults on first GET.

**Repository**: userId, githubId, fullName (stored lowercase for dedup), ownerLogin, name, description, htmlUrl, defaultBranch, visibility, stars, forks, githubCreatedAt, githubUpdatedAt, lastAnalyzedAt, latestHealthScore, timestamps.
- **Dedup strategy (decision):** unique compound index `{ userId: 1, fullName: 1 }` with fullName lowercased. Chosen because it works for every repo regardless of githubId availability. `githubId` is stored but not unique.
- Repo renames/transfers are a known limitation.

**Analysis** (one document per run, never embedded in Repository): userId, repositoryId, analyzedAt, healthScore (0–100 or null), scoreStatus (`complete | partial | insufficient_data`), scoreBreakdown (per-component score, weight, available flag, explanation), repositoryMetrics, activitySummary, issueSummary, pullRequestSummary, staleIssues (max 50 compact), stalePullRequests (max 50 compact), recommendations (max 20), dataWarnings[], thresholdsUsed {issueDays, prDays}, observationScope (what was fetched, caps, complete or not), timestamps.
- Indexes: `{userId, repositoryId, analyzedAt: -1}` and `{repositoryId, analyzedAt: -1}`.
- Store only compact fields, never raw GitHub payloads.

## 8. GitHub integration (`githubService`)

Only this module makes GitHub HTTP calls. Use the REST API with `Authorization: Bearer GITHUB_TOKEN`, 10s timeout, max 2 retries on network errors / 5xx with short backoff. Never retry rate-limit errors.

Fetch bounds (constants in one config file):

| Data | Endpoint | Bound |
|---|---|---|
| Metadata | `GET /repos/{o}/{r}` | 1 call |
| Commits | `/commits?since=<30 days ago>&per_page=100` | 1 page (max 100). If 100 returned, report "100+" |
| Issues | `/issues?state=all&sort=updated&direction=desc&per_page=100` | max 3 pages (300 items) |
| Pull requests | `/pulls?state=open&per_page=100` | max 2 pages (200) |

Rules:
- The issues endpoint returns PRs too: **drop any item with a `pull_request` field.**
- If a cap was hit, set `observationScope.complete = false` and add a data warning. Never present counts from capped data as the repo's total.
- Error mapping: 404 → REPO_NOT_FOUND; 401 → token invalid (server config error, 502-ish, no details to client); 403/429 → check `x-ratelimit-remaining` and `retry-after`/`x-ratelimit-reset` to distinguish rate limit (`GITHUB_RATE_LIMITED`, include reset time) from permission denial; 422 → validation; timeout/DNS → `GITHUB_UNAVAILABLE`. Never leak token or raw headers.
- Empty repos (409 on commits) → handled as zero commits with a warning.
- Cache: in-memory TTL cache (5 minutes, max 100 entries, key = endpoint + params). Responses carry `source: "live" | "cached"` and `fetchedAt`. `refresh=true` bypasses cache.

## 9. Analysis engine (pure functions, no Express/Mongo)

`analyzeRepository({ repo, commits, issues, pulls, thresholds, now, scope }) → result`

`now` is injected (testable). All functions are deterministic.

### Stale detection

`inactivityDays = floor((now − updatedAt) / 86_400_000)`

An **issue** is stale if state = open AND `updatedAt` valid AND `inactivityDays >= staleIssueDays`. Same for **PRs** with `stalePullRequestDays`. Invalid/missing timestamps → not stale, add data warning, never crash. Draft PRs are not stale just for being drafts. Boundary: exactly equal to threshold = stale.

Note in docs: `updatedAt` changes on any activity (bot comments, labels), so stale is a heuristic.

### Component scores (each 0–100 or `null` if unavailable)

1. **Commit activity (weight 0.30):** `commits30d` = commits in the last 30 days (from fetched data). `score = min(100, round(commits30d / 20 * 100))`. Saturation point: 20 commits per 30 days = 100. Zero commits gives 0 but is labeled "no commits observed in 30 days", not "unhealthy". Unavailable only if the commit fetch failed.
2. **Issue management (0.25):** `100 × (1 − staleOpenIssues / observedOpenIssues)`. `null` if observedOpenIssues = 0.
3. **Pull request management (0.25):** `100 × (1 − staleOpenPRs / observedOpenPRs)`. `null` if observedOpenPRs = 0.
4. **Resolution activity (0.20):** over the last 30 days using observed issues: `created30d` = issues created in window, `closed30d` = issues closed in window (`closed_at`). If `created30d > 0`: `100 × min(1, closed30d / created30d)`. If `created30d = 0` and `closed30d > 0`: 100. If both 0: `null`. If the oldest fetched issue's `updatedAt` is newer than the window start (meaning the cap cut the window short): the data is incomplete, so add a warning and still compute, but mark the component `partialWindow: true`.

### Overall score and missing-data policy (decision)

```
availableWeight = sum(weights of components with non-null score)
healthScore = round( sum(score × weight for available) / availableWeight )
```

- All 4 available → `scoreStatus = "complete"`
- `availableWeight >= 0.55` but not all → `"partial"` (UI must label "Partial score" and list which components were excluded and why)
- `availableWeight < 0.55` → `"insufficient_data"`, `healthScore = null`

Clamp all scores to 0–100. Each breakdown entry stores: score, weight, available, and a one-line human explanation (e.g. "3 of 12 observed open issues are stale").

### Recommendation rules (deterministic)

Each recommendation: `id` (rule id), `category`, `severity` (`high|medium|low|info`), `title`, `description`, `evidence` (concrete numbers), `suggestedAction`, `relatedUrl`.

| Rule | Trigger | Severity |
|---|---|---|
| R1 stale-issues | staleOpenIssues ≥ 1 | high if ≥ 50% of observed open issues stale, else medium |
| R2 stale-prs | staleOpenPRs ≥ 1 | high if ≥ 50% stale, else medium |
| R3 no-recent-commits | commits30d = 0 and commit data available | medium |
| R4 backlog-growth | closed30d + 1 < created30d / 2 AND observedOpenIssues ≥ 5 (i.e. closed less than half of what was opened) | medium |
| R5 partial-data | scoreStatus ≠ complete OR scope incomplete OR dataWarnings non-empty | info |

Sort by severity (high → info), then by rule id. One recommendation per rule (no duplicates). Empty/insufficient data must not produce claims the data doesn't support. Never claim vulnerability detection.

## 10. API (`/api/v1`)

Response shapes: `{ success: true, data, message }` and `{ success: false, error: { code, message } }`. Use correct HTTP status codes (400 validation, 401 unauthenticated, 404 not found/not owned, 409 duplicate, 429 rate-limited, 502/503 upstream).

| Method & path | Notes |
|---|---|
| POST `/auth/register` | name, email, password (min 8, letter + number), confirm checked client-side |
| POST `/auth/login` | sets HttpOnly cookie |
| POST `/auth/logout` | clears cookie |
| GET `/auth/me` | safe profile |
| GET `/repositories/search?q=owner/repo|owner|repository-name` | trims and validates the query; exact `owner/repo` returns one repository, a single owner or repository name returns up to 20 public matches with source/fetchedAt metadata |
| GET `/repositories` | own repos only |
| POST `/repositories` | body: `{ fullName }`; backend fetches metadata itself (don't trust client-sent stats); 409 on duplicate |
| GET `/repositories/:id` | owned only |
| DELETE `/repositories/:id` | also deletes that repo's analyses |
| POST `/repositories/:id/refresh` | refresh metadata |
| POST `/repositories/:id/analyze` | fetch → normalize → analyze → store → update repo's latestHealthScore/lastAnalyzedAt → return result |
| GET `/repositories/:id/latest-analysis` | stored, not recomputed |
| GET `/repositories/:id/analysis-history?page&limit` | paginated, newest first |
| GET `/analyses/:id` | owned only |
| GET `/repositories/:id/issues?state&stale&threshold&page&limit` | live/cached GitHub data, response includes `source` and `fetchedAt` |
| GET `/repositories/:id/pull-requests?state&stale&threshold&page&limit` | same |
| GET/PATCH `/preferences` | validated thresholds |
| GET `/health` | status + real DB readiness (`mongoose.connection.readyState`), no secrets |

Security: derive user from the verified JWT only; validate ObjectIds; ownership check on every user-scoped query (query by `{_id, userId}`; return 404 if not found); rate limit login/register (e.g. 10 per 15 min per IP); body size limit 10kb; helmet; no stack traces in production; never log passwords/tokens.

## 11. Frontend

Dark-first, clean developer-tool look. Palette (starting values): bg `#0B0D12`, sidebar `#10131B`, card `#151A24`, elevated `#1B2230`, accent `#8B5CF6`, success `#22C55E`, warning `#F59E0B`, error `#EF4444`, text `#F3F4F6`, muted `#9CA3AF`, border `#293142`. Keep contrast accessible; avoid heavy gradients/glow/animation.

Pages: Landing (problem, features, how scoring works, login/register CTAs; no fake screenshot, use a clearly labeled static illustration or omit), Login, Register, Dashboard, Repositories (search + saved list), Repository detail, Issues, Pull Requests, Analysis History (+ open past report), Settings.

Layout: sidebar on desktop, collapsible on mobile; top bar with repo selector, refresh, user menu; toast system. Every nav item works.

Requirements:
- Show `source` (live/cached/snapshot) and timestamps on data. Clearly distinguish "current GitHub data" from "stored snapshot".
- Score breakdown shows each component, weight, and its explanation; label partial scores.
- Each dashboard metric has a tooltip/caption saying what it measures.
- Chart only when ≥ 2 snapshots exist; otherwise an empty state explaining how to build history.
- Handle: loading, empty, validation errors, API errors, 401 (redirect to login), rate limit (show reset time), slow server wake-up.

## 12. Tests (required set)

**Engine (Vitest, no DB):** component scores in 0–100; weights applied correctly; null components follow the partial/insufficient policy; no division by zero on empty data; deterministic with injected `now`; stale boundary (equal to threshold is stale); closed issues never stale; PRs filtered out of issue lists; invalid timestamps safe; each recommendation rule fires/doesn't fire correctly, includes evidence, no duplicates.

**Backend (Supertest + mongodb-memory-server, GitHub service mocked):** register / duplicate email / invalid email / weak password / login / wrong password / logout / unauthenticated 401; passwordHash never in responses; user A cannot read or delete user B's repo or analyses (404); invalid ObjectId rejected; duplicate repo save → 409; analysis persists and history returns stored values unchanged; preferences persist and validate.

**GitHub service (mocked fetch):** 404, rate-limit 403 vs permission 403, timeout, pull_request filtering.

**Frontend (RTL):** login/register validation, dashboard loading/empty/error states, repo search, stale filter on issues table, logout.

Tests never touch Atlas or the real GitHub API.

## 13. Deployment

- GitHub repo → **Render** (backend): root `backend`, build `npm install`, start `npm start`, health check `/api/v1/health`, env vars from section 5 plus `NODE_ENV=production`, `CLIENT_URL=<vercel url>`.
- **Vercel** (frontend): root `frontend`, build `npm run build`, output `dist`, `vercel.json` with `/api/:path*` rewrite to the Render URL and an SPA fallback to `index.html`.
- **Atlas:** dedicated DB user with readWrite on the devflow database only. Render free tier has no static IP, so Network Access will need `0.0.0.0/0`. Mitigate with a long random DB password; document this tradeoff.
- Don't say deployment succeeded unless the live URL was actually tested end to end.

## 14. README must contain

Overview, problem, users, features, stack, architecture diagram, structure, schema overview, score algorithm (formulas above), stale algorithm, recommendation rules, API table, env vars, local setup (Windows PowerShell + standard), Atlas setup steps, testing, deployment, security notes, **known limitations** (bounded data, `updatedAt` heuristic, repo renames, free-tier sleep, public repos only), future work, placeholders for live URL / repo URL / demo video / screenshots. No invented URLs, results, or screenshots.

## 15. Definition of done

All P0 items work end to end in a browser against real GitHub data and a real Atlas DB: register → login → search `octocat/Hello-World` and a larger real repo → save → analyze → see score + breakdown + recommendations → inspect stale issues/PRs → change threshold → re-analyze → history shows both snapshots with their original values → refresh page, everything persists. `npm test` and `npm run build` pass. README matches reality.
