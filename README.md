# Vestigio — Intelligence & Decision Engine for SaaS

Vestigio is a full-stack analytics and audit platform that helps SaaS companies identify revenue leakage, chargeback risks, and conversion friction through automated analysis pipelines and AI-powered recommendations.

## Tech Stack

- **Framework:** Next.js 15 (App Router, React 19)
- **Database:** PostgreSQL + Prisma ORM
- **Auth:** NextAuth v4 (Google, GitHub, email/password, magic link)
- **Payments:** Stripe (primary), Paddle, Lemon Squeezy
- **AI:** MCP server with 21 tools, prompt gate, playbooks
- **UI:** Tailwind CSS, dark mode, i18n (en/de)

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev --name init

# Seed initial data
npm run seed

# Start dev server
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (Turbopack) |
| `npm run build` | Production build (Prisma generate + Next.js) |
| `npm run start` | Start production server |
| `npm run typecheck` | TypeScript type checking |
| `npm run test` | Run test suite |
| `npm run seed` | Seed database with initial data |
| `npm run check-style` | Prettier + ESLint checks |

## Environment Variables

See `.env.example` for the full list. Minimum required for local development:

- `DATABASE_URL` — PostgreSQL connection string
- `SECRET` — NextAuth secret
- `NEXTAUTH_URL` — App URL (http://localhost:3000)
- `STRIPE_SECRET_KEY` — Stripe API key
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing key

## Architecture

```
src/              → Next.js app (pages, API routes, components)
packages/         → Core computation engine (domain, signals, inference, impact)
apps/             → Platform services (MCP server, persistence, store enforcement)
workers/          → Ingestion + verification pipelines
prisma/           → Database schema + seed
tests/            → Integration test suites
```

## License

Proprietary. All rights reserved.
