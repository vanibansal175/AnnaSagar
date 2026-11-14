> NOTE: ARCHITECTURE.md is the source of truth. If this file disagrees with it, ARCHITECTURE.md wins.

# AnnaSagar

AnnaSagar is a community food-sharing web application that connects people who have surplus leftover cooked food with people nearby who can use it. Donors post time-boxed listings; receivers browse, claim, and collect in person — no payments, no delivery, no complexity. The platform is designed for Indian cities and campuses and enforces strict food-safety time windows to keep shared food safe.

---

## Features

- **Donor listings** — post surplus cooked food with photos, servings count, cooked-at time, and a pickup deadline
- **Receiver browsing** — browse available listings with approximate location; full address revealed only after claiming
- **Food-safety guardrails** — configurable time limits (cook-to-pickup, min/max listing duration) enforced server-side
- **Food-safety disclaimer** — acknowledged and timestamped on every claim
- **Real-time status updates** — Socket.io pushes listing status changes to connected clients instantly
- **Automatic expiry** — lazy evaluation, periodic cron sweep, and server-startup catch-up keep statuses accurate
- **Dual-role accounts** — one account can donate and receive; a user can never claim their own listing
- **Admin dashboard** — soft-remove listings with mandatory reason, block users, full audit log
- **Image uploads** — 1–3 photos per listing (jpg/png/webp, max 5 MB each) via Cloudinary
- **WARNING state** — listings approaching their deadline are highlighted for urgency (derived, not stored)
- **No payments, no chat, no GPS** — intentionally simple; in-person pickup only

---

## Tech Stack

| Layer | Technology | Hosting |
|---|---|---|
| Frontend | Next.js 14 · TypeScript · Tailwind CSS · shadcn/ui · Framer Motion | Vercel |
| Backend | Express · TypeScript · Mongoose · Zod · JWT · Socket.io · node-cron | Render |
| Database | MongoDB Atlas M0 (free tier) | MongoDB Atlas |
| Image storage | Cloudinary (free tier, folder: `annasagar`) | Cloudinary |

> **Important:** Vercel hosts the **frontend only**. Render hosts the **backend only**. These boundaries must be maintained.

---

## Prerequisites

- Node.js 20+
- npm 9+ (or pnpm / yarn — adapt commands accordingly)
- A MongoDB Atlas account (free M0 cluster)
- A Cloudinary account (free tier)
- Git

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/<your-org>/annasagar.git
cd annasagar
```

### 2. Install dependencies

```bash
# Install client dependencies
cd client
npm install

# Install server dependencies
cd ../server
npm install
```

### 3. Configure environment variables

The project uses separate `.env` files for the client and server. Copy the example files and fill in your values:

```bash
# Client
cp client/.env.example client/.env.local

# Server
cp server/.env.example server/.env
```

> See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full environment variable table with descriptions, types, and defaults. **Do not commit `.env` files.**

---

## Development Commands

### Client (Next.js — runs on port 3000)

```bash
cd client
npm run dev        # Start development server
npm run build      # Production build
npm run start      # Serve production build locally
npm run lint       # ESLint
```

### Server (Express — runs on port 4000)

```bash
cd server
npm run dev        # Start with ts-node-dev (hot reload)
npm run build      # Compile TypeScript to dist/
npm run start      # Run compiled dist/index.js
npm run seed       # Create first admin account (reads ADMIN_EMAIL + ADMIN_PASSWORD from env)
npm run lint       # ESLint
```

---

## Environment Variables

Environment variable **names** are listed below. For descriptions, types, required/optional status, and example values, see [ARCHITECTURE.md § Environment Variables](./ARCHITECTURE.md#environment-variables).

> Never commit real values. Use `.env.local` for client and `.env` for server, both git-ignored.

### Client (`client/.env.local`)

```
NEXT_PUBLIC_API_URL
NEXT_PUBLIC_SOCKET_URL
```

### Server (`server/.env`)

```
PORT
NODE_ENV
MONGODB_URI
JWT_SECRET
JWT_EXPIRES_IN
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
ADMIN_EMAIL
ADMIN_PASSWORD
MAX_LISTING_DURATION_MINUTES
MIN_LISTING_DURATION_MINUTES
MAX_FOOD_AGE_AT_PICKUP_MINUTES
WARNING_MINUTES
CLIENT_ORIGIN
```

---

## Testing

No tests have been written yet (the project is currently in the planning phase). When tests are added:

```bash
# Client
cd client
npm test

# Server
cd server
npm test
```

The testing strategy (unit, integration, and end-to-end) will be documented in [ARCHITECTURE.md](./ARCHITECTURE.md) when the test suite is set up.

---

## Deployment Overview

| Service | Platform | Notes |
|---|---|---|
| Frontend (Next.js) | **Vercel** | Connect the `client/` directory; set `NEXT_PUBLIC_*` env vars in Vercel dashboard |
| Backend (Express) | **Render** | Connect the `server/` directory; set all server env vars in Render dashboard; free tier sleeps after inactivity |
| Database | **MongoDB Atlas M0** | Free shared cluster; whitelist Render's outbound IPs or allow all (0.0.0.0/0) for free tier |
| Image storage | **Cloudinary** | Free tier; images stored in folder `annasagar`; backend uploads directly via SDK |

**Render cold-start note:** Render's free tier spins down after 15 minutes of inactivity. The first request after a sleep period may take 30–60 seconds. The server runs a startup expiry catch-up pass each time it boots, so no listings are stuck in stale states after a cold start.

Refer to [ARCHITECTURE.md](./ARCHITECTURE.md) for the full deployment topology diagram, environment variable configuration, and step-by-step deployment guide.

---

## Contributing

This project is currently in early planning. If you would like to contribute:

1. Fork the repository and create a feature branch (`git checkout -b feature/my-feature`).
2. Follow the code style enforced by ESLint and the TypeScript strict mode settings.
3. Ensure no environment secrets are committed.
4. Open a pull request with a clear description of the change and why it is needed.
5. All PRs must pass CI checks before review.

For significant changes, please open an issue first to discuss the approach.

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file for details.

> **Note:** The MIT license is a placeholder. The project owner should review and confirm the chosen license before the repository is made public.
