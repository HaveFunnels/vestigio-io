# Vestigio — Improvement Roadmap (Power User Audit)

**Last evaluated:** 2026-06-04
**Audit method:** 11 parallel analytical agents (5 lens evaluations + 6 surface traces) crossing 24 hypothesized purchase intents for a technical power user in their first 14 days.
**Overall score:** **4.3 / 10**

The product has genuinely strong engineering (ELK lanes for journey maps, change-detection,
RBAC, surface gates, MCP read/write, competitive lens infrastructure). UX coherence with the
landing page promise — and accessibility for non-engineer power users — does not yet meet
the engineering bar. This roadmap is the path from 4.3 → 7 in ~9 engineering days.

---

## Surface scores

| Surface | Score | 1-line verdict |
|---|---|---|
| Findings | 5.0 | Solid bones but no search, surface filter hidden, ChangeBadge buried in drawer |
| Maps | 5.0 | Excellent canvas (path highlight, ELK lanes, multi-select) ruined by zero discoverability + zero sharing |
| Strategy Plan | 4.0 | Read-only, dead share button, `$0.08` LLM cost in footer, mock fallback leaks havefunnels.com to other tenants |
| Workspaces | 4.0 | 15 workspace types collapsed to 4 perspectives via hardcoded if-chain; color drift; bespoke widgets feel disconnected |
| Actions | 4.0 | "Fila de decisões" became a filtered table; zero assignment; ROI card shows all-time aggregate |
| Inventory | 4.0 | Read-only — no Add URL, no Exclude URL, surface and inventory are disconnected concepts |

## Lens scores

| Lens | Score | Worst friction |
|---|---|---|
| Information Coherence | 3.5 | 3 incompatible severity enums, 5 independent `formatBRL` implementations, "trust" concept named 5 ways |
| Methodological Rigor | 4.0 | `FALLBACK_INPUTS` ($50k MRR, $80 AOV) used silently when onboarding incomplete; `basis_type` chip computed but never rendered |
| Churn Prevention | 4.0 | Hero "Money Recovered" KPI is structurally $0 for the first 14 days (requires 2nd-cycle confirmation) |
| Self-Explanation | 4.5 | "Pack" used 50+ times across UI, never defined; "midpoint" shown with no inputs, no formula |
| Strategic Positioning | 5.0 | Landing promises "fila de decisões" — dashboard delivers a 12-column bento; "Vestigio Pulse" radar has no UI home |

---

## The 6 recurring frictions (each appears in ≥4 reports)

### #1 — Engine vocabulary leaking to UI
- "Pack" used 50+ times, never defined inline
- 14 packs in ViewSelector as flat chip cloud
- `inference_key`, `signal_key`, `confidence_tier` exposed as labels
- "Workspace" vs "Panorama" vs "Perspectiva" — 3 terms, 1 concept
- "Trust" appears as 5 variants in code: `trust_gap`, `trust_revenue_gap`, `trust_posture`, `behavioral_trust_revenue_gap`, `paid_traffic_trust_gap`

### #2 — Money math is a black box
- `FALLBACK_INPUTS` ($50k MRR, $80 AOV, 625 transactions) silent default when business inputs are missing
- `basis_type` ('data_driven' / 'mixed' / 'heuristic') computed in `packages/impact/engine.ts` but **never rendered** — `grep "basis_type" src/ --include="*.tsx"` returns zero matches
- Hero metrics show `midpoint` only, discarding `min/max` already on the row
- 5 independent `formatBRL` implementations producing `R$1.2k`, `R$ 5,7k em foco`, `R$ 1,2k` for the same value
- No tooltip anywhere explaining "how was this number calculated?"

### #3 — Landing promise vs product reality
| Landing claim | Product reality |
|---|---|
| "Não é um dashboard. É uma fila de decisões" | Dashboard is a 12-column bento grid; Actions is one click away |
| "Vestigio Pulse — radar contínuo" | No "Pulse" surface exists; sidenav never mentions it |
| "Money Recovered" hero | Structurally $0 for 14 days (`confirmedCents` requires 2nd-cycle verification) |
| /pricing pt-BR | **Lorem ipsum in production** |
| Monthly Strategy Plan | **Zero mention on landing** (the best deliverable) |
| "Vestigio AI" tab in product tour | Removed from sidenav, only copilot panel |
| 4X money-back guarantee | No in-product surfacing of the threshold or how to claim |

