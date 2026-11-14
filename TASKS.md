> NOTE: ARCHITECTURE.md is the source of truth. If this file disagrees with it, ARCHITECTURE.md wins.

# AnnaSagar — Master Task Tracker

> This file is the single source of truth for milestone and task status.
> Update task checkboxes and milestone status as work progresses.
> See MEMORY.md for decisions, assumptions, and open questions.

---

## Phase 1 — Planning and Documentation

### Milestone 1 — Discovery and Requirements Clarification ⚫ MERGED INTO MILESTONE 2

(All discovery tasks were absorbed into Milestone 2)

---

### Milestone 2 — Project Documentation ✅ COMPLETE

- [x] Read and verify REQUIREMENTS.md
- [x] Run pre-step requirements check (R1–R90 checklist, contradictions, gaps)
- [x] Create PRD.md
- [x] Create ARCHITECTURE.md
- [x] Create RULES.md
- [x] Create PROJECT_CONTEXT.md
- [x] Create README.md
- [x] Create TASKS.md
- [x] Create MEMORY.md
- [ ] Run consistency check across all 7 files
- [x] Commit: "docs: add project documentation"

---

### Milestone 3 — Architecture Review ⬜ NOT STARTED

- [ ] Review ARCHITECTURE.md with stakeholder
- [ ] Verify data model covers all R-IDs
- [ ] Confirm env variable canonical table is complete
- [ ] Confirm API endpoint list covers all user journeys
- [ ] Confirm expiry design acceptable (lazy + cron + startup)
- [ ] Confirm notification delivery (Socket.io)
- [ ] Resolve any open questions from MEMORY.md
- [ ] Sign off on folder structure before scaffold
- [ ] Update MEMORY.md with any changes

---

## Phase 2 — Backend Foundation

### Milestone 4 — Initialize App and Structure ⬜ NOT STARTED

> Depends on: Milestone 3

- [ ] Initialize /client: npx create-next-app@latest with TypeScript, Tailwind, App Router
- [ ] Initialize /server: npm init, install Express, TypeScript, ts-node, nodemon
- [ ] Configure tsconfig.json (strict: true) for both
- [ ] Install and configure shadcn/ui in client
- [ ] Set up Framer Motion in client
- [ ] Set up server folder structure per ARCHITECTURE.md
- [ ] Configure ESLint and Prettier for both
- [ ] Add .env.example files for client and server (names only, no values)
- [ ] Verify git status is clean after scaffold
- [ ] Commit: "chore: initialize monorepo scaffold"

---

### Milestone 5 — Database, Schemas, Validation, Indexes ⬜ NOT STARTED

> Depends on: Milestone 4

- [ ] Install Mongoose; configure DB connection with retry logic
- [ ] Implement User model with all fields per ARCHITECTURE.md
- [ ] Implement Listing model with all fields (address subdocument, claim subdocument, claimHistory array)
- [ ] Implement Notification model
- [ ] Implement AuditLog model
- [ ] Add all indexes per ARCHITECTURE.md
- [ ] Implement Zod schemas for all request bodies (register, login, createListing, claim)
- [ ] Validate D6 env var invariants on server startup (MIN < MAX_LISTING_DURATION, WARNING < MIN_LISTING_DURATION, MAX_FOOD_AGE > MAX_LISTING_DURATION)
- [ ] Write unit tests for Zod validators
- [ ] Commit: "feat: add database models, schemas and indexes"

---

### Milestone 6 — Authentication, Authorization, User Management ⬜ NOT STARTED

> Depends on: Milestone 5

- [ ] Implement POST /api/auth/register (bcrypt hash, min rounds 12)
- [ ] Implement POST /api/auth/login (JWT, httpOnly cookie)
- [ ] Implement GET /api/auth/me
- [ ] Implement verifyToken middleware
- [ ] Implement checkRole middleware
- [ ] Implement checkNotBlocked middleware (lazy: DB check per request)
- [ ] Implement GET/PATCH /api/users/me/profile (donorType update only)
- [ ] Write seed script for admin (reads ADMIN_EMAIL, ADMIN_PASSWORD from env)
- [ ] Write integration tests for auth endpoints
- [ ] Test: register, login, JWT expiry, blocked user rejection, role enforcement
- [ ] Commit: "feat: implement auth and user management"

---

## Phase 3 — Core Features

### Milestone 7 — Layout, Navigation, Dashboard ⬜ NOT STARTED

> Depends on: Milestone 6

