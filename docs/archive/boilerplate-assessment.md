# Boilerplate Assessment for Vestigio Control Plane

> **2026-04-02 Status Update:** Many critical gaps identified in this assessment have been addressed. See inline status annotations marked with `[RESOLVED]` or `[UPDATED]` throughout the document.

## 1. Executive summary

This repository is usable as a **control plane starting point**, but **not as-is** for a serious multi-tenant control plane. My recommendation is:

**Reuse as control plane: YES WITH CAVEATS**

Why:

- It already provides a working SaaS shell on top of **Next.js App Router + Prisma + NextAuth**, with account pages, admin pages, billing flows, auth screens, session propagation, and a reasonable dashboard/layout foundation.
- It is clearly **not** the product brain. The current repo has no execution-plane architecture, no durable job system, no real tenant/workspace model, no domain engine, and no worker orchestration.
- The main constraint is that the current app is modeled around **single-user accounts plus a coarse `ADMIN` / `USER` role split**, not around organizations, workspaces, or tenant boundaries.

High-confidence reuse candidates:

- auth foundation
- billing skeleton
- account/profile flows
- dashboard shell and settings shell
- basic admin shell
- basic file upload support

High-risk areas if reused without strong boundaries:

- tenancy and RBAC
- plan enforcement
- API key model
- coupling billing data directly onto `User`
- treating admin/user dashboards as actual tenant isolation
- mixing engine logic into this Next.js app

Bottom line:

- This boilerplate can be a **good outer shell** for Vestigio's control plane.
- It should **not** become the execution plane, evidence system, decision engine, MCP brain, or worker host.
- Its current data model and auth model are too shallow for Vestigio without deliberate isolation and extension.

Confidence level: **medium-high** for the control-plane recommendation, **high** that it should not host the engine.

## 2. Stack overview

### Core stack

- **Framework:** Next.js `^15.2.4` ([`package.json`](../package.json))
- **Language:** TypeScript ([`package.json`](../package.json), [`tsconfig.json`](../tsconfig.json))
- **Repo shape:** single app repo, not a monorepo
- **Routing model:** **App Router**, via `src/app/*`
- **React version:** `19.0.0`

### Server/API model

- Primary server interface is **Next.js Route Handlers** under [`src/app/api`](../src/app/api)
- Some **Server Actions** exist in [`src/actions`](../src/actions), e.g.:
  - [`src/actions/user.ts`](../src/actions/user.ts)
  - [`src/actions/upload.ts`](../src/actions/upload.ts)
  - [`src/actions/api-key.ts`](../src/actions/api-key.ts)
- No tRPC found
- No dedicated REST client/server layering beyond route handlers plus direct Prisma calls

### Database and ORM

- **Database:** PostgreSQL via Prisma datasource in [`prisma/schema.prisma`](../prisma/schema.prisma)
- **ORM:** Prisma (`@prisma/client`, `prisma`)
- **Prisma client bootstrap:** [`src/libs/prismaDb.ts`](../src/libs/prismaDb.ts)
- **Migrations:** no Prisma migrations directory exists; only [`prisma/schema.prisma`](../prisma/schema.prisma) is present

### Auth

- **Auth provider/framework:** NextAuth v4 with Prisma adapter
- Defined in [`src/libs/auth.ts`](../src/libs/auth.ts)
- Providers configured:
  - Credentials
  - Email magic link
  - GitHub
  - Google
- Session strategy is **JWT**
- Auth route: [`src/app/api/auth/[...nextauth]/route.ts`](../src/app/api/auth/%5B...nextauth%5D/route.ts)
- Middleware gate: [`src/middleware.ts`](../src/middleware.ts)

### Billing

- Billing provider support exists for:
  - **Stripe**: [`src/app/api/stripe/*`](../src/app/api/stripe), [`src/stripe`](../src/stripe)
  - **Paddle**: [`src/app/api/paddle/*`](../src/app/api/paddle), [`src/paddle`](../src/paddle)
  - **Lemon Squeezy**: [`src/app/api/lemon-squeezy/*`](../src/app/api/lemon-squeezy), [`src/lemonSqueezy`](../src/lemonSqueezy)