### #4 — Read-only product, missing write affordances
- **Actions**: zero `assignedToUserId`; "Mine" tab queries by org+env, not by user
- **Inventory**: no "Add URL" anywhere; "Exclude" buried in Settings 3 levels deep
- **Strategy Plan**: NextSteps cards don't convert → Action; "Compartilhar" button has no `onClick`
- **Maps**: no share-link, no permission model; SVG export is HTML-in-SVG (breaks in Keynote)
- **Findings**: no snooze, no silence, no free-text search

### #5 — Cross-surface inconsistency (same data, different faces)
- **3 incompatible severity scales**: Prisma 5-tuple vs `MiniImpactSeverity` (3 values) vs `MiniFindingSeverity` (4 with "positive" as a severity!)
- **Status enums**: Finding (5) vs UserAction (4) vs PlanNextStep (5) — "done", "resolved", "completed" appear in different shapes
- **Color drift**: copy = `sky` in Panorama page, `emerald` in workspace detail
- **Mock fallback cross-tenant**: any new customer opening `/app/library/strategy/2026-06` falls back to `MOCK_PLAN_HAVEFUNNELS_2026_06` and sees `envDomain: "havefunnels.com"` in the header

### #6 — Discoverability collapse
- **Maps**: NOT in the primary sidebar; only reachable via Library card or chat citation
- **Strategy Plan**: discovered only via `strategy_plan_ready` email — without email, never found
- **Pulse**: announced on landing, has no entry anywhere in the app
- **Global search**: doesn't exist in `/app/findings`, `/app/actions`, or `/app/inventory`

---

## Use cases that break today (prioritized by churn risk)

### 🚨 P0 — Would cause churn in week 1-2

#### UC1: "Show me where I'm losing money right now"
- Dashboard hero "Money Recovered" = $0 (structural, 14 days)
- No tooltip explaining what `retainedMid` means
- `basis_type: 'heuristic'` (using fallback $50k MRR) never disclosed
- **Fix:** Methodology popover everywhere; rename hero to "Vazamento atual" + show range

#### UC2: "Give me a prioritized queue of decisions" (literal landing promise)
- `/app/dashboard` is a 12-column bento, not a queue
- `/app/actions` opens with 4 KPI cards + 3 filters before the queue
- Sort is money-weighted; severity desc exists in code but no UI control
- "Mine" tab shows actions for **all** org members (`/api/actions/user/route.ts:60-67`)
- **Fix:** `/app/dashboard` redirect → `/app/actions` OR top widget = "Action Queue Hero"

#### UC3: "Share the monthly plan with my CFO"
- "Compartilhar" button at `StrategyPlanPanel.tsx:124-129` has **no `onClick`** — dead control
- Footer renders `$0.08` LLM cost — internal telemetry on an exec document
- Cross-tenant: new customer can see `envDomain: "havefunnels.com"` if the mock fallback activates
- **Fix:** remove cost line, wire share button to signed-link share modal, gate mock fallback to demo env only

#### UC4: "Delegate actions to my team"
- `UserAction` schema only has `createdByUserId` — zero `assignedToUserId`
- PATCH endpoint accepts only `{status, notes}` — no reassign
- No `@mention`, no per-owner notification routing
- **Fix:** 1 Prisma column + 1 PATCH field + assignee dropdown in drawer

### ⚠️ P1 — Would cause public negative feedback

#### UC5: "How does Vestigio calculate these numbers?"
- Hero metrics are point estimates without visible range
- `confidence` shown as tier (low filtered out, only medium/high shown) — numeric score hidden
- "Re-verify" CTA doesn't say WHAT will be re-checked
- **Fix:** "Estimate basis" expandable on every ImpactBadge (inputs + assumption + benchmark)

#### UC6: "Filter findings by tech area (security, copy, mobile)"
- No pack named `security` — exists as `security_posture`, `money_moment_exposure`
- No pack named `mobile` — exists as `mobile_revenue_exposure`
- ZERO free-text search on `/app/findings`
- 14 packs as flat chip cloud with no category, no tooltip
- **Fix:** add search input + rename "Pack" → "Categoria" + per-pack tooltip

#### UC7: "Show me what changed since last cycle"
- ChangeSummaryBanner exists (✅ win)
- But `change_class` is NOT a default column in the findings table — only visible in the drawer
- Cycle 1 treats everything as `new_issue` but filter `regression` empties the table silently
- **Fix:** ChangeBadge as default column + preset view "What Changed Since Last Cycle"