- [ ] Build root layout (Header, Footer, navigation)
- [ ] Implement auth pages: Register, Login
- [ ] Implement protected route wrapper
- [ ] Implement user dashboard (donor stats, receiver stats)
- [ ] Connect frontend auth to /api/auth endpoints
- [ ] Socket.io client: connect on login, join user room, disconnect on logout
- [ ] Responsive design for mobile, tablet, desktop
- [ ] Add food-safety disclaimer banner (global)
- [ ] Commit: "feat: layout, navigation and dashboard"

---

### Milestone 8 — Listing Feed and Claiming Flow ⬜ NOT STARTED

> Depends on: Milestone 7

- [ ] Implement GET /api/listings (with category and city filters, sort by pickupDeadline)
- [ ] Implement GET /api/listings/:id (with privacy gating per D5)
- [ ] Implement listing feed page (cards with live countdown, WARNING stage highlight, status badges)
- [ ] Implement listing detail page
- [ ] Implement POST /api/listings/:id/claim (atomic, disclaimer required)
- [ ] Implement DELETE /api/listings/:id/claim (receiver cancel claim)
- [ ] Implement PATCH /api/listings/:id/collect (donor marks collected)
- [ ] Implement PATCH /api/listings/:id/cancel (donor cancel)
- [ ] Test: concurrent claim attempts (two requests simultaneously → only one succeeds)
- [ ] Test: privacy fields before and after claim
- [ ] Commit: "feat: listing feed and claiming flow"

---

### Milestone 9 — My Listings and Admin Panel ⬜ NOT STARTED

> Depends on: Milestone 8

- [ ] Implement "My Listings" page for donor (all statuses including removed)
- [ ] Implement "My Claims" page for receiver
- [ ] Implement admin dashboard: user list, listing list, audit log
- [ ] Implement GET /api/admin/users, PATCH /api/admin/users/:id/block, /unblock
- [ ] Implement GET /api/admin/listings, DELETE /api/admin/listings/:id (soft remove)
- [ ] Implement GET /api/admin/audit-logs
- [ ] Verify soft-removed listings hidden from public feed, visible in admin
- [ ] Verify blocked users rejected on all protected endpoints
- [ ] Commit: "feat: my listings and admin panel"

---

### Milestone 10 — Cloudinary and Post Food Flow ⬜ NOT STARTED

> Depends on: Milestone 9

- [ ] Configure Cloudinary (server-side: cloud name, API key, API secret)
- [ ] Implement image upload: validate type (jpg/png/webp), size (≤5 MB each), count (1–3)
- [ ] Upload to Cloudinary folder "annasagar" via backend
- [ ] Reject any image URL not from annasagar folder
- [ ] Implement POST /api/listings (full create listing flow with time rule validation)
- [ ] Implement image preview on client before submission (FileReader API)
- [ ] Handle upload failure gracefully (error message, allow retry)
- [ ] Validate D6 time rules: cookedAt not future, pickupDeadline within MIN/MAX_LISTING_DURATION, food age within MAX_FOOD_AGE_AT_PICKUP
- [ ] Write integration tests for listing creation and image upload
- [ ] Commit: "feat: Cloudinary upload and post food flow"

---

### Milestone 11 — Notifications, Loading, Error States ⬜ NOT STARTED

> Depends on: Milestone 10

- [ ] Implement Notification model routes (GET /api/notifications, PATCH mark read)
- [ ] Implement server-side notification creation for all 5 triggers (R67–R71)
- [ ] Implement node-cron job: every 5 minutes, expire overdue listings, emit notifications
- [ ] Implement server startup catch-up pass for expired listings
- [ ] Implement lazy expiry on GET /api/listings and GET /api/listings/:id
- [ ] Implement Socket.io server: per-user rooms, emit notification:new and listing:status_changed
- [ ] Implement Socket.io client: notification badge, toast on new notification
- [ ] Implement loading skeletons for feed and detail pages
- [ ] Implement global error boundary and error pages (404, 500)
- [ ] Test: deadline_warning notification fires at WARNING_MINUTES before deadline
- [ ] Test: expired notification fires when listing expires
- [ ] Commit: "feat: notifications, expiry jobs and loading/error states"

---

## Phase 4 — Quality Assurance

### Milestone 12 — Security Audit ⬜ NOT STARTED

> Depends on: Milestone 11

- [ ] Audit: no passwordHash ever returned from API
- [ ] Audit: address privacy gating (house, landmark, donorContact) enforced server-side
- [ ] Audit: admin-only routes inaccessible to role=user
- [ ] Audit: user cannot claim own listing
- [ ] Audit: only donor can mark COLLECTED or cancel listing
- [ ] Audit: only receiver of active claim can cancel claim
- [ ] Audit: JWT httpOnly cookie, SameSite, Secure in production
- [ ] Audit: Cloudinary URLs only from annasagar folder accepted
- [ ] Audit: all req.body inputs validated by Zod before controller
- [ ] Audit: CORS locked to CLIENT_URL
- [ ] Audit: no secrets in git history (git log --all --full-history -- '*.env*')
- [ ] Audit: rate limiting on auth endpoints
- [ ] Document findings and fixes
- [ ] Commit: "fix: security audit findings"