- Actual UI selection is manual via commented import in [`src/components/User/Billing/index.tsx`](../src/components/User/Billing/index.tsx)
- This means billing is **template-style optional integration**, not a unified abstraction

### UI stack

- Tailwind CSS ([`tailwind.config.ts`](../tailwind.config.ts))
- `styled-components` is installed but not central in the inspected code
- `next-themes` for theme switching
- `next-intl` for i18n support
- Custom component-driven dashboard shell in [`src/components/Common/Dashboard`](../src/components/Common/Dashboard)

### State management

- Mostly local React state + context
- `SessionProvider` from NextAuth in [`src/app/(site)/providers.tsx`](../src/app/%28site%29/providers.tsx)
- Contexts:
  - [`src/app/context/AuthContext.tsx`](../src/app/context/AuthContext.tsx)
  - [`src/app/context/ToastContext.tsx`](../src/app/context/ToastContext.tsx)
- No Redux, Zustand, Jotai, or equivalent global client state system found

### Background jobs / queue / workflow engine

- No queue system found
- No job runner found
- No worker framework found
- No Inngest, BullMQ, Temporal, Trigger.dev, Upstash Queue, SQS consumer, or similar found

### Realtime

- No WebSocket support found
- No SSE/EventSource support found

### Storage

- Cloudflare R2-compatible object storage support via S3 SDK:
  - [`src/actions/upload.ts`](../src/actions/upload.ts)
  - env vars in [`.env.example`](../.env.example)
- Current use appears limited to profile image upload

### Other integrated services

- **Sanity** embedded studio:
  - [`sanity.config.ts`](../sanity.config.ts)
  - [`src/app/(studio)/studio/[[...index]]/page.tsx`](../src/app/%28studio%29/studio/%5B%5B...index%5D%5D/page.tsx)
- **Algolia** search:
  - [`src/components/GlobalSearch`](../src/components/GlobalSearch)
  - [`src/libs/crawlIndex.ts`](../src/libs/crawlIndex.ts)
- **Mailchimp** newsletter:
  - [`src/app/api/newsletter/route.tsx`](../src/app/api/newsletter/route.tsx)
- **OpenAI** demo content generation:
  - [`src/app/api/generate-content/route.ts`](../src/app/api/generate-content/route.ts)
  - [`src/components/Admin/AiIntegration/index.tsx`](../src/components/Admin/AiIntegration/index.tsx)

## 3. Repository structure

### Top-level structure

- `src/app`: route tree and layouts
- `src/components`: UI components
- `src/actions`: server actions
- `src/libs`: helper libs and adapters
- `prisma`: Prisma schema
- `src/stripe`, `src/paddle`, `src/lemonSqueezy`: billing-provider-specific UI/helpers
- `src/sanity`: CMS schemas and config
- `src/pricing`: pricing config
- `src/staticData`: sidebar/demo dashboard/static content data

### App segments

- Public/site shell: [`src/app/(site)`](../src/app/%28site%29)
- Sanity Studio shell: [`src/app/(studio)`](../src/app/%28studio%29)

This is a **single Next.js app with route groups**, not separate deployable apps.

### Where auth lives

- Auth configuration: [`src/libs/auth.ts`](../src/libs/auth.ts)
- NextAuth route: [`src/app/api/auth/[...nextauth]/route.ts`](../src/app/api/auth/%5B...nextauth%5D/route.ts)
- Middleware authorization: [`src/middleware.ts`](../src/middleware.ts)
- Auth UI:
  - [`src/components/Auth`](../src/components/Auth)
  - auth pages under [`src/app/(site)/auth`](../src/app/%28site%29/auth)

### Where billing lives

