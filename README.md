# Vestigio -- Decision Intelligence for Revenue, Trust, and Readiness

Vestigio is a full-stack intelligence platform that helps digital businesses answer business-critical questions about their websites, funnels, and product experiences.

Instead of delivering long technical checklists, Vestigio turns collected evidence into:

- prioritized actions
- contextual workspaces
- explainable findings
- conversational answers
- causal maps

The product is designed to help teams understand where they are losing revenue, increasing risk, weakening trust, or blocking growth.

## Product Surfaces

- **Actions** -- the primary operating surface: prioritized incidents, opportunities, and verification tasks with impact, urgency, and next steps
- **Workspaces** -- persistent views for questions like scale readiness, revenue integrity, and chargeback resilience
- **Chat** -- a conversational interface for asking business questions such as "where am I losing money?" or "what changed since last cycle?"
- **Analysis / Findings** -- the global exploration layer for findings, quantified impact, verification maturity, and change tracking
- **Analysis / Inventory** -- normalized surfaces across the monitored environment, including page health, findings count, sessions, and discovery sources
- **Maps** -- causal visualizations that connect root causes, findings, and recommended actions
- **Data Sources** -- configuration surface for audit depth, authenticated SaaS access, pixel enrichment, and future integrations

## Platform Capabilities

- **Decision Engine** -- business-question-driven decisions (scale readiness, revenue integrity, chargeback resilience, SaaS growth) with risk scoring, confidence gating, and suppression governance
- **Evidence Pipeline** -- multi-method collection (HTTP fetch, HTML parsing, crawl discovery, indicator extraction, Playwright browser verification, authenticated SaaS journeys) with PostgreSQL persistence
- **Findings, Change, and Verification** -- 47 findings across 4 packs with verification maturity, change detection, and evidence quality scoring
- **AI Chat** -- Claude LLM integration (Sonnet/Opus) with 21 MCP tools, 30 expert playbooks, 4-layer security pipeline, and SSE streaming
- **Multi-tenancy** -- organization-centric model with memberships (owner/admin/member), environments, business profiles, and plan-gated limits
- **Billing** -- Paddle-primary with admin-configurable plans, Stripe as fallback

## Tech Stack

- **Framework:** Next.js 15 (App Router, React 19)
- **Database:** PostgreSQL + Prisma ORM
- **Auth:** NextAuth v4 (Google, GitHub, email/password, magic link)
- **Payments:** Paddle (primary), Stripe (fallback)
- **AI:** Claude API (Sonnet 4.6 / Opus 4.6) with MCP server (21 tools), 30 playbooks
- **Queue:** Redis (job queue, rate limiting) with in-memory fallback
- **UI:** Tailwind CSS, dark mode, i18n (en/pt-BR/es/de)
- **Browser Automation:** Playwright (optional, for verification)

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local

# Generate Prisma client
npx prisma generate

# Apply database schema (greenfield — no migrations)
npx prisma db push

# Seed initial data (demo account + platform config)
npm run seed

# Start dev server
npm run dev
```

See [docs/DEPLOY.md](docs/DEPLOY.md) for full Railway deployment guide.

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

See `.env.example` for the full list. Minimum required:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SECRET` | NextAuth secret |
| `NEXTAUTH_URL` | App URL (http://localhost:3000) |
| `ANTHROPIC_API_KEY` | Claude API key (for AI chat) |
| `VESTIGIO_LLM_ENABLED` | `true` to enable AI chat |
| `PADDLE_API_KEY` | Paddle API key (for billing) |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | Paddle client token |

Optional: `REDIS_URL` (distributed rate limiting/queue), `STRIPE_SECRET_KEY` (fallback billing), OAuth credentials (Google/GitHub), SMTP credentials (email).

## Architecture

```
src/              → Next.js app (console UI, API routes, components)
  src/app/(console)/  → Main product console (analysis, actions, chat, workspaces, maps, settings)
  src/app/api/        → API routes (onboard, chat, analysis, admin, billing webhooks)
packages/         → Core computation engine
  packages/domain/    → Domain model (workspace, evidence, decisions)
  packages/signals/   → Signal extraction from evidence
  packages/inference/ → Inference rules (composite interpretation)
  packages/decisions/ → Decision synthesis per business question
  packages/projections/ → Read models for UI (findings, actions, workspaces, change reports)
  packages/evidence/  → Evidence store (in-memory + Prisma persistence)
  packages/impact/    → Financial impact estimation (heuristic baselines)
  packages/graph/     → Evidence graph (structural + behavioral + trust overlays)
  packages/change-detection/ → Cycle-to-cycle regression/improvement detection
  packages/verification-lifecycle/ → Verification maturity tracking
apps/             → Platform services
  apps/mcp/           → MCP server (21 tools, context builder, LLM pipeline)
  apps/mcp/llm/       → Claude integration (pipeline, guards, system prompt, rate limiter)
  apps/platform/      → Persistence, billing, store enforcement, job queue
workers/          → Ingestion + verification pipelines
  workers/ingestion/  → HTTP fetch, HTML parse, crawl discovery, staged pipeline
  workers/verification/ → Playwright browser verification, authenticated SaaS journeys
prisma/           → Database schema + seed
tests/            → Integration test suites (185+ tests)
docs/             → Architecture and assessment documentation
```

## License

Proprietary. All rights reserved.
