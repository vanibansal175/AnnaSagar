# AnnaSagar — Architecture Document

> **Version:** 1.0 · **Status:** Canonical · This document is the single source of truth for all technical decisions in the AnnaSagar MVP.

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
- `WARNING` is **derived**, not stored: a listing is in warning state when `status = AVAILABLE` AND `now >= pickupDeadline - WARNING_MINUTES`
- Only the **donor** may mark a listing `COLLECTED`
- A `CLAIMED` listing not marked `COLLECTED` before its `pickupDeadline` → automatically `EXPIRED`
- Claim atomicity guaranteed via a single `findOneAndUpdate({_id, status:'AVAILABLE'}, ...)` — no separate read-then-write

---

## 2. Technology Stack

### Client — deployed on Vercel (frontend ONLY)

| Layer | Technology |
|-------|-----------|
| Framework | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Animation | Framer Motion |
| Auth state | JWT (httpOnly cookie, recommended) |
| Real-time | Socket.io client |
| Image preview | FileReader API (browser-native) |

### Server — deployed on Render (backend ONLY)

| Layer | Technology |
|-------|-----------|
| Framework | Express + TypeScript |
| ODM | Mongoose |
| Validation | Zod |
| Auth | JWT (jsonwebtoken) + bcrypt (≥ 12 rounds) |
| Real-time | Socket.io server |
| Scheduler | node-cron |
| Image storage | Cloudinary (folder: `annasagar`) |

### Infrastructure

| Service | Purpose | Tier |
|---------|---------|------|
| MongoDB Atlas | Primary database | M0 (free, 512 MB) |
| Cloudinary | Image storage & delivery | Free (25 credits/month) |
| Vercel | Next.js hosting | Free |
| Render | Express hosting | Free |

---

## 3. System Architecture Diagram

```
  Client (Vercel)         Server (Render)         MongoDB Atlas M0
  ┌─────────────┐         ┌─────────────┐         ┌──────────────────┐
  │ Next.js App │◄───────►│ Express API │◄────────►│ Listings, Users  │
  │             │  HTTP   │             │          │ Notifications    │
  │             │  WS     │             │          │ AuditLog         │
  └──────┬──────┘         └──────┬──────┘          └──────────────────┘
         │                       │
         └───── Socket.io ───────┘
                                 │
                                 ▼
                          ┌──────────────┐
                          │  Cloudinary  │
                          │   (images)   │
                          └──────────────┘
```

