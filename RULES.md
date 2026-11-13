# AnnaSagar — Engineering Rules

> These rules are **mandatory**, not advisory. Every contributor (human or AI agent) must follow them. When a rule conflicts with convenience, the rule wins.

---

## 1. TypeScript Standards

- **Strict mode is non-negotiable.** Both `client/tsconfig.json` and `server/tsconfig.json` must include `"strict": true`. Never disable it, suppress it, or add `@ts-ignore` without a comment explaining why and a TODO to fix it properly.
- Use explicit return types on all exported functions and all async functions.
- Prefer `type` for plain shapes and `interface` for extendable contracts (e.g., Mongoose document types). Be consistent within a file.
- Never use `any`. Use `unknown` and narrow it, or define the correct type.
- Avoid type assertions (`as Foo`) unless you are narrowing from `unknown` and can verify it at runtime. Never use `as any`.
- Status values (`AVAILABLE`, `CLAIMED`, `COLLECTED`, `EXPIRED`, `CANCELLED`) must be declared as a `const` enum or a `readonly` string union — never as bare string literals scattered across the codebase.

  ```ts
  // server/src/constants/listingStatus.ts
  export const ListingStatus = {
    AVAILABLE: 'AVAILABLE',
    CLAIMED:   'CLAIMED',
    COLLECTED: 'COLLECTED',
    EXPIRED:   'EXPIRED',
    CANCELLED: 'CANCELLED',
  } as const;
  export type ListingStatus = (typeof ListingStatus)[keyof typeof ListingStatus];
  ```

- Use `readonly` on function parameters and object properties that must not be mutated.
- Always `await` Promises; never discard a Promise silently. If a fire-and-forget is intentional, assign it to `void` explicitly: `void sendEmail(...)`.
- Keep types in a co-located `*.types.ts` file or a shared `types/` directory. Never inline complex types ad-hoc in function signatures.

---

## 2. Folder and File Naming Conventions

### Naming Rules

| Category | Convention | Example |
|---|---|---|
| Variables and functions | `camelCase` | `pickupDeadline`, `getUserById` |
| React components and classes | `PascalCase` | `ListingCard`, `UserService` |
| TypeScript types and interfaces | `PascalCase` | `Listing`, `ApiResponse<T>` |
| Environment variables | `SCREAMING_SNAKE_CASE` | `JWT_SECRET`, `CLIENT_URL` |
| Status constants | `SCREAMING_SNAKE_CASE` | `AVAILABLE`, `CLAIMED` |
| Non-component file names | `kebab-case` | `listing-service.ts`, `auth-middleware.ts` |
| React component file names | `PascalCase` | `ListingCard.tsx`, `ClaimButton.tsx` |
| Directories | `kebab-case` | `listing-service/`, `auth/` |

### Project Structure

```
annasagar/
├── client/                    # Next.js app
│   ├── src/
│   │   ├── app/               # Next.js App Router pages and layouts
│   │   ├── components/        # Shared UI components (PascalCase files)
│   │   │   └── ui/            # shadcn/ui generated components
│   │   ├── hooks/             # Custom React hooks (use-*.ts)
│   │   ├── lib/               # Utility functions (kebab-case)
│   │   ├── schemas/           # Zod schemas for frontend validation
│   │   ├── types/             # Shared TypeScript types
│   │   └── constants/         # Enums and constant values
│   └── tsconfig.json
├── server/
│   ├── src/
│   │   ├── controllers/       # Route handlers (kebab-case)
│   │   ├── middleware/        # Express middleware
│   │   ├── models/            # Mongoose models (PascalCase file = model name)
│   │   ├── routes/            # Express routers
│   │   ├── services/          # Business logic (kebab-case)
│   │   ├── schemas/           # Zod schemas for backend validation
│   │   ├── types/             # TypeScript types
│   │   ├── constants/         # Status constants, enums
│   │   └── utils/             # Pure helper functions
│   └── tsconfig.json
├── PRD.md
├── ARCHITECTURE.md
└── RULES.md
```

- One export per component file. Do not barrel-export React components (`index.ts` re-exports are acceptable for utility/service modules only).
- Tests live alongside the code they test: `listing-service.test.ts` next to `listing-service.ts`, or in a `__tests__/` subdirectory of the module.

---

## 3. API Response Format

Every backend endpoint **must** return one of these two shapes. No exceptions.

### Success

```json
{
  "success": true,
  "data": { }
}
```

