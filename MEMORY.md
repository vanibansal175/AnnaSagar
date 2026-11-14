> NOTE: ARCHITECTURE.md is the source of truth. If this file disagrees with it, ARCHITECTURE.md wins.

# AnnaSagar — Project Memory

> Durable knowledge base. Not a chat log.
> Records decisions, assumptions, open questions, and current state so any
> future agent or developer can resume work without reading prior conversations.
> Update this file whenever a decision changes or a question is resolved.

---

## 1. Important Decisions

All decisions reference PROJECT_CONTEXT.md for full rationale. One-line summaries:

| ID  | Decision |
|-----|----------|
| D1  | Roles are `user` and `admin` only (lowercase in code, Title Case in prose). |
| D2  | Stored statuses are UPPERCASE: AVAILABLE, CLAIMED, COLLECTED, EXPIRED, CANCELLED. WARNING is derived (not stored). |
| D3  | One account can both donate and receive; a user can never claim their own listing. |
| D4  | Admin is created exclusively via seed script reading ADMIN_EMAIL and ADMIN_PASSWORD from env; no public admin signup. |
| D5  | Privacy gating: house, landmark, donorContact are hidden from receivers until a claim is active; always visible to donor and admin. |
| D6  | Time rules enforced via env vars: MAX_LISTING_DURATION_MINUTES, MIN_LISTING_DURATION_MINUTES, MAX_FOOD_AGE_AT_PICKUP_MINUTES, WARNING_MINUTES. Defaults: 180, 45, 240, 30. Invariants validated on server startup. |
| D7  | Images: 1–3 per listing, max 5 MB each, jpg/png/webp only, stored in Cloudinary folder "annasagar". Any URL not from that folder is rejected. |
| D8  | Soft-delete only: listings are never hard-deleted by users. Admin removal = soft removal with reason recorded in AuditLog. |
| D9  | Claim atomicity: single atomic `findOneAndUpdate({_id, status:'AVAILABLE'})`. No multi-document transaction needed at target scale. |
| D10 | Disclaimer: shown on every listing card and detail page; receiver must tick "I understand" before every claim; `disclaimerAcknowledgedAt` stored on claim subdocument. |
| D11 | Expiry mechanism: lazy expiry on read + node-cron periodic sweep every 5 minutes + startup catch-up pass for listings that expired while server was down. |
| D12 | Notifications delivered via Socket.io to per-user rooms. Five triggers: listing claimed, claim cancelled by receiver, listing cancelled by donor, listing expired, deadline warning. |
| D13 | Vercel hosts ONLY the Next.js frontend; Render hosts ONLY the Express backend. No backend code on Vercel. |

### Additional Canonical Decisions

- **Stack finalized:** Next.js + TypeScript + Tailwind + shadcn/ui + Framer Motion (client, Vercel) · Express + TypeScript + Mongoose + Zod + JWT + Socket.io + node-cron (server, Render) · MongoDB Atlas M0 · Cloudinary — all free-tier.
- **Monorepo structure:** `/client` and `/server` live in the same repository.
- **Blocked user invalidation:** lazy — `checkNotBlocked` middleware queries the DB on every protected request; no token blacklist required at MVP scale.
- **Primary image:** `images[0]` is the primary/thumbnail image.
- **Donor contact format:** free-text field, max 100 characters (OQ1 default accepted).
- **Donor cancels CLAIMED listing:** status → CANCELLED; receiver is notified; claim record is voided (OQ2 default accepted).
- **Soft-removed listings:** hidden from public feed and from the donor's own view; visible only in the admin dashboard.
- **Re-claim after receiver cancels:** allowed; disclaimer tick required again each time.
- **Google OAuth:** explicitly out of scope for MVP; auth architecture must allow adding it later without breaking changes.
- **Language:** English only.
- **PIN code:** 6-digit Indian PIN code, stored as string.
- **donorType (optional profile field):** `individual | hostel_pg | restaurant_cafe | ngo | event_organizer`.

---

## 2. Assumptions

These assumptions drive implementation. If any proves incorrect, re-evaluate the affected milestones.

| # | Assumption |
|---|------------|
| A1 | MongoDB Atlas M0 free tier is sufficient for MVP (512 MB storage, shared cluster). |
| A2 | Cloudinary free tier is sufficient (25 GB storage, 25 GB monthly bandwidth). |
| A3 | Render free tier cold-start latency (~30 s) is acceptable for MVP. The keep-alive ping (Milestone 16) mitigates this for active demos. |
| A4 | Concurrent user peak is 10–15 simultaneously active users. The 50-user onboarding target is cumulative, not simultaneous. |
| A5 | No payment, delivery, or in-app messaging is required in MVP. |
| A6 | Food safety liability is managed entirely through the disclaimer text. No legal review is in scope. |
| A7 | A single Socket.io server instance on Render is sufficient at MVP scale (no Redis adapter needed). |
| A8 | bcrypt with a minimum of 12 rounds is the password hashing standard throughout the project. |
| A9 | JWT expiry policy (duration) will be set by an env var; a reasonable default is 7 days. |
| A10 | All dates and times are stored and compared in UTC. The UI may display local time. |

