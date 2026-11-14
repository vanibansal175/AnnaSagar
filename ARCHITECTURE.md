# AnnaSagar — Architecture Document

> **Version:** 1.1 · **Status:** Canonical · This document is the single source of truth for all technical decisions in the AnnaSagar MVP.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technology Stack](#2-technology-stack)
3. [System Architecture Diagram](#3-system-architecture-diagram)
4. [Project Folder Structure](#4-project-folder-structure)
5. [Data Models](#5-data-models)
6. [API Endpoints](#6-api-endpoints)
7. [Authentication Design](#7-authentication-design)
8. [Listing Status Model](#8-listing-status-model)
9. [Expiry Design](#9-expiry-design)
10. [Cloudinary Upload Flow](#10-cloudinary-upload-flow)
11. [Socket.io Usage](#11-socketio-usage)
12. [Environment Variables](#12-environment-variables)
13. [Deployment Architecture](#13-deployment-architecture)
14. [Scalability & Free-Tier Notes](#14-scalability--free-tier-notes)

---

## 1. System Overview

AnnaSagar is a food-surplus sharing platform connecting food donors with nearby receivers. Donors post surplus food listings; receivers browse and claim them. The system manages the full lifecycle of a listing from creation through collection or expiry, with real-time notifications and admin oversight.

**Roles:**
| Role | Description |
|------|-------------|
| `user` | A registered user who can donate food (create listings) and/or receive food (claim listings). One account covers both activities. A user can never claim their own listing. |
| `admin` | Created via seed script only (never public signup). Can block/unblock users, soft-remove listings, and view all audit logs. |

**Core Invariants:**
- Stored statuses (always UPPERCASE): `AVAILABLE`, `CLAIMED`, `COLLECTED`, `EXPIRED`, `CANCELLED`
- `WARNING` is **derived**, not stored: a listing is in warning state when `status = AVAILABLE` AND `now >= pickupDeadline - WARNING_MINUTES`. Never stored in the database.
- Only the **donor** may mark a listing `COLLECTED`
- A `CLAIMED` listing not marked `COLLECTED` before its `pickupDeadline` → automatically `EXPIRED`
- Claim atomicity guaranteed via a single `findOneAndUpdate` with filter `{ _id, status:'AVAILABLE', isRemoved: false, pickupDeadline: { $gt: now }, donor: { $ne: claimerId } }` — no separate read-then-write
- Browsing and all listing reads require authentication (login required)
- Privacy: `address.house`, `address.landmark`, and `donorContact` are returned only to the donor, admins, and the receiver of the **current active claim**. If a claim is cancelled these fields are hidden from the former receiver. Enforced by server-side response serialisation — never by the UI alone.

---

## 2. Technology Stack

### Client — deployed on Vercel (frontend ONLY)

| Layer | Technology |
|-------|-----------|
| Framework | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Animation | Framer Motion |
| Auth state | JWT stored in memory / `sessionStorage`; sent as `Authorization: Bearer <token>` header on every request |
| Real-time | Socket.io client (primary); 30-second HTTP polling fallback |
| Image preview | FileReader API (browser-native) |

### Server — deployed on Render (backend ONLY)

| Layer | Technology |
|-------|-----------|
| Framework | Express + TypeScript |
| ODM | Mongoose |
| Validation | Zod |
| Auth | JWT (jsonwebtoken) + **bcryptjs** (≥ 12 rounds) |
| Real-time | Socket.io server |
| Scheduler | node-cron |
| Image storage | Cloudinary (folder: `annasagar`) |

> **bcryptjs** (pure-JS) is used instead of `bcrypt` (native C++ bindings) for compatibility with Render's free-tier Linux container without build toolchain dependencies.

### Infrastructure

| Service | Purpose | Tier |
|---------|---------|------|
| MongoDB Atlas | Primary database | M0 (free, 512 MB) |
| Cloudinary | Image storage & delivery | Free (25 credits/month) |
| Vercel | Next.js hosting | Free |
| Render | Express hosting | Free |
| UptimeRobot | Ping `/health` every 5 minutes to reduce Render cold-start frequency | Free |

---

## 3. System Architecture Diagram

```
  Client (Vercel)         Server (Render)         MongoDB Atlas M0
  ┌─────────────┐         ┌─────────────┐         ┌──────────────────┐
  │ Next.js App │◄───────►│ Express API │◄────────►│ Listings, Users  │
  │             │  HTTPS  │             │          │ Notifications    │
  │             │  WSS    │             │          │ AuditLog         │
  └──────┬──────┘         └──────┬──────┘          └──────────────────┘
         │                       │
         └───── Socket.io ───────┘
                                 │
                                 ▼
                          ┌──────────────┐
                          │  Cloudinary  │
                          │   (images)   │
                          └──────────────┘

  UptimeRobot ──── GET /health every 5 min ────► Server (Render)
```

**Data flows:**
- **HTTPS** — All REST API calls between Next.js client and Express (`Authorization: Bearer <token>` header)
- **WSS** — Socket.io bidirectional channel for real-time notifications and feed events; authenticated via token in socket handshake
- **Cloudinary** — Backend-to-Cloudinary upload; `secure_url` and `public_id` saved to MongoDB; client never touches Cloudinary directly
- **UptimeRobot** — Pings `GET /health` every 5 minutes to keep the Render free-tier instance warm and reduce cold-start latency

---

## 4. Project Folder Structure

```
AnnaSagar/
├── client/                         # Next.js application
│   ├── app/                        # App Router pages & layouts
│   ├── components/                 # Reusable UI components
│   ├── lib/                        # API client, auth helpers, socket client
│   ├── hooks/                      # Custom React hooks
│   ├── types/                      # TypeScript types shared in client
│   ├── public/                     # Static assets (favicon, OG image, etc.)
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   └── tsconfig.json
│
└── server/                         # Express application
    ├── src/
    │   ├── config/                 # DB connection, Cloudinary config, env validation
    │   ├── models/                 # Mongoose models: User, Listing, Notification, AuditLog
    │   ├── routes/                 # Route files per domain
    │   ├── controllers/            # Business logic per domain
    │   ├── middleware/             # auth (verifyToken), role-check, error-handler, isBlocked
    │   ├── services/               # notificationsService, expiryService
    │   ├── jobs/                   # node-cron job definitions
    │   ├── utils/                  # Zod validation schemas, helpers
    │   ├── scripts/                # seed admin script (reads ADMIN_EMAIL / ADMIN_PASSWORD)
    │   └── index.ts                # Entry point: Express + Socket.io + cron init
    ├── tsconfig.json
    └── package.json
```

---

## 5. Data Models

### 5.1 User

```typescript
{
  _id:            ObjectId,
  name:           string,
  email:          string,          // unique index
  passwordHash:   string,          // bcryptjs, ≥ 12 rounds; never returned in API responses
  role:           'user' | 'admin',
  tokenVersion:   number,          // default: 0; incremented on password change; tokens with older version are rejected
  donorType?:     'individual' | 'hostel_pg' | 'restaurant_cafe' | 'ngo' | 'event_organizer',
  isBlocked:      boolean,         // default: false; checked lazily by middleware on every protected request
  blockedReason?: string,
  createdAt:      Date,
  updatedAt:      Date
}
```

**Indexes:** `{ email: 1 }` (unique)

> `tokenVersion` is embedded in the JWT payload at login time. The `verifyToken` middleware compares the token's `tokenVersion` to the current value in the database. A mismatch (e.g., after password change) results in a `401` response, invalidating all previously issued tokens for that user.

---

### 5.2 Listing

```typescript
{
  _id:            ObjectId,
  donor:          ObjectId,        // ref: User — indexed
  foodName:       string,
  description?:   string,
  category:       'veg' | 'non_veg' | 'egg',
  servings:       number,          // positive integer
  allergens?:     string,
  packaging?:     string,
  cookedAt:       Date,
  pickupDeadline: Date,            // indexed; must satisfy D6 time-window rules
  images: [                        // 1–3 items; images[0] is the primary image
    {
      url:       string,           // Cloudinary secure_url
      publicId:  string            // Cloudinary public_id (for future deletion)
    }
  ],
  address: {
    house:     string,             // post-claim visibility only (except to donor and admin)
    street:    string,             // pre-claim visible
    landmark:  string,             // post-claim visibility only (except to donor and admin)
    city:      string,             // pre-claim visible
    state:     string,             // pre-claim visible
    pin:       string              // 6-digit Indian PIN code; pre-claim visible
  },
  cityKey:        string,          // lowercase, trimmed city name; used for case-insensitive city filter
  donorContact:   string,          // free-text ≤ 100 chars; post-claim visibility only (except donor and admin)
  status:         'AVAILABLE' | 'CLAIMED' | 'COLLECTED' | 'EXPIRED' | 'CANCELLED',
  claim?: {
    receiver:                ObjectId,         // ref: User
    claimedAt:               Date,
    disclaimerAcknowledgedAt: Date,
  },
  claimHistory:   Array<{                      // pushed to on every claim cancellation (before unsetting claim)
    receiver:                ObjectId,
    claimedAt:               Date,
    disclaimerAcknowledgedAt: Date,
    cancelledAt:             Date,
    cancelledBy:             'receiver' | 'donor'
  }>,
  collectedAt?:            Date,               // set when status → COLLECTED
  cancelledAt?:            Date,               // set when status → CANCELLED
  cancelledBy?:            'donor',            // only donors cancel listings
  expiredAt?:              Date,               // set when status → EXPIRED
  warningNotifiedAt?:      Date,               // set when deadline_warning notification is first sent (prevents duplicate)
  expiredNotifiedAt?:      Date,               // set when expired notification is first sent (prevents duplicate)
  isRemoved:      boolean,         // default: false; admin soft-delete flag
  removedBy?:     ObjectId,        // ref: User (admin who removed)
  removedReason?: string,
  removedAt?:     Date,
  createdAt:      Date,
  updatedAt:      Date
}
```

**Indexes on Listing:**
| Index | Purpose |
|-------|---------|
| `{ isRemoved: 1, status: 1, cityKey: 1, pickupDeadline: 1 }` | Primary feed query (available, non-removed, city-filtered, deadline-sorted) |
| `{ donor: 1 }` | Donor's own listing queries (`/api/listings/mine`) |
| `{ 'claim.receiver': 1, status: 1 }` | Receiver's claimed listing queries (`/api/listings/claimed`) |

**Field visibility rules (enforced by server-side serialisation):**

| Field | Unauthenticated | Authenticated (pre-claim) | Donor | Admin | Current active claimer |
|-------|----------------|--------------------------|-------|-------|----------------------|
| `foodName`, `images`, `servings`, `category`, `cookedAt`, `pickupDeadline` | ❌ (login required) | ✅ | ✅ | ✅ | ✅ |
| `donorDisplayName`, `address.street`, `address.city`, `address.state`, `address.pin` | ❌ | ✅ | ✅ | ✅ | ✅ |
| `address.house`, `address.landmark`, `donorContact` | ❌ | ❌ | ✅ | ✅ | ✅ (while claim is active) |

> If a receiver's claim is cancelled, `address.house`, `address.landmark`, and `donorContact` are **no longer returned** to that receiver. Visibility is determined per-request by server-side serialisation logic, not by the UI.

---

### 5.3 Notification

```typescript
{
  _id:       ObjectId,
  recipient: ObjectId,   // ref: User — indexed
  type:      'claimed' | 'claim_cancelled_by_receiver' | 'claim_cancelled_by_donor'
           | 'collected' | 'deadline_warning' | 'expired',
  listing:   ObjectId,   // ref: Listing
  message:   string,
  isRead:    boolean,    // default: false
  createdAt: Date        // indexed
}
```

**Indexes on Notification:**
| Index | Purpose |
|-------|---------|
| `{ recipient: 1, isRead: 1 }` | Unread notification queries per user |
| `{ createdAt: 1 }` | Pagination and TTL-based cleanup (future) |

---

### 5.4 AuditLog

```typescript
{
  _id:         ObjectId,
  action:      'listing_removed' | 'user_blocked' | 'user_unblocked',
  performedBy: ObjectId,   // ref: User (admin)
  targetId:    ObjectId,   // ID of the affected listing or user
  targetType:  'listing' | 'user',
  reason:      string,
  createdAt:   Date
}
```

> An `AuditLog` document is created for every admin soft-remove and every block/unblock action.

---

## 6. API Endpoints

> **All endpoints except `GET /health`, `POST /api/auth/register`, and `POST /api/auth/login` require a valid `Authorization: Bearer <token>` header.**
> All list endpoints accept `page` (default: 1) and `limit` (default: 20, max: 100) query parameters and return `{ success, data, meta: { total, page, limit } }`.

---

### 6.1 Health

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `GET` | `/health` | Public | Returns `200 { status: 'ok', uptime: <seconds> }`. Pinged by UptimeRobot every 5 minutes. |

---

### 6.2 Auth

| Method | Path | Auth | Role | Notes |
|--------|------|------|------|-------|
| `POST` | `/api/auth/register` | Public | — | Creates a `user`-role account; returns JWT |
| `POST` | `/api/auth/login` | Public | — | Validates credentials; returns JWT with `tokenVersion` embedded |
| `GET` | `/api/auth/me` | Required | user/admin | Returns current user object; `passwordHash` and `tokenVersion` excluded |

---

### 6.3 Users (Self)

| Method | Path | Auth | Role | Notes |
|--------|------|------|------|-------|
| `PATCH` | `/api/users/me` | Required | user | Updates own `name` and/or `donorType`; returns updated user |

---

### 6.4 Listings

| Method | Path | Auth | Role | Notes |
|--------|------|------|------|-------|
| `GET` | `/api/listings` | Required | user/admin | Browse `AVAILABLE`, non-removed listings where `pickupDeadline > now`; filters: `category`, `city` (matched against `cityKey`); sort by `pickupDeadline` asc; paginated; returns pre-claim fields; `serverTime` and per-listing `warnAt` included in response |
| `GET` | `/api/listings/mine` | Required | user | Donor's own listings, all statuses except `isRemoved: true`; paginated |
| `GET` | `/api/listings/claimed` | Required | user | Receiver's claimed listings (all historical statuses); paginated |
| `GET` | `/api/listings/:id` | Required | user/admin | Returns pre-claim or post-claim fields based on requester role and active claim status; `serverTime` and `warnAt` included; expiry computed on read |
| `POST` | `/api/listings` | Required | user | Create listing; validates `pickupDeadline` and `cookedAt` against D6 env-var rules; derives `cityKey` from `address.city` |
| `POST` | `/api/listings/:id/claim` | Required | user | Atomic claim via `findOneAndUpdate({ _id, status:'AVAILABLE', isRemoved: false, pickupDeadline: { $gt: now }, donor: { $ne: claimerId } })`; blocked users rejected; body: `{ disclaimerAcknowledged: true }` |
| `DELETE` | `/api/listings/:id/claim` | Required | user (receiver) | Cancel own active claim; pushes claim into `claimHistory`, unsets `claim`, sets `status: 'AVAILABLE'` if `pickupDeadline > now`, else `EXPIRED`; notifies donor |
| `PATCH` | `/api/listings/:id/cancel` | Required | user (donor) | Donor cancels listing → `CANCELLED`; sets `cancelledAt`, `cancelledBy`; if `CLAIMED`, pushes claim to `claimHistory`, voids claim, notifies receiver |
| `PATCH` | `/api/listings/:id/collect` | Required | user (donor) | Mark listing `COLLECTED`; listing must be in `CLAIMED` status; sets `collectedAt` |

> **There is no `DELETE` route for listings anywhere.** Admin soft-removal uses `PATCH /api/admin/listings/:id/remove` (see §6.5).

---

### 6.5 Admin

| Method | Path | Auth | Role | Notes |
|--------|------|------|------|-------|
| `GET` | `/api/admin/users` | Required | admin | List all users; paginated |
| `PATCH` | `/api/admin/users/:id/block` | Required | admin | Block user; body: `{ reason }`; sets `isBlocked: true`; creates `AuditLog` entry |
| `PATCH` | `/api/admin/users/:id/unblock` | Required | admin | Unblock user; sets `isBlocked: false`; creates `AuditLog` entry |
| `GET` | `/api/admin/listings` | Required | admin | List all listings including `isRemoved: true`; paginated |
| `PATCH` | `/api/admin/listings/:id/remove` | Required | admin | Soft-remove listing; body: `{ reason }`; sets `isRemoved: true`, `removedBy`, `removedReason`, `removedAt`; creates `AuditLog` entry |
| `GET` | `/api/admin/audit-logs` | Required | admin | Paginated audit log |

---

### 6.6 Notifications

| Method | Path | Auth | Role | Notes |
|--------|------|------|------|-------|
| `GET` | `/api/notifications` | Required | user/admin | Paginated notifications for current user |
| `PATCH` | `/api/notifications/read-all` | Required | user/admin | Mark all as read |
| `PATCH` | `/api/notifications/:id/read` | Required | user/admin | Mark one as read |

---

## 7. Authentication Design

### JWT Storage and Transport

JWTs are sent **exclusively** in the `Authorization: Bearer <token>` header on every request. The client stores the token in memory or `sessionStorage` — **not** in `localStorage` and **not** in a cookie.

> **Why not httpOnly cookies?** The frontend (Vercel) and backend (Render) are on different origins. `SameSite=Strict` cookies do not cross origins; `SameSite=None` requires `Secure` and disables CSRF protection. Using Bearer tokens avoids cross-origin cookie complexity entirely.

> **XSS trade-off and mitigations:** Storing a JWT in `sessionStorage` or memory means it is accessible to JavaScript, making XSS a risk. Mitigations enforced at the application level:
> - A strict **Content Security Policy (CSP)** header on all Vercel responses: `default-src 'self'; script-src 'self'`. No inline scripts, no `eval`.
> - All user-generated output is escaped before rendering (React does this by default; never use `dangerouslySetInnerHTML` with untrusted content).
> - `sessionStorage` is preferred over `localStorage` so the token is cleared when the browser tab closes.
> - `JWT_EXPIRES_IN=24h` limits the damage window if a token is compromised.

### Token Lifetime

`JWT_EXPIRES_IN=24h` (24 hours). This is shorter than the previous 7-day default, limiting the exposure window for compromised tokens.

### Token Version (Invalidation on Password Change)

The JWT payload includes a `tokenVersion` field copied from `User.tokenVersion` at login time:

```typescript
// JWT payload shape
{
  userId:       string,
  role:         'user' | 'admin',
  tokenVersion: number,
  iat:          number,
  exp:          number
}
```

The `verifyToken` middleware:
1. Decodes and verifies the JWT signature.
2. Fetches the user from the database (or a short-lived cache).
3. Compares `token.tokenVersion === user.tokenVersion`.
4. If they differ → `401 UNAUTHORISED`; the token was issued before the last password change.

On password change, the server increments `user.tokenVersion`, immediately invalidating all previously issued tokens for that user.

### Socket.io Authentication

Socket.io connections authenticate by passing the JWT in the socket handshake:

```typescript
// Client
const socket = io(SOCKET_URL, {
  auth: { token: getStoredToken() }
});

// Server (middleware on io.use)
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  // verify token; attach socket.data.user; call next() or next(new Error('Unauthorised'))
});
```

Unauthenticated socket connections are rejected.

### Middleware Chain (all protected routes)

```
Request → verifyToken → checkTokenVersion → checkNotBlocked → [checkRole('admin')] → controller
```

- **`verifyToken`** — Decodes JWT from `Authorization: Bearer` header; returns `401` if missing or invalid
- **`checkTokenVersion`** — Compares `token.tokenVersion` to `user.tokenVersion` in DB; returns `401` if mismatch
- **`checkNotBlocked`** — Reads `isBlocked` from DB on every protected request; returns `403` if blocked
- **`checkRole('admin')`** — Applied to all `/api/admin/*` routes; returns `403` if `req.user.role !== 'admin'`

### Password Hashing

- Library: **bcryptjs** (pure-JS; no native build dependencies)
- Minimum salt rounds: **12**
- `passwordHash` is never returned in any API response

### Admin Account Creation

Admin accounts are created exclusively via the seed script (`/server/src/scripts/`). The script reads `ADMIN_EMAIL` and `ADMIN_PASSWORD` from environment variables. There is no public registration path for admins.

### Future OAuth

The auth layer is intentionally architected with passport-style strategy slots to allow adding Google OAuth (and other providers) post-MVP without restructuring the JWT flow.

---

## 8. Listing Status Model

### Stored Statuses

| Status | Set By | Meaning |
|--------|--------|---------|
| `AVAILABLE` | System (on create; on receiver claim cancel) | Listing is open for claiming |
| `CLAIMED` | System (on claim) | A receiver has an active claim; awaiting collection |
| `COLLECTED` | Donor only | Donor confirmed food was collected; `collectedAt` set |
| `EXPIRED` | System (lazy or cron) | Deadline passed without collection; `expiredAt` set |
| `CANCELLED` | Donor | Donor explicitly cancelled; `cancelledAt` and `cancelledBy` set |

### Derived State

| State | Derivation | Storage |
|-------|-----------|---------| 
| `WARNING` | `status === 'AVAILABLE'` **AND** `now >= pickupDeadline - WARNING_MINUTES` | ❌ Never stored; computed on read using `serverTime` and `warnAt` returned by API |

> The API returns `serverTime` (current server UTC timestamp) and `warnAt` (= `pickupDeadline - WARNING_MINUTES * 60_000` ms) on every listing response, so the client can compute the WARNING state without needing `WARNING_MINUTES` as a client-side environment variable.

### Status Transition Diagram

```
                        ┌─────────────┐
                        │  AVAILABLE  │◄──── receiver cancels claim (if deadline not passed)
                        └──────┬──────┘
              claim()          │          cancel() by donor
         ┌────────────────────►│◄─────────────────────────────┐
         │                     ▼                              │
         │               ┌─────────────┐                      │
         │               │   CLAIMED   │──── cancel() ────► CANCELLED
         │               └──────┬──────┘      by donor        (cancelledAt, cancelledBy set)
         │                      │
         │          collect()   │    deadline passes (lazy/cron/startup)
         │          by donor    ▼                │
         │               ┌───────────┐           ▼
         │               │ COLLECTED │      ┌─────────┐
         │               └───────────┘      │ EXPIRED │
         │               (collectedAt set)  └─────────┘
         │                                  (expiredAt set)
    deadline passes while AVAILABLE ──────────────────► EXPIRED
```

---

## 9. Expiry Design

The expiry system uses three layers to handle the Render free-tier sleep behaviour. The feed query also always hard-filters by `pickupDeadline > now`, so expired listings never appear even if the cron has not yet run.

### Layer 0 — Feed Query Hard Filter

Every `GET /api/listings` (and `GET /api/listings/mine`, `GET /api/listings/claimed` where applicable) includes `{ pickupDeadline: { $gt: now } }` in the query. This prevents any past-deadline listing from appearing in public feeds, independent of whether its `status` has been flipped yet.

### Layer 1 — Lazy Expiry on Read

Applied in `GET /api/listings/:id`:
- If the fetched listing has `pickupDeadline < now AND status IN [AVAILABLE, CLAIMED]`, the server immediately updates `status → EXPIRED`, sets `expiredAt`, and emits notifications before responding.
- This ensures a listing detail view is always accurate, even between cron runs.

### Layer 2 — Periodic Cron Job (every 5 minutes)

```
node-cron: '*/5 * * * *'
  → find all { status: { $in: ['AVAILABLE', 'CLAIMED'] }, pickupDeadline: { $lt: now }, expiredNotifiedAt: null }
  → bulk-update status to EXPIRED, set expiredAt
  → for each transitioned document only:
      · create Notification (type: 'expired') for donor and active receiver (if CLAIMED)
      · set expiredNotifiedAt = now (prevents duplicate notifications)
      · emit Socket.io 'notification:new' to affected user rooms
      · emit Socket.io 'feed:changed' to 'feed' room
  → find all { status: 'AVAILABLE', pickupDeadline: { $lte: now + WARNING_MINUTES }, warningNotifiedAt: null }
  → for each:
      · create Notification (type: 'deadline_warning') for donor and active receiver
      · set warningNotifiedAt = now (prevents duplicate notifications on subsequent cron runs)
      · emit Socket.io 'notification:new' to affected user rooms
```

The `warningNotifiedAt` and `expiredNotifiedAt` fields guarantee that each notification is created **exactly once per listing**, even if the cron runs multiple times while the listing remains in the same state.

### Layer 3 — Startup Catch-Up Pass

On `index.ts` startup, before the HTTP server begins accepting requests, the same sweep as the cron job runs once. This corrects all listings that expired during the period the Render instance was asleep (up to ~15 minutes of sleep + cold start ~30 s).

### UptimeRobot Keep-Alive

UptimeRobot is configured to send `GET /health` to the Render backend every 5 minutes (the minimum free-tier interval). This keeps the Render instance warm during active-use periods, reducing the frequency of cold starts. The expiry architecture does not depend on UptimeRobot — it handles cold starts correctly regardless.

---

## 10. Cloudinary Upload Flow

```
Client                       Server                        Cloudinary
  │                             │                               │
  │  Select 1–3 images          │                               │
  │  Preview via FileReader API │                               │
  │                             │                               │
  │──── POST /api/listings ────►│                               │
  │     (multipart/form-data)   │                               │
  │                             │  Validate:                    │
  │                             │  · type: jpg/png/webp         │
  │                             │  · size: ≤ 5 MB each          │
  │                             │  · count: 1–3                 │
  │                             │                               │
  │                             │──cloudinary.uploader.upload()►│
  │                             │   folder: 'annasagar'         │
  │                             │◄── { secure_url, public_id } ─│
  │                             │                               │
  │                             │  Save { url: secure_url,      │
  │                             │         publicId: public_id } │
  │                             │  to Listing.images[]          │
  │◄─── 201 Created ────────────│                               │
```

**Rules:**
- Accepted MIME types: `image/jpeg`, `image/png`, `image/webp`
- Maximum file size: **5 MB per image**
- Minimum images: **1**, maximum: **3** per listing
- Each image object stored as `{ url: string, publicId: string }` — the `publicId` enables future deletion from Cloudinary
- All images must be uploaded to the `annasagar` Cloudinary folder; only URLs matching the `annasagar` folder pattern are accepted when creating/updating a listing
- `images[0]` is the **primary image** (used for listing cards and OG image)
- No server-side Cloudinary transformations in MVP (preserves free-tier credits)

---

## 11. Socket.io Usage

### CORS Configuration

Socket.io CORS is locked to `CLIENT_URL` only:

```typescript
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL,
    methods: ['GET', 'POST'],
  }
});
```

`origin: '*'` is never used.

### Connection Lifecycle

```
User logs in
  → Client receives JWT
  → Client connects to Socket.io server (NEXT_PUBLIC_SOCKET_URL)
    with handshake auth: { token }
  → Server verifies token in io.use() middleware
  → Server joins socket to per-user room = userId (string)
  → Server joins socket to public 'feed' room

User logs out
  → Client disconnects socket
  → Token discarded from memory/sessionStorage
```

### Server-Emitted Events

| Event | Room Target | Payload | Client Action |
|-------|------------|---------|---------------|
| `notification:new` | `userId` (string) | `{ notification: NotificationObject }` | Increment notification badge; prepend to notification list |
| `listing:status_changed` | `userId` (string) | `{ listingId: string, status: string }` | Refresh affected listing in feed or detail view for the specific user |
| `feed:changed` | `'feed'` (public room) | `{ listingId: string, reason: 'claimed' \| 'expired' \| 'cancelled' \| 'collected' }` | Non-sensitive public event; triggers feed refresh for all connected clients. Contains no personal data. |

### 30-Second Polling Fallback

The client implements a 30-second polling fallback on `GET /api/listings` for situations where the Socket.io connection is unavailable or dropped. The polling is active only when the socket is not connected, preventing redundant requests when real-time updates are working.

### Notes

- Rooms are keyed by `userId` string — one room per user, any number of socket connections can join (supports multiple browser tabs)
- The `'feed'` room is a public room joined by all authenticated connected clients
- The expiry cron job and lazy-expiry service both emit `listing:status_changed` (to affected user rooms) and `feed:changed` (to the feed room)
- The server never broadcasts sensitive data to the `'feed'` room — all sensitive payloads go to per-user rooms

---

## 12. Environment Variables

All variables are backend (`server`) unless noted as `client`.

| Name | Purpose | Used In | Default / Note |
|------|---------|---------|---------------|
| `PORT` | Express listen port | server | `5000` |
| `NODE_ENV` | Runtime environment | server | `development` |
| `MONGODB_URI` | MongoDB Atlas connection string | server | (Atlas connection string) |
| `JWT_SECRET` | HMAC secret for signing JWTs | server | (long random string, min 32 chars) |
| `JWT_EXPIRES_IN` | JWT token lifetime | server | `24h` |
| `CLIENT_URL` | Frontend origin for CORS and Socket.io CORS | server | `http://localhost:3000` in dev |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account cloud name | server | (from Cloudinary dashboard) |
| `CLOUDINARY_API_KEY` | Cloudinary API key | server | (from Cloudinary dashboard) |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | server | (from Cloudinary dashboard) |
| `ADMIN_EMAIL` | Email for seeded admin account | server seed script | (choose before seeding) |
| `ADMIN_PASSWORD` | Password for seeded admin account | server seed script | (choose before seeding) |
| `MAX_LISTING_DURATION_MINUTES` | Max minutes from post to deadline (D6) | server | `180` |
| `MIN_LISTING_DURATION_MINUTES` | Min minutes from post to deadline (D6) | server | `45` |
| `MAX_FOOD_AGE_AT_PICKUP_MINUTES` | Max minutes from cookedAt to deadline (D6) | server | `240` |
| `WARNING_MINUTES` | Minutes before deadline = warning stage (D6); used in cron job and serialisation only | server | `30` |
| `NEXT_PUBLIC_API_URL` | Backend base URL for API calls | client | `http://localhost:5000` in dev |
| `NEXT_PUBLIC_SOCKET_URL` | Backend Socket.io URL | client | `http://localhost:5000` in dev |

> `WARNING_MINUTES` is a **server-only** variable. The client does not need it; instead the API returns `serverTime` and a per-listing `warnAt` field so the client can compute the WARNING state without any client-side environment variable.

> ⚠️ Never commit real values for `JWT_SECRET`, `MONGODB_URI`, `CLOUDINARY_API_SECRET`, `ADMIN_EMAIL`, or `ADMIN_PASSWORD` to version control. Use `.env.local` (client) and `.env` (server) files excluded via `.gitignore`.

---

## 13. Deployment Architecture

```
┌─────────────────────────────────────────────┐
│                   Vercel                     │
│  ┌─────────────────────────────────────┐    │
│  │  Next.js (App Router)               │    │
│  │  · Static pages                     │    │
│  │  · Server Components                │    │
│  │  · Client Components (Socket.io)    │    │
│  │  · CSP headers configured           │    │
│  └─────────────────────────────────────┘    │
│  Frontend ONLY — no backend logic here       │
└───────────────────────┬─────────────────────┘
                        │ HTTPS + WSS
                        │ Authorization: Bearer <token>
┌───────────────────────▼─────────────────────┐
│                   Render                     │
│  ┌─────────────────────────────────────┐    │
│  │  Express + Socket.io                │    │
│  │  · REST API (/api/*)                │    │
│  │  · GET /health (UptimeRobot ping)   │    │
│  │  · Socket.io server                 │    │
│  │  · node-cron expiry jobs            │    │
│  │  · Startup catch-up pass            │    │
│  └─────────────────────────────────────┘    │
│  Backend ONLY — no frontend served here      │
└───────┬─────────────────────────────────────┘
        │
        ├─────────► MongoDB Atlas M0
        │            (Listings, Users, Notifications, AuditLog)
        │
        └─────────► Cloudinary
                     (Image storage, folder: annasagar)

UptimeRobot ──── GET /health every 5 min ────► Render
```

**Key constraint:** Vercel hosts the frontend **only**. Render hosts the backend **only**. There is no server-side rendering of API routes on Vercel that proxies to the database.

---

## 14. Scalability & Free-Tier Notes

| Service | Constraint | Mitigation |
|---------|-----------|-----------| 
| **Render free** | 1 instance, 512 MB RAM; sleeps after ~15 min inactivity; cold start ~30 s | UptimeRobot pings `/health` every 5 min to keep instance warm; lazy expiry + startup catch-up handle any remaining cold starts |
| **Atlas M0** | 512 MB storage, shared cluster, no cross-shard transactions | `findOneAndUpdate` atomicity is sufficient for single-document claim operations; no distributed transactions needed |
| **Cloudinary free** | 25 credits/month | No server-side transformations; 5 MB upload limit enforced at backend before Cloudinary call; 1–3 images per listing stored as `{url, publicId}` |
| **Vercel free** | 100 GB bandwidth; serverless function limits | Next.js static generation + server components keep bandwidth and function invocations low at target scale (50+ users, 10–15 simultaneously active) |

---

*End of ARCHITECTURE.md*
