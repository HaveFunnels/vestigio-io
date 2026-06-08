# ROADMAP.md — Vestigio.io

Tracks open work derived from the 2026-05-14 wiring audit (see audit summary
at the bottom). Each item references the audit finding number and links to
the exact file/line of the broken seam. Items are checked off as they ship
and the corresponding `DEV_PROGRESS.md` entry lands.

Legend: `[ ]` pending · `[~]` in progress · `[x]` shipped

---

## Tier 1 — Ship today

Silently broken, real money or trust on the line. Most are same-class bugs
(field-name mismatch, missing schema field) — fixable as a small sweep.

- [x] **#1 Admin Users page — list empty, invite 400s, role-change is a lie** — ✅ shipped
  Field-name mismatch between UI and API (`role` ↔ `adminRole`) plus a GET
  response key mismatch (`admins[]` vs `users[]`). Optimistic state updates
  hid the silent failure. UI now reads `data.admins` / `data.totalUsers`,
  sends `adminRole`, and reverts optimistic state on PATCH failure. Also
  emits `user.invite` / `user.role_change` / `user.delete` audit events
  (partial fix for #18).

- [x] **#2 Admin Feedback "set status" silently no-ops** — ✅ shipped
  UI now sends `{id, status}` matching the API contract.

- [x] **#3 Admin Support Tickets — status/priority/category + "Mark as Spam"** — ✅ shipped
  Same `ticketId` → `id` rename.

- [x] **#5 Annual billing toggle bills monthly** — ✅ shipped (partial — toggle hidden)
  Annual toggle hidden via a new `annualPricingEnabled` prop on
  `PricingComponent` (defaults to `false`). Users no longer see a discount
  they can't get. Full annual SKU support tracked separately under Tier 3
  follow-up: add `paddleAnnualPriceId` to the plan config, sync via paddle-
  sync, pick the right priceId in `handlePlanSelect` based on cycle, then
  flip `annualPricingEnabled={true}` on the billing + home pricing pages.

- [x] **#6 Cancel-flow "Downgrade to Starter" doesn't downgrade** — ✅ shipped
  `accept-offer` with `offerType: "downgrade"` now: resolves the downgrade
  target (max → pro, pro → vestigio), calls Paddle to swap the
  subscription's price, and updates `org.plan` + `User.priceId` so feature
  gates flip without waiting for the webhook. Paddle failures propagate as
  500 instead of silently writing `acceptedSave: true`.

- [x] **#11 Admin "granular roles" are theater** — ✅ shipped
  Collapsed `support / marketing / viewer / billing` into a single `admin`
  tier so the UI matches what's actually enforced. `super_admin` remains
  as a distinct tier (it's the only one the API actually gates on).
  Legacy DB rows with the old role values render as "Admin" via the
  RoleBadge fallback.

---

## Tier 2 — This week

- [x] **#4 Admin Pricing "Features per Plan" edits never persist** — ✅ shipped
  Added `planFeatureSchema` + `features` field to the Zod schema in
  `/api/admin/pricing` so edits round-trip instead of being stripped.

- [x] **#7 Action drawer Fix / Track / Dismiss CTA does nothing** — ✅ shipped
  Removed the bottom resolve button entirely (along with `resolveConfig`).
  It rendered with an empty onClick. The verification CTA already lives
  in its own card and Discuss in Chat remains. If/when fix/track/dismiss
  pipelines actually exist, wire them back in.

- [x] **#8 Onboarding "Industry vertical" persists** — ✅ shipped
  Added `targetIndustry` to the activate-route + onboard-route Zod schemas
  and the persistence path. The onboarding form already sent the value;
  it just got stripped on the server.

- [x] **#9 Onboarding "I own this domain" checkbox persists** — ✅ shipped
  Added `BusinessProfile.ownershipConfirmedAt` column + migration
  `20260515120000_business_profile_ownership_timestamp`. Both onboarding
  flows now send `ownershipConfirmed` and the activate/onboard routes
  stamp the timestamp.

- [x] **#10 Inventory "Use as context" attaches selected surfaces** — ✅ shipped
  `CopilotContextItem.kind` now includes `"surface"`. The copilot
  `open()` accepts a `surfaces: {id, title}[]` array (stacks with
  finding/action attachments). The chat API + system-prompt builder
  whitelist `surface` and render it as `- surface URL: <url>` so the
  model sees the actual URLs the user picked instead of just a count.

- [x] **#12 `/app/admin/environments` "Trigger Audit" wired** — ✅ shipped
  Now POSTs to `/api/admin/trigger-audit` with the env's
  `organizationId` (added to the GET response). Refreshes the table on
  success; surfaces 409 (already running) explicitly. Loading state
  on the per-row button.

- [x] **#16 Chat ActionCard → actions page deep-link** — ✅ shipped
  Actions page reads both `?action=<id>` (chat cards + drawer
  linked-actions list) and `?selected=<key>` (dashboard KPI tile).
  Both consumed params are stripped from the URL afterwards.

---

## Tier 3 — Backlog

- [x] **#13 Stripe `priceId` edits — confirm warning when changing** — ✅ shipped
  Admin pricing save now compares loaded `priceId` per plan against the
  edited value and forces a confirm dialog when any differ. The dialog
  is explicit about the semantics: PlatformConfig is updated but live
  Stripe subscriptions keep being billed at the old price until
  migrated in the Stripe dashboard. Stops the silent "old subscribers
  keep paying old price forever, no warning" scenario.

- [x] **#14 Admin org "Edit plan & type" — confirm warning** — ✅ shipped
  PATCH to `/api/admin/organizations/[id]` still writes Organization.plan
  only (intentionally — it's how admin overrides exist), but the UI
  now hard-confirms when the org has a live subscription. The dialog
  spells out that the change does not migrate the Paddle/Stripe
  subscription so the admin reaches for the proper path.

- [x] **#15 NotificationBell click navigates** — ✅ shipped
  GET `/api/notifications` now returns `href` per row, resolved from
  the event type (regression/improvement/digest → /app/dashboard,
  page_down → /app/inventory, incident → /app/actions, etc.). Click
  handler navigates via `router.push` and closes the popover.

- [x] **#17 MiniCalculator → onboarding handoff** — ✅ shipped
  MiniCalc CTA stashes `revenue` + `business_type` to localStorage at
  click time (alongside the existing `domain` stash). Onboarding form
  consumes all three (with a business-type mapping from MiniCalc's
  six values to onboarding's four), so the visitor doesn't re-type
  anything they just gave on the homepage.

- [x] **#18 Audit log gaps** — ✅ shipped
  `user.invite` / `user.role_change` / `user.delete` audit events
  emitted from `/api/admin/users` (shipped in Tier 1). Now adding
  `alert.create` / `alert.update` / `alert.delete` to
  `/api/admin/alerts`. All filter options on the audit-log page now
  surface real data.

- [x] **#19 `landing_url` per-env editor** — ✅ shipped
  New PATCH on `/api/organization/environments` (owner/admin only).
  Inline editor on the org page with URL validation + cancel — fixes
  misconfigured subpath sites without a DB shell.

- [x] **#5b Annual billing toggle end-to-end** — ✅ shipped
  All six steps done:
  1. `paddleAnnualPriceId` added to `PlanConfig` + the pricing Zod
     schema + the admin pricing default plans.
     `annualPriceCentsFromMonthly()` helper centralizes the 10× monthly
     ≈ 17% off derivation.
  2. Both `/api/admin/pricing` POST and `/api/admin/pricing/paddle-sync`
     now provision the annual Paddle price alongside the monthly one
     (and `paddle-api.createPrice` accepts `interval: "year"`).
  3. Admin pricing UI gains a "Paddle Annual" column next to "Paddle
     Monthly" so the synced annual id is visible.
  4. `/api/pricing` and `/api/pricing-preview` return
     `paddleAnnualPriceId` on every plan row.
  5. `handlePlanSelect(planId, cycle)` picks the annual id when
     `cycle === "annually"` (falls back to monthly when annual is
     missing — defense in depth; the toggle is gated by readiness so
     it shouldn't be reachable).
  6. `annualPricingEnabled` is wired on both surfaces:
     - `/app/billing` flips when every plan has a synced annual id
       (`isAnnualPriceReady` useMemo).
     - Home `/` Pricing flips via `usePricingPlans().annualReady`.
     Until the first paddle-sync provisions annual prices, the toggle
     stays hidden — eliminates the "user picks Annual, gets billed
     Monthly" scenario from the original #5 bug.

---

## Tier 4 — Cleanup

- [x] **#20** `productUpdates` notification toggle now gates a real event — ✅ shipped (added `product_updates` to `NotificationEvent` + `isEventEnabled`).
- [x] **#21** `/app/settings/account` has working Change Password + Delete Account forms — ✅ shipped (wired to existing `/api/user/change-password` and `/api/user/delete`).
- [x] **#22** Cancel "pause" / "discount" / "downgrade" return a clear 400 for orgs without an active subscription instead of silently writing `acceptedSave: true` — ✅ shipped.
- [x] **#23** `ForgotPassword` 404 branch removed (API only returns 200, anti-enumeration) — ✅ shipped.
- [x] **#24** Legacy `SigninWithPassword` now `String(data.remember)`s the value, matching the new Signin — same trap class as remember-me, defused — ✅ shipped.
- [~] **#25** `lp/audit` `ownershipConfirmed` hard-coded to true client-side. Decision: leave the API validation in place as defense-in-depth so a bypassed client can't mint a lead with `ownershipConfirmed=false`. Not a defect; documented so future cleanup doesn't drop the check thinking it's dead.
- [x] **#26** Signup now shows a green chip confirming the carried-over domain when arriving from MiniCalc — ✅ shipped.

---

## Surface Audit Refactor — 2026-06-07 wave

Full investigation, decisions, file:line index: `docs/surface-audit-investigation.md`.

Goal: shift the audit's unit of work from "page" to "surface" (anything
fetchable from the public network). Catches the Melissa-class problem
(public platform endpoints leaking commercial data — e.g.
`/ccstore/v1/sites/B2CMN` returning all coupons). Same primitives unlock
attribution / pricing / vendor cost / churn detectors that already exist
in `packages/signals/engine.ts` but never had data.

Pattern fechado neste wave: 2 instances of "infra sem instalação"
(Nuclei + Katana absent from Dockerfile; BRAVE_SEARCH_API_KEY undocumented
after Tavily migration). See Definition of Delivered below.

### Pre-flight

- [x] **Install Nuclei v3.8.0 + Katana v1.6.1 in production image** — commit `dc6dbbc9`. Standalone amd64 binaries pulled in dedicated `tools` Dockerfile stage; templates pre-baked via `nuclei -update-templates`.
- [x] **SERP collapses to Tavily-only** — commit `97260de6`. Brave adapter removed, `TAVILY_API_KEY` documented in `.env.example`. Confirmed by operator that key is set in Railway worker env.
- [x] **Internal UptimeCheck deleted** — commit `540ea895`. Railway `/healthz` is canonical. Model + library + admin routes + nav links + alert rule metric all removed.
- [ ] **Verify next havefunnels audit cycle** — passive check on logs/evidences: (a) `nucleiScanPass` ran against `landing_url` with the 19 curated checks; (b) `getSerpProvider()` returned Tavily (not null); (c) `prisma.suppressionRule.findMany` ran (will return 0 rows until any rule created).

### Wire 0 — SuppressionRule operational tool (DONE)

- [x] **Backend wire** — commit `3e99f7a4`. `run-cycle.ts` loads active rules scoped to env + workspace, filters expired at query level, passes to `runEngine` via `input.suppression_rules`. Phase 26 in `packages/workspace/recompute.ts:1013-1044` applies confidence reduction (never hides findings).
- [x] **Admin-only CRUD** — commit `db08d5d9`. `/api/admin/suppressions/` with `session.user.role === "ADMIN"` guard. UI panel in `src/app/app/admin/organizations/[id]/page.tsx` (list + create form). **Not customer-facing** — pushing "what is false positive?" onto customers undermines value prop.
- **Operational discipline (open)**: every rule created must open a ticket to tune the underlying detector at source (`packages/signals/engine.ts`, inference heuristics, or Nuclei template). Suppression is alívio temporário, never durable. Future metric: monthly rule-creation rate should fall as detectors mature.

### Wire 1 + Surpresa 4 — Network-as-surface + PlaywrightRender extractors

- [ ] **Promote captured XHR/fetch URLs to first-class surfaces.** Today `playwright-runtime.ts:84-171` captures into `CapturedNetworkRequest[]` and the array dies in `BrowserNavigationTrace` evidence (`browser-worker.ts:282-313` doesn't read `result.network_analysis`). Wire: same-registrable-domain filter + URL template dedup + per-audit cap.
- [ ] **Create `NetworkSurface` / `DiscoveredSurface` Prisma model** — parallel to existing `Surface` (which is operator-declared scope). Decision recorded: parallel, not overload.
- [ ] **Embed Surpresa 4 in same PR**: 2 signal extractors for `EvidenceType.PlaywrightRender` (emitted at `staged-pipeline.ts:415,884`, currently zero consumers). Likely `spa_runtime_error_on_boot` + `static_html_empty_needs_render`. Trivial work; saves a follow-up PR touching the same files.
- Effort: M-L, ~5-7 days

### Wire 5 + Surpresa 9 — NetworkAnalysisPayload emitter + feature flag rollout

- [ ] **Emit the payload that's already computed.** `buildNetworkAnalysisSummary` (`playwright-runtime.ts:243-245`) is populated but `resultToEvidence` (`browser-worker.ts:282-313`) never reads it. ~10 lines.
- [ ] **Feature flag the dormant detectors.** Surpresa 9: 7+ detectors in `signals/engine.ts:2837-3000+` (`checkout_api_latency_degrading`, `mobile_payment_slow`, `payment_critical_failed`, etc.) have never run against real data — thresholds at lines 2878/2885 are guesses. When the payload starts emitting, these fire all at once.
- [ ] **havefunnels-only rollout 1-2 weeks** before broader release. Calibrate thresholds via observed FP rate.
- Effort: M-L, ~7-10 days

### Wire 3 — Platform endpoint catalog

- [ ] **Add OCC, SFCC, BigCommerce to `packages/technology-registry/registry.ts`** (currently has Shopify, WooCommerce, Magento, WordPress, Wix, Squarespace, VTEX, Nuvemshop — missing the platforms most exposed to the Melissa class).
- [ ] **Add `endpoint_catalog: string[]` field** to each registry entry. Known commercial endpoint families per platform.
- [ ] **New enrichment pass `platform-catalog-probe.ts`** in `workers/ingestion/enrichment/` that fires when fingerprint detects a catalogued platform, probes the N URLs against the host, and pushes resolvable ones to the candidate queue + Nuclei target list.
- Effort: M, ~5 days

### Wire 4 — Custom Nuclei templates for body shapes

- [ ] **Create `packages/nuclei-templates/`** directory (does not exist today — `CURATED_CHECKS` references only upstream template IDs).
- [ ] **Author first batch of YAML templates** using matcher DSL (`type: regex`/`dsl`/`word` with `part: body`) for shapes: array of objects with `code`/`coupon`/`promo` keys, pricing tables, customer email arrays, etc.
- [ ] **Extend `CuratedNucleiCheck`** (`packages/nuclei-adapter/types.ts:28-45`) with optional `template_path` field for filesystem templates alongside the existing `nuclei_template` (upstream ID).
- [ ] **Update `runNucleiScan`** (`workers/nuclei/runner.ts:76-84`) to accept `-t <path>` for filesystem templates.
- Effort: M, ~5 days

### Wire 2 — Katana → Nuclei chain

- [ ] **Pipe Katana-discovered URLs to Nuclei targets.** Today `nuclei-scan.ts:64` passes only `ctx.landing_url`. After `katanaDiscoveryPass`, derive commercial-surface URLs from `KatanaClassifiedRoute[]` and inject into `runNucleiScan({ targets: [...] })` with a per-audit cap (e.g. 20 net-new).
- Effort: S, ~2 days

### Wire 7 — Katana with -jc + tuning

- [ ] **Enable JS bundle parsing.** Add `-jc` (`-js-crawl`) flag in `workers/katana/runner.ts:67-84`. This is Katana's main differentiator — extracting URLs embedded in JS chunks. The Melissa OCC endpoint is almost certainly referenced in their bundle.
- [ ] **Add `-aff` (auto-form-fill)** for parameter discovery.
- [ ] **Tune the `shouldRun` gate** in `katana-discovery.ts:26-70`. Today requires `spa_detected === true` AND discovery gaps — too restrictive. SSR sites with XHR-heavy shells (like Melissa) never trigger.
- Effort: M, ~5 days (heavy tuning because `-jc` is 3-10× slower).

### Wire 6 + Surpresa 5 — Surface drift + SurfaceVitality

- [ ] **Implement `NetworkSurface` diff between cycles.** "Apareceu uma URL JSON nova que ontem não existia" — the always-on revenue protection thesis depends on this.
- [ ] **Resurrect `extractVitalityFromEvents`** (`packages/behavioral/session-aggregator.ts:392-428` — defined, never called). Plug into `apps/audit-runner/process-behavioral.ts`. Pre-existing heartbeat infra ready.
- [ ] **2-3 signal extractors** for `EvidenceType.SurfaceVitality` once production data flows.
- Effort: L, ~10-15 days

### OpportunityTracking UI (separate ticket, parallel to wires)

- [ ] **Status buttons inline** in actions drawer at `src/app/app/actions/page.tsx:1402` (around `OperationalTimeline`). API + schema + recompute already exist (`/api/actions/[id]/status/route.ts`). Today UI reads status but doesn't expose transitions.
- [ ] **Trigger monthly strategy plan refresh** on status change.
- [ ] **Invalidate MCP context** so next interaction reflects the new status.
- [ ] **No new screen** — embed in existing drawer (founder decision).
- Effort: M, ~3-5 days

### Backlog (separate tickets, no urgency for the wave)

- [ ] **Surpresa 2 — Mobile pass.** Phase 2B detectors at `signals/engine.ts:1867-1988` waiting on producer. `playwright-runtime.ts` needs a mobile viewport second pass + emit `MobileVerificationResult` / `ClassifiedRuntimeErrors` payloads.
- [ ] **Surpresa 6 — Authenticated session evidence detectors.** `authenticated-runtime.ts:476-562` emits 3 evidence types, zero detectors read them. SaaS vertical track — defer until post-PMF.
- [ ] **Surpresa 7 — MCP analytics call sites.** `PrismaMcpStore` (`apps/platform/mcp-persistence.ts:202-308`) has write methods, never called from chat/MCP/playbook code. Tables `McpPromptEvent` / `McpSession` / `McpSuggestionClick` / `PlaybookRun` ALL empty in prod. Product decisions about MCP suggestions made blind.
- [ ] **Surpresa 8 quick win (~1 day, between wires).** `EvidenceType.BehavioralEvent` + `IntegrationSnapshot` are dead enums — maturity scoring at `packages/classification/maturity.ts:65` + recompute at `recompute.ts:1349` filter by them, always return zero. Rewrite consumers to check input payload presence instead.
- [ ] **Suspeita 3 — MarketingEvent customer-facing reads.** Today admin-only by design. Product question: should customers see their own A/B test results? If yes, ticket M to build read route. If no, document as intentional and remove from maturity scoring.

### Discipline: Definition of Delivered (open)

For any future wave that depends on an env var or external binary:

1. Env var documented in `.env.example`
2. Binary install verified in prod (Docker build succeeds + container check)
3. Producer instrumented + emitting evidence in prod (havefunnels first)
4. Consumer present + actively reading
5. Single integration test exercises the full producer→consumer path

Two instances of this pattern caught in this wave (Nuclei/Katana, BRAVE/Tavily).
Codify as a checklist before closing any wave.

---

## Audit context — 2026-05-14

Four parallel audits ran across (a) settings/billing/account, (b)
console/dashboard/workspaces, (c) admin platform, (d) signup/onboarding/auth.
Each looked for two failure modes:

1. **Ghost controls** — UI control with a handler that doesn't actually
   reach the backend, or reaches a backend that ignores the field.
2. **Missing wiring** — feature/control that should be there but isn't,
   where a real user expectation isn't met (e.g. role descriptions that
   aren't enforced, persisted data with no read path).

The two confirmed prior bugs that motivated the audit:
- "Remember me" checkbox sent a value the credentials provider never read.
  Fixed in commit `3481594`.
- Admin language selector cookie was clobbered by `syncUserLocale` on every
  layout re-render. Fixed in commit `5389b8f`.

Both shared the same root cause class: UI commits to a state, backend
silently ignores or reverts it, no error surfaces to the user.

Same pattern explains 7 of the 26 findings here. Worth treating as a class
of bug, not as individual fixes: any time a control persists state, verify
the read path exists and is exercised.
