# Vestigio — Improvement Roadmap (Power User Audit)

**First audit:** 2026-06-04 against commit `4a89df4f`
**Last update:** 2026-06-04 (4/4 P0s shipped)

**Audit method:** 11 parallel analytical agents (5 lens evaluations
+ 6 surface traces) crossing 24 hypothesized purchase intents for a
technical power user in their first 14 days.

**Scoring:** A friction tag is only listed here if it appeared in
≥2 independent agent reports.

---

## Progress at a glance

```
P0 (must fix, would churn)    ████████████████████ 4/4 ✅ shipped
P1 (medium-leverage)          ░░░░░░░░░░░░░░░░░░░░ 0/3
P2 (polish + structural)      ░░░░░░░░░░░░░░░░░░░░ 0/4
P3 (deferred)                 ░░░░░░░░░░░░░░░░░░░░ 0/3
```

**Score trajectory (estimated):**

```
                          Initial     P0 done     P1 done     Target
Overall                     4.3   →    ~6.0   →    ~7.5   →    8.5
Strategy Plan               4.0   →    6.0    →    6.5    →    8.0
Actions                     4.0   →    6.5    →    7.5    →    8.5
Dashboard                   —     →    7.0    →    7.5    →    8.5
Findings                    5.0   →    6.0    →    8.0    →    8.5
Workspaces                  4.0   →    5.0    →    5.5    →    7.0
Maps                        5.0   →    5.0    →    7.0    →    8.0
Inventory                   4.0   →    4.0    →    6.0    →    7.5
Methodological Rigor        4.0   →    6.5    →    7.5    →    8.5
Self-Explanation            4.5   →    6.0    →    8.0    →    8.5
Information Coherence       3.5   →    3.5    →    6.5    →    8.0
Strategic Positioning       5.0   →    7.0    →    7.5    →    8.0
```

---

## ✅ Shipped (P0 batch — 4/4 fixes, ~4.5 eng hours total)

### UC3 — Strategy Plan exec credibility (3 sub-fixes)
**Commit:** `8f3b857e` · **Files:** `StrategyPlanPanel.tsx`, `library/strategy/[month]/page.tsx`

- **UC3.a:** Removed `$0.08` LLM-cost telemetry + engineer-style
  version slug from the Strategy Plan footer. Exec-shareable surface
  no longer leaks internal cost.
- **UC3.b:** Wired the dead "Compartilhar" button to clipboard-copy
  the plan permalink (`?envId=` deep link). Was previously a no-op
  click for the most-clicked control on the surface.
- **UC3.c:** Gated the Step-3 design-review mock fallback
  (`MOCK_PLAN_HAVEFUNNELS_2026_06`) behind `?demo=1`. Previously
  ANY customer hitting `/app/library/strategy/2026-06` without a
  generated plan saw `envDomain: "havefunnels.com"` in the header
  — cross-tenant data leak.

### UC4 — Actions multi-player delegation
**Commit:** `8f3b857e` · **Files:** `prisma/schema.prisma`,
`prisma/migrations/20260604140000_user_action_assignment/`,
`api/actions/user/route.ts`, `api/actions/user/[id]/route.ts`,
`app/actions/page.tsx`

- New `UserAction.assignedToUserId` column with FK + index on
  `(envId, assignedToUserId, status)`. Migration backfills existing
  rows to `createdByUserId`. Applied to Railway prod.
- `GET /api/actions/user` accepts `?scope=mine|all`; response
  includes `created_by` + `assigned_to` user info so the UI doesn't
  need a second fetch.
- `PATCH /api/actions/user/[id]` accepts `assigned_to_user_id`;
  server validates the assignee is a member of the action's org
  (no cross-org assignment via guessed user id).
- New "Responsável" dropdown in the UserAction drawer populated
  from `/api/organization/members`; switching fires PATCH + toast.