- `data` may be an object, array, or `null` (for no-content operations like delete).
- Include `meta` at the top level (not inside `data`) for pagination: `{ "success": true, "data": [...], "meta": { "total": 100, "page": 2, "limit": 20 } }`.

### Error

```json
{
  "success": false,
  "error": {
    "code": "LISTING_NOT_FOUND",
    "message": "No listing found with that ID."
  }
}
```

- `code` is a `SCREAMING_SNAKE_CASE` string that client code may switch on. Codes must be documented in `ARCHITECTURE.md`.
- `message` is human-readable and safe to display (no stack traces, no internal paths).
- **Never** include `stack`, `passwordHash`, internal DB IDs beyond what the client needs, or any other internal detail in an error response.
- Use the correct HTTP status codes:
  - `200` — success
  - `201` — resource created
  - `400` — validation error or bad request
  - `401` — unauthenticated
  - `403` — authenticated but unauthorised
  - `404` — resource not found
  - `409` — conflict (e.g., race on claim)
  - `500` — unexpected server error

---

## 4. Error Handling

### Backend

- **Never** let an unhandled exception reach the network. All async route handlers must be wrapped (use an `asyncHandler` utility or Express 5's native async support).

  ```ts
  // utils/async-handler.ts
  import { Request, Response, NextFunction } from 'express';
  type AsyncFn = (req: Request, res: Response, next: NextFunction) => Promise<void>;
  export const asyncHandler = (fn: AsyncFn) => (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);
  ```

- Create a global error-handling middleware as the **last** middleware registered. It must:
  1. Log the error internally (with request ID, timestamp — never log secrets or tokens).
  2. Return the standard `{ success: false, error: { code, message } }` shape.
  3. Never expose stack traces or internal paths in the response body.

- Zod validation errors must be caught and translated into `400` responses with `code: 'VALIDATION_ERROR'` and a `message` derived from `z.ZodError.flatten()` or `format()`.

- Mongoose `CastError` (invalid ObjectId) → `400 BAD_REQUEST`.
- Mongoose duplicate key (code 11000) → `409 CONFLICT`.
- JWT errors (`JsonWebTokenError`, `TokenExpiredError`) → `401 UNAUTHORISED`.

### Frontend

- Never silently swallow errors from API calls. Always surface them either via a toast, inline field error, or error boundary.
- Use React Error Boundaries for page-level errors; never let an unhandled render error crash the whole application silently.
- Discriminate on `success`:

  ```ts
  const json = await res.json();
  if (!json.success) {
    // json.error.code and json.error.message are always present
    toast.error(json.error.message);
    return;
  }
  // json.data is safe to use here
  ```

---

## 5. Security Rules

- **bcrypt minimum cost factor: 12.** Never lower this. If the hash function changes, document the migration path before merging.
- **JWT must be stored in an `httpOnly` cookie** (preferred). If `Authorization` header is used as an alternative, document why in the PR. Never store JWT in `localStorage` or non-httpOnly cookies.
- **CORS**: lock `origin` to the `CLIENT_URL` environment variable. Never use `origin: '*'` in production.

  ```ts
  app.use(cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  }));
  ```

- **Never return `passwordHash`** from any endpoint. All Mongoose user queries must call `.select('-passwordHash')`. Add this as a Mongoose schema plugin or enforce it in the User model's default projection.
- **Validate before trusting.** Run Zod validation middleware **before** the controller. The controller may assume `req.body` is valid.
- **Admin users are created only via seed script** reading `ADMIN_EMAIL` and `ADMIN_PASSWORD`. There is no public signup path for admin accounts. The seed script must check for existing admins to be idempotent.
- **Blocked users** must be rejected on every protected request. The `checkNotBlocked` middleware reads `user.isBlocked` from the database (or a recently-hydrated token) and returns `403 FORBIDDEN` if true.
- Input sanitisation: strip or reject HTML from free-text fields (donor contact, food name). Use a sanitiser library or Zod `.transform()` to trim and strip tags.
- Cloudinary upload: only accept URLs matching the `annasagar` Cloudinary folder pattern when saving listing images. Never trust a URL provided directly by the client.
- Rate-limit authentication endpoints (`/api/auth/login`, `/api/auth/register`) to prevent brute-force attacks. Use `express-rate-limit` with a reasonable window (e.g., 15 requests per 15 minutes per IP).
- Cookie settings for JWT: `httpOnly: true`, `secure: true` (in production), `sameSite: 'strict'`.

---

## 6. Database Rules

- **No hard-deletes by users.** Listings are soft-deleted by setting `isDeleted: true` and storing a reason (admin-only, via AuditLog). User-facing delete actions are not permitted.
- **Atomic claim.** Claiming a listing must use a single `findOneAndUpdate({ _id, status: 'AVAILABLE' }, { $set: { status: 'CLAIMED', ... } }, { new: true })`. Never read-then-write for status transitions.
- **`select('-passwordHash')` on every user query.** Add this to the Mongoose schema's default projection:

  ```ts
  UserSchema.set('toJSON', {
    transform: (_doc, ret) => {
      delete ret.passwordHash;
      return ret;
    },
  });
  ```

  AND explicitly call `.select('-passwordHash')` on all `find`, `findOne`, and `findById` queries as a defence-in-depth measure.

- **`lean()`** on all read-only queries (GET endpoints that do not modify data). This returns plain JS objects, not Mongoose documents, and is significantly faster.
- **Compound indexes** must match those defined in `ARCHITECTURE.md`. Never add or remove indexes without updating `ARCHITECTURE.md` and justifying the change in the PR description.
- **Never store derived state** (e.g., `WARNING` status). `WARNING` is computed at read time: `status === 'AVAILABLE' && pickupDeadline - now <= WARNING_MINUTES * 60_000`.
- **Expiry** is a three-layer process:
  1. Lazy: on every read of a listing, check and correct expired status.
  2. `node-cron` periodic sweep: marks all `AVAILABLE` listings past their `pickupDeadline` as `EXPIRED`.
  3. Startup catch-up: on server boot, run the sweep immediately to handle listings that expired during downtime.
- Mongoose schema changes (adding/removing fields) must be accompanied by a migration plan documented in the PR. Do not assume old documents will have new fields; use optional fields and default values defensively.
- Do not use `save()` on a document retrieved with `lean()`. Lean documents are plain objects, not Mongoose documents.

---

## 7. Frontend UI/UX Guidelines

- **Mobile-first.** Write Tailwind classes for mobile (`sm:` breakpoint and below) first, then override for larger screens. Test all pages at 375 px wide.
- **Tailwind only.** No inline styles (`style={{}}`). No CSS modules. No `styled-components`. No `emotion`. All styling via Tailwind utility classes.
- **shadcn/ui components preferred.** Before building a custom component, check if shadcn/ui provides one. Use `npx shadcn-ui@latest add <component>` to add it; do not copy-paste shadcn source unless it needs deep modification, and document why in a comment.
- **Framer Motion for meaningful transitions only.** Use it for: page transitions, modal open/close, list item entrance/exit. Do not use it for hover effects, button presses, or decoration. If the animation adds no UX value, remove it.
- **No `any` in component props.** All component props must be fully typed with an exported `interface` or `type`.
- **Disclaimer on every listing card and detail page.** The receiver must tick "I understand" before every claim. This is not optional and must not be hidden behind a small checkbox. `disclaimerAcknowledgedAt` must be sent with the claim request.
- **Sensitive address fields** (`house`, `landmark`, `donorContact`) must NOT be rendered until the listing is CLAIMED by the current user (or the current user is the donor or admin). Gate this in the component, not just the API.
- **Image preview.** Use the FileReader API to show image previews before upload. Do not upload until the user submits the form.
- **Never claim own listing.** The "Claim" button must not render if `listing.donorId === currentUser._id`. Enforce this in the UI AND the backend.
- **Error states.** Every API-driven component must handle three states: loading, error, and success. Never show a blank screen on error.
- **Accessibility.** All interactive elements must have accessible labels (`aria-label`, `aria-describedby`, or visible text). Buttons must not be `<div>`s. Form fields must have `<label>` elements associated via `htmlFor`.

---

## 8. Testing Rules

- **Unit tests** are required for:
  - All utility functions in `server/src/utils/` and `client/src/lib/`.
  - All service-layer functions in `server/src/services/`.
- **Integration tests** are required for all API endpoints. Each endpoint test must cover:
  - Happy path (200/201).
  - Validation failure (400).
  - Auth failure (401, 403 where applicable).
  - Not-found case (404 where applicable).
  - Conflict case (409 for claim endpoint).
- **No mock data in production.** Test fixtures and seed data must be gated behind `NODE_ENV !== 'production'`.
- Tests must pass locally before opening a PR. CI must enforce this; a failing test blocks merge.
- Do not test Mongoose models directly against the real Atlas cluster in CI. Use an in-memory MongoDB (e.g., `mongodb-memory-server`) or a dedicated test database.
- Test files must not share mutable state across test cases. Reset database state between tests (use `beforeEach` or `afterEach` hooks).
- Test naming: describe what the unit does and what scenario is being tested.

  ```ts
  describe('claimListing', () => {
    it('returns 409 when listing is already CLAIMED', async () => { ... });
    it('returns 403 when requester is the donor', async () => { ... });
  });
  ```

- Code coverage is a signal, not a target. Do not write trivial tests to hit a coverage number.

---

## 9. Dependency Rules

- **No paid services.** The free tier of every external service must be sufficient for the target scale (50+ onboarded users, 10–15 simultaneously active). Document the free-tier limits of every service in `ARCHITECTURE.md`.
- **Every new npm package must be justified** in the PR description:
  - What problem does it solve?
  - Why is it better than a custom implementation or an already-installed package?
  - What is its weekly download count and last publish date? (Signal of maintenance.)
- **Never install a package for a one-liner.** If the package's entire contribution to the codebase is a single small utility, write it yourself.
- Keep `dependencies` and `devDependencies` correctly separated. Build tools, test runners, and type definitions belong in `devDependencies`.
- Run `npm audit` before each release. Do not ship with known high or critical vulnerabilities.
- Pin versions in `package.json` for the server (`"express": "4.18.2"`, not `"express": "^4.18.2"`) to avoid surprise breakage on the Render deploy. The client may use `^` with caution given Vercel's build reproducibility.
- Do not add packages that duplicate existing stack capabilities:
  - HTTP client on the server: use `node-fetch` or Node's native `fetch` — not `axios`.
  - Validation: Zod is already the standard — do not add `joi`, `yup`, or `class-validator`.
  - Date manipulation: use native `Date` and `Intl` — do not add `moment.js`. `date-fns` is acceptable if many date helpers are needed; justify it.

---

## 10. Git and Version Control Rules

- **Conventional commits required.** Every commit message must start with one of:
  - `feat:` — new feature
  - `fix:` — bug fix
  - `docs:` — documentation only
  - `chore:` — build scripts, dependency bumps, tooling
  - `test:` — adding or updating tests
  - `refactor:` — code restructuring with no behaviour change
  - `perf:` — performance improvement

  Examples:
  ```
  feat: add soft-delete for listings
  fix: return 409 when listing already claimed
  docs: update ARCHITECTURE.md with indexes
  ```

- **No force-push to `main`.** Ever. For any reason.
- **All changes via Pull Requests.** Even solo contributors. PRs are the record of what changed and why.
- PR description must include:
  - What changed and why.
  - How to test it.
  - Any new env vars added (see §12).
  - Any new npm packages added (see §9).
- **Branch naming:** `feat/<short-description>`, `fix/<short-description>`, `chore/<short-description>`.
- **Keep PRs small.** One feature or one fix per PR. Do not batch unrelated changes.
- **Never commit secrets.** Use `.gitignore` for all `.env` files. The `.gitignore` must include `.env`, `.env.local`, `.env.production`, and similar variants. If a secret is accidentally committed, rotate it immediately — removing it from history is not sufficient on its own.
- **Tag releases** with semantic versions (`v1.0.0`) on `main` after merging. Use annotated tags: `git tag -a v1.0.0 -m "Release v1.0.0"`.

---

## 11. Rules for Modifying Existing Code

- **Read the file before editing it.** Understand what it does, what it exports, and who uses those exports before making any change.
- **Smallest change that works.** Fix the bug or add the feature. Do not rewrite unrelated code in the same PR, even if it looks messy.
- **No unrelated refactors when fixing a bug.** If you notice code that should be improved, open a separate `refactor:` PR. Mixing a bug fix with a refactor makes the fix harder to review and revert.
- **Preserve existing test coverage.** If you modify a function that has tests, ensure all existing tests still pass. If behaviour changes intentionally, update the tests in the same PR.
- **Do not change function signatures without auditing all call sites.** Use TypeScript's compiler errors to find all usages; never rely on grep alone.
- **Document breaking changes** in the PR description. If an API endpoint's request or response shape changes, update `ARCHITECTURE.md` in the same PR.
- **Do not comment out code.** Delete it. Version control preserves history.
- If you must work around a known issue, add a `// TODO(issue-link): explain why` comment and open a tracking issue.

---

## 12. Environment Variables

### Naming

All environment variables use `SCREAMING_SNAKE_CASE`.

### Validation on Startup

The server **must** validate all required environment variables at startup before accepting any requests. Use a Zod schema:

```ts
// server/src/config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  PORT:                              z.string().regex(/^\d+$/).transform(Number),
  NODE_ENV:                          z.enum(['development', 'production', 'test']),
  MONGODB_URI:                       z.string().url(),
  JWT_SECRET:                        z.string().min(32),
  JWT_EXPIRES_IN:                    z.string(),
  CLIENT_URL:                        z.string().url(),
  CLOUDINARY_CLOUD_NAME:             z.string().min(1),
  CLOUDINARY_API_KEY:                z.string().min(1),
  CLOUDINARY_API_SECRET:             z.string().min(1),
  MAX_LISTING_DURATION_MINUTES:      z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 45),
  MIN_LISTING_DURATION_MINUTES:      z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1),
  MAX_FOOD_AGE_AT_PICKUP_MINUTES:    z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1),
  WARNING_MINUTES:                   z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1),
  ADMIN_EMAIL:                       z.string().email(),
  ADMIN_PASSWORD:                    z.string().min(12),
});

export const env = envSchema.parse(process.env);
```

If validation fails, the process must exit immediately with a descriptive error — never start in a broken state.

### Required Variables

| Variable | Where | Description |
|---|---|---|
| `PORT` | server | Port the Express server listens on |
| `NODE_ENV` | server | `development`, `production`, or `test` |
| `MONGODB_URI` | server | Full MongoDB Atlas connection string |
| `JWT_SECRET` | server | Secret key for signing JWTs (min 32 chars) |
| `JWT_EXPIRES_IN` | server | JWT expiry string (e.g., `7d`) |
| `CLIENT_URL` | server | Allowed CORS origin; full URL including protocol |
| `CLOUDINARY_CLOUD_NAME` | server | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | server | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | server | Cloudinary API secret |
| `MAX_LISTING_DURATION_MINUTES` | server | D6: max 180 |
| `MIN_LISTING_DURATION_MINUTES` | server | D6: min 45 |
| `MAX_FOOD_AGE_AT_PICKUP_MINUTES` | server | D6: max 240 |
| `WARNING_MINUTES` | server | D6: 30 |
| `ADMIN_EMAIL` | server | Seed-only: admin account email |
| `ADMIN_PASSWORD` | server | Seed-only: admin account password |
| `NEXT_PUBLIC_API_URL` | client | Backend base URL for client-side fetches |

### Rules

- **Never hardcode an environment variable** anywhere in source code. Even in tests, use `process.env` or a test-specific `.env.test` file.
- **Never commit `.env` files.** The repository must contain only `.env.example` with placeholder values and inline comments.
- **Never log environment variable values** at any log level (the variable name is fine to log; the value is not).
- When adding a new environment variable: (a) add it to `.env.example` with a comment, (b) add it to the Zod `envSchema`, (c) document it in the table above, (d) mention it in the PR description.

---

## 13. What Never To Do

The following are hard NOTs. Doing any of these is grounds for immediate PR rejection and, if already merged, an emergency fix PR.

| # | Never do this |
|---|---|
| N1 | Force-push to `main` |
| N2 | Merge a PR without review (even solo) |
| N3 | Return `passwordHash` from any endpoint |
| N4 | Use `any` in TypeScript source |
| N5 | Hardcode a secret, password, API key, or connection string |
| N6 | Commit a `.env` file |
| N7 | Log a secret, JWT, or password at any log level |
| N8 | Use inline styles (`style={{}}`) — Tailwind only |
| N9 | Add a paid service or exceed any free-tier limit |
| N10 | Add a npm package without justification in the PR |
| N11 | Hard-delete a listing (users); skip AuditLog (admin) |
| N12 | Allow a user to claim their own listing |
| N13 | Skip Zod validation on any `req.body` before the controller runs |
| N14 | Store `WARNING` as a database field — it is derived, not stored |
| N15 | Use `origin: '*'` in CORS configuration |
| N16 | Lower bcrypt rounds below 12 |
| N17 | Store JWT in `localStorage` or a non-httpOnly cookie |
| N18 | Mix a bug fix and an unrelated refactor in the same PR |
| N19 | Write a test that shares mutable state across test cases |
| N20 | Claim that the system supports a scale that has not been load-tested |
| N21 | Start the server without validating all required env vars |
| N22 | Use `lean()` and then call `.save()` on the result |
| N23 | Add animations that ignore prefers-reduced-motion or hurt performance (heavy animation on long lists) |
| N24 | Expose stack traces or internal paths in API error responses |
| N25 | Add Google OAuth or any other out-of-scope MVP feature without a new RFC |
