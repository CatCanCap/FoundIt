# FoundIt: IS216 Web Application Development 2 (Group G2-T1)

FoundIt is a lost-and-found web app for the SMU campus. It scores every lost report against every
found report, shows the owner why each find might be theirs, and guides a verified handoff, so
students get their things back without scrolling through Telegram groups.

**Team:** Cassandra Kaye Perez Bonzon, Ong Guiyun, Seth Tan Yu Zhi, Lee Ruo Xuan Audrey, Lau Qing Rui,
Lew Jing Yuan

## Quick links

| What | Where |
|---|---|
| Deployed app (first page) | https://foundit-chi-amber.vercel.app |
| API health check | https://foundit-chi-amber.vercel.app/api/health |
| Git repository | https://github.com/CatCanCap/FoundIt |

The quickest way to mark the app is the deployed link with the logins below. No setup is needed.

## Contents

1. [Logins](#1-logins)
2. [What the app does](#2-what-the-app-does)
3. [Set up](#3-set-up)
4. [Run](#4-run)
5. [Test](#5-test)
6. [Tech stack, data stores and external APIs](#6-tech-stack-data-stores-and-external-apis)
7. [Project layout](#7-project-layout)
8. [Troubleshooting](#8-troubleshooting)

## 1. Logins

These work on the deployed app, and on a local copy after `npm run seed`.

| Role | Email | Password | Use it for |
|---|---|---|---|
| Student (owner) | alice.tan.2024@scis.smu.edu.sg | FoundIt-demo-1 | Owns the seeded lost reports: Matches, claim, handoff |
| Student (finder) | ben.lim.2024@business.smu.edu.sg | FoundIt-demo-2 | Owns the seeded found items: reporting a find, accepting a claim |
| Student | chloe.ng.2025@economics.smu.edu.sg | FoundIt-demo-3 | Owns the decoy reports: browsing, disputes |
| Admin | foundit.admin@smu.edu.sg | FoundIt-admin-1 | The Admin page: disputes, reports, appeals, people, action log |

New accounts can be registered with an `@smu.edu.sg` address (or a subdomain). A 6-digit code is
then emailed. On a local copy with no email settings, the code is printed in the API's terminal.

## 2. What the app does

| Feature | Pages | What to try |
|---|---|---|
| Report a found item | `/report/found` | Upload a photo and get the category, colour and brand suggested, then pick the building, level and time |
| Browse | `/feed` | Filter and search found and lost items, turn a tag over, switch to the list view |
| Report a lost item with a trail | `/report/lost` | List up to 10 places from your day when you aren't sure where you lost it |
| Smart matching and alerts | `/matches` | See finds scored out of 100, with the reasons each one might be yours |
| Verified claim and handoff | `/matches/:id/claim`, `/matches/:id/handoff`, `/returns` | Claim with a detail only the owner knows, chat without sharing contact details, hand over, confirm |
| Hotspot map | `/map` | See where things turn up, by building |
| Admin and safeguards | `/admin`, `/disputes`, `/appeal` | Decide disputes and reports, suspend, handle appeals, read the action log |

**Private places:** where and when a find was handed in is shown only to its finder, admins, and
people whose own lost report already named that building around that time. Everyone else sees
"Place hidden".

## 3. Set up

### What you need

- Node.js 22 or newer, with npm
- The submitted zip, or a clone of the repository
- A Supabase database: either Option A or Option B below

### Step 1: get the code

From the submitted zip:

```bash
unzip <submitted-zip-name>.zip
cd <unzipped-folder>
```

Or from Git:

```bash
git clone https://github.com/guiyun466/WAD2-Project-G2-T1.git
cd WAD2-Project-G2-T1
```

### Step 2: install the packages

```bash
cd server
npm install

cd ../client
npm install
```

### Step 3: connect a database

The API reads its settings from `server/config.env`. That file holds secret keys, so it is never
in the Git repository. **The submitted zip already includes it**, along with `client/.env.local`
(a hidden file, as its name starts with a dot).

**Option A: use the team's test database (the zip's settings).**
Nothing to do: the zip's `server/config.env` points at the team's test database, where the data is
already loaded, and turns on the outside services (all but the instant chat pings: an open chat
still checks for new messages every few seconds). Go to [Run](#4-run). From a Git clone, ask the
team for the two files.

**Option B: create your own free Supabase project.**

1. Create a project at https://supabase.com and note its project ref (in the project's address).
2. Create the tables, from the top folder of the project. This needs the
   [Supabase CLI](https://supabase.com/docs/guides/cli):

   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

3. Create the settings file:

   ```bash
   cd server
   cp config.env.example config.env
   ```

4. Fill in these values in `server/config.env`. The rest can stay empty:

   | Setting | Value |
   |---|---|
   | `DB_TARGET` | `test` |
   | `SUPABASE_URL` | Your project's address, from the Supabase dashboard |
   | `SUPABASE_SECRET_KEY` | Your project's secret key, from the Supabase dashboard |
   | `JWT_SECRET` | Any long random text |
   | `CRON_SECRET` | Any long random text |

5. Load the demo data, including the [logins](#1-logins). This empties the database it points at:

   ```bash
   npm run seed
   ```

### Step 4 (optional): turn on the outside services

The zip's two settings files already have these filled in, so skip this step when using them.
Without them the app still runs, as the table shows. To set them up yourself, from the top folder
of the project:

```bash
cd client
cp .env.example .env.local
```

| Setting | File | Without it |
|---|---|---|
| `VITE_MAPBOX_TOKEN` | `client/.env.local` | The map pages show a drawn map |
| `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET` | `client/.env.local` | The photo field is hidden |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | `client/.env.local` | No instant chat pings; an open chat still checks every few seconds |
| `GOOGLE_VISION_API_KEY` | `server/config.env` | No photo suggestions; the form shows the plain fields |
| `GEMINI_API_KEY` | `server/config.env` | Matching compares descriptions on shared words only |
| `EMAILJS_*` | `server/config.env` | No emails; sign-up codes are printed in the API's terminal |

## 4. Run

Open two terminals, starting from the top folder of the project.

```bash
# Terminal 1: the API, on http://localhost:8000
cd server
npm run dev
```

```bash
# Terminal 2: the app, on http://localhost:5173
cd client
npm run dev
```

Open **http://localhost:5173**. This loads the home page. Sign in with one of the
[logins](#1-logins).

To check the API alone, open http://localhost:8000/api/health. It should answer
`{"status":"ok","database":"ok"}`.

## 5. Test

### Manual test cases

These can be run on the deployed app or a local copy. The steps that post, claim or hand over
change the demo data.

| # | Log in as | Steps | Expected |
|---|---|---|---|
| 1 | Nobody | Open the first page | The landing page shows the headline, a match example and the newest finds |
| 2 | Nobody | Open `/matches` | Sent to sign in, then back to Matches after signing in |
| 3 | Nobody | Sign in with a wrong password | An error shows and you stay on the sign-in page |
| 4 | Nobody | Register with a Gmail address | Refused: an SMU email is needed |
| 5 | Nobody | Open `/feed`, then a find's details | The item shows with "Place hidden" |
| 6 | Any student | On `/feed`, filter by a category, search, and reload | The filters and results stay after the reload |
| 7 | Ben | Report a found item at `/report/found` | It posts, shows possible owners, and appears on the feed |
| 8 | Alice | Report a lost item at `/report/lost` with two places | It posts and links to Matches |
| 9 | Alice | Open `/matches` and a report's best find | A score out of 100 with its reasons |
| 10 | Alice, then Ben | Alice claims a match with a detail. Ben accepts it and plans the handoff | The chat opens for both, with no contact details showing |
| 11 | Ben, then Alice | Ben marks it handed over. Alice confirms | The item shows as returned |
| 12 | Any student | Open `/map` and switch between found and lost | The building figures change, and buildings with under 3 finds aren't shown |
| 13 | Any student | Open `/admin` | The admins-only page shows |
| 14 | Admin | Sign in and open a dispute or report | Lands on the Admin page, and a decision needs a reason and is logged |
| 15 | Any | Use the header's moon or sun button, and narrow the window to 375px | Day and night both work, with no sideways scroll |

### Automated tests

The test scripts are in the submitted files:

| Tests | Where | Command (from that folder) | Needs the database? |
|---|---|---|---|
| Server unit tests | `server/tests/unit/` | `npm run test:unit` | No |
| Client unit tests | `client/src/**/__tests__/` | `npx vitest run` | No |
| API tests | `server/tests/api/` | `npm test` | **Yes, it wipes the database** |
| End-to-end tests | `client/e2e/` | `npx playwright test --project=chromium` | Yes |

**Warning:** `npm test` runs the server's unit and API tests. The API tests empty the database in
`config.env` while they run and reload it when they finish. Start with the two unit-test commands,
which are safe.

**To run the end-to-end tests:**

1. Install the test browser once:

   ```bash
   cd client
   npx playwright install chromium
   ```

2. Load fresh demo data once, from `server/`, with `npm run seed`.
3. Start the API and the app, as in [Run](#4-run).
4. Run the tests and open the report:

   ```bash
   cd client
   npx playwright test --project=chromium
   npx playwright show-report
   ```

The tests post their own items, tagged `E2E-`, and remove them when they finish. Photo upload and
the Mapbox map aren't exercised: the tests pick places from the drop-downs.

| File | Covers |
|---|---|
| `accounts.spec.js` | Signing in and out, redirects, signing up, refused emails, wrong email codes |
| `login.spec.js` | The sign-in page's mascot |
| `report.spec.js` | Reporting found and lost items, required fields, the 10-place trail limit |
| `feed.spec.js` | Filters, search, paging, list view, turning tags, private places, the hotspot map |
| `matches.spec.js` | Claim, finder's acceptance, chat, handoff, return, declining, who can open a handoff |
| `matches-page.spec.js` | Ranked finds with scores and reasons, filters in the address bar, Not mine with Undo, the side-by-side finds page, closing a report |
| `disputes.spec.js` | Raising a dispute and who may raise one |
| `reports.spec.js` | Reporting a post, repeat reports, hiding a post after 3 reports |
| `admin.spec.js` | Who can open Admin, deciding disputes |
| `cross-page.spec.js` | The header and the phone menu across pages |
| `responsive.spec.js` | Layouts at each screen size, and night mode on a phone |

## 6. Tech stack, data stores and external APIs

**Frontend:** Vue 3, Vue Router, Pinia, Bootstrap 5, axios, Vite, and our own design system.

**Backend:** Express 5 on Node.js, with routes, controllers and models.

**Login:** our own, with `jsonwebtoken` and `bcryptjs`, for SMU emails only.

**Testing:** Vitest, supertest, Playwright.

**Hosting:** Vercel, one project with two services: the app at `/` and the API at `/api/*`.

### Data stores

| Store | Type | Holds |
|---|---|---|
| Supabase Postgres | Relational database | Accounts, items and trails, matches, claims, messages, handoffs, disputes, reports, appeals, the admin log. Only the server can reach it |
| Cloudinary | Cloud image store | Item photos. The database keeps only each photo's link |
| Browser `localStorage` | Key-value store on the device | The login token and the day or night choice |

### External APIs

| API | Used for | How it's connected |
|---|---|---|
| Cloudinary | Item photos | The browser uploads directly with an unsigned preset; only the link goes to our API |
| Google Cloud Vision | Suggesting category, colour and brand from a photo | Called from the server (`POST /api/vision/suggest`), so the key stays secret |
| Mapbox GL JS and Directions | Campus map, heatmap, walking route to a handoff | `mapbox-gl` in Vue components, with a public token |
| Google Gemini embeddings | The meaning score in matching | Called from the server; the numbers are saved in Postgres |
| EmailJS | Match, claim and sign-up emails | Called from the server, sent after the reply |
| Supabase Realtime | New-message pings in chat | The browser hears a ping with no text, then fetches through our API |

## 7. Project layout

```
client/              The Vue app
  src/views/         One file per page
  src/components/    Pieces of pages, by feature
  e2e/               Playwright end-to-end tests
server/              The Express API
  routes/            Addresses and who may call them
  controllers/       Input checks and the logic of each request
  models/            All database access, one file per table
  matching/          The scoring engine
  data/              Seed data
  scripts/           Scripts that load the seed data
  tests/             Unit and API tests
supabase/migrations/ The database tables, as SQL files
```

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| `Cannot find module ...` when starting the API or app | Run `npm install` in that folder |
| The app loads but shows no finds, or can't reach the server | Check the API is running, and that http://localhost:8000/api/health answers `ok` |
| `/api/health` doesn't say `"database":"ok"` | Check `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `server/config.env` |
| `Refusing to seed` | Set `DB_TARGET=test` in `server/config.env` |
| `Project(s) "chromium" not found` | Run the end-to-end tests from `client/`, not the top folder |
| No sign-up email arrives on a local copy | The code is printed in the API's terminal |
| Seeded items have gone from the feed or matching | Open items are archived after 30 days. Run `npm run seed` to make them current; this empties the database it points at |