- "Mine" tab now actually filters by current user's assignment
  (previously showed everyone's actions in the org+env).

### UC1 — Universal methodology popover
**Commit:** `9cfe6719` · **Files:** new
`components/console/MethodologyPopover.tsx`, `ImpactBadge.tsx`,
`FindingDetailPanel.tsx`, `findings/page.tsx`,
`workspaces/[id]/page.tsx`,
`workspaces/perspective/[slug]/page.tsx`,
`strategy/sections/HeroMetrics.tsx`,
`dashboard/widgets/MoneyRecoveredTicker.tsx`

- New reusable `MethodologyPopover` component — per-finding "ⓘ"
  trigger that shows the min/max range, `basis_type` chip
  (data_driven/mixed/heuristic), severity, baseline % rule, cause,
  effect. When `basis_type === heuristic`, surfaces an amber CTA
  linking to `/app/settings#business-inputs`.
- Variant `AggregateMethodologyPopover` for KPI tiles with
  description + drill-href.
- `ImpactBadge` extended with optional `basis_type`, `severity`,
  `cause`, `effect` props. The trigger renders only when
  `basis_type` is supplied — existing callsites without it keep
  working unchanged (backwards compatible).
- Wired into 6 high-traffic surfaces: FindingDetailPanel,
  findings list, workspace detail (table + drawer), perspective
  page, Strategy Plan HeroMetrics (4 tiles), MoneyRecoveredTicker.

### UC2 — Action Queue Hero on dashboard
**Commit:** `c5ef4e05` · **Files:** new
`components/console/dashboard/widgets/ActionQueueHero.tsx`,
`lib/dashboard/types.ts`, `aggregator.ts`, `mock-data.ts`,
`default-layout.ts`, dictionaries

- New widget renders top-5 prioritized open actions inline — each
  row shows severity dot+chip, title, effort, assignee, in-progress
  badge, impact midpoint, deep-link arrow.
- New `actionQueue` slice in `DashboardData`. `computeActionQueue()`
  pulls from `UserAction` directly (no MCP roundtrip), sorts by
  `baselineImpactMidpoint DESC → severity DESC → createdAt DESC`,
  caps top 5, surfaces totalOpen + totalImpact across ALL open.
- Default layout restructured: ActionQueueHero at `(0,0,12,4)`
  is now the first thing the user sees. Cross-Signal Hero moves
  down to row 4. Everything else shifts +4 rows.
- Empty state has explicit CTA into
  `/app/findings?view=on_fire` so users without actions yet have
  a clear path to create their first.
- Widget is locked (`removable: false`) — same anchor pattern as
  MoneyRecovered.

---

## 🟡 Next batch — P1 (3 items, ~3 eng days, 6.0 → ~7.5)

These are the natural follow-ons from the P0 batch. Each one closes
a friction pattern that hits multiple surfaces.

### P1.1 — Plumb `basis_type` through ActionProjection (0.5d)

**Why:** UC1 ships methodology popover wired into 6 surfaces, but
NOT `/app/actions`. The widget is wired client-side; the popover
will render the moment `ActionProjection` carries `basis_type`,
`cause`, `effect` at the top level (currently only on linked
findings via `value_case_basis`).

**Touch list:**
- `packages/projections/types.ts` — extend `ActionProjection` with
  `basis_type: string | null`, `cause: string | null`,
  `effect: string | null` (inherit from primary linked finding)
- `packages/projections/engine.ts` — populate the new fields when
  building each action (use linked finding's `valueCase`)
- `src/app/app/actions/page.tsx` — pass the new fields to
  `<ImpactBadge basis_type={...} cause={...} effect={...} />` in
  both the table (line ~862) and drawer (lines ~1289, ~1298)

**Verification:** click a $-impact row in `/app/actions` → "ⓘ"
trigger renders → popover explains how the number was computed.

### P1.2 — `PACK_REGISTRY` unification + delete alias maps (1d)

**Why:** Friction #1 of the audit ("Engine vocabulary leaking to
UI"). 14 packs exist as flat chip cloud in ViewSelector with no
glossary; pack names drift across surfaces (`revenue` vs
`revenue_integrity`, `behavioral` vs `behavioral_heuristics`,
"trust" appears as 5 different identifiers).

**Touch list:**
- New `src/lib/pack-registry.ts` exports `PACK_REGISTRY:
  Record<PackId, PackDefinition>` where `PackDefinition` is
  `{ id, label_pt, label_en, description_pt, description_en,
  color: hue, hex }`. Source of truth.
- Delete the 6 alias maps that re-implement this concept:
  - `src/lib/pack-colors.ts` `PACK_STYLE_MAP` (long+short forms)
  - `src/components/console/ViewSelector.tsx` `PACK_OPTIONS`
  - `src/components/console/chat/PackInsightBubble.tsx` `PACK_META`
  - `src/lib/dashboard/aggregator.ts` line ~1110 `LABELS_EN`
  - any string literal pack names in components
- Rename `pack: string` callsites to `pack: PackId`; TypeScript
  will catch every drift.
- Add tooltip on every pack chip: hover shows
  `description_pt`/`description_en` from the registry.

**Verification:** type `Pack` becomes the canonical union of pack
ids; renaming a pack updates label everywhere; UI tooltips explain
each pack inline.

### P1.3 — Free-text search on `/app/findings` + ChangeBadge column (0.5d)

**Why:** UC6+UC7 in the audit. The findings page has 14 packs as
flat chips; users with mental model "show me checkout findings"
can't find them without learning the engine taxonomy. ChangeBadge
exists per row but is only visible after opening the drawer.

**Touch list:**
- `src/app/app/findings/page.tsx`: add a
  `<input type="search">` next to ViewSelector; filter `findings`
  by `title.toLowerCase().includes(query)` OR
  `affected_surfaces.some(...)` OR `inference_key.includes(query)`.
- `src/components/console/ColumnSelector.tsx`: add `change_class`
  to `AVAILABLE_COLUMNS` so users can show it as a column.
- Update `DEFAULT_VIEW_PRESETS` in `src/app/api/views/route.ts`:
  add a "What changed" preset
  (`change in [regression, new_issue, resolved]`, ordered by
  `last_observed_at DESC`).
- Render `<ChangeBadge>` in the column body (component already
  exists at `src/components/console/ChangeBadge.tsx`).

**Verification:** searching "checkout" filters the table to
matching findings without taxonomy knowledge; opening the saved
view "What Changed" shows new/regression/resolved as the default
sort.

---

## 🟢 P2 — Polish + structural (4 items, ~3 eng days, 7.5 → ~8.0)

### P2.1 — Maps in sidebar + chat custom-map deep link (0.5d)

**Why:** Audit #6 finding. Maps is genuinely a strong surface but
zero discoverability — only reachable via Library card or chat
citation. Chat-created custom maps return `url: '/app/maps'`
(gallery) instead of `/app/maps/${id}`.

**Touch list:**
- `src/components/app/sidebar-nav-data.ts`: add `/app/maps`
  entry between Findings and Library
- `apps/mcp/tools.ts:815`: change `url: '/app/maps'` to
  `url: /app/maps/${mapDef.id}`
- `src/components/console/chat/ChatMessage.tsx`: add a card
  renderer for `type === 'custom_map_created'` with thumbnail
  + "Open map" button

### P2.2 — Replace Lorem Ipsum on `/pricing` pt-BR (15 min)

**Why:** Audit P0-3 ("/pricing pt-BR renders Lorem Ipsum"). Found
by the strategic-positioning agent. A paying pt-BR power user who
returns to `/pricing` to evaluate upgrade paths reads lorem ipsum
— destroys credibility.

**Touch list:**
- Either delete `homepage.pricing_section.plans` from pt-BR
  dictionary so the page falls back to the English `FALLBACK_PLANS`
- OR translate the English `FALLBACK_PLANS` content into the
  dictionary (better long-term)

### P2.3 — Inventory "Audit scope" header strip (1d)

**Why:** Audit UC9 + UC2 + UC10. Inventory has no "Add URL", no
"Exclude URL" inline. Customers can't answer "did you check my
homepage?" without scanning 200 rows.

**Touch list:**
- `src/app/app/inventory/page.tsx`: add a header strip above the
  summary cards showing:
  - "Crawled N URLs from {sources}" with discovery_source
    breakdown
  - "Skipped M (reasons →)" linking to a drawer showing
    `skip_reason` aggregates
  - "+ Add URL" button (POST `/api/inventory/manual` — new endpoint)
  - "Exclude URL" button (PATCH `/api/organization/environments/
    crawl-exclusions`, already exists)
- `src/app/api/inventory/manual/route.ts` (new): POST adds a
  user-supplied URL with `discovery_source: 'manual'`; needs
  env-membership auth + URL validation

### P2.4 — 3 severity enums → 1 canonical (1d)

**Why:** Audit friction #5. Three incompatible severity scales
exist:
- `Finding.status` / `Action.status` Prisma: 5-tuple
  (`critical|high|medium|low|none`)
- `MiniImpactSeverity` (3 values, no critical, no none)
- `MiniFindingSeverity` (4 values with `positive` repurposed as
  severity)

**Touch list:**
- `packages/domain/types.ts` (or wherever): export canonical
  `Severity = 'critical'|'high'|'medium'|'low'|'none'`
- Delete `MiniImpactSeverity` and `MiniFindingSeverity`; migrate
  all consumers to the canonical type
- Add a polarity field where "positive" was conflated with
  severity
- Delete the 5 independent `formatBRL` implementations: there
  are copies in `actions/page.tsx`, `strategy/sections/`,
  `dashboard/page.tsx` etc. Replace with the canonical
  `src/lib/format-currency.ts` (or add a new util) and grep -r
  for `formatBRL` to verify zero local copies

---

## ⚪ P3 — Deferred / Wave 28+ (3 items)

### P3.1 — Aggregate range + finding count on HeroMetric type
Extend `HeroMetric` interface with optional `retainedRange:
{min,max}`, `retainedFindingCount`, `capturedRange`,
`capturedFindingCount`. Generator populates from underlying value
cases. AggregateMethodologyPopover then renders the actual range
instead of just the description.

### P3.2 — Workspace by surface (URL/funnel-step) pivot
Audit Workspaces H1: "fix ONE problem area" maps to surface, not
to discipline. Add `/app/workspaces?surface=/checkout` filter.
Foundation already exists (`surface` field on findings, surface
declarations in Wave 22.5). Needs a new perspective tab "By
Surface" + classification function.

### P3.3 — `/app/dashboard` rename to `/app/pulse`
Audit P0-2. Landing announces "Vestigio Pulse" but the dashboard
URL says `/dashboard`. Rename route + sidenav label so the buyer
mental model matches the product surface.

---

## How this roadmap is maintained

- **Adding a new fix:** append to the appropriate P-bucket with
  same shape (Why / Touch list / Verification).
- **Marking a fix shipped:** move it from its P-bucket to
  ✅ Shipped with the commit hash + file list.
- **Re-auditing:** the parallel-agent methodology that produced
  this doc is documented in
  `docs/POWER_USER_AUDIT_METHOD.md` (TODO — write this when we
  re-audit Wave 28 to compare scores apples-to-apples).

---

## Methodology notes

Audit conducted via 11 parallel `code-reviewer` and
`general-purpose` agents on 2026-06-04 against commit `4a89df4f`.

Each agent received:
- Same test-case framing (technical power user, fresh subscription,
  week 1-2)
- Either a specific analytical lens (churn, customer research,
  methodology, coherence, positioning) OR a specific product
  surface (Strategy Plan, Workspaces, Actions, Findings, Maps,
  Inventory)
- Multiple distinct purchase-intent hypotheses to trace through
  their assigned surface/lens
- Output format: file/line references + severity (P0/P1/P2) +
  score 0-10 + leverage fix

A friction tag is only listed in this roadmap if it appeared in
≥2 independent agent reports.