**Data flows:**
- **HTTP** — All REST API calls between Next.js (client-side fetch / server components) and Express
- **WebSocket** — Socket.io bidirectional channel; used for real-time notification delivery and feed status updates
- **Cloudinary** — Backend-to-Cloudinary upload; only `secure_url` values are saved to MongoDB; client never touches Cloudinary directly

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
  passwordHash:   string,          // bcrypt, ≥ 12 rounds; never returned in API responses
  role:           'user' | 'admin',
  donorType?:     'individual' | 'hostel_pg' | 'restaurant_cafe' | 'ngo' | 'event_organizer',
  isBlocked:      boolean,         // default: false; checked lazily by middleware on every protected request
  blockedReason?: string,
  createdAt:      Date,
  updatedAt:      Date
}
```

**Indexes:** `{ email: 1 }` (unique)

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
  images:         string[],        // 1–3 Cloudinary secure_urls; images[0] is the primary image
  address: {
    house:     string,             // post-claim visibility only (except to donor and admin)
    street:    string,             // pre-claim visible
    landmark:  string,             // post-claim visibility only (except to donor and admin)
    city:      string,             // pre-claim visible
    state:     string,             // pre-claim visible
    pin:       string              // 6-digit Indian PIN code; pre-claim visible
  },
  donorContact:   string,          // free-text ≤ 100 chars; post-claim visibility only
  status:         'AVAILABLE' | 'CLAIMED' | 'COLLECTED' | 'EXPIRED' | 'CANCELLED',
  claim?: {
    receiver:                ObjectId,         // ref: User
    claimedAt:               Date,
    disclaimerAcknowledgedAt: Date,
    cancelledAt?:            Date,
    cancelledBy?:            'receiver' | 'donor'
  },
  claimHistory:   Array<ClaimObject>,          // audit trail of every claim on this listing
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
| `{ status: 1, pickupDeadline: 1 }` | Primary feed query (available listings sorted by deadline) |
| `{ donor: 1 }` | Donor's own listing queries |
| `{ 'claim.receiver': 1 }` | Receiver's claimed listing queries |
| `{ isRemoved: 1, status: 1 }` | Admin dashboard listing queries |

**Field visibility rules:**

| Field | Pre-claim (public) | Post-claim (receiver/donor/admin) |
|-------|-------------------|----------------------------------|
| `foodName` | ✅ | ✅ |
| `images` | ✅ | ✅ |
| `servings` | ✅ | ✅ |
| `category` | ✅ | ✅ |
| `cookedAt` | ✅ | ✅ |
| `pickupDeadline` | ✅ | ✅ |
| `donorDisplayName` | ✅ | ✅ |
| `address.street` | ✅ | ✅ |
| `address.city` | ✅ | ✅ |
| `address.state` | ✅ | ✅ |
| `address.pin` | ✅ | ✅ |
| `address.house` | ❌ | ✅ |
| `address.landmark` | ❌ | ✅ |
| `donorContact` | ❌ | ✅ |

> Admin always sees all fields regardless of claim state.

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

### 6.1 Auth

| Method | Path | Auth | Role | Notes |
|--------|------|------|------|-------|
| `POST` | `/api/auth/register` | Public | — | Creates a `user`-role account |
| `POST` | `/api/auth/login` | Public | — | Returns JWT (httpOnly cookie recommended; also supports `Authorization` header) |
| `GET` | `/api/auth/me` | Required | user/admin | Returns current user object; `passwordHash` excluded |

---

### 6.2 Users (Self)

| Method | Path | Auth | Role | Notes |
|--------|------|------|------|-------|
| `GET` | `/api/users/me/profile` | Required | user | Returns own profile |
| `PATCH` | `/api/users/me/profile` | Required | user | Updates `donorType` only |

---

### 6.3 Listings

| Method | Path | Auth | Role | Notes |
|--------|------|------|------|-------|
| `GET` | `/api/listings` | Public | — | Browse `AVAILABLE`, non-removed listings; filters: `category`, `city`; sort by `pickupDeadline` asc; returns pre-claim fields only; expiry computed on read |
| `GET` | `/api/listings/:id` | Public / Required | — / user/admin | Public → pre-claim fields; authenticated + is receiver/donor/admin → post-claim fields; expiry computed on read |
| `POST` | `/api/listings` | Required | user | Create listing; validates `pickupDeadline` and `cookedAt` against D6 env-var time-window rules |
| `POST` | `/api/listings/:id/claim` | Required | user | Atomic claim via single `findOneAndUpdate({_id, status:'AVAILABLE'})`; body: `{ disclaimerAcknowledged: true }` |
| `DELETE` | `/api/listings/:id/claim` | Required | user (receiver) | Cancel own claim; listing → `AVAILABLE` if deadline not yet passed |
| `PATCH` | `/api/listings/:id/cancel` | Required | user (donor) | Donor cancels listing → `CANCELLED`; if `CLAIMED`, voids claim and notifies receiver |
| `PATCH` | `/api/listings/:id/collect` | Required | user (donor) | Mark listing `COLLECTED`; listing must be in `CLAIMED` status |

---

### 6.4 Admin

| Method | Path | Auth | Role | Notes |
|--------|------|------|------|-------|
| `GET` | `/api/admin/users` | Required | admin | List all users |
| `PATCH` | `/api/admin/users/:id/block` | Required | admin | Block user; body: `{ reason }`; creates `AuditLog` entry |
| `PATCH` | `/api/admin/users/:id/unblock` | Required | admin | Unblock user; creates `AuditLog` entry |
| `GET` | `/api/admin/listings` | Required | admin | List all listings including soft-removed |
| `DELETE` | `/api/admin/listings/:id` | Required | admin | Soft-remove listing; sets `isRemoved`, `removedBy`, `removedReason`, `removedAt`; creates `AuditLog` entry |
| `GET` | `/api/admin/audit-logs` | Required | admin | Paginated audit log |

---

### 6.5 Notifications

| Method | Path | Auth | Role | Notes |
|--------|------|------|------|-------|
| `GET` | `/api/notifications` | Required | user/admin | Paginated notifications for current user |
| `PATCH` | `/api/notifications/read-all` | Required | user/admin | Mark all notifications as read |
| `PATCH` | `/api/notifications/:id/read` | Required | user/admin | Mark one notification as read |

---

## 7. Authentication Design

### JWT Storage

| Method | Recommendation | Notes |
|--------|---------------|-------|
| httpOnly Cookie | ✅ **Recommended** | Immune to XSS; set with `Secure`, `SameSite=Strict` |
| `Authorization: Bearer <token>` header | Supported | Acceptable for API-client use; client must store token securely |

### Middleware Chain (all protected routes)

```
Request → verifyToken → checkNotBlocked → [checkRole('admin')] → controller
```

- **`verifyToken`** — Decodes JWT, attaches `req.user`; returns `401` if missing or invalid
- **`checkNotBlocked`** — Reads `isBlocked` from DB on every protected request (lazy invalidation; no token revocation needed)
- **`checkRole('admin')`** — Applied to all `/api/admin/*` routes; returns `403` if `req.user.role !== 'admin'`

### Password Hashing

- Library: **bcrypt**
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
| `AVAILABLE` | System (on create) | Listing is open for claiming |
| `CLAIMED` | System (on claim) | A receiver has claimed; awaiting collection |
| `COLLECTED` | Donor only | Donor confirmed food was collected |
| `EXPIRED` | System (lazy or cron) | Deadline passed without collection |
| `CANCELLED` | Donor or Receiver | Explicitly cancelled before deadline |

### Derived State

| State | Derivation | Storage |
|-------|-----------|---------|
| `WARNING` | `status === 'AVAILABLE'` **AND** `now >= pickupDeadline - WARNING_MINUTES` | ❌ Never stored; computed on read |

### Status Transition Diagram

```
                        ┌─────────────┐
                        │  AVAILABLE  │◄──── re-claim after receiver cancel
                        └──────┬──────┘
              claim()          │          cancel() by donor
         ┌────────────────────►│◄─────────────────────────────┐
         │                     ▼                              │
         │               ┌─────────────┐                      │
         │               │   CLAIMED   │──── cancel() ────► CANCELLED
         │               └──────┬──────┘      by donor
         │                      │
         │          collect()   │    deadline passes (lazy/cron)
         │          by donor    ▼                │
         │               ┌───────────┐           ▼
         │               │ COLLECTED │      ┌─────────┐
         │               └───────────┘      │ EXPIRED │
         │                                  └─────────┘
         │
    deadline passes while AVAILABLE ──────────────────► EXPIRED
```

---

## 9. Expiry Design

The expiry system uses three layers to handle the Render free-tier sleep behaviour:

### Layer 1 — Lazy Expiry on Read

Applied in:
- `GET /api/listings` — before returning feed, any listing with `pickupDeadline < now AND status IN [AVAILABLE, CLAIMED]` is flipped to `EXPIRED`
- `GET /api/listings/:id` — same check for the individual document before responding

This ensures receivers and donors always see accurate status even if the cron job or server startup have not yet run.

### Layer 2 — Periodic Cron Job (every 5 minutes)

```
node-cron: '*/5 * * * *'
  → find all { status: { $in: ['AVAILABLE', 'CLAIMED'] }, pickupDeadline: { $lt: now } }
  → bulk-update status to EXPIRED
  → create Notification documents for affected donors/receivers
  → emit Socket.io 'listing:status_changed' and 'notification:new' events
