# AnnaSagar — Project Context

> This document captures the background, business logic, roles, constraints, and all resolved design decisions for the AnnaSagar project. It is the single source of truth for anyone joining the project mid-stream or reviewing it at a later date.

---

## 1. Background and Purpose

AnnaSagar is a web application built to reduce cooked-food waste in India by connecting people who have surplus leftover food with people nearby who need it. The name evokes abundance and community sharing.

The core problem: households, hostels, restaurants, and event organisers often cook more food than they can consume. At the same time, many individuals and families nearby could benefit from that food. There is no lightweight, trust-safe, local channel to bridge this gap without payments or logistics complexity.

AnnaSagar is that channel. Donors post listings for surplus cooked food they have on hand right now. Receivers browse, claim, and collect in person. No money changes hands. No delivery is arranged by the platform. The entire interaction is local, human, and time-boxed by food-safety constraints.

The MVP targets small-to-medium cities and campuses in India where community density makes in-person pickup realistic. The initial scale target is 50+ onboarded users with 10–15 simultaneously active at any time.

---

## 2. Business Logic Summary

### Listing lifecycle

1. **Donor creates a listing** — provides food name, category, number of servings, cooked-at timestamp, pickup deadline, address, up to 3 images, and an optional contact note. The system enforces that `cookedAt` is not in the future and that the pickup deadline falls within the allowed duration window.
2. **Listing is AVAILABLE** — visible to all logged-in users except the donor themselves.
3. **Receiver claims the listing** — a single atomic database operation prevents double-claims. The receiver must tick a food-safety disclaimer before every claim.
4. **Listing is CLAIMED** — full address details and donor contact are now visible to the receiver.
5. **Donor marks COLLECTED** — the food has been picked up. Only the donor may perform this action.
6. **If the deadline passes while CLAIMED** — the system automatically transitions the listing to EXPIRED via lazy evaluation, a periodic cron sweep, and a startup catch-up pass.
7. **Donor may CANCEL** — a donor can cancel an AVAILABLE or CLAIMED listing; a CLAIMED cancellation voids the claim and notifies the receiver.
8. **Admin may soft-remove** — admin can soft-remove any listing with a mandatory reason; the removal is recorded in an AuditLog. Users never hard-delete listings.

### WARNING state

WARNING is not a stored status. It is a derived display state: a listing is in WARNING when its stored status is `AVAILABLE` and the current time is within `WARNING_MINUTES` of the `pickupDeadline`. The UI may render this differently to encourage urgency.

### Privacy model

Before claiming, a receiver sees only the food details and approximate location (street/area, city, state, PIN). After a successful claim, the full address (house/building number, landmark) and the donor's contact note become visible to the receiver. Donor and admin always see the full address regardless of claim state.

### Claim atomicity

The claim operation uses a single `findOneAndUpdate({ _id, status: 'AVAILABLE', isRemoved: false, pickupDeadline: { $gt: now }, donor: { $ne: claimerId } })` call. If any guard condition fails (listing not AVAILABLE, already removed, deadline passed, or requester is the donor), the operation returns null and the claim is rejected, preventing race conditions and enforcing all business rules atomically.

---

## 3. Roles and Permissions

There are exactly two roles: **user** and **admin**.

| Capability | user | admin |
|---|---|---|
| Register via public signup | ✅ | ❌ |
| Post food listings | ✅ | — |
| Claim food listings | ✅ (not own) | — |
| Mark listing COLLECTED | ✅ (own listings only) | — |
| Cancel a listing | ✅ (own listings only) | — |
| Soft-remove any listing | ❌ | ✅ |
| View full address before claim | ❌ | ✅ |
| Access admin dashboard | ❌ | ✅ |
| Block/unblock users | ❌ | ✅ |
| View AuditLog | ❌ | ✅ |
| Created via seed script | ❌ | ✅ |

A single user account can act as both donor and receiver at different times. A user cannot claim a listing they themselves posted.