- Billing page: [`src/app/(site)/user/billing/page.tsx`](../src/app/%28site%29/user/billing/page.tsx)
- Billing UI switch: [`src/components/User/Billing/index.tsx`](../src/components/User/Billing/index.tsx)
- Provider-specific implementations:
  - Stripe: [`src/stripe`](../src/stripe), [`src/app/api/stripe`](../src/app/api/stripe)
  - Paddle: [`src/paddle`](../src/paddle), [`src/app/api/paddle`](../src/app/api/paddle)
  - Lemon Squeezy: [`src/lemonSqueezy`](../src/lemonSqueezy), [`src/app/api/lemon-squeezy`](../src/app/api/lemon-squeezy)

### Where multitenancy would be expected

There is **no dedicated multitenancy module**.

Closest related pieces:

- user role on [`prisma/schema.prisma`](../prisma/schema.prisma)
- invitation flow:
  - [`src/app/api/user/invite/send/route.ts`](../src/app/api/user/invite/send/route.ts)
  - [`src/app/api/user/invite/signin/route.ts`](../src/app/api/user/invite/signin/route.ts)
- manage users page:
  - [`src/app/(site)/admin/manage-users/page.tsx`](../src/app/%28site%29/admin/manage-users/page.tsx)
  - [`src/components/Admin/Users`](../src/components/Admin/Users)

This is **user administration**, not tenant/workspace management.

### Where dashboard shell lives

- Admin layout: [`src/app/(site)/admin/layout.tsx`](../src/app/%28site%29/admin/layout.tsx)
- User layout: [`src/app/(site)/user/layout.tsx`](../src/app/%28site%29/user/layout.tsx)
- Dashboard shell components: [`src/components/Common/Dashboard`](../src/components/Common/Dashboard)
- Sidebar config: [`src/staticData/sidebarData.tsx`](../src/staticData/sidebarData.tsx)

### Sensitive configuration locations

- [`.env.example`](../.env.example)
- auth/billing provider keys referenced in:
  - [`src/libs/auth.ts`](../src/libs/auth.ts)
  - [`src/app/api/stripe/*`](../src/app/api/stripe)
  - [`src/app/api/paddle/*`](../src/app/api/paddle)
  - [`src/app/api/lemon-squeezy/*`](../src/app/api/lemon-squeezy)
  - [`src/actions/upload.ts`](../src/actions/upload.ts)
  - [`sanity.config.ts`](../sanity.config.ts)

### Providers / infra adapters

- Prisma DB adapter: [`src/libs/prismaDb.ts`](../src/libs/prismaDb.ts)
- NextAuth adapter usage: [`src/libs/auth.ts`](../src/libs/auth.ts)
- Email adapter: [`src/libs/email.ts`](../src/libs/email.ts)
- Stripe client: [`src/stripe/stripe.ts`](../src/stripe/stripe.ts)
- Lemon Squeezy client: [`src/lemonSqueezy/ls.ts`](../src/lemonSqueezy/ls.ts)
- R2/S3 upload signing: [`src/actions/upload.ts`](../src/actions/upload.ts)

## 4. Auth / tenancy analysis

### Real auth provider

Auth is implemented with **NextAuth** and **PrismaAdapter** in [`src/libs/auth.ts`](../src/libs/auth.ts).

Configured providers:

- Credentials login
- Email magic link
- GitHub OAuth
- Google OAuth

This is a conventional and reusable auth foundation for a control plane.

### Session propagation

- Session strategy is `jwt` in [`src/libs/auth.ts`](../src/libs/auth.ts)
- Session is available client-side through `SessionProvider` in [`src/app/(site)/providers.tsx`](../src/app/%28site%29/providers.tsx)
- Server-side access uses `getServerSession(authOptions)` through:
  - [`src/libs/isAuthorized.ts`](../src/libs/isAuthorized.ts)
  - [`src/libs/auth.ts`](../src/libs/auth.ts)
- JWT callback injects:
  - `uid`
  - `priceId`
  - `currentPeriodEnd`
  - `subscriptionId`
  - `role`

This means auth/session state is somewhat coupled to billing state.

### How tenants/orgs are modeled

They are **not modeled**.

The Prisma schema contains:

