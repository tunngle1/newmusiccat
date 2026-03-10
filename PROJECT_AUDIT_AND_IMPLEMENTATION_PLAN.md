# Project Audit and Implementation Plan

## 1. Project Overview

### Frontend
- Stack: `React + Vite + TypeScript`
- Entry/build config: root `package.json`
- Runtime API base URL: `VITE_API_URL`
- Main runtime files:
  - `App.tsx`
  - `context/PlayerContext.tsx`
  - `utils/api.ts`
  - `utils/telegram.ts`
  - `views/SubscriptionView.tsx`
  - `views/PaymentView.tsx`
  - `views/ReferralView.tsx`
  - `views/AdminView.tsx`

### Backend
- Stack: `Python + FastAPI + SQLAlchemy + SQLite`
- Entry point: `backend/main.py`
- Local port: `8000`
- Main backend modules:
  - `backend/main.py`
  - `backend/database.py`
  - `backend/payments.py`
  - `backend/hitmo_parser_light.py`
  - `backend/lyrics_service.py`
  - `backend/bot.py`
  - `backend/tribute.py`

### Deployment model currently used
- Frontend: `Vercel`
- Backend: local/backend host via `cloudflared`

## 2. What is currently working correctly

### Core app structure
- Frontend and backend are clearly separated.
- Backend is a real FastAPI service and exposes a large API surface.
- Frontend correctly reads `VITE_API_URL` and can work against a public backend URL.
- Local backend start path is known and valid:
  - `cd backend`
  - `python main.py`
- `cloudflared` can be used for exposing backend over HTTPS.

### Basic API areas that appear implemented
- Health endpoint exists: `/health`
- Search endpoint exists: `/api/search`
- Genre endpoint exists: `/api/genre/{genre_id}`
- Track endpoint exists: `/api/track/{track_id}`
- Radio endpoint exists: `/api/radio`
- Download-to-chat endpoint exists: `/api/download/chat`
- YouTube info/download endpoints exist
- User auth endpoint exists: `/api/user/auth`
- Subscription status endpoint exists: `/api/user/subscription-status`
- Admin endpoints exist for stats, users, cache, transactions, promo codes, etc.

### Telegram Mini App integration
- `utils/telegram.ts` is reasonably complete.
- Frontend initializes Telegram WebApp and viewport logic.
- User auth flow is implemented through Telegram `initDataUnsafe.user`.

### Local/offline user-facing features
- Favorites and playlists are stored locally.
- Downloaded/local track handling exists.
- Media Session support exists.
- Radio/favorites/player state infrastructure exists.

## 3. What is partially working or fragile

### Backend availability / deployment
- The app works only if backend is actively running and `cloudflared` is alive.
- `trycloudflare` quick tunnels are temporary and unstable for production-like use.
- This is acceptable for testing but not for stable public operation.

### CORS
- Backend currently uses:
  - `allow_origins=["*"]`
  - `allow_credentials=True`
- This is not a production-safe configuration and may cause browser issues depending on usage patterns.
- CORS needs explicit environment-based domain allowlist.

### Subscription infrastructure
- Subscription endpoints exist, but payment architecture is inconsistent.
- Different payment methods are mixed:
  - Tribute links
  - YooMoney
  - Telegram Stars
  - partial TON code
- Frontend subscription screens and backend payment endpoints are not fully aligned.

### Referral system
- Referral logic exists in multiple places and is inconsistent.
- Some referral flows are probably functional at a basic level, but architecture is duplicated and risky.

## 4. What is definitely problematic or broken

### 4.1 Documentation is outdated and misleading
- Root `README.md` is unrelated/outdated and still references AI Studio / Gemini setup.
- `SETUP.md` still references `ngrok`, while the current working setup uses `cloudflared` and Vercel.
- Project documentation does not accurately describe the real architecture.

### 4.2 Duplicated and conflicting backend endpoints
In `backend/main.py`, there are duplicate or repeated endpoint blocks for:
- admin stats
- admin cache stats
- admin users
- referral endpoints
- payment completion logic

This creates risks:
- later definitions may shadow earlier ones
- behavior becomes hard to reason about
- future edits are error-prone

### 4.3 Referral logic is duplicated across multiple places
Referral behavior exists in:
- `backend/main.py`
- `backend/referral_endpoints.py`
- `backend/payments.py`
- `backend/bot.py`
- frontend referral registration logic in `App.tsx`