---

### Milestone 13 — Functional, Unit and Integration Tests ⬜ NOT STARTED

> Depends on: Milestone 12

- [ ] Unit tests: Zod validators (all required/optional fields, edge cases)
- [ ] Unit tests: expiry helper function
- [ ] Unit tests: time rule validation (D6)
- [ ] Integration tests: auth (register, login, me, blocked)
- [ ] Integration tests: listing CRUD
- [ ] Integration tests: atomic claim (concurrent test)
- [ ] Integration tests: privacy fields before/after claim
- [ ] Integration tests: admin soft-delete, block/unblock
- [ ] Integration tests: notification creation for all 5 triggers
- [ ] Integration tests: image upload (valid, oversized, wrong type, too many)
- [ ] E2E: donor journey (register → post → collected)
- [ ] E2E: receiver journey (register → browse → claim → cancel)
- [ ] Achieve ≥80% coverage on server routes and services
- [ ] Commit: "test: full test suite"

---

### Milestone 14 — Performance and Scalability Tests ⬜ NOT STARTED

> Depends on: Milestone 13

- [ ] Verify compound indexes hit for feed query (explain plan)
- [ ] Load test: simulate 10–15 concurrent users on feed endpoint
- [ ] Load test: simulate concurrent claim attempts (expect exactly 1 success)
- [ ] Measure cold-start time on Render free tier
- [ ] Measure Cloudinary upload latency
- [ ] Document results; do NOT claim 50-concurrent-user support unless tested
- [ ] Commit: "test: performance and scalability results"

---

### Milestone 15 — Bug Fixing and Regression ⬜ NOT STARTED

> Depends on: Milestone 14

- [ ] Fix all bugs found in Milestones 12–14
- [ ] Run full test suite; confirm no regressions
- [ ] Re-audit any security findings that were deferred
- [ ] Update MEMORY.md with any new decisions made during QA
- [ ] Commit: "fix: bug fixes and regression cleanup"

---

## Phase 5 — Deployment and Launch

### Milestone 16 — Production Readiness ⬜ NOT STARTED

> Depends on: Milestone 15

- [ ] Review all env vars; create production .env.example with names only
- [ ] Confirm NODE_ENV=production disables stack traces in error responses
- [ ] Confirm JWT cookie is Secure and SameSite=Strict in production
- [ ] Confirm CORS origin locked to production Vercel URL
- [ ] Add health check endpoint GET /api/health (returns 200 + uptime)
- [ ] Add Render keep-alive ping (or document cron-job.org approach)
- [ ] Confirm mongodump backup procedure documented
- [ ] Review Cloudinary credit usage estimate
- [ ] Commit: "chore: production readiness"

---

### Milestone 17 — Deployment ⬜ NOT STARTED

> Depends on: Milestone 16

- [ ] Deploy backend to Render (Node.js web service); set all env vars in dashboard
- [ ] Run admin seed script on production DB
- [ ] Deploy frontend to Vercel; set NEXT_PUBLIC_API_URL and NEXT_PUBLIC_SOCKET_URL
- [ ] Verify CORS works between Vercel domain and Render domain
- [ ] Verify Socket.io connection works in production
- [ ] Verify Cloudinary uploads work in production
- [ ] Verify admin seed account works
- [ ] Smoke test: donor posts listing → receiver claims → donor marks collected
- [ ] Smoke test: listing expires after deadline
- [ ] Commit: "chore: production deployment verified"

---

### Milestone 18 — Final Acceptance and Launch Verification ⬜ NOT STARTED

> Depends on: Milestone 17

- [ ] Run full acceptance criteria checklist against PRD (every R-ID)
- [ ] Onboard 2–3 test users (1 donor, 1 receiver, 1 admin)
- [ ] Verify responsive UI on mobile, tablet, desktop
- [ ] Verify no duplicate claims possible (attempt simultaneously from two accounts)
- [ ] Verify expiry works correctly end-to-end in production
- [ ] Verify notification delivery via Socket.io in production
- [ ] Verify admin can block user, remove listing, view audit log
- [ ] Confirm no secrets in git history
- [ ] Final git status: clean
- [ ] Tag release: v1.0.0
- [ ] Update MEMORY.md: mark MVP as launched