- `User`
- `Session`
- `Account`
- `Invitation`
- `ApiKey`
- `VerificationToken`

There is **no**:

- `Organization`
- `Workspace`
- `Tenant`
- `Membership`
- `Project`
- tenant-scoped join table

So the current model is effectively:

- one user account
- optional invitation
- coarse role
- subscription fields directly on the user

For Vestigio, this is the single biggest structural limitation.

### RBAC

RBAC is minimal:

- `User.role` is a string with default `"USER"` in [`prisma/schema.prisma`](../prisma/schema.prisma)
- Code assumes only `"ADMIN"` or `"USER"`:
  - [`src/middleware.ts`](../src/middleware.ts)
  - [`src/app/api/user/register/route.ts`](../src/app/api/user/register/route.ts)
  - [`src/app/api/user/invite/send/schema.ts`](../src/app/api/user/invite/send/schema.ts)

This is **role gating**, not robust RBAC.

### Workspaces / teams

Not present.

The invite flow is account-centric, not workspace-centric:

- admin invites a user with a role
- invited user is created as a standalone `User`

No membership model ties that user to an org or workspace.

### Coupling level

Auth is moderately coupled to the rest of the app:

- session JWT carries billing fields
- route protection assumes admin/user dashboard split
- middleware redirects based on role to `/admin` or `/user`
- UI menus depend directly on `user.role`

Examples:

- [`src/middleware.ts`](../src/middleware.ts)
- [`src/components/Common/AccountMenu.tsx`](../src/components/Common/AccountMenu.tsx)
- [`src/components/Common/Dashboard/Header/index.tsx`](../src/components/Common/Dashboard/Header/index.tsx)

Assessment:

- **Auth foundation itself is reusable**
- **Current tenancy model is insufficient**
- **Current role/dashboard split would need to remain a shell concern, not a domain boundary**

## 5. Billing analysis

### Provider

The repo ships with three payment options:

- Stripe
- Paddle
- Lemon Squeezy

But it does **not** provide a clean provider abstraction. Instead, the UI chooses one implementation manually in [`src/components/User/Billing/index.tsx`](../src/components/User/Billing/index.tsx).

### Subscription model

Billing state is stored directly on `User`:

- `customerId`
- `subscriptionId`
- `priceId`
- `currentPeriodEnd`

Defined in [`prisma/schema.prisma`](../prisma/schema.prisma).

This is workable for a simple SaaS starter, but it is weak for Vestigio because:

- subscription data belongs more naturally to an account/workspace/org boundary than to an individual person
- future seat-based or org-level billing would be awkward
- metering and entitlements have nowhere to live yet

### Checkout flow

#### Stripe

- Checkout session created in [`src/app/api/stripe/payment/route.ts`](../src/app/api/stripe/payment/route.ts)
- Billing portal session created when already subscribed
- Success/cancel URLs point to `/user` or `/user/billing`

#### Paddle

- Subscription changes handled in [`src/app/api/paddle/change-plan/route.ts`](../src/app/api/paddle/change-plan/route.ts)
- Cancel flow in [`src/app/api/paddle/cancel-subscription/route.ts`](../src/app/api/paddle/cancel-subscription/route.ts)

#### Lemon Squeezy

- Checkout generation in [`src/app/api/lemon-squeezy/payment/route.ts`](../src/app/api/lemon-squeezy/payment/route.ts)
- Cancel flow in [`src/app/api/lemon-squeezy/cancel-subscription/route.ts`](../src/app/api/lemon-squeezy/cancel-subscription/route.ts)

### Customer portal

- **Stripe:** yes, via billing portal in [`src/app/api/stripe/payment/route.ts`](../src/app/api/stripe/payment/route.ts)
- **Paddle / Lemon Squeezy:** no equivalent first-class customer portal flow found in the inspected code

### Webhooks

- Stripe webhook: [`src/app/api/stripe/webhook/route.ts`](../src/app/api/stripe/webhook/route.ts)
- Paddle webhook: [`src/app/api/paddle/webhook/route.ts`](../src/app/api/paddle/webhook/route.ts)
- Lemon Squeezy webhook: [`src/app/api/lemon-squeezy/webhook/route.ts`](../src/app/api/lemon-squeezy/webhook/route.ts)

