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

- [ ] **#4 Admin Pricing "Features per Plan" edits never persist**
  `planSchema` Zod object has no `features` field; the edits are silently
  stripped before write. Customer-facing pricing comparison table is
  unaffected.
  - UI: [src/app/app/admin/pricing/page.tsx:225](src/app/app/admin/pricing/page.tsx#L225)
  - API: [src/app/api/admin/pricing/route.ts:25](src/app/api/admin/pricing/route.ts#L25)

- [ ] **#7 Action drawer Fix / Track / Dismiss CTA does nothing**
  `onClick` intentionally empty ("placeholders awaiting their own pipelines").
  Most common bottom CTA shown in the action drawer.
  - UI: [src/app/app/actions/page.tsx:1443](src/app/app/actions/page.tsx#L1443)

- [ ] **#8 Onboarding "Industry vertical" is dead-storage**
  Sent as `targetIndustry` but the Zod schema strips it.
  `BusinessProfile.targetIndustry` exists and is consumed by
  copy-persona-rewrite — it's always null.
  - UI: [src/app/app/onboarding/page.tsx:227](src/app/app/onboarding/page.tsx#L227)
  - API: [src/app/api/environments/activate/route.ts:30](src/app/api/environments/activate/route.ts#L30)

- [ ] **#9 Onboarding "I own this domain" checkbox is never persisted**
  Required UI control. Activate route's body doesn't include
  `ownershipConfirmed`; no `Environment.ownershipConfirmedAt` column exists.
  Pure UI speedbump.
  - UI: [src/app/app/onboarding/page.tsx:178](src/app/app/onboarding/page.tsx#L178)
  - Handler: [src/app/app/onboarding/useOnboardingForm.ts:411](src/app/app/onboarding/useOnboardingForm.ts#L411)

- [ ] **#10 Inventory "Use as context" loses selected surfaces**
  Only the count is sent in the prompt; the surface IDs are not attached.
  `CopilotContextItem.kind` doesn't even include `"surface"`.
  - UI: [src/app/app/inventory/page.tsx:1001](src/app/app/inventory/page.tsx#L1001)
  - Context type: [src/components/app/CopilotProvider.tsx:34](src/components/app/CopilotProvider.tsx#L34)

- [ ] **#12 `/app/admin/environments` "Trigger Audit" explicitly stubbed**
  Pops an `alert("not yet implemented")` despite `/api/admin/trigger-audit`
  existing and working from the org detail page. One-line fix.
  - UI: [src/app/app/admin/environments/page.tsx:97](src/app/app/admin/environments/page.tsx#L97)

- [ ] **#16 Chat ActionCard navigates to `?action=`, actions page reads `?selected=`**
  Drawer never auto-opens from chat. (FindingCard ↔ findings page does work,
  so this is a one-sided break.)
  - UI: [src/components/console/chat/ActionCard.tsx:34](src/components/console/chat/ActionCard.tsx#L34)
  - Reader: [src/app/app/actions/page.tsx:440](src/app/app/actions/page.tsx#L440)

---

## Tier 3 — Backlog

Real but lower volume / less visible.

- [ ] **#13 Stripe `priceId` edits don't migrate existing subscriptions**
  Old subscribers keep old pricing forever. No Stripe subscription update
  call on plan save.
  - API: [src/app/api/admin/pricing/route.ts:99](src/app/api/admin/pricing/route.ts#L99)

- [ ] **#14 Admin org "Edit plan & type" bypasses Stripe/Paddle**
  Acknowledged by inline copy, but raising an org's plan grants features
  without billing change. Financial reconciliation footgun.
  - UI: [src/app/app/admin/organizations/[id]/page.tsx:556](src/app/app/admin/organizations/[id]/page.tsx#L556)

- [ ] **#15 NotificationBell click never navigates**
  `href?: string` declared on the type but the API never returns it and the
  click handler never reads it.
  - Type: [src/components/app/NotificationBell.tsx:22](src/components/app/NotificationBell.tsx#L22)

- [ ] **#17 MiniCalculator revenue + business profile thrown away at handoff**
  User types monthly revenue + picks business type on the homepage,
  signup→onboarding stashes only `domain` and re-asks both later.
  - UI: [src/components/Home/MiniCalculator/index.tsx:231](src/components/Home/MiniCalculator/index.tsx#L231)
  - Handoff: [src/components/Auth/Signup/index.tsx:47](src/components/Auth/Signup/index.tsx#L47)

- [ ] **#18 Audit log filter lists actions that are never logged**
  `user.delete`, `user.role_change`, `alert.create` never fire
  `logAuditEvent`. Admin role changes specifically are not auditable, which
  is a real security/compliance gap.
  - UI: [src/app/app/admin/audit-log/page.tsx:75](src/app/app/admin/audit-log/page.tsx#L75)

- [ ] **#19 `landing_url` per-env has no editor**
  Stored, no read or edit path in the UI. Misconfigured subpath sites can't
  be fixed without a DB shell.
  - API write: [src/app/api/environments/activate/route.ts:59](src/app/api/environments/activate/route.ts#L59)

- [ ] **#5b Re-enable annual billing toggle**
  Spun out of #5. Steps:
  1. Add `paddleAnnualPriceId` to the Zod schema in
     [src/app/api/admin/pricing/route.ts](src/app/api/admin/pricing/route.ts)
     + the `PlanConfig` type in
     [src/libs/plan-config.ts](src/libs/plan-config.ts).
  2. Update `/api/admin/pricing/paddle-sync` to provision both monthly and
     annual prices in Paddle.
  3. Surface a second input row in the admin pricing UI.
  4. Have `/api/pricing` return both IDs; type `PricingPlan` on the billing
     page reflects them.
  5. `handlePlanSelect` picks the right `priceId` from
     `{paddlePriceId, paddleAnnualPriceId}` based on the `BillingCycle`
     argument (currently discarded).
  6. Flip `annualPricingEnabled={true}` on `BillingPage` and `HomePricing`.

---

## Tier 4 — Cleanup as you touch the file

- [ ] **#20** `productUpdates` notification toggle persisted but never gated on by `isEventEnabled` ([libs/notifications.ts:436](src/libs/notifications.ts#L436))
- [ ] **#21** `/app/settings/account` renders only a heading — no password change / no delete despite endpoints existing ([settings/page.tsx:110](src/app/app/settings/page.tsx#L110))
- [ ] **#22** Cancel "pause" silently no-ops for admin-provisioned (Paddle-free) orgs ([api/billing/cancel/route.ts:209](src/app/api/billing/cancel/route.ts#L209))
- [ ] **#23** `ForgotPassword` handles a 404 branch the API never returns (200 always, anti-enumeration) ([Auth/ForgotPassword/index.tsx:44](src/components/Auth/ForgotPassword/index.tsx#L44))
- [ ] **#24** Legacy `SigninWithPassword` sends `remember` as JS boolean — coerces to string in practice but same trap class as the just-fixed remember-me bug ([Auth/SigninWithPassword.tsx:81](src/components/Auth/SigninWithPassword.tsx#L81))
- [ ] **#25** `lp/audit` `ownershipConfirmed: true` is hard-coded client-side; API still "validates" it ([lp/audit/useLpAuditForm.ts:102](src/app/(site)/lp/audit/useLpAuditForm.ts#L102))
- [ ] **#26** Signup `?domain=` silently stashed in localStorage with no confirmation toast ([Auth/Signup/index.tsx:46](src/components/Auth/Signup/index.tsx#L46))

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