The optional `donorType` profile field lets a user identify as one of: `individual`, `hostel_pg`, `restaurant_cafe`, `ngo`, or `event_organizer`. This is informational only and does not change permissions.

---

## 4. Key Constraints

### Free-tier infrastructure
The entire application must run within the free tiers of Vercel (frontend), Render (backend), MongoDB Atlas M0 (database), and Cloudinary (image storage). This constrains compute power, memory, concurrent connections, and storage. Architecture decisions must respect these limits.

### Food safety
Surplus cooked food degrades quickly. The platform enforces time constraints through environment-variable-driven rules (see D6). A food-safety disclaimer is displayed on every listing card and detail page and must be acknowledged before every claim. The system is not responsible for food quality; the disclaimer makes this explicit to receivers.

### No payments
AnnaSagar is a free-sharing platform. No payment gateway, no tipping, no premium features. All food must be offered at zero cost.

### Indian context
- PIN codes are 6-digit Indian postal codes.
- The language of the application is English only (no i18n in MVP).
- The target geography is Indian cities and campuses.
- Phone numbers, if ever collected in future, would be Indian format — but contact info in MVP is a free-text field (≤ 100 characters).

### No out-of-scope features (MVP)
The following are explicitly out of scope for MVP: GPS/map display, in-app chat, SMS notifications, email notifications, ratings/reviews, reporting/flagging other users, Google OAuth, and any payment mechanism.

---

## 5. Resolved Decisions D1–D13

**D1 — What food can be listed**
AnnaSagar is for sharing **leftover surplus cooked food only** — food that was already prepared and is now excess. It is not a platform for ordering freshly made food or for selling/trading food. This focus keeps the use case simple and legally distinct from food delivery.

**D2 — User roles and account model**
There are two roles: `user` and `admin`. A single user account can both donate and receive; there is no separate "donor account" or "receiver account". A user can never claim a listing they posted themselves. User registration requires name, email, and password. The `donorType` field (individual, hostel_pg, restaurant_cafe, ngo, event_organizer) is an optional profile field — it does not affect permissions.

**D3 — Admin account creation**
Admin accounts are never created through the public signup flow. The first (and subsequent) admin accounts are created by running a seed script that reads `ADMIN_EMAIL` and `ADMIN_PASSWORD` from server environment variables. This prevents privilege escalation through the public UI.

**D4 — Google OAuth**
Google login is **not** included in the MVP. However, the authentication architecture must be designed so that Google OAuth (and potentially other OAuth providers) can be added in a future iteration without restructuring the auth layer.

**D4b — Authentication transport**
JWTs are sent exclusively in the `Authorization: Bearer <token>` header. No cookie-based JWT storage is used. The frontend (Vercel) and backend (Render) are on different origins, making cross-origin cookies impractical. The token is stored in memory or `sessionStorage` on the client. XSS risk is mitigated by a strict CSP header on all Vercel responses and strict output escaping. `JWT_EXPIRES_IN=24h`.

**D4c — Token invalidation**
`User.tokenVersion` is incremented on every password change. The `verifyToken` middleware compares the token's `tokenVersion` to the current database value; a mismatch (stale token) results in a `401` response.

**D5 — Address and contact privacy**
Before claiming, a receiver sees: food name, images, servings, category, cooked-at timestamp, pickup deadline countdown, donor's display name, and the approximate address (street/area, city, state, PIN). The precise address (house/building number, landmark) and the donor's contact note are revealed **only after a successful claim**. Admin and the donor always see the full address.

**D6 — Time rules via environment variables**
All time-related business rules are driven by four environment variables on the server, so they can be tuned without code changes:
- `MAX_LISTING_DURATION_MINUTES=180` — maximum time between listing creation and pickup deadline (3 hours)
- `MIN_LISTING_DURATION_MINUTES=45` — minimum pickup window a donor must offer (45 minutes)
- `MAX_FOOD_AGE_AT_PICKUP_MINUTES=240` — maximum time between `cookedAt` and `pickupDeadline` (4 hours)
- `WARNING_MINUTES=30` — how many minutes before deadline a listing enters the WARNING display state