All three update user subscription fields directly.

### Feature flags / plan enforcement

Very limited.

What exists:

- UI can check whether `session.user.priceId` matches a plan
- pricing plans are statically defined in [`src/pricing/pricingData.ts`](../src/pricing/pricingData.ts)

What does not exist:

- entitlement service
- feature gates by capability
- limits/quotas model
- metered usage tracking
- seat counting
- org-scoped billing enforcement

### Metered billing

No metered billing found.

### Reusability for Vestigio

Assessment:

- **Useful as a starting skeleton:** yes
- **Production-ready billing model for Vestigio:** no

Best reusable parts:

- checkout shell
- subscription status plumbing
- Stripe portal pattern
- billing page shell

Parts that should not be treated as final architecture:

- storing plan state on `User`
- pricing IDs hardcoded in [`src/pricing/pricingData.ts`](../src/pricing/pricingData.ts)
- manual provider toggling by commented import
- lack of entitlement model

## 6. Extensibility analysis

### Data / persistence model

#### Current database model

Current schema is intentionally small and easy to understand. That is good for extension, but it also means Vestigio-specific primitives do not exist yet.

Adding new entities such as:

- `websites`
- `audit_cycles`
- `findings`
- `decisions`
- `workspaces`
- `integrations`

is technically straightforward because Prisma is already in place.

However, there are real caveats:

- there is no tenant root aggregate yet
- there is no workspace membership table yet
- there is no job/execution tracking base
- there is no event or audit log base
- there are no migrations checked into the repo

So adding entities is easy at the schema level, but **harder at the architectural level** because control-plane boundaries are not modeled yet.

#### Data access pattern

Data access is direct and simple:

- route handlers call Prisma directly
- server actions call Prisma directly
- very little repository/service abstraction exists

Examples:

- [`src/app/api/user/register/route.ts`](../src/app/api/user/register/route.ts)
- [`src/actions/user.ts`](../src/actions/user.ts)
- [`src/app/api/stripe/webhook/route.ts`](../src/app/api/stripe/webhook/route.ts)

This simplicity helps speed, but it also means domain boundaries are not strongly enforced.

### Suitability by control-plane concern

#### Auth

**Good fit with caveats**

- NextAuth + Prisma is usable
- social login + magic link + credentials already exist
- needs stronger authorization modeling for org/workspace roles

#### Orgs / tenants

**Poor fit currently**

- no org/workspace model
- current structure is account-centric and role-centric

#### Billing

**Moderate fit**

- subscription workflows exist
- Stripe path is the cleanest
- needs org-scoped billing and entitlements for Vestigio

#### Dashboard shell

**Good fit**

- layouts, sidebar, header, settings pages, and shell components already exist
- this is one of the repo's strongest reusable areas

#### Onboarding wizard

**Reasonable fit**

- easy to build inside existing App Router structure
- nothing domain-specific blocks it
- but no current onboarding state model exists

#### Settings

**Good fit**

- user settings shell already exists
- admin section already exists

#### Chat UI shell

**Reasonable fit as UI shell only**

- frontend shell can host chat pages/components
- there is no streaming, SSE, or conversational backend architecture present

#### Incident / opportunity UI shell

**Reasonable fit as surface only**

- UI shell and dashboard cards/tables are present
- underlying workflow/state engine is absent

### Additional notes on extensibility

- The repo includes several demo-ish integrations such as OpenAI content generation, Sanity blog, Mailchimp, and Algolia. These are useful examples but are not core control-plane capabilities.
- Some admin dashboard content is static/demo data, e.g. [`src/staticData/statsData.tsx`](../src/staticData/statsData.tsx), so the visual shell should not be mistaken for an operational admin backend.

## 7. Risks and limitations

### 1. No true multitenancy

~~This is the largest risk.~~