#### UC8: "Share a map in slides"
- PNG export works; SVG export is HTML-in-SVG (breaks in Keynote/Google Slides)
- Zero share-link, zero permission model
- Chat-created custom maps return `url: '/app/maps'` (gallery) instead of `/app/maps/${id}`
- **Fix:** PDF export + chat tool returns correct deep link

### 📝 P2 — Would notice + comment internally

#### UC9: "I want to see the crawler's coverage"
- No "we crawled N URLs, skipped M (why)" narrative panel
- `skip_reason` field exists server-side but only visible in row drawer
- **Fix:** "Audit scope" header strip on Inventory

#### UC10: "Multiple workspaces for different teams"
- Zero ownership/assignment primitives on WorkspaceProjection
- No per-workspace notification routing, no "watch this workspace"
- **Fix:** later wave

#### UC11: "Compare mobile vs desktop journey maps"
- Only one view per map; no segment overlay
- **Fix:** later wave

---

## The 10 highest-leverage fixes (sorted by impact × effort)

The first 4 alone move the score from 4.3 → ~7. ~9 engineering days total.

| # | Fix | Effort | Cross-cutting impact |
|---|---|---|---|
| 1 | **Add Maps to sidebar + fix chat custom-map deep link** | 30min | UC8 + cross-feature discovery |
| 2 | **Rename Dashboard → Pulse, hero widget = Action Queue Top 5** | 1d | UC2 + delivers landing promise |
| 3 | **Universal methodology popover** (range, basis_type, baseline %, formula) on every ImpactBadge / Hero metric | 2d | UC1 + UC5 + UC6 |
| 4 | **Single `PACK_REGISTRY`** (id, label_pt, label_en, color, hue) + delete 6 alias maps | 1d | Friction #1 + #5 |
| 5 | **`assignedToUserId` on UserAction + assignee dropdown in drawer** | 1d | UC4 |
| 6 | **Free-text search on `/app/findings`** + add ChangeBadge as default column | 0.5d | UC6 + UC7 |
| 7 | **Strategy Plan: delete `$0.08` cost + wire share button + close mock cross-tenant** | 0.5d | UC3 + exec credibility |
| 8 | **Inventory: "Audit scope" header strip with +Add URL / Exclude URL inline** | 1d | UC9 + UC10 |
| 9 | **Replace Lorem Ipsum on /pricing pt-BR with FALLBACK_PLANS** | 30min | post-purchase credibility |
| 10 | **Collapse 3 severity enums → 1 canonical + delete 5 formatBRL implementations** | 1d | Friction #5 |

---

## Strategic recommendation

Vestigio's engineering is genuinely impressive. The product suffers from the classic symptom
of engineering-led B2B: the "power users" added to the roadmap by engineers are themselves
engineers, and the vocabulary drifts toward engine-speak. Hence "pack" is undefined,
`inference_key` appears in UI, `FALLBACK_INPUTS` runs silently.

**The single line that separates Vestigio from Crayon / Klue / Similarweb today:**
"queue of decisions with money in R$". The product is not making that promise stick — it's
burying it under a 12-column bento.

**Where to focus next:** the Competitive Intel pillar is mature. The next wave of leverage
is **product polish, not new features**. The 10 fixes above are ~9 eng days with brutal ROI
on paid retention.

Pre-PMF priority order: top 4 first (~4.5 eng days → +2.7 score).

---

## Methodology notes

Evaluation conducted via 11 parallel `code-reviewer` and `general-purpose` agents on
2026-06-04 against the `main` branch at commit `4a89df4f` (Wave 22.6 review fully closed,
Waves 23.1 + 24 + 25 + 26 + 27 + Tavily adapter shipped).

Each agent received:
- The same test-case framing (technical power user, fresh subscription, week 1-2)
- Either a specific analytical lens (churn, customer research, methodology, coherence,
  positioning) OR a specific product surface (Strategy Plan, Workspaces, Actions, Findings,
  Maps, Inventory)
- Multiple distinct purchase-intent hypotheses to trace through their assigned surface/lens
- Output format: file/line references + severity (P0/P1/P2) + score 0-10 + leverage fix

Findings were cross-checked: a friction tag is only listed in this roadmap if it appeared
in ≥2 independent agent reports.