Problems:
- duplicated source of truth
- inconsistent link formats
- mixed registration mechanisms
- high risk of double rewards or silent failures

### 4.4 Referral link formats are inconsistent
Observed formats:
- `REF{user_id}`
- `ref_{user_id}`
- bot `/start` flow expecting `REF...`
- frontend auth sending `referrer_id` if `start_param` starts with `ref_`

This means the system currently mixes two incompatible schemes:
- code-based referral (`REF123`)
- direct ID-based referral (`ref_123`)

This is a major source of bugs.

### 4.5 Broken referral registration call in frontend
In `App.tsx`, there is an obviously malformed fetch URL:
- contains spaces inside the template literal around path/query
- effectively this request is invalid or unreliable

This means Telegram `start_param` registration from frontend is not trustworthy right now.

### 4.6 Bot and backend endpoint mismatch
`backend/bot.py` calls:
- `/api/subscription/status`

But backend exposes:
- `/api/user/subscription-status`

So bot premium status command is currently using the wrong endpoint.

### 4.7 Promo code endpoint mismatch in frontend
`views/SubscriptionView.tsx` calls:
- `/api/promo/check`

Backend exposes:
- `/api/payment/check-promo`

So promo check in `SubscriptionView` is currently broken.

### 4.8 Subscription view ignores configured Tribute constants
`views/SubscriptionView.tsx` imports:
- `TRIBUTE_LINK_MONTH`
- `TRIBUTE_LINK_YEAR`

But then hardcodes direct links instead of using the imported constants.

This means environment configuration is partially bypassed.

### 4.9 Payment architecture is split across two different UIs
There are at least two subscription/payment UI paths:
- `views/SubscriptionView.tsx`
- `views/PaymentView.tsx`

They use different assumptions and different endpoints.
This likely confuses product flow and creates dead or legacy code paths.

### 4.10 Telegram Stars is not fully productized
Backend exposes Stars-related endpoints:
- `/api/payment/stars/create`
- `/api/payment/create-stars-invoice`

But current frontend purchase UX appears focused on Tribute/YooMoney, not a unified Telegram-native Stars flow.
If Stars is the target payment method, the current implementation is incomplete from product perspective.

### 4.11 Payment config endpoint likely broken/incomplete
`/api/payment/config` imports values like:
- `TON_WALLET_ADDRESS`
- `TON_PRICE_MONTH`
- `TON_PRICE_YEAR`

from `payments`, but current `backend/payments.py` snippet clearly defines only RUB/YooMoney constants. This suggests one of:
- missing definitions
- stale code path
- import failure risk

This needs verification/fix.

### 4.12 Database path inconsistency risk
`backend/database.py` uses:
- `sqlite:///./users.db`

But the project also contains:
- `backend/music_app.db`

This suggests possible mismatch between expected DB file and actual DB file in the project.
This can cause confusion in local testing, migrations, and deployment.

### 4.13 Production security/validation gaps
- Telegram auth is not visibly verified cryptographically on backend in the reviewed auth flow.
- CORS is too open.
- Payment callback security needs a full verification pass.
- Webhook handling is present in parts but not clearly centralized.

## 5. Specific conclusions about referrals

### What likely works
- Backend can create/update users on auth.
- Referral records can be stored in DB.
- There is reward logic for referrer premium extension after payment.

### What is not reliable
- Single canonical referral flow does not exist.
- Referral entry can happen through different code paths.
- Link formats are inconsistent.
- Bot and frontend do not share one exact source of truth.

### Required direction
Implement one referral model only:
- canonical invite code format, e.g. `REF{user_id}`
- one backend endpoint for registration
- bot and frontend both use the same format
- rewarding only through one post-payment service

## 6. Specific conclusions about subscriptions and payments

### What likely works
- Subscription status model exists.
- Premium expiration is stored in DB.
- Admin grant flow exists.
- YooMoney link generation exists.
- Some payment completion/rewarding logic exists.

### What is not reliable
- Payment UX is fragmented.
- Tribute, YooMoney, Stars, TON are mixed without a single strategy.
- Telegram Stars is not clearly wired end-to-end in frontend UX.
- Duplicate payment completion logic increases chance of inconsistent premium granting.