**[RESOLVED 2026-04-02]** Organization, Membership, and Environment models now exist in Prisma. Organization-centric multi-tenancy with owner/admin/member roles. Billing tied to Organization (plan field). Auth middleware includes `hasOrganization` check.

~~If Vestigio needs workspace-first control plane behavior, this repo does not provide it yet.~~

### 2. Role split is too coarse

Current assumptions:

- `/admin` for admins
- `/user` for users

That is a product-template convention, not a durable control-plane architecture.

Relevant files:

- [`src/middleware.ts`](../src/middleware.ts)
- [`src/app/(site)/admin/layout.tsx`](../src/app/%28site%29/admin/layout.tsx)
- [`src/app/(site)/user/layout.tsx`](../src/app/%28site%29/user/layout.tsx)

### 3. Billing is coupled to user identity

~~Subscription state is stored directly on `User`.~~

**[RESOLVED 2026-04-02]** Billing is now Paddle-primary with plan state on Organization model (not User). Admin-configurable pricing via `/app/admin/pricing` with Paddle Price IDs. Stripe maintained as fallback. `PlatformConfig` stores plan limits. Onboarding creates checkout tied to Organization.

### 4. No queue / worker support

**[UPDATED 2026-04-02]** Redis-backed job queue now exists (`apps/platform/redis-job-queue.ts`). Rate limiting uses Redis sorted sets with in-memory fallback. However, full workflow orchestration, retries, and scheduling are still absent.

~~That makes the repo unsuitable for hosting the audit/execution plane or heavy engine operations.~~
Heavy engine operations now run in-process but with Redis backing for job queuing.

### 5. No clear separation between control plane and domain engine

The current app is a single Next.js app with direct Prisma access from routes and actions. If Vestigio engine logic gets added casually here, coupling will happen quickly.

### 6. Weak feature enforcement

**[UPDATED 2026-04-02]** Plan enforcement improved. `PlatformConfig` stores per-plan limits (MCP calls/mo, environments, members, credits, continuous audits). Store enforcement (`apps/platform/store-enforcement.ts`) validates limits. Rate limiter is plan-aware (3/10/30 req/min for vestigio/pro/max). Daily query budgets enforced. Ultra model gated to Pro+ plans.

### 7. Some integrations are template/demo flavored

Examples:

- static pricing IDs in [`src/pricing/pricingData.ts`](../src/pricing/pricingData.ts)
- static admin metrics in [`src/staticData/statsData.tsx`](../src/staticData/statsData.tsx)
- OpenAI demo route pinned to `gpt-3.5-turbo` in [`src/app/api/generate-content/route.ts`](../src/app/api/generate-content/route.ts)

This does not make the repo bad, but it means parts of it are starter-material, not mature platform modules.

### 8. API key implementation is not suitable for a real control plane

The API key design is especially weak:

- keys are derived from role strings in [`src/actions/api-key.ts`](../src/actions/api-key.ts)
- validation compares the provided key against `"ADMIN"` or `"USER"` in [`src/libs/isValidAPIKey.ts`](../src/libs/isValidAPIKey.ts)

This is not a reusable foundation for machine-to-machine auth in Vestigio.

### 9. Rate limiting is in-memory

**[RESOLVED 2026-04-02]** Rate limiting now uses Redis sorted sets (`apps/mcp/llm/rate-limiter.ts`) with automatic fallback to in-memory when Redis is unavailable. `src/libs/limiter.ts` still exists for non-chat endpoints but the critical chat path is Redis-backed and horizontally safe.

### 10. No committed migration history

Only [`prisma/schema.prisma`](../prisma/schema.prisma) exists. Lack of migration history increases onboarding and evolution risk.

## 8. Recommended boundary with Vestigio

### What the boilerplate SHOULD own

The boilerplate is appropriate to own:

- auth UX and session handling
- user identity
- org/workspace shell once modeled properly
- billing UX
- subscription/account administration
- dashboard layout and navigation shell
- settings pages
- basic notifications UI shell
- basic admin UI shell
- onboarding flow and account provisioning UI
- profile/media upload for control-plane assets