```

### Layer 3 — Startup Catch-Up Pass

On `index.ts` startup, before the server begins accepting requests, the same sweep as the cron job runs once. This corrects all listings that expired during the period the Render instance was asleep (up to ~15 minutes of sleep + cold start ~30 s).

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
  │                             │◄── secure_url(s) ─────────────│
  │                             │                               │
  │                             │  Save secure_url(s)           │
  │                             │  to Listing.images[]          │
  │◄─── 201 Created ────────────│                               │
```

**Rules:**
- Accepted MIME types: `image/jpeg`, `image/png`, `image/webp`
- Maximum file size: **5 MB per image**
- Minimum images: **1**, maximum: **3** per listing
- All images must be uploaded to the `annasagar` Cloudinary folder; only URLs matching the `annasagar` folder pattern are accepted when creating/updating a listing
- `images[0]` is the **primary image** (used for listing cards and OG image)
- No server-side Cloudinary transformations in MVP (preserves free-tier credits)

---

## 11. Socket.io Usage

### Connection Lifecycle

```
User logs in
  → Client connects to Socket.io server (NEXT_PUBLIC_SOCKET_URL)
  → Client sends auth token
  → Server verifies token, joins socket to room = userId (string)

User logs out
  → Client disconnects socket
```

### Server-Emitted Events