---

## 3. Open Questions

| ID   | Question | Recommended Default | Status |
|------|----------|---------------------|--------|
| OQ1  | Donor contact format — structured fields or free text? | Free-text ≤ 100 chars | default accepted |
| OQ2  | What happens when a donor cancels a CLAIMED listing? | Status → CANCELLED; receiver notified; claim voided | default accepted |
| OQ3  | How is expiry handled when the Render server sleeps? | Lazy expiry on read + node-cron every 5 min + startup catch-up | default accepted |
| OQ4  | How are notifications delivered? | Socket.io to per-user rooms | default accepted |
| OQ5  | Which image is the primary/thumbnail? | `images[0]` | default accepted |
| OQ6  | Who can see soft-removed listings? | Admin dashboard only | default accepted |
| OQ7  | How are blocked user sessions invalidated? | Lazy middleware check per request | default accepted |
| OQ8  | Where is disclaimer acknowledgement stored? | `disclaimerAcknowledgedAt` on claim subdocument | default accepted |
| OQ9  | Does admin see full address before a claim exists? | Yes — admin always sees all fields | default accepted |
| OQ10 | Can a listing be re-claimed after the receiver cancels? | Yes; disclaimer tick required again | default accepted |

---

## 4. Canonical Constants

### Stored Listing Statuses

| Status    | Stored | Description |
|-----------|--------|-------------|
| AVAILABLE | ✅ Yes | Listing is live and open for claiming. |
| CLAIMED   | ✅ Yes | A receiver has an active claim. |
| COLLECTED | ✅ Yes | Donor has confirmed food was picked up. |
| EXPIRED   | ✅ Yes | Deadline passed without collection. |
| CANCELLED | ✅ Yes | Cancelled by donor or by the system. |
| WARNING   | ❌ Derived | AVAILABLE + within `WARNING_MINUTES` of pickupDeadline. Never stored. |

### Roles

| Role  | Code value | Description |
|-------|-----------|-------------|
| User  | `user`    | Default role; can donate and receive. |
| Admin | `admin`   | Created via seed script only; full platform access. |

### D6 Environment Variables (Time Rules)

| Variable | Default | Unit | Invariant |
|----------|---------|------|-----------|
| `MAX_LISTING_DURATION_MINUTES` | 180 | minutes | Must be > MIN_LISTING_DURATION_MINUTES |
| `MIN_LISTING_DURATION_MINUTES` | 45  | minutes | Must be < MAX_LISTING_DURATION_MINUTES |
| `MAX_FOOD_AGE_AT_PICKUP_MINUTES` | 240 | minutes | Must be > MAX_LISTING_DURATION_MINUTES |
| `WARNING_MINUTES` | 30 | minutes | Must be < MIN_LISTING_DURATION_MINUTES |

All four invariants are validated on server startup; the process exits if any fails.

### Other Key Env Variables

| Variable | Purpose |
|----------|---------|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Secret for signing JWTs |
| `JWT_EXPIRES_IN` | JWT lifetime (e.g. `7d`) |
| `CLIENT_URL` | CORS origin; production Vercel URL |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `ADMIN_EMAIL` | Seed script: admin account email |
| `ADMIN_PASSWORD` | Seed script: admin account password |
| `NODE_ENV` | `development` or `production` |
| `PORT` | Express listen port |

---

## 5. Current State

| Item | Status |
|------|--------|
| Phase | 1 — Planning and Documentation |
| Current milestone | Milestone 2 (Documentation) — **COMPLETE** |
| Source code | None — no scaffold exists yet |
| Repository | https://github.com/vanibansal175/AnnaSagar · branch `main` |
| Files committed | `.gitignore`, `REQUIREMENTS.md`, `PRD.md`, `ARCHITECTURE.md`, `RULES.md`, `PROJECT_CONTEXT.md`, `README.md`, `TASKS.md`, `MEMORY.md` |
| Next milestone | **Milestone 3 — Architecture Review** |

---

## 6. Next Step

User reviews all 7 documentation files (`PRD.md`, `ARCHITECTURE.md`, `RULES.md`, `PROJECT_CONTEXT.md`, `README.md`, `TASKS.md`, `MEMORY.md`) and either:

- **Approves** → proceed to Milestone 3 (Architecture Review), then Milestone 4 (Scaffold).
- **Requests corrections** → agent updates the relevant file(s), re-runs consistency check, recommits.

No code is written until the user signs off on the documentation.