In Vestigio terms, this means the boilerplate can become the **control-plane web shell**.

### What the boilerplate SHOULD NOT own

It should not own:

- audit execution
- crawl/extraction execution
- evidence graph / evidence layer
- decision logic
- policy evaluation brain
- MCP orchestration brain
- browser verification
- durable workflow execution
- heavy async workers
- deep runtime integration logic with external systems

Those belong outside this Next.js app.

### Recommended principle

Treat this app as:

- the place where humans authenticate, configure, review, pay, and manage

Do not treat it as:

- the place where Vestigio thinks, executes, validates, or scales background compute

## 9. Suggested repo/app/package shape

The current repo is a single app, so the least artificial future shape is:

### Near-term shape

- keep this repository as the **control-plane app**
- keep the current Next.js app as the main web entrypoint
- connect it to external engine services through explicit APIs/events rather than internal imports

### If the repo evolves toward a monorepo later

A natural shape would be:

- `apps/web`: this current Next.js control plane
- `apps/mcp` or `services/mcp`: MCP-facing service
- `services/engine`: decision/audit orchestration service
- `workers/*`: isolated execution workers
- `packages/contracts`: shared schemas/events/types
- `packages/auth` or `packages/identity`: shared auth/session helpers if needed
- `packages/ui`: extracted shared design system only if justified later

### Important constraint

Do not force an early monorepo split just because Vestigio will have multiple planes.

Based on the current repo, the immediate architectural win is not "more packages"; it is:

- keeping the Next.js app restricted to control-plane responsibilities
- introducing a hard API boundary toward engine/worker systems
- avoiding direct imports of engine code into the web app

### Practical integration shape grounded in this repo

If this repo remains single-app for now, a realistic shape is:

- `src/app/(site)` remains the human-facing control plane
- `src/app/api/*` remains only for control-plane APIs and thin integration endpoints
- engine-facing communication happens through dedicated API clients/adapters in `src/libs` or a future `src/services`
- worker/execution systems stay out of `src/app`

That matches the current repo's shape better than trying to bend it into a fake internal engine platform.

## 10. Final verdict

### Reuse as control plane

**YES WITH CAVEATS**

### Why

- The repo already solves a meaningful portion of control-plane concerns: auth UI, sessions, account management, billing skeleton, dashboard shell, settings shell, and admin shell.
- It does not contain the core engine concerns, which is good.
- Its biggest weakness is that it is not actually multi-tenant yet and currently thinks in terms of `USER` vs `ADMIN`, not `workspace` / `organization` / `membership`.

### What to keep

- Next.js App Router shell
- NextAuth foundation
- Prisma foundation
- auth pages and session handling
- billing page patterns, especially Stripe portal flow
- dashboard layouts, sidebars, headers, account/settings pages
- basic media upload infrastructure

### What to isolate

- any future engine calls
- audit lifecycle orchestration
- evidence processing
- decision logic
- MCP logic
- async execution and retries
- machine-to-machine trust boundary

### What to avoid

- putting engine code directly into `src/app/api`
- using `User.role` + `/admin`/`/user` split as the long-term tenancy model
- keeping subscription ownership on user identity if billing is workspace-centric
- reusing the current API key approach
- assuming static template data represents mature backend capability

### Confidence

**Recommendation confidence: medium-high**

Rationale:

- The repository is clear enough to assess its current responsibilities.
- The main missing piece is not ambiguity, but absence: there is simply no real multitenancy or worker plane yet.
- That makes the control-plane recommendation fairly solid, while the exact future boundary details still depend on Vestigio product choices.

## What I still need to inspect manually

- Whether Vestigio billing should be workspace-based, seat-based, usage-based, or hybrid
- Whether "admin" in Vestigio means platform operator, workspace owner, or both
- Whether the control plane needs hard regional/data residency separation from the engine
- Whether Sanity, Mailchimp, Algolia, and the current blog/marketing surface should stay in the same deployment as the control plane
- Whether human users and machine actors need separate identity domains and credential systems
