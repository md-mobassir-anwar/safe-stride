# SafeStride

**Proactive peer-transit and safety companion for female students and staff of MANIT Bhopal.**

SafeStride matches women walking similar routes at similar times so they can travel together, enforces a nighttime lock on off-campus travel, provides multi-trigger silent SOS with live location streaming to a security dashboard, and tracks a trust/safety-index system with badges — all behind a zero-trust, ERP-verified, female-only onboarding flow.

Built as a production-quality **Progressive Web App** (installable, offline-capable, service-worker cached) using React + TypeScript + Vite + Tailwind, with Supabase (Postgres, Auth, RLS, Realtime, Edge Functions) as the backend.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Edge Functions](#edge-functions)
- [Demo Mode](#demo-mode)
- [Switching Adapters (ERP, SMS, Webhook, Push)](#switching-adapters)
- [Testing](#testing)
- [Building & Deploying](#building--deploying)
- [Project Structure](#project-structure)
- [Real vs Simulated](#real-vs-simulated)
- [Acceptance Checklist](#acceptance-checklist)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite 5, Tailwind CSS 3 |
| PWA | vite-plugin-pwa (Workbox), manifest, service worker, offline shell |
| Maps | Leaflet + React-Leaflet, OpenStreetMap tiles |
| Routing | React Router 6 |
| Geospatial | Turf.js (corridor buffer, line split, point-in-polygon) |
| Backend | Supabase (Postgres, Auth, RLS, Realtime, Edge Functions) |
| Icons | Lucide React |
| Testing | Vitest |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    PWA Frontend                      │
│  React + TS + Vite + Tailwind + Leaflet             │
│                                                     │
│  Screens: Landing → Auth → Verification → Home      │
│  → Request → Results → Journey → Rating → Profile   │
│  → Settings | SecurityDashboard | Admin | Track     │
│                                                     │
│  Lib: matching (Turf) · policy · trust · noshow     │
│       · campus-graph (Dijkstra) · silent-triggers   │
│       · auth-context · supabase client              │
└──────────────────────┬──────────────────────────────┘
                       │ Supabase JS SDK + Realtime
┌──────────────────────▼──────────────────────────────┐
│                   Supabase Backend                   │
│                                                     │
│  Postgres: 16 tables, RLS on all, 4 policies each   │
│  Auth: email/password, email confirmation OFF        │
│  Realtime: SOS, journeys, locations, notifications  │
│  Edge Functions: sos-webhook (HMAC-signed delivery) │
└─────────────────────────────────────────────────────┘
```

### Roles

| Role | Access |
|------|--------|
| `student_staff` | Home, Request, Results, Journey, Rating, Profile, Settings |
| `security` | Security Dashboard (live SOS, dispatch, tracking) |
| `admin` | Admin panel (verification, reports, config, campus, integrations, analytics, demo tools) + everything security sees |

### Zero-Trust Onboarding

1. User signs up with scholar ID + email + password.
2. Backend checks the ERP roster (`erp_roster` table) for a matching scholar ID + email.
3. Gender must be `female` — all other genders are rejected with a clear message.
4. Profile is created with `account_state = 'pending'`.
5. An admin approves the profile → `account_state = 'active'`.
6. Only active users can create requests or be matched.

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install & Run

```bash
npm install
npm run dev
```

The dev server starts automatically — no manual command needed.

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build + PWA service worker generation |
| `npm run typecheck` | TypeScript type checking (zero errors expected) |
| `npm run test` | Run all unit tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run preview` | Preview the production build locally |

---

## Environment Variables

All variables are pre-populated in `.env` and the hosted environment. **Never modify these manually.**

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon public key (safe for client) |

The Edge Function additionally uses server-side secrets (auto-configured):

| Secret | Description |
|--------|-------------|
| `SUPABASE_URL` | Same project URL (server-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for privileged DB access |

---

## Database Setup

Two migrations are already applied via the Supabase MCP tools:

1. **`001_core_schema`** — Creates all 16 tables (institutions, app_config, erp_roster, profiles, emergency_contacts, places, campus_edges, saved_destinations, journey_requests, invitations, journeys, journey_participants, location_pings, ratings, user_blocks, reports, sos_events, webhook_deliveries, notifications, verification_documents, audit_log), all enums, indexes, RLS policies, and helper functions (`is_admin()`, `is_security()`).

2. **`002_seed_data`** — Seeds MANIT Bhopal institution, all 35 config values, campus places + edges, saved destinations, 62 demo profiles (admin, security, students), ERP roster entries, and emergency contacts.

### Row Level Security

Every table has RLS enabled with 4 separate policies (SELECT, INSERT, UPDATE, DELETE). Policies are scoped:
- **Profile-scoped tables**: `auth.uid() = id` or `auth.uid() = profile_id`
- **Institution-scoped tables**: verified through profile membership
- **Public tables** (places, config, institutions): readable by all authenticated users
- **Helper functions**: `is_admin()` and `is_security()` check the caller's role

---

## Edge Functions

### `sos-webhook`

Deployed via the Supabase MCP `deploy_edge_functions` tool. Handles SOS event webhooks:

1. Loads the SOS event and user profile.
2. Constructs a payload (name, scholar ID, phone, location, tracking URL, status).
3. Signs the payload with **HMAC-SHA256** using the configured webhook secret.
4. Delivers to the configured webhook URL with up to **5 retries** and **exponential backoff** (2s, 4s, 8s, 16s, 32s).
5. Logs every delivery attempt to `webhook_deliveries`.
6. Notifies emergency contacts (SMS adapter — fallback mode logs to audit_log).
7. Notifies journey companions via in-app notifications.

**Configuration** (set in Admin → Integrations tab, stored in `app_config`):

| Key | Default | Description |
|-----|---------|-------------|
| `webhook_url` | `https://example.com/webhook` | Destination URL for SOS webhooks |
| `webhook_secret` | `safestride-hmac-secret-change-me` | HMAC-SHA256 signing secret |

---

## Demo Mode

SafeStride includes a full demo mode accessible at `/demo`:

- **60+ seeded users**: 1 admin, 2 security, ~59 students with varied trust levels, badges, and journey history.
- **Demo login switcher**: One-click login as admin, security, or featured students.
- **Roster CSV upload**: Upload a CSV to bulk-import ERP roster entries.
- **Time travel** (Admin → Demo Tools): Shift the demo clock to test the nighttime outside-campus lock (19:00–06:00).
- **Benchmark tool**: Run the matching engine against all open requests and measure latency.
- **Simulate 50 concurrent requests**: Stress-test the matching pipeline.

### Demo Logins

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@manit.ac.in` | `demo123456` |
| Security | `security1@manit.ac.in` | `demo123456` |
| Student (Gold) | `aarohi@manit.ac.in` | `demo123456` |
| Student (Silver) | `diya@manit.ac.in` | `demo123456` |

All demo users use the password `SafeStrideDemo!2026`. Demo accounts are created automatically the first time you select a demo user.

---

## Switching Adapters

SafeStride uses a configurable adapter system for ERP, SMS, webhooks, and push notifications. All adapters are controlled via `app_config` keys, editable in **Admin → Integrations**.

### ERP Adapter

Controls how scholar IDs are verified during onboarding.

| Mode | Behavior |
|------|----------|
| `roster` (default) | Uses the built-in `erp_roster` table. Admin can upload CSV rosters via Demo Login or Admin panel. |
| `api` | Calls an external ERP API. **Requires** setting `erp_api_url` and `erp_api_key` in config. |

**To switch to API mode:**
1. Go to Admin → Integrations → ERP.
2. Change `erp_mode` from `roster` to `api`.
3. Set `erp_api_url` to your ERP endpoint.
4. Set `erp_api_key` to your API key.
5. The sign-up flow will call the external API instead of the local roster table.

### SMS Adapter

Controls how emergency contacts are notified during SOS events.

| Mode | Behavior |
|------|----------|
| `fallback` (default) | Logs notifications to `audit_log` (no actual SMS sent). |
| `twilio` | Sends SMS via Twilio. **Requires** `sms_twilio_sid`, `sms_twilio_token`, `sms_twilio_from` in config. |

**To switch to Twilio:**
1. Go to Admin → Integrations → SMS.
2. Change `sms_mode` from `fallback` to `twilio`.
3. Set `sms_twilio_sid`, `sms_twilio_token`, and `sms_twilio_from`.
4. The `sos-webhook` edge function will call the Twilio API for each emergency contact.

### Webhook Adapter

Controls where SOS event webhooks are delivered.

| Mode | Behavior |
|------|----------|
| `default` | Delivers to `webhook_url` with HMAC-SHA256 signature. |

**To configure:**
1. Go to Admin → Integrations → Webhook.
2. Set `webhook_url` to your security operations center endpoint.
3. Set `webhook_secret` to a shared secret for HMAC verification.
4. Your endpoint must verify the `X-SafeStride-Signature` header (hex-encoded HMAC-SHA256 of the JSON body).

### Push Notification Adapter

Controls how real-time push notifications are delivered.

| Mode | Behavior |
|------|----------|
| `fallback` (default) | Uses Supabase Realtime in-app notifications only. |
| `fcm` | Sends push via Firebase Cloud Messaging. **Requires** `fcm_server_key` in config. |

**To switch to FCM:**
1. Go to Admin → Integrations → Push.
2. Change `push_mode` from `fallback` to `fcm`.
3. Set `fcm_server_key` to your Firebase server key.

---

## Testing

41 unit tests across 4 modules:

```bash
npm run test
```

| Module | Tests | Coverage |
|--------|-------|----------|
| `matching.test.ts` | 11 | Corridor overlap (split + contained), scoring formula, trust filter, timing filter, max results, priority boost |
| `policy.test.ts` | 12 | 05:59 allowed, 06:00 allowed, 18:59 allowed, 19:00 locked, 19:01 locked, countdown, cancel logic |
| `trust.test.ts` | 12 | Safety index computation, badge tiers (bronze/silver/gold), +15 completed, -30 no-show, suspension lock |
| `noshow.test.ts` | 6 | Grace period, suspension calculation (24h), edge cases |

### Type Checking

```bash
npm run typecheck
```

Zero errors expected.

---

## Building & Deploying

```bash
npm run build
```

This produces:
- `dist/` — production assets
- `dist/sw.js` — auto-generated service worker (Workbox)
- Precache manifest with all JS/CSS/HTML/PNG/SVG/WOFF2 assets
- Runtime caching for OSM tiles (CacheFirst, 200 entries, 7 days) and OSRM routes (NetworkFirst, 50 entries, 1 hour)

The PWA manifest is embedded with:
- App name: SafeStride
- Theme color: `#6D28D9`
- Background: `#0f0a1e`
- Display: standalone
- Icons: 192px, 512px, maskable 512px

### PWA Features

- **Installable**: Add to home screen on iOS/Android
- **Offline shell**: App shell precached, works offline after first load
- **Map tile caching**: OSM tiles cached for offline map viewing
- **Auto-update**: Service worker updates automatically on new deployments

---

## Project Structure

```
src/
├── App.tsx                    # Router + auth-gated routes
├── main.tsx                   # React entry point
├── index.css                  # Tailwind + custom components
├── components/
│   ├── AppLayout.tsx          # Header, bottom nav, SOS button
│   ├── SosButton.tsx          # Persistent SOS + location streaming
│   ├── ThemeToggle.tsx        # Dark/light toggle
│   └── ui.tsx                 # Logo, Disclaimer, Spinner, Badge, etc.
├── lib/
│   ├── auth-context.tsx       # AuthProvider, signUp (ERP + female-only), signIn
│   ├── campus-graph.ts        # Dijkstra, OSRM foot route, off-route detection
│   ├── matching.ts            # Top-5 match engine (Turf corridor overlap)
│   ├── matching.test.ts       # 11 tests
│   ├── noshow.ts              # No-show detection + suspension
│   ├── noshow.test.ts         # 6 tests
│   ├── policy.ts              # Outside-campus lock (19:00-06:00 IST)
│   ├── policy.test.ts         # 12 tests
│   ├── silent-triggers.ts     # Shake, taps, keyboard, voice, trigger URL
│   ├── supabase.ts            # Supabase client singleton
│   ├── time.ts                # Kolkata timezone helpers
│   ├── trust.ts               # Safety index, badges, trust deltas
│   ├── trust.test.ts          # 12 tests
│   └── types.ts               # All interfaces + DEFAULT_CONFIG
└── screens/
    ├── Landing.tsx            # Public landing page
    ├── Auth.tsx               # Sign in / sign up
    ├── DemoLogin.tsx          # Demo user switcher
    ├── VerificationStatus.tsx # Pending/active/suspended states
    ├── Home.tsx               # Mode toggle, transit timeline, trust summary
    ├── Request.tsx            # Create journey request
    ├── Results.tsx            # Top-5 matches + invite
    ├── Journey.tsx            # Live map, sync timer, location sharing
    ├── Rating.tsx             # Post-journey rating
    ├── Profile.tsx            # Trust, safety index, badges, history
    ├── Settings.tsx           # Emergency contacts, silent triggers, QR
    ├── SecurityDashboard.tsx  # Live SOS, dispatch, map, audit
    ├── Admin.tsx              # 7-tab admin panel
    └── Track.tsx              # Public tracking page (no auth)

supabase/
├── config.toml                # Edge function config
├── functions/
│   └── sos-webhook/index.ts   # HMAC-signed SOS webhook delivery
└── migrations/
    ├── 20261006061949_001_core_schema.sql
    └── 20261006062136_002_seed_data.sql
```

---

## Real vs Simulated

| Feature | Status | Notes |
|---------|--------|-------|
| **Auth (email/password)** | Fully real | Supabase Auth, real sessions, JWT tokens |
| **ERP roster verification** | Real (built-in adapter) | Uses `erp_roster` table; API adapter ready but needs endpoint config |
| **Female-only onboarding** | Fully real | Checked against roster gender field at sign-up |
| **Admin verification queue** | Fully real | Approve/reject/suspend/reinstate via DB updates |
| **Campus map (Leaflet + OSM)** | Fully real | Live OpenStreetMap tiles, real coordinates for MANIT Bhopal |
| **Dijkstra campus routing** | Fully real | Pure TS implementation over campus_edges graph |
| **OSRM foot routing** | Fully real | Calls `router.project-osrm.org` foot profile; straight-line fallback if unreachable |
| **Matching engine (Turf corridor)** | Fully real | Turf.js buffer + lineSplit + booleanPointInPolygon, pure TS scoring |
| **Top-5 results display** | Fully real | Supabase Realtime subscription for live updates |
| **Journey lifecycle** | Fully real | requested → invited → matched → ready → in_progress → completed/cancelled/no_show |
| **Sync countdown timer** | Fully real | 10-second countdown (configurable), state transitions on expiry |
| **Live location sharing** | Fully real | `navigator.geolocation.watchPosition`, pings to `location_pings` table every 5s |
| **Deviation detection** | Fully real | Point-to-line distance via Turf, 100m threshold → 30s → auto silent SOS |
| **Trust points (+15 / -30)** | Fully real | DB updates on journey completion / no-show |
| **Safety index formula** | Fully real | Computed from completed walks, no-shows, ratings |
| **Badge tiers (bronze/silver/gold)** | Fully real | Thresholds: silver (index ≥60, walks ≥3), gold (index ≥80, walks ≥8) |
| **No-show grace + 24h suspension** | Fully real | Grace period (10 min configurable), suspension blocks matching |
| **Policy engine (19:00–06:00 lock)** | Fully real | IST timezone-aware, blocks outside-campus requests at night |
| **SOS button + location streaming** | Fully real | Streams GPS every 4s to `sos_events` + `location_pings`, calls edge function |
| **Silent SOS triggers** | Fully real | Shake (DeviceMotion), 5 rapid logo taps, keyboard shortcut, voice phrase, trigger URL/QR |
| **SOS webhook delivery (HMAC)** | Fully real | Edge function signs + delivers with 5 retries + exponential backoff |
| **Security dashboard** | Fully real | Realtime SOS list, moving map markers + trail, acknowledge/dispatch/resolve |
| **Public tracking page** | Fully real | No-auth page at `/track/:token`, live map, 2h expiry after resolution |
| **Admin config editor** | Fully real | 24 editable keys, persisted to `app_config` table |
| **Admin campus editor** | Fully real | Add/edit places + edges with coordinates, stored in DB |
| **Admin analytics** | Fully real | Live stat cards from DB queries, CSV export |
| **Reports & blocks** | Fully real | Insert into `reports`/`user_blocks`, admin resolution |
| **Ratings (immutable)** | Fully real | Insert-only with UNIQUE(journey_id, rater_id) constraint |
| **Dark mode** | Fully real | Tailwind `class` strategy, persisted to localStorage |
| **PWA (installable, offline)** | Fully real | Service worker precaches shell + OSM tiles, manifest with icons |
| **Realtime subscriptions** | Fully real | Supabase Realtime channels for SOS, journeys, locations, notifications |
| **Demo mode (60 seeded users)** | Fully real | 62 profiles in seed migration, demo login switcher, time travel, benchmark |
| **Notifications** | Fully real (in-app) | Supabase Realtime; FCM push adapter ready but needs config |
| **SMS to emergency contacts** | Simulated (fallback) | Logs to audit_log; Twilio adapter ready but needs credentials |
| **External ERP API** | Simulated (roster) | Built-in roster adapter active; API adapter code path ready |
| **ID card photo upload** | Simulated | UI exists; Supabase Storage bucket creation needed for real uploads |
| **Profile photo upload** | Simulated | Same as above |
| **Group walk** | Partially real | Toggle + max/min enforced; full group coordination logic in DB + UI |

### Assumptions

1. **MANIT Bhopal campus coordinates** are approximate, based on publicly available latitude/longitude. Place names and edge distances are reasonable estimates and should be refined with survey data.
2. **OSRM foot routing** uses the public `router.project-osrm.org` endpoint, which has rate limits. For production, deploy a dedicated OSRM instance.
3. **IST timezone** is hardcoded via `Asia/Kolkata` for the policy engine. If deployed in another timezone, update the config.
4. **SMS and push** adapters have code paths and config keys ready but default to fallback mode. Switching to Twilio/FCM requires credentials in `app_config`.
5. **File uploads** (ID card, profile photo) have UI and DB columns but use simulated storage. Enabling Supabase Storage buckets would make them fully functional.
6. **Demo passwords** are shared (`demo123456`) for convenience. In production, each user would set their own password.
7. **The webhook secret** defaults to a placeholder. Change it in Admin → Integrations before going live.
8. **Group walks** support gold-badge users only, as specified. The matching engine finds individual pairs; group coordination uses the invitation system.

---

## Acceptance Checklist

| # | Check | Status |
|---|-------|--------|
| 1 | PWA manifest + service worker + offline shell | Pass |
| 2 | Supabase Auth (email/password, email confirmation off) | Pass |
| 3 | RLS on every table, 4 policies each, `auth.uid()` ownership | Pass |
| 4 | Zero-trust onboarding (ERP roster + female-only + admin approval) | Pass |
| 5 | Leaflet + OSM maps with Dijkstra campus routing | Pass |
| 6 | Top-5 match engine with Turf corridor overlap scoring | Pass |
| 7 | Policy engine: outside campus locked 19:00–06:00 IST | Pass |
| 8 | Journey lifecycle with sync timer + live location + deviation detection | Pass |
| 9 | Trust system (+15/-30, safety index, badges, 24h suspension) | Pass |
| 10 | SOS with silent triggers + security dashboard + HMAC webhook | Pass |
| 11 | Admin panel (verification, reports, config, campus, integrations, analytics) | Pass |
| 12 | 41 unit tests pass + TypeScript zero errors + production build succeeds | Pass |

---

## License

This is a demonstration project for MANIT Bhopal. Not for production deployment without security review and proper configuration of all adapters.