| Event | Room Target | Payload | Client Action |
|-------|------------|---------|---------------|
| `notification:new` | `userId` (string) | `{ notification: NotificationObject }` | Increment notification badge; prepend to notification list |
| `listing:status_changed` | `userId` (string) | `{ listingId: string, status: string }` | Refresh affected listing in feed or detail view |

### Notes

- Rooms are keyed by `userId` string — one room per user, any number of socket connections can join (supports multiple browser tabs)
- The expiry cron job and lazy-expiry service both emit `listing:status_changed` and `notification:new` to affected user rooms
- The server never broadcasts to all clients; all emissions are room-scoped

---

## 12. Environment Variables

All variables are backend (`server`) unless noted as `client`.

| Name | Purpose | Used In | Default / Note |
|------|---------|---------|---------------|
| `PORT` | Express listen port | server | `5000` |
| `NODE_ENV` | Runtime environment | server | `development` |
| `MONGODB_URI` | MongoDB Atlas connection string | server | (Atlas connection string) |
| `JWT_SECRET` | HMAC secret for signing JWTs | server | (long random string) |
| `JWT_EXPIRES_IN` | JWT token lifetime | server | `7d` |
| `CLIENT_URL` | Frontend origin for CORS | server | `http://localhost:3000` in dev |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account cloud name | server | (from Cloudinary dashboard) |
| `CLOUDINARY_API_KEY` | Cloudinary API key | server | (from Cloudinary dashboard) |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | server | (from Cloudinary dashboard) |
| `ADMIN_EMAIL` | Email for seeded admin account | server seed script | (choose before seeding) |
| `ADMIN_PASSWORD` | Password for seeded admin account | server seed script | (choose before seeding) |
| `MAX_LISTING_DURATION_MINUTES` | Max minutes from post to deadline (D6) | server | `180` |
| `MIN_LISTING_DURATION_MINUTES` | Min minutes from post to deadline (D6) | server | `45` |
| `MAX_FOOD_AGE_AT_PICKUP_MINUTES` | Max minutes from cookedAt to deadline (D6) | server | `240` |
| `WARNING_MINUTES` | Minutes before deadline = warning stage | server + client | `30` |
| `NEXT_PUBLIC_API_URL` | Backend base URL for API calls | client | `http://localhost:5000` in dev |
| `NEXT_PUBLIC_SOCKET_URL` | Backend Socket.io URL | client | `http://localhost:5000` in dev |

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
│  └─────────────────────────────────────┘    │
│  Frontend ONLY — no backend logic here       │
└───────────────────────┬─────────────────────┘
                        │ HTTPS + WSS
┌───────────────────────▼─────────────────────┐
│                   Render                     │
│  ┌─────────────────────────────────────┐    │
│  │  Express + Socket.io                │    │
│  │  · REST API (/api/*)                │    │
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
```

**Key constraint:** Vercel hosts the frontend **only**. Render hosts the backend **only**. There is no server-side rendering of API routes on Vercel that proxies to the database.

---

## 14. Scalability & Free-Tier Notes

| Service | Constraint | Mitigation |
|---------|-----------|-----------|
| **Render free** | 1 instance, 512 MB RAM; sleeps after ~15 min inactivity; cold start ~30 s | Lazy expiry on every read means no stale statuses after wake; startup catch-up pass corrects listings that expired during sleep |
| **Atlas M0** | 512 MB storage, shared cluster, no cross-shard transactions | `findOneAndUpdate` atomicity is sufficient for single-document claim operations; no distributed transactions needed |
| **Cloudinary free** | 25 credits/month | No server-side transformations; 5 MB upload limit enforced at backend before Cloudinary call; 1–3 images per listing |
| **Vercel free** | 100 GB bandwidth; serverless function limits | Next.js static generation + server components keep bandwidth and function invocations low at target scale (50+ users, 10–15 simultaneously active) |

---

*End of ARCHITECTURE.md*
