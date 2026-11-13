# AnnaSagar — Product Requirements Document

**Version:** 1.0  
**Status:** Draft  
**Language:** English only  

---

## Table of Contents

1. [Vision and Problem Statement](#1-vision-and-problem-statement)
2. [Target Users / Personas](#2-target-users--personas)
3. [Functional Requirements](#3-functional-requirements)
4. [Non-Functional Requirements](#4-non-functional-requirements)
5. [User Journeys](#5-user-journeys)
6. [Status Definitions](#6-status-definitions)
7. [MVP Scope](#7-mvp-scope)
8. [Out of Scope (MVP)](#8-out-of-scope-mvp)
9. [Future Features](#9-future-features)
10. [Open Questions](#10-open-questions)

---

## 1. Vision and Problem Statement

### Vision

AnnaSagar ("ocean of food" in Hindi) is a hyperlocal food-surplus sharing platform. It connects individuals and organisations who have surplus cooked food with people nearby who can collect and consume it — reducing waste, building community, and helping those who need a meal.

### Problem Statement

Cooked food spoils quickly. Households, hostels, restaurants, NGOs, and event organisers frequently find themselves with more food than they can consume, yet disposing of it feels wasteful. At the same time, people nearby — students, travellers, volunteers, or anyone in a pinch — may welcome a free, home-cooked or professionally cooked meal.

There is no lightweight, trust-aware, mobile-friendly platform that:

- Lets a donor publish surplus food in under two minutes.
- Enforces a hard expiry window so receivers never collect stale food.
- Protects the donor's precise address until a claim is made.
- Gives platform administrators the tools to moderate listings and users.

AnnaSagar fills this gap for the Indian urban context, starting with a small cohort of 50+ onboarded users with 10–15 simultaneously active at any time.

---

## 2. Target Users / Personas

### 2.1 Donor

A registered user who creates food listings to share surplus cooked food.

| Attribute | Detail |
|-----------|--------|
| **Account type** | Standard `user` account |
| **Donor type** (optional profile field) | `individual`, `hostel_pg`, `restaurant_cafe`, `ngo`, `event_organizer` |
| **Primary motivation** | Reduce food waste; contribute to community |
| **Key actions** | Create listing, upload images, cancel listing, mark listing COLLECTED |
| **Pain points** | Doesn't want strangers knowing their exact address until a claim is committed; needs to know pickup has happened |

A single user account may act as both a Donor and a Receiver at different times. A user can **never** claim their own listing.

### 2.2 Receiver

A registered user who browses available listings and claims one for pickup.

| Attribute | Detail |
|-----------|--------|
| **Account type** | Standard `user` account |
| **Primary motivation** | Access free, fresh, home-cooked or prepared food |
| **Key actions** | Browse feed, view listing detail, acknowledge disclaimer, claim listing, pick up food |
| **Pain points** | Needs certainty that food is still fresh and unclaimed when they arrive |

### 2.3 Admin

A privileged operator account created out-of-band via a seed script; never via public signup.

| Attribute | Detail |
|-----------|--------|
| **Account type** | `admin` role |
| **Creation** | Seed script reads `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables |
| **Primary motivation** | Keep the platform safe, clean, and trustworthy |
| **Key actions** | View all listings (including soft-removed), block/unblock users, soft-remove listings with reason, view audit log |

---

## 3. Functional Requirements

### 3.1 Users and Roles (R1–R5)

| R-ID | Description | Acceptance Criteria |
|------|-------------|---------------------|
| **R1** | The system supports exactly two roles: `user` and `admin`. Role names are lowercase in code and Title Case in prose. | A JWT payload contains a `role` field of value `"user"` or `"admin"`. No other role value is accepted. |
| **R2** | Any registered `user` may act as both Donor and Receiver across different listings. | A single user account can create a listing and separately claim another listing in the same session. |
| **R3** | A user can **never** claim their own listing. | The claim endpoint returns HTTP 403 if `listing.donorId === requestingUser._id`. |
| **R4** | Donor type is an optional profile field with values: `individual`, `hostel_pg`, `restaurant_cafe`, `ngo`, `event_organizer`. | Profile update API accepts and persists any of these five values or `null`; any other value is rejected with HTTP 400. |
| **R5** | Admin accounts are created exclusively via a seed script that reads `ADMIN_EMAIL` and `ADMIN_PASSWORD`; public signup cannot produce an Admin. | The `/api/auth/signup` endpoint always creates a `user` role account. No API endpoint or UI path exists to self-assign the `admin` role. |

---

### 3.2 Authentication (R6–R11)

| R-ID | Description | Acceptance Criteria |
|------|-------------|---------------------|
| **R6** | Users register with email and password. | Signup endpoint accepts `name`, `email`, `password`; returns a signed JWT on success. Duplicate email returns HTTP 409. |
| **R7** | Users log in with email and password. | Login endpoint validates credentials, returns a signed JWT. Invalid credentials return HTTP 401. |
| **R8** | JWTs are used for all protected API endpoints. | Requests to protected routes without a valid Bearer token return HTTP 401. |
| **R9** | The auth architecture must support adding Google OAuth in a future version without breaking existing sessions. | Auth logic is abstracted behind a strategy pattern or equivalent; `provider` and `providerId` fields exist on the User document with defaults for email/password. |
| **R10** | Google OAuth is **not** implemented in MVP. | No Google OAuth routes, buttons, or SDKs are present in the MVP build. |
| **R11** | Blocked users are denied access on every protected request (lazy invalidation). | An `isBlocked` check middleware runs on every protected route. A user blocked mid-session receives HTTP 403 on the next request. |

---

### 3.3 Admin (R12–R19)

| R-ID | Description | Acceptance Criteria |
|------|-------------|---------------------|
| **R12** | Admin can view all listings, including soft-removed ones, in the admin dashboard. | Admin dashboard API returns all listings with a `removed` flag; public feed does not. |
| **R13** | Admin can soft-remove any listing, supplying a mandatory reason. The reason is written to the AuditLog. | `PATCH /api/admin/listings/:id/remove` accepts `{ reason }`, sets `removed: true` on the listing, and creates an AuditLog entry with actor, reason, and timestamp. |
| **R14** | Soft-removed listings are hidden from the public feed and from the donor's own listing view. | Public feed and donor's "my listings" queries filter out `removed: true` documents. |
| **R15** | Admin can block a user. | `PATCH /api/admin/users/:id/block` sets `isBlocked: true`. Subsequent requests from that user's JWT return HTTP 403. |
| **R16** | Admin can unblock a user. | `PATCH /api/admin/users/:id/unblock` sets `isBlocked: false`. User can make authenticated requests again. |
| **R17** | Admin always sees the full address (house, landmark, donorContact) of any listing, regardless of claim status. | Admin listing detail endpoint always includes `house`, `landmark`, and `donorContact` fields. (See OQ9.) |
| **R18** | AuditLog records admin actions with actor ID, action type, target ID, reason (where applicable), and timestamp. | Each admin mutation creates an AuditLog document with these fields. |
| **R19** | Listings are never hard-deleted by any user. Admin removal is always a soft removal. | No `DELETE` route exists for listings. `removed` flag is used instead. |

---

### 3.4 Address and Location (R20–R25)

| R-ID | Description | Acceptance Criteria |
|------|-------------|---------------------|
| **R20** | A listing address consists of: `house`, `street`, `landmark`, `city`, `state`, `pin`. | Listing schema enforces all six fields. |
| **R21** | `pin` must be a valid 6-digit Indian PIN code. | Zod/Mongoose validation rejects any `pin` that is not exactly 6 digits. |
| **R22** | Before a claim, receivers see only: `street`, `city`, `state`, `pin`. House and landmark are hidden. | Pre-claim listing detail API omits `house` and `landmark` for `user` role requests where no active claim exists. |
| **R23** | After a successful claim, the receiver sees the full address: `house`, `landmark`, `street`, `city`, `state`, `pin`. | Post-claim listing detail API includes `house` and `landmark` for the authenticated claimer. |
| **R24** | Donor and Admin always see the full address. | Donor and Admin requests to listing detail always include `house` and `landmark`. |
| **R25** | `donorContact` is hidden from receivers pre-claim; visible post-claim and always to Donor and Admin. | API response projection respects claim status and requester role for the `donorContact` field. |

---

### 3.5 Listings (R26–R38)

| R-ID | Description | Acceptance Criteria |
|------|-------------|---------------------|
| **R26** | Only authenticated `user` accounts can create listings. | Unauthenticated requests and Admin-role requests to `POST /api/listings` return HTTP 401 or HTTP 403 respectively. |
| **R27** | A listing requires: `foodName`, `category`, `servings`, `cookedAt`, `pickupDeadline`, address fields, `donorContact`, and 1–3 images. | Zod validation on the create endpoint enforces all required fields. Missing fields return HTTP 400. |
| **R28** | `pickupDeadline` must be at least `MIN_LISTING_DURATION_MINUTES` (45) and at most `MAX_LISTING_DURATION_MINUTES` (180) minutes from the time of creation. | Server validates `pickupDeadline - now` is in [45, 180] minutes. Invalid values return HTTP 400. |
| **R29** | `cookedAt` plus `MAX_FOOD_AGE_AT_PICKUP_MINUTES` (240 minutes) must not be earlier than `pickupDeadline`. Equivalently, food must still be within 4 hours of cooking at the latest pickup time. | Server validates `pickupDeadline ≤ cookedAt + 240 minutes`. Invalid values return HTTP 400. |
| **R30** | A listing accepts 1–3 images. Each image: max 5 MB, formats jpg/png/webp, stored in Cloudinary under the folder `annasagar`. | Image upload endpoint rejects files outside these constraints. Cloudinary upload uses folder `annasagar`. |
| **R31** | The primary image is the image at index 0 in the `images` array. | Listing cards and social shares use `images[0]` as the display image. |
| **R32** | A new listing is created with status `AVAILABLE`. | `POST /api/listings` response shows `status: "AVAILABLE"`. |
| **R33** | A Donor may cancel their own listing if it is in `AVAILABLE` or `CLAIMED` status. | `PATCH /api/listings/:id/cancel` succeeds for the owner when status is `AVAILABLE` or `CLAIMED`; returns HTTP 403 for any other user; returns HTTP 409 if status is `COLLECTED`, `EXPIRED`, or `CANCELLED`. |
| **R34** | When a Donor cancels a `CLAIMED` listing, the status becomes `CANCELLED`, the active claim is voided, and the receiver is notified. | On cancel of a CLAIMED listing: `status` → `CANCELLED`, `claim.active` → `false`, Socket.io notification emitted to receiver's room. |
| **R35** | The Donor is the only actor who may mark a listing `COLLECTED`. | `PATCH /api/listings/:id/collect` returns HTTP 403 for any user other than the listing's `donorId`. |
| **R36** | A disclaimer is shown on every listing card and detail page. | Frontend renders a disclaimer text block on both the card component and the full detail view. |
| **R37** | The receiver must tick "I understand" before every claim, acknowledging the disclaimer. The acknowledgement timestamp is stored as `disclaimerAcknowledgedAt` on the claim subdocument. | Claim endpoint requires `disclaimerAcknowledged: true` in the request body; server stores `disclaimerAcknowledgedAt: Date.now()` on the claim subdocument. Missing or `false` value returns HTTP 400. |
| **R38** | `donorContact` is a free-text field, max 100 characters. | Zod validation enforces `maxLength(100)` on `donorContact`. |

---

### 3.6 Browsing and Search (R39–R47)

| R-ID | Description | Acceptance Criteria |
|------|-------------|---------------------|
| **R39** | The public feed shows only `AVAILABLE` listings (including those in `WARNING` derived state). | Feed query filters `{ status: 'AVAILABLE', removed: false }`. |
| **R40** | Soft-removed listings are hidden from the public feed. | Feed query includes `{ removed: false }` condition. |
| **R41** | Pre-claim visible fields in the feed and listing card: `foodName`, `images`, `servings`, `category`, `cookedAt`, `pickupDeadline`, `donorDisplayName`, `street`, `city`, `state`, `pin`. | API response for unauthenticated or pre-claim users omits `house`, `landmark`, `donorContact`. |
| **R42** | The feed is accessible without authentication (read-only). | `GET /api/listings` returns AVAILABLE listings to unauthenticated requests. |
| **R43** | The feed supports filtering by `category`. | `GET /api/listings?category=<value>` returns only matching listings. |
| **R44** | The feed supports filtering by `city`. | `GET /api/listings?city=<value>` returns only matching listings. |
| **R45** | The feed is paginated. | Feed endpoint accepts `page` and `limit` query parameters and returns a paginated response with `total`, `page`, `limit`, and `data`. |
| **R46** | A Donor can view their own listings (including CLAIMED, COLLECTED, EXPIRED, CANCELLED) but not soft-removed ones. | `GET /api/listings/mine` returns all non-removed listings where `donorId === requestingUser._id`. |
| **R47** | A Receiver can view their claim history. | `GET /api/claims/mine` returns all claims made by the requesting user, including historical statuses. |

---

### 3.7 Claiming (R48–R57)

| R-ID | Description | Acceptance Criteria |
|------|-------------|---------------------|
| **R48** | Only authenticated `user` accounts can claim a listing. | Unauthenticated requests to the claim endpoint return HTTP 401. |
| **R49** | Claim creation is atomic: a single `findOneAndUpdate({ _id, status: 'AVAILABLE' })` operation is used. | No two concurrent requests can both succeed in claiming the same listing; the second returns HTTP 409. |
| **R50** | A user cannot claim their own listing. | Claim endpoint returns HTTP 403 if `listing.donorId === requestingUser._id`. |
| **R51** | A user cannot hold more than one active claim at a time. | Claim endpoint returns HTTP 409 if the requesting user already has an active (CLAIMED) claim. |
| **R52** | On successful claim, the listing status transitions from `AVAILABLE` → `CLAIMED`. | Listing document `status` field equals `"CLAIMED"` after a successful claim. |
| **R53** | The receiver must acknowledge the disclaimer on every claim (see R37). | Each individual claim request requires disclaimer acknowledgement; a previous acknowledgement does not carry over. |
| **R54** | Post-claim, the receiver gains access to `house`, `landmark`, and `donorContact`. | Listing detail endpoint includes these fields in the response for the active claimer. |
| **R55** | A Receiver may cancel their own active claim. | `PATCH /api/claims/:id/cancel` succeeds for the claimer; listing status reverts to `AVAILABLE`. |
| **R56** | After a receiver cancels their claim, the listing returns to `AVAILABLE` and may be re-claimed by any eligible user. | Listing `status` = `"AVAILABLE"` after receiver cancels; new claim can be created with disclaimer acknowledgement required again. (See OQ10.) |
| **R57** | On receiver cancellation, the Donor is notified. | Socket.io notification emitted to Donor's per-user room upon receiver claim cancellation. |

---

### 3.8 Statuses and Expiry (R58–R66)

| R-ID | Description | Acceptance Criteria |
|------|-------------|---------------------|
| **R58** | Five stored statuses exist: `AVAILABLE`, `CLAIMED`, `COLLECTED`, `EXPIRED`, `CANCELLED`. All are stored in UPPERCASE. | Mongoose enum validates the `status` field against these five values. |
| **R59** | `WARNING` is a derived state, not stored: a listing with `status = AVAILABLE` and `pickupDeadline` within `WARNING_MINUTES` (30) of now. | No `WARNING` value exists in the database. Frontend/API computes and surfaces it from `status === 'AVAILABLE' && (pickupDeadline - now) ≤ WARNING_MINUTES * 60 * 1000`. |
| **R60** | A `CLAIMED` listing whose `pickupDeadline` passes without being marked `COLLECTED` automatically transitions to `EXPIRED`. | Expiry triggers on: (a) lazy check on read, (b) `node-cron` periodic sweep, (c) startup catch-up pass. |
| **R61** | Lazy expiry: when any read operation fetches a CLAIMED listing past its deadline, the server immediately updates its status to `EXPIRED`. | A `GET /api/listings/:id` for a past-deadline CLAIMED listing returns `status: "EXPIRED"` and the DB is updated. |
| **R62** | Cron expiry: a `node-cron` job periodically sweeps for CLAIMED listings past deadline and marks them `EXPIRED`. | A cron job runs at a configurable interval and executes `updateMany({ status: 'CLAIMED', pickupDeadline: { $lt: now } }, { $set: { status: 'EXPIRED' } })`. |
| **R63** | Startup expiry: at server startup, a catch-up pass marks any CLAIMED-past-deadline listings as `EXPIRED`. | The catch-up query runs once during the server boot sequence before the HTTP server begins accepting requests (or immediately after, before routes are exercised). |
| **R64** | Only the Donor may mark a listing `COLLECTED`. | `PATCH /api/listings/:id/collect` checks `listing.donorId === requestingUser._id`; otherwise HTTP 403. |
| **R65** | A `COLLECTED` listing cannot transition to any other status. | Server rejects any status-change request on a `COLLECTED` listing with HTTP 409. |
| **R66** | A `CANCELLED` listing cannot transition to any other status. | Server rejects any status-change request on a `CANCELLED` listing with HTTP 409. |

---

### 3.9 Notifications (R67–R72)

| R-ID | Description | Acceptance Criteria |
|------|-------------|---------------------|
| **R67** | Notifications are delivered via Socket.io. The server emits events to a per-user room (keyed by `userId`). | Each authenticated user is joined to a room named by their user ID on socket connection. |
| **R68** | The Donor is notified when their listing is claimed. | Server emits a `listing:claimed` event to the Donor's room upon successful claim creation. |
| **R69** | The Receiver is notified when the Donor cancels a CLAIMED listing. | Server emits a `listing:cancelled` event to the Receiver's room upon Donor cancellation of a CLAIMED listing. |
| **R70** | The Donor is notified when the Receiver cancels their claim. | Server emits a `claim:cancelled` event to the Donor's room upon Receiver claim cancellation. |
| **R71** | The Receiver is notified when their claimed listing transitions to `EXPIRED`. | Server emits a `listing:expired` event to the Receiver's room when expiry is triggered for their claimed listing (by lazy, cron, or startup path). |
| **R72** | Notifications are real-time and best-effort; no persistent notification store is required in MVP. | Missed notifications (e.g., user offline) are not re-delivered. No notification inbox table is required. |

---

### 3.10 Performance (R73–R81)

| R-ID | Description | Acceptance Criteria |
|------|-------------|---------------------|
| **R73** | The system must support 50+ onboarded users with 10–15 simultaneously active without degradation. | Load tests with 15 concurrent users show p95 API response < 800 ms on a cold Render free tier. |
| **R74** | MongoDB Atlas M0 (free tier) is used. Queries must be index-backed where possible. | Indexes exist on `status`, `pickupDeadline`, `donorId`, `city`, and `category` fields on the listings collection. |
| **R75** | Images are served via Cloudinary CDN, not through the Express server. | No image bytes pass through the backend; Cloudinary public URLs are stored and returned. |
| **R76** | The public feed endpoint must respond in under 500 ms for the first page (up to 20 listings) under normal load. | Measured in staging with realistic data volume. |
| **R77** | The frontend must achieve a Largest Contentful Paint (LCP) under 2.5 seconds on a mid-range mobile device on 4G. | Lighthouse CI score target: LCP ≤ 2.5 s. |
| **R78** | Socket.io connections must recover gracefully from Render service sleep/wake cycles. | Socket.io client uses exponential back-off reconnection. |
| **R79** | The expiry cron job must not cause observable latency spikes in the API. | Cron job runs in a non-blocking manner; no synchronous heavy work on the main event loop. |
| **R80** | The Next.js frontend is deployed exclusively on Vercel. The Express backend is deployed exclusively on Render. | No frontend code runs on Render; no backend code runs on Vercel. |
| **R81** | Environment variables are managed via platform dashboards (Vercel and Render); no secrets are committed to source control. | `.env` files are in `.gitignore`; CI/CD pipelines inject secrets from platform environment settings. |

---

## 4. Non-Functional Requirements

### 4.1 Security

- All passwords stored as bcrypt hashes; salt rounds ≥ 10.
- JWTs signed with a secret stored in an environment variable; short-lived (suggested: 7 days for MVP).
- Rate limiting on auth endpoints to prevent brute-force attacks.
- Zod schema validation on all incoming API payloads; server never trusts client-supplied role or computed status.
- HTTPS enforced on both Vercel and Render deployments.
- Cloudinary upload presets restrict allowed file types (jpg, png, webp) and max file size (5 MB) server-side.
- `isBlocked` checked on every protected request (lazy invalidation); see OQ7.

### 4.2 Reliability and Availability

- Three-layer expiry (lazy + cron + startup) ensures no CLAIMED listing remains active past its deadline even after Render cold starts.
- Atomic claim operation (`findOneAndUpdate` with status filter) prevents double-claiming under concurrent load.
- Socket.io client configured with exponential back-off for reconnection after Render sleep.

### 4.3 Maintainability

- TypeScript used end-to-end (frontend and backend).
- Zod schemas serve as the single source of truth for request/response shapes.
- Mongoose models are co-located with their Zod schemas where practical.
- AuditLog provides a trail for all admin mutations.
- ENV-driven constants (`MAX_LISTING_DURATION_MINUTES`, `MIN_LISTING_DURATION_MINUTES`, `MAX_FOOD_AGE_AT_PICKUP_MINUTES`, `WARNING_MINUTES`) allow operational tuning without code changes.

### 4.4 Usability

- UI built with shadcn/ui component library on a Tailwind CSS foundation.
- Framer Motion used for transitions; animations should not block interaction.
- Disclaimer shown prominently on every listing card and detail page.
- All UI text in English only for MVP.
- Mobile-first responsive design.

### 4.5 ENV Configuration

The following environment variables drive system behaviour (D6):

| Variable | Default / Example | Purpose |
|----------|-------------------|---------|
| `MAX_LISTING_DURATION_MINUTES` | `180` | Maximum minutes from creation to `pickupDeadline` |
| `MIN_LISTING_DURATION_MINUTES` | `45` | Minimum minutes from creation to `pickupDeadline` |
| `MAX_FOOD_AGE_AT_PICKUP_MINUTES` | `240` | Max age of food (from `cookedAt`) allowed at `pickupDeadline` |
| `WARNING_MINUTES` | `30` | Minutes before deadline at which AVAILABLE listing enters WARNING derived state |
| `ADMIN_EMAIL` | _(seed only)_ | Email for seeded Admin account |
| `ADMIN_PASSWORD` | _(seed only)_ | Password for seeded Admin account |

---

## 5. User Journeys

### 5.1 Donor Journey

```
Donor registers / logs in
    └─► Fills profile (optional: donor type)
         └─► Taps "Share Food"
              └─► Enters listing details:
                    foodName, category, servings, cookedAt,
                    pickupDeadline (45–180 min from now),
                    address (house, street, landmark, city, state, pin),
                    donorContact (free text ≤ 100 chars),
                    1–3 images (jpg/png/webp, ≤ 5 MB each)
                   └─► Server validates all fields + time constraints
                        └─► Images uploaded to Cloudinary/annasagar
                             └─► Listing created with status AVAILABLE
                                  └─► [Listing appears in public feed]
                                       │
                                  ┌────▼─────────────────────────┐
                                  │  Receiver claims the listing  │
                                  └────┬─────────────────────────┘
                                       │  Socket.io → Donor notified
                                       ▼
                                  Donor sees listing as CLAIMED
                                       │
                              ┌────────┴────────────┐
                              │                     │
                     Receiver collects          Donor cancels
                     (Donor marks COLLECTED)    (→ CANCELLED,
                              │                  receiver notified)
                              ▼
                         Listing COLLECTED
                         (terminal state)
```

### 5.2 Receiver Journey

```
Receiver registers / logs in
    └─► Browses public feed (city / category filters)
         └─► Sees listing cards:
               foodName, image, servings, category,
               cookedAt, pickupDeadline, donorDisplayName,
               street / city / state / pin
              └─► Opens listing detail
                   └─► Reads disclaimer
                        └─► Ticks "I understand" (required every claim)
                             └─► Taps "Claim"
                                  └─► Atomic claim: findOneAndUpdate
                                       │
                                  ┌────▼──────────────────────┐
                                  │ SUCCESS: status → CLAIMED │
                                  └────┬──────────────────────┘
                                       │
                        Full address + donorContact now visible
                                       │
                              ┌────────┴────────────┐
                              │                     │
                       Receiver picks up      Receiver cancels
                       (Donor marks           (listing → AVAILABLE,
                        COLLECTED)             Donor notified)
```

### 5.3 Post-Collection Flow

```
Receiver arrives and collects food
    └─► Donor opens listing → taps "Mark as Collected"
         └─► Server checks donorId === requestingUser._id
              └─► status → COLLECTED (terminal, no further transitions)
                   └─► Listing removed from public feed
```

### 5.4 Auto-Expiry Flow

```
CLAIMED listing pickupDeadline passes without COLLECTED mark
    │
    ├─ [On next read]  Lazy expiry: server sets status → EXPIRED
    ├─ [Periodically]  node-cron sweep: bulk updateMany → EXPIRED
    └─ [Server boot]   Startup catch-up: updateMany → EXPIRED
         │
         └─► Socket.io notification → Receiver's room (listing:expired)
```

---

## 6. Status Definitions

| Status | Stored? | Set By | Trigger / Condition | Terminal? |
|--------|---------|--------|---------------------|-----------|
| `AVAILABLE` | ✅ Yes | System (on create); System (on receiver cancel) | Listing created; or receiver cancels their claim | No |
| `CLAIMED` | ✅ Yes | System (on successful claim) | Atomic claim operation succeeds | No |
| `COLLECTED` | ✅ Yes | Donor only | Donor marks listing collected | **Yes** |
| `EXPIRED` | ✅ Yes | System (lazy / cron / startup) | CLAIMED listing passes `pickupDeadline` without COLLECTED | **Yes** |
| `CANCELLED` | ✅ Yes | Donor (cancels own listing) | Donor explicitly cancels an AVAILABLE or CLAIMED listing | **Yes** |
| `WARNING` ⚠️ | ❌ Derived | — | `status = AVAILABLE` **AND** `(pickupDeadline − now) ≤ WARNING_MINUTES (30 min)` | No |

> **Note on WARNING:** `WARNING` is never persisted in the database. It is computed by the frontend or API layer at read time and surfaced as a UI badge or visual indicator. The underlying stored status remains `AVAILABLE`.

---

## 7. MVP Scope

The MVP delivers a fully functional, end-to-end food-sharing platform for a closed cohort.

### Included in MVP

| Area | Included |
|------|----------|
| **Auth** | Email + password signup/login; JWT; blocked-user middleware; Admin seed script |
| **Listings** | Create, view, cancel (Donor); mark COLLECTED (Donor); browse feed; filters by city & category; pagination |
| **Claiming** | Claim (atomic); cancel claim (Receiver); disclaimer acknowledgement per claim |
| **Statuses** | All 5 stored statuses + WARNING derived state; three-layer expiry |
| **Address privacy** | Pre/post-claim field projection; Admin always full |
| **Images** | 1–3 images per listing; Cloudinary upload; jpg/png/webp; ≤ 5 MB; primary = index 0 |
| **Notifications** | Real-time Socket.io events (claim, cancel, expiry); per-user rooms; best-effort |
| **Admin** | View all listings; soft-remove with reason; block/unblock users; AuditLog; always full address |
| **Soft-delete** | All listing removals are soft; removed listings hidden from public + donor; visible in admin dashboard |
| **Stack** | Next.js + TypeScript + Tailwind + shadcn/ui + Framer Motion on Vercel; Express + TypeScript + Mongoose + Zod + JWT + Socket.io + node-cron on Render; MongoDB Atlas M0; Cloudinary |
| **Language** | English only |

---

## 8. Out of Scope (MVP)

Requirements R82–R90 are explicitly deferred:

| R-ID | Out-of-Scope Item |
|------|-------------------|
| **R82** | Google OAuth / social login |
| **R83** | Push notifications (FCM, APNs, Web Push) |
| **R84** | Persistent notification inbox / history |
| **R85** | SMS or email notification delivery |
| **R86** | Native mobile apps (iOS / Android) |
| **R87** | Map / geolocation-based discovery |
| **R88** | Ratings or reviews of donors / receivers |
| **R89** | Multi-language / internationalisation (i18n) |
| **R90** | Payment or tipping functionality |

---

## 9. Future Features

The following enhancements are explicitly not in scope for MVP but are anticipated in later iterations:

- **Google OAuth** — Auth architecture is designed to accommodate additional providers; OAuth login can be added without breaking existing email/password sessions.
- **Push & email notifications** — Extend the notification layer to FCM/APNs and transactional email for offline delivery.
- **Persistent notification inbox** — Store and replay missed notifications for users who were offline.
- **Map view** — Geolocation-based listing discovery with radius filtering.
- **Ratings and trust scores** — Allow Receivers to rate Donors after collection; build a trust score over time.
- **Native mobile apps** — iOS and Android wrappers or React Native app consuming the same API.
- **Multi-language support** — Internationalise the UI for regional Indian languages (Hindi, Tamil, etc.).
- **Donor verification badges** — Verified NGO / restaurant / institution badges based on document upload.
- **Scheduled / recurring listings** — Allow recurring donors (hostels, restaurants) to schedule repeating listings.
- **Admin analytics dashboard** — Charts for food saved (kg), claims made, expiry rate, active users over time.

---

## 10. Open Questions

The following questions have an agreed default that will be used in implementation unless explicitly overridden before development of the affected feature begins.

| OQ-ID | Question | Default / Decision |
|-------|----------|--------------------|
| **OQ1** | What format should `donorContact` take? Should it be a phone number, an email, or a free-text field? | **Free-text, max 100 characters.** No format validation beyond length. |
| **OQ2** | When a Donor cancels a listing that is already `CLAIMED`, what happens to the receiver? | **Listing → `CANCELLED`; active claim voided; Receiver notified via Socket.io.** |
| **OQ3** | How should expiry be handled given that Render's free tier sleeps after inactivity? | **Three-layer approach:** lazy expiry on read + `node-cron` periodic sweep + startup catch-up pass on boot. |
| **OQ4** | What mechanism should deliver real-time notifications? | **Socket.io**, server emitting to per-user rooms keyed by `userId`. |
| **OQ5** | Which image is the primary / thumbnail image for a listing? | **Index 0** in the `images` array. |
| **OQ6** | Who can see soft-removed listings? | **Admin only**, via the admin dashboard. Hidden from all public feeds and from the Donor's own listing view. |
| **OQ7** | How should a blocked user's existing active session be invalidated? | **Lazy middleware check:** `isBlocked` is verified on every protected request. No proactive session revocation required for MVP. |
| **OQ8** | Where should the disclaimer acknowledgement be stored? | **`disclaimerAcknowledgedAt`** timestamp on the claim subdocument; recorded fresh on every claim. |
| **OQ9** | Should Admin see the full address (house, landmark, donorContact) before a claim has been made? | **Yes, always.** Admin always has full address visibility regardless of listing claim status. |
| **OQ10** | After a Receiver cancels their claim, can the listing be claimed again by another (or the same) user? | **Yes, re-claiming is allowed.** The listing returns to `AVAILABLE`. The disclaimer tick is required again for every new claim. |

---

*Document maintained by the AnnaSagar product team. All canonical field names, status values, and role identifiers in this document are normative and must be used verbatim in code, database schemas, and API contracts.*
