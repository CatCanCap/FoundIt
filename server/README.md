# How does FoundIt API work?

`server/` is FoundIt's backend: a JSON REST API built on Express 5 (Node.js 22, CommonJS). The Vue
single-page app is its only client and does all reads and writes through it; the browser has no
direct access to the database.

- **Production:** `https://foundit-chi-amber.vercel.app/api`
- **Local:** `http://localhost:8000/api` (`npm run dev` in this folder)

The health check `GET /api/health` returns `{ "status": "ok", "database": "ok" }`, or `503` when
the database is unreachable.

Set-up, running and testing are in the main README ([Set up](../README.md#3-set-up),
[Run](../README.md#4-run), [Test](../README.md#5-test)). The endpoints are listed in
[section 6](#6-endpoints-and-folders); the input checks for each one are in its controller.

**Contents**

1. [Stack](#1-stack)
2. [Architecture](#2-architecture)
3. [Data layer](#3-data-layer)
4. [External services and configuration](#4-external-services-and-configuration)
5. [Security](#5-security)
6. [Endpoints and folders](#6-endpoints-and-folders)

---

## 1. Stack

| Concern | Choice |
|---|---|
| Runtime and framework | Node.js 22, Express 5 (rejected async handlers go straight to the error middleware) |
| Architecture | Layered: routes → middleware → controllers → models (data-access layer) |
| Database | Supabase-hosted PostgreSQL, accessed only through `@supabase/supabase-js` (PostgREST) |
| Authentication | Stateless JWT bearer tokens (`jsonwebtoken`, HS256, 7-day expiry); passwords and one-time codes hashed with bcrypt (`bcryptjs`, cost 10) |
| Authorisation | Role-based (`user`, `admin`) plus per-resource ownership checks in controllers |
| Hosting | Vercel: the Vite build as static files and the Express app as a serverless function, in one project (region `sin1`, Fluid compute) |
| Scheduled work | Vercel Cron, daily |
| Tests | Vitest unit tests; supertest integration tests against a dedicated test database |

---

## 2. Architecture

Vercel serves both halves from one origin: the SPA at `/` and the API at `/api/*` (path-based
rewrites in `vercel.json`), so production requests are same-origin and need no CORS.

```mermaid
flowchart LR
  B["Browser: Vue 3 SPA"]
  subgraph V ["Vercel project"]
    C["client service: static Vite build at /"]
    S["server service: Express function at /api/*"]
  end
  DB[("Supabase PostgreSQL")]
  B -->|"HTTPS GET"| C
  B -->|"HTTPS, JSON, Bearer JWT"| S
  S -->|"supabase-js, secret key"| DB
```

Every request passes through the same middleware chain and layers:

```mermaid
flowchart LR
  R["HTTP request"] --> RT["Router (routes/)"]
  RT --> MW["Auth middleware: requireAuth, requireAdmin"]
  MW --> CT["Controller: validation, business rules"]
  CT --> MD["Model: data-access layer"]
  MD --> DB[("PostgreSQL")]
  CT -->|"JSON response"| R
  MW -.->|"httpError"| EH["Error middleware (middleware/error.js)"]
  CT -.->|"httpError"| EH
  MD -.->|"mapped Postgres error"| EH
```

| Layer | Responsibility |
|---|---|
| **Router** (`routes/`) | Maps method and path to a controller and attaches the auth middleware |
| **Middleware** (`middleware/`) | Verifies the JWT, loads the user, enforces account state and role |
| **Controller** (`controllers/`) | Validates every input (`lib/validate.js`), applies business rules and ownership checks, throws `httpError(status, message)` |
| **Model** (`models/`) | The only code that queries the database; one module per table, converting snake_case columns to camelCase objects |
| **Error middleware** | The single place that writes error responses: `{ "error": "message" }`. Any 5xx is masked as `"Something went wrong"` and logged server-side |

Models map Postgres error codes to HTTP errors (`lib/errors.js`): a unique violation becomes
`409`, a foreign-key violation `400`. Work the response does not depend on (emails, chat
broadcasts) runs after the response through `inBackground` (`lib/background.js`), which uses
Vercel's `waitUntil` to keep the function alive until it finishes.

### Worked example: logging in and posting a report

```mermaid
sequenceDiagram
  participant P as Vue SPA
  participant A as requireAuth
  participant C as Controller
  participant M as Models
  P->>C: POST /api/auth/login (email, password)
  C->>M: User.findByEmail, bcrypt compare
  C-->>P: 200 signed JWT and public user
  P->>A: POST /api/items, Authorization Bearer JWT
  A->>M: verify JWT, load user, check verified and not suspended
  A->>C: next()
  C->>C: validate body
  C->>M: Item.create (item and trail points)
  C->>C: run the scoring function against open found items
  C-->>P: 201 item and matches
  C--)P: match alert emails sent after the response (waitUntil)
```

**1. Log in.**

```http
POST /api/auth/login
Content-Type: application/json

{ "email": "alice.tan.2024@scis.smu.edu.sg", "password": "FoundIt-demo-1" }
```

Response `200`:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs…",
  "user": { "id": 1, "name": "Alice Tan", "email": "alice.tan.2024@scis.smu.edu.sg",
            "role": "user", "alertsOn": false, "emailVerifiedAt": "2026-10-09T02:00:00.000Z",
            "suspendedAt": null, "createdAt": "2026-10-09T02:00:00.000Z" }
}
```

`User.toPublic` strips the password hash and code fields before serialisation. An unknown email
and a wrong password return the same `401`, which prevents account enumeration.

**2. Post a lost report** with the token:

```http
POST /api/items
Authorization: Bearer eyJhbGciOiJIUzI1NiIs…
Content-Type: application/json

{ "type": "lost", "title": "Black Totes umbrella", "category": "Umbrella",
  "colours": ["Black"], "brand": "Totes",
  "trail": [{ "spotId": 5, "from": "2026-10-27T02:00:00Z", "to": "2026-10-27T04:00:00Z" }] }
```

The controller checks the category and colours against the reference tables and requires
ISO 8601 timestamps with a timezone that are not in the future; a violation returns `400`
(e.g. `"A time cannot be in the future"`). On success the response is `201` with
`{ "item": {…}, "matches": [{ "foundItemId": 2, "score": 87.5, "reasons": [...] }] }`. Without a
token the response is `401 { "error": "Please log in" }`.

---

## 3. Data layer

| Store | Contents | Lifetime |
|---|---|---|
| **Supabase PostgreSQL** | All application state: accounts, reports, matches, claims, messages, handoffs, disputes, appeals, the admin audit log | Persistent |
| **Cloudinary** | Item photos; the database stores only the `https://` URL | Persistent |
| **Browser `localStorage`** | The JWT and UI preferences (theme, matches already seen). Never authoritative | Until logout or cleared |
| **Server memory** | Per-IP rate-limit counters (see [section 5](#5-security)) | Per function instance |

The schema is relational: a match references one lost and one found item, and claims, messages
and handoffs reference a match. Foreign keys and constraints enforce integrity in the database.

```mermaid
flowchart LR
  U["users"] -->|"1 to many"| I["items (lost or found)"]
  I --> T["item_trail_points"]
  I --> IC["item_colours"]
  I --> M["matches (lost_item_id, found_item_id)"]
  M --> CL["claims"]
  M --> MS["messages"]
  M --> H["handoffs"]
  I --> D["disputes"]
```

| Group | Tables | Contents |
|---|---|---|
| Identity | `users`, `appeals` | Profile, SMU email, bcrypt password hash, role, verification and suspension state, hashed one-time codes; suspension appeals |
| Reports | `items`, `item_trail_points`, `item_colours`, `item_embeddings` | Lost and found reports. A trail point is a location and time window (1 for a found item, 1 to 10 for a lost item). Up to 3 colours. Cached Gemini embedding vectors |
| Reference data | `categories`, `colours`, `campus_spots`, `campus_rooms` | Lookup tables for the forms: categories, the fixed colour list, campus buildings, levels and areas with coordinates, SMU's bookable rooms |
| Matching | `matches` | Scored lost and found pairs (unique per pair) with score 0 to 100, signal breakdown and reasons |
| Recovery | `claims`, `messages`, `handoffs` | The owner's claim, the chat, and the two-step handoff |
| Moderation | `disputes`, `reports`, `admin_actions` | Ownership disputes, user reports on messages and posts, an append-only audit log of admin actions |

- **Two environments, one schema.** **FoundIt-Test** backs development and the test suite
  (`npm run seed` loads 40 lost and found pairs plus decoys); **FoundIt** (live) backs
  production. Schema changes are versioned SQL migrations in `supabase/migrations/`, applied to
  both. API tests truncate FoundIt-Test, so read [Test](../README.md#5-test) first.
- **Data access.** `lib/db.js` creates a single supabase-js client, used only by `models/`.
  Queries go through PostgREST's query builder, never concatenated SQL, so user input cannot
  alter a query (no SQL injection).
- **Scheduled job.** Vercel Cron calls `GET /api/cron/daily` at 18:00 UTC (02:00 Singapore),
  authenticated with `CRON_SECRET`. It archives items open 30 days or more, auto-completes
  handoffs not confirmed 7 days after handover, and keeps the free Supabase project from pausing.

---

## 4. External services and configuration

```mermaid
flowchart LR
  B["Browser"]
  API["FoundIt API"]
  B -->|"unsigned direct upload"| CD["Cloudinary"]
  B -->|"Mapbox GL JS, Directions API"| MB["Mapbox"]
  RT["Supabase Realtime"] -->|"broadcast, no payload text"| B
  API -->|"REST broadcast"| RT
  API -->|"images:annotate"| GV["Google Cloud Vision"]
  API -->|"batchEmbedContents"| GM["Google Gemini"]
  API -->|"email send"| EJ["EmailJS"]
  API -->|"PostgREST"| DB[("Supabase PostgreSQL")]
```

| Service | Purpose | Called from | Configuration |
|---|---|---|---|
| Supabase | Database; Realtime broadcast for chat | Server; browser subscribes to Realtime | `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (server); `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (browser, Realtime only) |
| Cloudinary | Photo storage and on-the-fly resizing | Browser | `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET`; `CLOUDINARY_CLOUD_NAME` (server-side URL allowlist; empty allows any Cloudinary URL) |
| Google Cloud Vision | Category, colour and brand suggestions from a photo | Server (proxy) | `GOOGLE_VISION_API_KEY` |
| Google Gemini | Text embeddings for the semantic part of matching | Server | `GEMINI_API_KEY` (set in Vercel for Production and Preview) |
| EmailJS | Transactional email: match and claim alerts, one-time codes | Server | `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`, `EMAILJS_VERIFY_TEMPLATE_ID`, `EMAILJS_PUBLIC_KEY`, `EMAILJS_PRIVATE_KEY` |
| Mapbox | Campus map, hotspot heatmap, walking directions | Browser | `VITE_MAPBOX_TOKEN` (public token) |

Core server settings: `DB_TARGET` (`test` or `live`; the seed script and test helpers refuse to
truncate a database that doesn't match), `JWT_SECRET` (HS256 signing key, also keys the chat
channel HMAC), `CRON_SECRET` and `APP_URL` (base URL for links in emails). Server settings live
in `server/config.env` locally (template: `config.env.example`) and in Vercel's environment
variables in production. `VITE_` variables are compiled into the client bundle and therefore
public, so only publishable keys go there. Full list: `server/config.env.example`, `client/.env.example` and
[Step 4 of the set-up](../README.md#step-4-optional-turn-on-the-outside-services).

**Graceful degradation.** Every external service is optional at run time. A missing key or an
outage disables that feature only; the core flows keep working. Tests never call these services.

### Chat: Realtime broadcast as an invalidation signal

The browser never reads the `messages` table. Realtime carries only a contentless "something
changed" signal; the page then fetches through the authorised API:

```mermaid
sequenceDiagram
  participant S as Sender SPA
  participant API as FoundIt API
  participant RT as Supabase Realtime
  participant O as Recipient SPA
  S->>API: POST /api/messages/:matchId
  API-->>S: 201 message persisted
  API->>RT: broadcast on the match channel, no message text (after response)
  RT->>O: broadcast event
  O->>API: GET /api/messages/:matchId with Bearer JWT
  API-->>O: new messages, after the access check
```

The channel name carries an HMAC-SHA256 of the match id (`lib/chat-channel.js`), so it is
unguessable, and `GET /api/messages/:matchId/channel` reveals it only to the two participants.
The chat page also polls every few seconds as a fallback for missed broadcasts.

### Cloudinary: direct browser upload

Vercel caps request bodies at 4.5 MB and the API's JSON parser at 1 MB, so photos bypass the API
and go straight from the browser to Cloudinary (`client/src/services/cloudinary.js`):

```mermaid
sequenceDiagram
  participant P as Report form
  participant CD as Cloudinary
  participant API as FoundIt API
  P->>P: client-side check (JPG, PNG, WebP or HEIC, max 10 MB)
  P->>CD: upload with an unsigned preset (no API secret in the browser)
  CD-->>P: secure_url
  P->>API: POST /api/items with photoUrl only
  API->>API: allowlist our Cloudinary cloud, check size at most 10 MB
```

Rejecting other hosts (`400`) stops a post from making viewers' browsers load an arbitrary URL.
Cards request resized variants through URL transformations (e.g. `c_limit,w_480,q_auto,f_auto`).

### Other integrations

- **Google Cloud Vision (server-side proxy).** `POST /api/vision/suggest` requires login and
  accepts only our Cloudinary photos, so the key stays server-side and can't be used for
  arbitrary images. An 800 px variant goes to `images:annotate` (10 s timeout), and
  `vision/suggest.js` maps the result to a category, the nearest fixed colour and a brand, each
  with a confidence. The user confirms every suggestion; Vision is not used in matching.
- **Google Gemini (text embeddings).** Each report's title and description is embedded with
  `gemini-embedding-2`. Cosine similarity between two embeddings feeds the attribute signal of
  the scoring function, so synonyms ("wallet", "billfold") can match. Vectors are cached in
  `item_embeddings` and recomputed only when the text changes; if Gemini is unavailable,
  matching falls back to keyword overlap. Gemini never sees the other report or the score.
- **EmailJS (transactional email).** New-match alerts (opted-in users, once per pair), a
  "someone claimed your find" alert that never names the claimer, and the 6-digit verification
  and reset codes, from two templates in `email-templates/`. Each send has a 5 s timeout and
  failures are only logged. Without EmailJS settings, codes are printed to the server log.
- **Mapbox.** Mapbox GL JS (lazy-loaded) renders the campus map and the hotspot heatmap at `/map`
  (data from `GET /api/stats/hotspots`); the Directions API gives walking routes on the handoff
  page. Without WebGL or a token, the page falls back to a drawn schematic map and a Google Maps
  link.

---

## 5. Security

All rules are enforced server-side; the client only hides controls for convenience.

### Registration and email verification

```mermaid
flowchart TD
  R["POST /api/auth/register (@smu.edu.sg only)"] --> E["Account created unverified, 6-digit code emailed, no token issued"]
  E --> V["POST /api/auth/verify-email with email, code and password"]
  V -->|"valid"| OK["emailVerifiedAt set, JWT issued"]
  V -->|"invalid"| X["400, attempt counted before comparison"]
  X -->|"5 failures in 30 min"| L["Code locked for 30 min"]
  OK --> LG["Subsequent sessions: POST /api/auth/login"]
```

Verification requires the password as well as the code, which blocks a takeover where someone
registers a classmate's address: they never see the code, and the classmate doesn't know their
password. The rightful owner reclaims the address through password reset, whose code also
verifies the email. Logging in while unverified returns `403` and re-sends an expired code.

### Controls

| Control | Implementation |
|---|---|
| Database isolation | Row Level Security enabled on every table with **no policies**, so the anonymous and publishable keys can read or write nothing. Only the server's secret key (which bypasses RLS) has access, and it never leaves the server |
| Password and code storage | bcrypt hashes only; `User.toPublic` removes them from every response |
| Token validity and revocation | JWTs expire after 7 days. Each token embeds an HMAC fingerprint of the current password hash (`lib/token.js`); `requireAuth` reloads the user on every request, so a password change revokes all earlier tokens and suspension or role changes apply immediately |
| One-time codes | 6 digits, valid 15 minutes, resend at most once a minute, locked for 30 minutes after 5 failures. Attempts are counted before comparison, so concurrent guesses cannot bypass the limit |
| No account enumeration | Login returns the same error for an unknown email or a wrong password; forgot-password and resend-code return the same response, padded to a fixed minimum duration, whether or not the account exists |
| Account state | `requireAuth` returns `403` for any non-GET request from an unverified or suspended account. `requireLogin` skips that check and is used only for appeals (`POST /api/appeals`) and changing the password |
| Role-based access control | `/api/admin/*` runs `requireAuth` then `requireAdmin`, which checks the role stored in the database, not a claim in the token |
| Ownership (object-level authorisation) | Controllers compare `postedBy` (or the two items of a match) with `req.user.id` and return `403`. The claimer's identity goes only to the claimer and admins; a lost item's photo only to its owner and admins; a dispute only to its parties and admins |
| Location privacy | A found item's place and time go only to its finder, admins, and users whose own lost report already named that building near that time; everyone else receives `placeHidden: true` (`lib/item-privacy.js`). A match alone is not enough, since copying a find's visible details can score over 50 |
| Idempotent retries | A repeated write after a client timeout returns the saved record instead of a duplicate: a report within a 10-minute window (`lib/same-report.js`), a chat message within 2 minutes, a claim the owner already holds. Disputes, reports and appeals rely on unique indexes (`409`) |
| Timeouts | Each database attempt aborts after 5 s (`lib/fetch-timeout.js`); supabase-js retries reads, never writes. The client waits 15 s for reads and 30 s for writes |
| Input validation | Ids, string lengths, ISO 8601 dates with timezone, and reference values are validated in controllers (`lib/validate.js`); JSON bodies are capped at 1 MB |
| CORS | Only `localhost` origins are allowed, for local development; production is same-origin |
| Audit log | Every admin decision, warning, suspension and appeal outcome is appended to `admin_actions`, which has no update or delete path |

### Rate limiting

In-memory sliding-window counters per client IP (`lib/rate-limit.js`; the IP comes from the
`X-Forwarded-For` header Vercel sets):

| Action | Limit per IP |
|---|---|
| Registration | 30 per hour |
| Requesting a verification or password-reset code | 5 each per 15 minutes |
| Submitting a verification or password-reset code | 3 per email address and 10 in total, per 30 minutes |

The per-IP limit for one address (3) is below the per-account lockout (5), so a single client
cannot lock another user's code.

**Accepted limitations:** login has no attempt limit; the demo account passwords are public; and
because the counters are per function instance, an attacker using many IPs could still lock an
account's reset code for 30 minutes (login is unaffected).

---

## 6. Endpoints and folders

All routers are mounted in `app.js`; unknown `/api` paths return `404`. Each router file in `routes/` lists its endpoints
with the middleware that guards them.

| Base path | Purpose |
|---|---|
| `/api/health` | Liveness and database connectivity |
| `/api/auth` | Register, verify email, resend code, login, forgot, reset and change password, current user (`/me`) |
| `/api/spots`, `/api/categories`, `/api/colours` | Reference data for the forms |
| `/api/items` | Create, list and filter, update and soft-delete reports; an item's record and its matches |
| `/api/vision` | Photo tag suggestions (Vision proxy) |
| `/api/matches` | The user's ranked matches; rejecting one |
| `/api/claims` | Claiming a match with an ownership detail; the finder may decline |
| `/api/messages` | Owner and finder chat, and the Realtime channel name |
| `/api/handoffs` | Collection points, scheduling, marking handed over, owner confirmation |
| `/api/disputes` | Ownership disputes on a claimed item |
| `/api/reports` | Reporting a message or post to admins |
| `/api/appeals` | Suspension appeals |
| `/api/admin` | Admin console: disputes, reports, users, appeals, audit log (RBAC) |
| `/api/stats` | Aggregated hotspot figures for the heatmap |
| `/api/cron` | The daily job (bearer `CRON_SECRET`) |

### Matching pipeline

```mermaid
flowchart TD
  P["POST /api/items"] --> S["Validate, persist item and trail"]
  S --> SC["matching/run.js loads open opposite-type items and embeddings"]
  SC --> F["findMatches: pure weighted scoring function, 0 to 100"]
  F --> K["Upsert pairs scoring 50 or more, return top 5"]
  K --> EM["After response: one alert per new pair"]
  K --> O["Owner claims a match"]
  O --> CH["Chat"]
  CH --> HO["Two-step handoff: handed over, then confirmed"]
```

`findMatches` (`matching/index.js`) is a pure function with no I/O. It combines four signals,
each 0 to 100, as a weighted sum: category (C), attributes (A: colours, brand, keywords and the
embedding similarity), location (L) and date proximity (D). The tuned weights are
C 0.15, A 0.55, L 0.25, D 0.05 (the proposal's 0.4, 0.3, 0.2, 0.1 are kept for comparison). For a
lost item with several trail points, L and D come from the best-scoring point. Editing a report
re-scores it: surviving pairs are updated without a new alert. A suggested pair that falls below
50 is removed, except one whose lost report did not name the find's building and time: that one is
kept as `rejected`, so a user cannot edit a report repeatedly to probe a hidden location.

### Folders in `server/`

| Folder | Contents |
|---|---|
| `app.js`, `server.js` | `app.js` builds the Express app and mounts every router (Vercel's entrypoint); `server.js` listens on port 8000 for local development |
| `routes/` | Express routers: method, path, middleware, controller |
| `controllers/` | Request handlers: validation, business rules, authorisation |
| `models/` | Data-access layer, one module per table; the only code that uses supabase-js |
| `middleware/` | `requireAuth`, `requireLogin`, `requireAdmin` and the error handler |
| `lib/` | Shared helpers: JWT, hashing, validation, one-time codes, rate limiting, background work, handoff and dispute state transitions, location privacy |
| `matching/` | The scoring engine, weight tuning script and Gemini embedding client |
| `vision/` | The Cloud Vision client and the mapping to suggestions |
| `alerts/`, `email-templates/` | EmailJS sending and the two HTML templates |
| `stats/` | Hotspot aggregation |
| `data/`, `scripts/` | Seed data and loaders (`seed.js` resets a database; `seed-demo.js` adds the presentation accounts) |
| `tests/` | Vitest: `tests/unit/` needs no database; `tests/api/` runs supertest against the app and **truncates the shared test database** |
