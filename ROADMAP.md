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

## Tier 4 — Cleanup

- [x] **#20** `productUpdates` notification toggle now gates a real event — ✅ shipped (added `product_updates` to `NotificationEvent` + `isEventEnabled`).
- [x] **#21** `/app/settings/account` has working Change Password + Delete Account forms — ✅ shipped (wired to existing `/api/user/change-password` and `/api/user/delete`).
- [x] **#22** Cancel "pause" / "discount" / "downgrade" return a clear 400 for orgs without an active subscription instead of silently writing `acceptedSave: true` — ✅ shipped.
- [x] **#23** `ForgotPassword` 404 branch removed (API only returns 200, anti-enumeration) — ✅ shipped.
- [x] **#24** Legacy `SigninWithPassword` now `String(data.remember)`s the value, matching the new Signin — same trap class as remember-me, defused — ✅ shipped.
- [~] **#25** `lp/audit` `ownershipConfirmed` hard-coded to true client-side. Decision: leave the API validation in place as defense-in-depth so a bypassed client can't mint a lead with `ownershipConfirmed=false`. Not a defect; documented so future cleanup doesn't drop the check thinking it's dead.
- [x] **#26** Signup now shows a green chip confirming the carried-over domain when arriving from MiniCalc — ✅ shipped.

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