### Recommended strategic decision
Choose one primary payment flow for launch:
- Option A: `Telegram Stars` as primary in-app payment method
- Option B: `Tribute` as primary external payment flow
- Option C: `YooMoney` as fallback/manual region-specific option

Recommended for Telegram Mini App:
- Primary: `Telegram Stars`
- Secondary fallback: `YooMoney` or `Tribute`

### Current implementation status
- Payment flow is now being consolidated to `Telegram Stars` only.
- Active frontend subscription UI has been switched from external payment links to Telegram invoice creation.
- Active backend public payment API has been reduced to Telegram Stars invoice creation plus promo validation.
- Active user-facing payment flow now uses only `Telegram Stars`.
- Remaining debt is limited to legacy test/docs code and database fields that are no longer used by the active payment flow.

## 7. Recommended implementation roadmap

### Phase 1 — Stabilize architecture
1. Remove duplicate endpoint definitions from `backend/main.py`.
2. Extract referral logic into one service/module.
3. Extract payment/subscription logic into one service/module.
4. Make one canonical API contract for frontend and bot.

### Phase 2 — Fix broken integrations
1. Fix malformed referral fetch in `App.tsx`.
2. Fix bot endpoint mismatch for subscription status.
3. Fix promo endpoint mismatch in `SubscriptionView.tsx`.
4. Make `SubscriptionView` use constants/env instead of hardcoded Tribute URLs.
5. Verify `/api/payment/config` imports and implementation.

### Phase 3 — Unify payment product flow
1. Decide primary payment method.
2. If using Telegram Stars:
   - centralize invoice creation endpoint
   - call Telegram Mini App invoice flow from frontend
   - on successful callback/webhook grant premium once
3. Keep fallback payment method behind explicit UI.

### Phase 4 — Production hardening
1. Replace quick `trycloudflare` with named tunnel or real backend hosting.
2. Add environment-based CORS allowlist.
3. Verify Telegram auth signature server-side.
4. Audit payment callback verification.
5. Standardize env files and deployment docs.

### Phase 5 — Documentation and operations
1. Replace root `README.md` with actual project docs.
2. Update setup guide for:
   - backend FastAPI
   - frontend Vercel
   - backend cloudflared / hosted deployment
   - Telegram bot setup
3. Add `.env.example` files for backend and frontend with real variables.

## 8. Concrete changes to implement

### Backend
- Split `backend/main.py` into modules:
  - `routes/auth.py`
  - `routes/referrals.py`
  - `routes/payments.py`
  - `routes/admin.py`
  - `routes/music.py`
- Add service modules:
  - `services/referral_service.py`
  - `services/subscription_service.py`
  - `services/payment_service.py`
- Centralize premium granting and referral reward logic.
- Remove duplicate endpoints.
- Standardize DB file path and configuration.

### Frontend
- Unify `SubscriptionView` and `PaymentView` or clearly separate one as deprecated and remove it.
- Replace hardcoded payment URLs with env-driven config.
- Fix API paths to match backend exactly.
- Create one payment flow for Telegram Stars.
- Centralize API URLs and endpoint helpers.

### Telegram Bot
- Fix wrong endpoint usage.
- Make `/start` referral handling use same canonical code format as frontend/backend.
- Move business rules out of bot into backend.

## 9. Priority bug list

### Critical
- Fix malformed referral fetch in `App.tsx`
- Fix duplicate backend endpoints
- Fix promo endpoint mismatch
- Fix bot subscription status endpoint mismatch
- Standardize referral code format

### High
- Unify subscription/payment flow
- Implement full Telegram Stars purchase flow
- Verify payment completion and rewarding
- Replace wildcard CORS with environment config

### Medium
- Clean docs
- Standardize env files
- Clean dead/legacy payment code paths
- Normalize DB file naming and migration path

## 10. Launch recommendation

Current state is good enough for:
- local development
- tunnel-based testing
- UI validation
- partial feature testing

Current state is not yet clean enough for:
- stable production launch
- trusted referral rewards
- robust subscription billing
- maintainable future development

## 11. Proposed next implementation batch

Recommended next batch of work:
1. Audit and fix all referral flows end-to-end.
2. Unify subscriptions into one payment flow.
3. Implement Telegram Stars as the primary purchase method.
4. Remove duplicate endpoints and dead payment code.
5. Update docs and env setup.