Additionally, `cookedAt` must not be in the future — a donor cannot claim food was cooked at a future time.

**D7 — Status design: stored vs. derived**
Five statuses are stored in the database: `AVAILABLE`, `CLAIMED`, `COLLECTED`, `EXPIRED`, `CANCELLED`. The `WARNING` state is **derived** — it is never stored. A listing displays as WARNING when its stored status is `AVAILABLE` and `pickupDeadline - now ≤ WARNING_MINUTES`. This keeps the data model clean while allowing the UI to communicate urgency.

**D8 — Food-safety disclaimer**
A food-safety disclaimer is shown on every listing card and every listing detail page, reminding receivers that food is shared as-is and the platform does not verify food quality. Before completing a claim, the receiver must explicitly tick an "I understand" checkbox. The timestamp of this acknowledgement (`disclaimerAcknowledgedAt`) is stored on the claim record for audit purposes. This tick is required on every claim, including re-claims after a cancellation.

**D9 — COLLECTED and EXPIRED transitions**
Only the **donor** can mark a listing as `COLLECTED`. No other user, and not the system automatically, marks COLLECTED. If a listing remains `CLAIMED` past its `pickupDeadline`, the system transitions it to `EXPIRED` — this happens via lazy evaluation (checked when the listing is read), a periodic node-cron sweep, and a startup catch-up pass to handle any that expired while the server was down.

**D10 — Image uploads**
Each listing must have between 1 and 3 images. Each image must be a jpg, png, or webp file no larger than 5 MB. Images are uploaded through the backend API to Cloudinary, stored in the `annasagar` folder. The backend accepts only Cloudinary URLs from that specific folder, preventing spoofed image URLs. The first image (index 0 in the array) serves as the primary/thumbnail image.

**D11 — PIN codes and out-of-scope features**
Address PIN codes are 6-digit Indian postal codes. The following features are explicitly out of scope for MVP and must not be built: in-app reporting/flagging, ratings or reviews, in-app chat, email notifications, SMS notifications, GPS or map integration. These may be revisited in future phases.

**D12 — Data retention and deletion**
Listings and claim history are never hard-deleted by users. Users can cancel their own listings (status → `CANCELLED`) but cannot erase data. Admin removal is a **soft removal**: the listing is flagged as removed with a mandatory reason, and the action is recorded in an `AuditLog` collection. Soft-removed listings are hidden from the public feed and donor's own view but remain accessible in the admin dashboard.

**D13 — Hosting separation**
Vercel hosts the **frontend only** (Next.js client). Render hosts the **backend only** (Express server). There is no server-side rendering of API responses on Vercel, and no static assets are served from Render. This separation is explicit and must be preserved to keep deployment boundaries clean and free-tier quotas maximised.

---

## 6. Current Development State

| Item | Status |
|---|---|
| Phase 1 — Planning & Documentation | ✅ In progress (completing now) |
| PRD.md | ✅ Written |
| ARCHITECTURE.md | ✅ Written |
| PROJECT_CONTEXT.md | ✅ Written (this file) |
| README.md | ✅ Written |
| Source code | ❌ None exists yet |
| Database schemas | ❌ Not implemented |
| API endpoints | ❌ Not implemented |
| Frontend components | ❌ Not implemented |
| Tests | ❌ Not implemented |

**Next milestone (Milestone 3): Architecture review**
Before any code is written, the architecture document should be reviewed and signed off. This milestone confirms the data models, API contract, deployment topology, and environment variable strategy before implementation begins.

The project is currently at the end of Phase 1 (planning). Prompt 2 of the documentation phase is completing now. No source code of any kind exists in the repository yet.
