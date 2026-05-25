# Monthly Strategy Plan — Design Doc

> Last updated: 2026-05-25
> Status: Steps 1+2 shipped (schema + Library page); Step 3 is next
> Source: synthesized from a multi-turn strategic conversation about
> Vestigio's enterprise positioning, the "snapshot-vs-cumulative"
> retention tension, and the realization that the flagship enterprise
> feature isn't a new pack — it's a workflow integration play that
> turns Vestigio from "audit tool" into "audit + remediation
> orchestration platform."

## 0. Build state (kept current)

Updated as steps complete. The number-to-status mapping IS the
authoritative source of "where are we in the build" — if a future
session needs to resume, start by reading this section.

| Step | Status | Commit | Notes |
|---|---|---|---|
| Design doc | ✅ shipped | `cc0b1b3` | This file |
| 1 — Prisma schema + migration | ✅ shipped | `14a0a2e` | Applied to prod via db push |
| 2 — Library page revamp | ✅ shipped | `14a0a2e` | `/app/library` exists; sidenav "Maps" → "Library"; i18n keys added in all 4 dictionaries; `/api/library/strategy` lists plans by env |
| 3 — StrategyPlanPanel + visual mock | ⏳ next | — | **CHECKPOINT** for visual approval before any LLM code |
| 4 — Generator | pending | — | LLM orchestration over schema |
| 5 — Cron + first-month trigger | pending | — | Day-1 cron + post-first-audit hook |
| 6 — Re-narrative event triggers | pending | — | Conservative regen on high-signal events |
| 7 — Notification email | pending | — | Reuse `notification-templates.ts` infra |
| 8 — MCP read-only context loader | pending | — | Plan visible globally to MCP |
| 9 — MCP write (propose/approve) | pending | — | First time MCP gains write surface |
| 10 — Export endpoint | pending | — | Single-page-long PDF via chromium pool |

### Architectural decisions made AFTER doc creation (post-Step-2)

- **Library page is a SIMPLE composition, not an extracted-component refactor.** The existing `/app/maps/page.tsx` (`MapsGallery` + `MapCard`) was NOT extracted into shared components. Library page links to `/app/maps` for the full gallery; Plans section lives inline. If Step 3 needs the gallery components, extract then. Otherwise, leave the duplication — keeps Step 2 small and reviewable.
- **`/app/maps` continues to work as a direct URL** — no redirect from Maps → Library was added. Existing deep-links from external systems (chat bot responses, emails, bookmarks) keep working. Sidenav points only at Library.

---

## -1. Aesthetic standard (the visual quality bar)

This is the user-stated quality bar for the document. It's important
this survives compaction because the bar is the difference between
"another SaaS dashboard page" and "a flagship moment for the product."

User-stated standard (verbatim from the design conversation):

- "Topo de linha, algo que Miro, Notion, Figma faria, nesse nível"
- "Bonito, UI bem pensado e bonito"
- "Investimento altíssimo, não vamos poupar nisso" (specifically about dataviz)
- "O export tem que ser bonitinho, html" (not webpage-screenshot-to-PDF)
- "Editorial typography" — Fraunces serif for narrative; Satoshi sans for UI

What this means concretely:

1. **Typography rhythm IS the moat against "looks like every SaaS page".** Serif display + serif narrative + sans UI + mono numeric, with line-heights 1.6-1.7 in narrative blocks. If a design choice doesn't respect that rhythm, it fails the standard.
2. **No "out-of-the-box" chart libraries that converge to a Recharts look.** visx is locked in. Custom inline SVG for bespoke shapes (timeline, sequence flow).
3. **Spacing is generous.** Hero metrics get room. Narrative paragraphs have max-width ~640px for readability, not stretched edge-to-edge.
4. **Animations are subtle but consistent.** Framer Motion staggered entrance on scroll. No flashy / playful — editorial calm.
5. **Print/PDF must match the screen quality.** Single-page-long PDF. Print stylesheet expands collapsibles, removes hover states, otherwise visually identical.

If a future implementation step feels like it's "good enough" but not at this bar, push back and revise.

---

## -2. Architectural discipline (extend, not invent)

This was a core lesson from the design conversation that the user
pushed back on repeatedly until it crystallized. It applies to all
future Plan work AND informs how to extend the engine in general.

**The rule:** when adding a new capability, default to extending
existing top-level concepts with metadata + generators, NOT to
inventing new top-level concepts.

**Examples this design follows:**

- "Strategic Brief" output is NOT a new pack — it's a new `Action.category` value ('strategic_brief'). Same Action table, new discriminator.
- "Customer Journey Coherence" findings are NOT a new finding type — they're regular Findings with `generator='ai_synthesis'` and `surface_kind='mixed'`. Same Finding table, new metadata.
- "AI-generated content" is NOT a new entity — it's a `generator` field on PlanEdit (`'cron'|'mcp'|'user'`) and Finding/Action when those start receiving LLM emissions.

**Where this lesson came from:** earlier iterations of the strategic
conversation kept proposing "flagship enterprise packs" (Strategic
Position Pack, Customer Journey Coherence Pack, Multi-brand Holding
Pack). The user pointed out that under critical analysis these were
all EXTENSIONS of existing concepts. The realization led to the
conclusion that **flagship enterprise features at the engine layer
mostly don't exist** — the enterprise moat is narrative + depth +
workflow integration + compliance, not new top-level features.

**Why this matters for the Plan:** when implementation surprises come
up ("this feels like it needs its own table" / "should this be a new
pack?"), the answer is usually "no, it's a `generator` discriminator
or a category field on an existing table." Default to extension.

---

## -3. Why this exists (strategic framing)

To survive compaction: this is the SHORT answer to "why are we building
this." When future work feels expensive or unclear, this is the test
to apply.

**The problem the Plan solves:** Vestigio's discovery moment is the
first-audit reveal — "we found 47 things you didn't know." That moment
is high-leverage for acquisition but ANTI-leverage for retention.
Sophisticated customers can pay 1 month, export findings, cancel, and
work through them at their own pace. The continuous audit, trend
detection, and chronic-pattern surfacing remain valuable but are NOT
sufficient retention friction on their own.

**The Plan's job is workflow lock-in + cumulative value visibility.**

- **Workflow lock-in:** the Plan becomes the place where the operator's
  team coordinates work. Comments, assignments, status changes, MCP
  collaboration — once that lives in Vestigio, switching means losing
  the institutional record of decisions and progress. This is the same
  retention model Jira / Linear / Notion use.
- **Cumulative value visibility:** each month the Plan demonstrates
  that the product gets BETTER as the customer stays. Findings become
  more specific to them (after Stripe / behavioral / Meta CSV data
  enters the engine). Memory rollups show the progress. Value-preview
  timeline shows what's coming.

**The Plan is THE answer to "why pay month 4 of Vestigio when month 1
already told me what's broken?"** Without it, retention is feature
luck. With it, retention is structural.

This framing should drive priority decisions: any feature that
strengthens workflow lock-in OR makes cumulative value more visible
ranks above one that just adds more findings.

---

---

## 1. Vision

The Monthly Strategy Plan ("**Plano de Estratégia**") is a long-form,
interactive document generated monthly per environment. It is the
**core deliverable** of Vestigio Pulse — the place where every other
artifact converges into a prescriptive narrative the operator acts on.

It exists to solve the "snapshot-cancel" churn risk: customers who buy
Vestigio for the discovery moment ("show me what's broken") and then
cancel after exporting findings. The Plan creates **workflow lock-in**
+ **cumulative value visibility** so subscription retention is a
function of accrued strategic context, not just monthly novel findings.

### The cumulative value promise

The Plan is the surface that makes this promise concrete to the operator:

- **Month 1:** you see your revenue exposure by surface (what we found)
- **Month 3:** Stripe + behavioral data inside the engine make findings ~40% more specific to you
- **Month 6:** you begin receiving category benchmarks (cross-customer comparison)
- **Month 12:** the recommender has enough history to predict regressions before they surface

Without the Plan, this narrative is implicit. With it, the operator sees
their position on the trajectory every month.

---

## 2. Mental model

**Vestigio Pulse** is the umbrella concept (existing brand) for
Vestigio's strategic/narrative outputs. The Monthly Strategy Plan is
the primary artifact under Pulse.

**Library** is the side-nav home for long-form artifacts:
- Maps (revenue leakage, chargeback risk, root cause, user journey, custom maps — already exist)
- Plano de Estratégia (monthly, this doc)
- Future docs (M&A reports, regulatory submissions when those ship)

The side-nav item currently labeled "Maps" is renamed to **"Library"**.
Maps continue to be accessible from within workspaces that reference
them (no change there). The Library page (`/app/library`) becomes the
gallery of all long-form artifacts the env has accumulated.

### Plan access pattern

The Plan does NOT get its own side-nav item.

Two entry points:
1. **From `/app/library`** — listed alongside Maps + future docs.
2. **From `/app/actions`** — a destacated horizontal strip near the top
   of the page advertises the current month's plan, with a CTA that
   opens the plan in a full-screen panel overlay (same UX pattern as
   the copilot panel opens in full-screen mode).

The full-screen panel keeps the URL on `/app/actions` with a state
parameter (e.g. `?plan=2026-06`), so closing returns the operator to
the actions view they were on.

---

## 3. Document structure (final)

Reading order top-to-bottom. Each section is independently
regeneratable (LLM cost amortized across sections; partial regen on
events). Section IDs in brackets are used by the MCP / RBAC / edit-log
systems.

### `[header]` Title + meta
- Display: **Plano de Estratégia · Junho 2026** (Fraunces serif 56px)
- Sub: env domain · cycle # · generated timestamp · revision (e.g. "revisão semanal")

### `[hero-metrics]` 4 metric tiles
Generous spacing, sparkline trail per tile.
- R$ retido/mo (with MoM delta)
- R$ capturado/mo (with MoM delta)
- # findings críticos abertos (with MoM delta)
- # actions em progresso (with MoM delta)

Source: deterministic SQL aggregations (no LLM).

### `[buyer-segments]` "O que sua audit revelou este mês"
Decomposed by buyer/owner. Each segment is a card:
- Para o time de copy — N fixes triviais · R$ X
- Para o time de engenharia — N fixes médios · R$ Y
- Para liderança — N decisões · R$ Z de upside

Source: deterministic grouping of findings by INFERENCE_TO_PACK + ownership heuristic (no LLM).

The ownership heuristic maps:
- `copy_alignment`, `discoverability`, `content_freshness`, `first_impression_revenue` → copy team
- `scale_readiness`, `revenue_integrity`, `friction_tax`, `path_efficiency`, `mobile_revenue_exposure`, `money_moment_exposure`, `acquisition_integrity` → engineering team
- `saas_growth_readiness`, `funnel_journey`, `trust_revenue_gap`, `brand_integrity`, `action_value_map`, `channel_integrity` → leadership / strategy

### `[narrative-what-happened]` "O que aconteceu em [mês]"
Editorial paragraph(s) generated by LLM. Style: Fraunces 17px, line-height 1.7, max-width ~640px (long-form reading).

Source: **Sonnet 4.6** call. The single most narrative-quality-dependent section.

Prompts pull in:
- Findings resolved this month (with impact)
- Findings introduced this month (especially critical)
- Chronic findings detected
- Regression chains (multiple regressions in same cycle)
- Cross-source signals (Stripe MRR delta, Meta CSV trend, behavioral conversion shift)
- Deploy/probe events that correlate with finding changes

The LLM is instructed to ground every claim in cited evidence. Citations
render as small superscript links to the underlying finding/event in the
plan UI.

### `[next-step]` "Próximo passo — atacar nesta ordem"

**This is the core prescriptive section** — narrative + checklist
merged into one composite block (the user's explicit framing). Each
step is a structured object:

```ts
type NextStep = {
  order: number;                          // 1, 2, 3...
  title: string;                          // "Resolver fricção do mobile checkout"
  linkedActionRefs: string[];             // pointers to Action table
  combinedImpact: {                       // sum of linked actions
    min: number;
    max: number;
    midpoint: number;
  };
  reasoning: string;                      // Markdown, LLM-generated
                                          // "POR QUE PRIMEIRO" explanation
                                          // citing evidence numerically
  procedureSteps: string[];               // 3-5 concrete steps
                                          // ("Reproduzir no Chrome DevTools mobile",
                                          //  "Checkar git log do deploy 12/maio", etc)
  researchRefs: Array<{                   // External references
    title: string;
    url?: string;
  }>;
  estimatedEffort: string;                // "1-2 dias dev" — qualitative
  suggestedOwner: string;                 // "time eng" / "copywriter" / "head of growth"
  status: 'todo' | 'in_progress' |        // Checklist state (member-editable)
          'in_review' | 'done' | 'blocked';
  assigneeUserId: string | null;          // FK to User (member-assignable)
  dueAt: Date | null;                     // Member-editable
  commentsCount: number;                  // Cached count of comments thread
};
```

Top 3 expanded by default; +2 collapsed under "ver mais" (max 5 total).
More than 5 steps makes the plan overwhelming.

The checklist UX is **merged into this section**: each step has
- Checkbox to mark done (member action, optimistic UI)
- Click step card → opens drawer with full action details
- Comment count visible inline ([✉ 2 comments])

Source: **Haiku 4.5** for reasoning generation per step (5 calls × small
prompt). The procedure + research refs come from a hybrid of:
- The action's `remediation_steps` from REMEDIATION_CATALOG (deterministic)
- LLM-suggested research links based on the finding category

### `[value-preview]` "O que você ganha continuando"
Horizontal timeline visualization with 4 markers (now, M3, M6, M12).
Each marker shows what unlocks at that point based on env state:
- Are integrations connected (Stripe / Meta / Shopify)?
- How many cycles of history exist?
- Is cross-customer benchmark available for this category yet?

Narrative below the timeline: 1 short paragraph generated by Haiku that
personalizes the next-milestone callout ("você tá há 2 meses; em 1 mês
você passa a ver X").

Source: deterministic timeline computation + 1 Haiku call (~$0.001).

### `[memory]` "Memória — meses anteriores"
NOT a flat list of months. Rollup summaries at 4 windows:
- **Último mês:** detailed (N actions, R$ recovered, top 2 categories)
- **Últimos 3 meses:** aggregate (N actions, R$ total, top categories)
- **Últimos 6 meses:** aggregate + biggest single win
- **Últimos 12 meses:** year overview + percentile vs category benchmark (when available)

Each rollup is a card. Expandable on click to reveal more detail.

Source: deterministic SQL aggregations over `Finding` + `Action` +
`MonthlyStrategyPlan` history (no LLM).

---

## 4. Data model (Prisma)

### New models

```prisma
model MonthlyStrategyPlan {
  id              String   @id @default(cuid())
  environmentId   String
  month           String   // 'YYYY-MM' format, e.g. '2026-06'
  locale          String   // 'pt-BR' | 'en' | 'es' | 'de'

  // Lifecycle
  generatedAt     DateTime @default(now())  // First generation
  lastRegenerated DateTime @default(now())  // Latest partial/full regen
  status          String   @default("generating")
                  // 'generating' | 'ready' | 'editing' | 'archived'

  // Structured data (deterministic sections)
  heroMetricsJson      Json   // { retainedMid, capturedMid, criticalCount, inProgressCount, deltas }
  buyerSegmentsJson    Json   // [{ buyer, count, impactRange }, ...]
  memoryRollupsJson    Json   // { 1m: {...}, 3m: {...}, 6m: {...}, 12m: {...} }
  valuePreviewJson     Json   // { currentMonth, milestoneM3, milestoneM6, milestoneM12 }

  // LLM-generated sections (markdown stored as text)
  narrativeWhatHappened String  @db.Text
  valuePreviewNarrative String  @db.Text

  // Generation cost telemetry
  llmCostCents          Int     @default(0)  // cumulative across regens
  llmCallsCount         Int     @default(0)

  // Soft lock for export + edit serialization
  exportLockedUntil     DateTime?    // null when not exporting
  editLockedByMcpUntil  DateTime?    // null when no MCP edit pending

  environment  Environment   @relation(fields: [environmentId], references: [id], onDelete: Cascade)
  nextSteps    PlanNextStep[]
  comments     PlanComment[]
  edits        PlanEdit[]
  versions     PlanVersion[]

  @@unique([environmentId, month])
  @@index([environmentId, status])
  @@index([environmentId, generatedAt])
}

model PlanNextStep {
  id              String   @id @default(cuid())
  planId          String
  order           Int      // 1-5
  title           String
  reasoning       String   @db.Text          // Markdown
  procedureStepsJson Json                    // string[]
  researchRefsJson Json                      // {title,url?}[]
  estimatedEffort String                     // qualitative
  suggestedOwner  String
  linkedActionRefsJson Json                  // string[] of Action ids

  // Member-editable state (RBAC: members allowed)
  status          String   @default("todo")
                  // 'todo' | 'in_progress' | 'in_review' | 'done' | 'blocked'
  assigneeUserId  String?
  dueAt           DateTime?
  doneAt          DateTime?

  plan         MonthlyStrategyPlan @relation(fields: [planId], references: [id], onDelete: Cascade)
  assignee     User?               @relation("PlanNextStepAssignee", fields: [assigneeUserId], references: [id])

  @@index([planId, order])
  @@index([assigneeUserId, status])
}

model PlanComment {
  id          String   @id @default(cuid())
  planId      String
  sectionId   String   // 'header' | 'hero-metrics' | 'buyer-segments' |
                       // 'narrative-what-happened' | 'next-step:<step-id>' |
                       // 'value-preview' | 'memory'
  authorId    String?  // null when author is MCP
  authorKind  String   // 'user' | 'mcp'
  body        String   @db.Text  // markdown, supports @vestigio mentions
  createdAt   DateTime @default(now())
  editedAt    DateTime?
  deletedAt   DateTime?    // soft delete

  plan        MonthlyStrategyPlan @relation(fields: [planId], references: [id], onDelete: Cascade)
  author      User?              @relation("PlanCommentAuthor", fields: [authorId], references: [id])

  @@index([planId, sectionId, createdAt])
}

model PlanEdit {
  id           String   @id @default(cuid())
  planId       String
  sectionId    String   // same vocabulary as PlanComment
  editorKind   String   // 'cron' | 'mcp' | 'user'
  editorUserId String?  // null when cron or MCP
  beforeText   String   @db.Text  // snapshot before
  afterText    String   @db.Text  // snapshot after
  reason       String?  @db.Text  // optional rationale (mainly for MCP edits)
  proposedAt   DateTime @default(now())
  approvedAt   DateTime?            // null when pending; set when approved by admin
  approvedByUserId String?
  rejectedAt   DateTime?
  rejectedByUserId String?

  plan          MonthlyStrategyPlan @relation(fields: [planId], references: [id], onDelete: Cascade)
  editorUser    User?              @relation("PlanEditEditor", fields: [editorUserId], references: [id])
  approvedBy    User?              @relation("PlanEditApprover", fields: [approvedByUserId], references: [id])

  @@index([planId, sectionId, proposedAt])
  @@index([planId, approvedAt])
}

model PlanVersion {
  id          String   @id @default(cuid())
  planId      String
  versionNum  Int      // monotonic 1, 2, 3...
  snapshotJson Json    // full plan snapshot for auditing
  createdAt   DateTime @default(now())
  createdByKind String  // 'cron' | 'mcp' | 'user_approval'

  plan        MonthlyStrategyPlan @relation(fields: [planId], references: [id], onDelete: Cascade)

  @@unique([planId, versionNum])
  @@index([planId, createdAt])
}
```

### Relation additions to User

```prisma
// Add to User model:
planStepsAssigned  PlanNextStep[] @relation("PlanNextStepAssignee")
planComments       PlanComment[]  @relation("PlanCommentAuthor")
planEditsProposed  PlanEdit[]     @relation("PlanEditEditor")
planEditsApproved  PlanEdit[]     @relation("PlanEditApprover")
```

### Relation additions to Environment

```prisma
// Add to Environment model:
strategyPlans      MonthlyStrategyPlan[]
```

---

## 5. Generation policy

### When to generate

**Initial generation (per env, per month):**
- For an env that ALREADY has past cycles: cron fires on the 1st of every month at ~00:30 UTC (leader-elected like the value-caught cron in `src/libs/value-caught-monthly.ts`)
- For an env that's brand new (first audit just completed): generate IMMEDIATELY after the first complete cycle, regardless of date. This is the first-month onboarding moment.

**Trigger condition for first-month:**
```ts
// In run-cycle.ts post-completion hook:
if (cycle.status === 'complete' &&
    !await prisma.monthlyStrategyPlan.findFirst({ where: { environmentId: env.id } })) {
  await generateInitialPlan(env, cycle);
}
```

### Re-narrative events (mid-month partial regeneration)

Conservative trigger list — only high-signal events regenerate narrative. **NOT every change.**

| Event | What regenerates |
|---|---|
| Action with `severity=critical` and impact > R$ 5k marked `done` | `narrative-what-happened` + `next-step` |
| New finding with `severity=critical` introduced (from targeted re-audit OR full cycle) | `narrative-what-happened` |
| Chronic finding detected (came back 3rd+ time) | `narrative-what-happened` + adds visual marker on memory section |
| Regression chain detected (3+ regressions in same cycle) | `narrative-what-happened` + `next-step` |
| Major surface change detected (probe diff above similarity threshold) | `narrative-what-happened` |

**Cap:** max 4 partial regenerations per env per month. Subsequent
events still update structured data (checkbox state, metrics) but
don't regenerate narrative.

### Cost model

| Item | LLM | Tokens (in + out) | Cost |
|---|---|---|---|
| Initial generation — `narrative-what-happened` | Sonnet 4.6 | ~600 + 400 (w/ prompt caching) | ~$0.015 |
| Initial generation — `next-step` reasoning × 5 steps | Haiku 4.5 | ~400 + 300 per step | ~$0.010 |
| Initial generation — sequence inter-step rationale | Haiku 4.5 | ~300 + 200 | ~$0.002 |
| Initial generation — `value-preview-narrative` | Haiku 4.5 | ~200 + 150 | ~$0.001 |
| **Subtotal initial** | | | **~$0.028** |
| Re-narrative event (avg) | Haiku 4.5 + maybe Sonnet | partial regen | ~$0.013 |
| 4 re-narrative cap × $0.013 | | | ~$0.052 |
| **Total per env per month** | | | **~$0.08** |

**Prompt caching:** the static "context preamble" (env profile, packs
catalog, INFERENCE_TO_PACK map, etc) is cached at the Anthropic level
across calls within a session — gets billed at 0.1× input rate. The
caching is enabled when input > 1024 tokens, which our prompts hit.

### Sustainability check

| Tier | Customers | Monthly LLM cost |
|---|---|---|
| 1 paying customer (havefunnels) | 1 | $0.08 |
| 100 Max-tier customers | 100 | $8 |
| 1000 customers (mixed tiers) | 1000 | ~$80 |

LLM cost is **never** the limiting factor for this feature. Engineering
cost is.

---

## 6. MCP integration

### Visibility (transversal context loading)

The MCP server's context loader (`apps/mcp/...`) gets a new tool:
- `get_strategy_plan({ month?: string })` — loads the plan for the
  current month (or specified month) into context. Returns the
  structured plan + active section IDs + counts.

**The context loader auto-includes the current month's plan in every MCP
session** — not only when the user is on `/app/library/strategy`.
Rationale: when a user is on `/app/findings` and discusses a finding,
the LLM should know "is this finding covered in the current Strategy
Plan?" to answer well. The plan is universal context.

Implementation: extend `ensureContext` in `mcp-client.ts` to load the
current plan alongside findings/actions when bootstrapping context.

### Plan-aware behaviors the LLM should exhibit

Hardcoded in the system prompt + driven by the loaded plan context:

1. **When user discusses a finding** — check if any `nextStep`'s
   `linkedActionRefs` cover this finding. If yes, mention that the
   finding is part of "Próximo passo #N do Plano de Junho." If no, the
   answer is just the finding analysis.

2. **When user asks "what should I do next"** — refer them to the plan
   directly. "Seu Plano de Estratégia de Junho tem 3 próximos passos
   priorizados. O #1 é [X], começa pelo time de eng. Quer que eu abra
   o plano pra você?"

3. **When user explicitly invokes `@vestigio` in a comment** — the MCP
   replies inline in the same thread. Response is contextual to the
   section the comment is attached to.

### Write capability — propose / approve flow

New MCP tools:
- `propose_plan_edit({ planId, sectionId, newContent, reason })` — creates a `PlanEdit` row with `proposedAt` set but `approvedAt` null. Does NOT mutate the plan. UI shows the proposed edit inline as a "MCP sugere mudar isso pra X. Aceitar?" affordance.
- `add_plan_comment({ planId, sectionId, body })` — MCP is the author. Visible to everyone (Notion-style). Tagged with `authorKind='mcp'`.

The approval flow:
- Member sees the proposed edit visually inline in the plan
- **Admin (only)** can click "Aprovar" to apply, "Recusar" to discard
- On approve: `afterText` replaces the section content, `PlanVersion` snapshot created, `approvedAt` + `approvedByUserId` set
- On reject: `rejectedAt` + `rejectedByUserId` set, edit archived (visible in audit log)

**Serialization lock:** while a `PlanEdit` is pending (approvedAt null AND rejectedAt null) for a given `sectionId`, the section's content is `editLockedByMcpUntil` flagged. Other MCP proposals on the same section queue behind (or get rejected). Members can still mark checkboxes / add comments — those don't conflict.

### Member-vs-admin edit rights (RBAC)

| Action | Member | Admin |
|---|---|---|
| Toggle next-step checkbox (status field) | ✅ | ✅ |
| Assign next-step (assigneeUserId) | ✅ | ✅ |
| Set due date (dueAt) | ✅ | ✅ |
| Add comment (any section) | ✅ | ✅ |
| Edit own comment | ✅ | ✅ |
| Edit other's comment | ❌ | ✅ |
| Delete comment | ✅ (own) | ✅ (any) |
| Approve / reject MCP edit | ❌ | ✅ |
| Manually edit narrative text | ❌ | ✅ |
| Archive plan | ❌ | ✅ |

---

## 7. Notification

**Monthly cron-triggered email** when a new plan is ready:
- Subject: `"Seu Plano de Estratégia de Junho está pronto."` (locale-aware month name; "Vestigio" is the sender, not the subject prefix)
- Re-use the `notification-templates.ts` engine (the `value_caught_monthly` template pattern)
- Includes: 3 hero metrics, top next-step preview, CTA "Abrir plano" → deep link to `/app/library/strategy/2026-06`
- Locale: matches the receiving user's locale

**Opt-out:** falls under the existing `alertOnDigest` NotificationPreference. Default: enabled (sticky with the value-caught preference).

**First-month special case:** when a plan is generated immediately after first audit (not on day 1), the email subject is `"Sua primeira análise terminou. Plano de Estratégia pronto."` and the body includes onboarding language about what to expect next month.

---

## 8. Export — HTML→PDF, single-page long

**Format:** single-page long PDF (one page that's as tall as the entire
plan; no multi-page breaks). NOT a screenshot of a webpage; a properly
typeset HTML rendered through headless Chromium.

**Implementation:**

1. New route: `/app/library/strategy/[month]/export` (auth-gated, owner-or-member)
2. Route returns a print-friendly HTML view of the plan. Print mode differs from interactive:
   - No sticky header
   - All collapsibles expanded
   - No hover states (CSS `@media print`)
   - Font sizes slightly tightened for paper density
3. API endpoint: `POST /api/library/strategy/[month]/export`
   - Uses existing chromium pool from `workers/verification/chromium-pool.ts`
   - Launches a fresh page, navigates to `/app/library/strategy/[month]/export?print=true`
   - Computes content height: `await page.evaluate(() => document.body.scrollHeight)`
   - Generates PDF: `await page.pdf({ width: '210mm', height: '<computed>px', printBackground: true, preferCSSPageSize: false })`
   - Returns the PDF blob as download

**Locking during export:**
- While export is in progress, `MonthlyStrategyPlan.exportLockedUntil` is set ~30s in the future
- The export endpoint refuses to start a new export if the field is in the future (returns 423 Locked)
- The plan UI shows "Exportando…" state and disables the export button

**File size:** ~500KB-1MB depending on dataviz density + embedded fonts.

---

## 9. Dataviz approach

Investment: high quality, not economized.

| Viz | Library | Rationale |
|---|---|---|
| Hero metric sparklines (small inline) | Custom inline SVG | Already the codebase standard; lightweight |
| Buyer segmentation chart (donut + bars) | **visx (Airbnb)** | Custom-stylable beyond Recharts; matches editorial typography |
| Memory rollup bars (1m/3m/6m/12m) | visx | Same |
| Value preview timeline | Custom SVG | Bespoke shape; tooltip via Radix |
| Next-step sequence flow (arrow connectors) | Custom SVG | Bespoke |
| Status badges, severity dots | shadcn primitives | Standard |

**New dependencies:**
```
@visx/group, @visx/scale, @visx/shape, @visx/axis, @visx/tooltip, @visx/event
@radix-ui/react-accordion, @radix-ui/react-collapsible, @radix-ui/react-dialog,
@radix-ui/react-scroll-area, @radix-ui/react-tabs, @radix-ui/react-progress,
@radix-ui/react-separator, @radix-ui/react-tooltip
```

Total bundle add: ~150KB minified. Acceptable for a flagship document
view.

### Typography

Add **Fraunces** via `next/font/google` as the variable display font.
Used for:
- Display headline (`Plano de Estratégia · Junho 2026`) — Fraunces 700, 56px
- Narrative paragraphs (`narrative-what-happened`, step `reasoning`,
  `value-preview-narrative`) — Fraunces 400, 17px, line-height 1.7

Existing Satoshi continues for UI labels, metrics, checklist items.
JetBrains Mono continues for monetary values + timestamps.

### Animation

Framer Motion (already installed):
- Staggered fade-in on scroll (IntersectionObserver + Framer)
- Hover lift on cards (translateY -2px + shadow)
- Checkbox check via SVG path draw
- Drawer slide-from-right + backdrop fade

---

## 10. Implementation sequence

Ordered to ship a usable v1 incrementally. Each step independently
mergeable + testable.

### Step 1 — Prisma schema + migration (1 day)

- Add 4 new models above (`MonthlyStrategyPlan`, `PlanNextStep`, `PlanComment`, `PlanEdit`, `PlanVersion`)
- Relation additions to `User` and `Environment`
- Migration with safe defaults (no breaking changes to existing tables)
- Run `prisma db push` on prod via existing build pipeline (Dockerfile already has `--accept-data-loss`)

### Step 2 — Library page revamp (1 day)

- Rename sidenav item `Maps` → `Library` (i18n keys in dictionary/* files)
- New route `/app/library` listing artifacts (Maps existing + Plans empty for now)
- Old `/app/maps` route → 301 redirect to `/app/library`
- Maps continue accessible inside workspaces (no change there)

### Step 3 — Plan component skeleton + mock data (3-5 days)

Most front-loaded UX work; everything visual lives here.

- Component `<StrategyPlanPanel>` rendering the full document layout
- Full-screen panel mount pattern in `/app/actions` (strip above table + panel overlay)
- All sections rendered with mock data (hard-coded JSON) so user can review layout before generator works
- Fraunces font integration via `next/font/google`
- visx charts wired with mock data
- Framer Motion staggered entrance
- Radix Accordion / Collapsible / Tabs for interactivity
- Skeleton states + empty states

**Checkpoint:** user reviews the mock document end-to-end and approves
layout before any LLM code is written.

### Step 4 — Generator (3-4 days)

- `packages/strategy-plan/generator.ts` — entry point + section orchestration
- Sub-generators per section:
  - `generateHeroMetrics(envId, month)` — pure SQL
  - `generateBuyerSegments(envId, month)` — pure logic over findings
  - `generateNarrativeWhatHappened(envId, month)` — Sonnet 4.6
  - `generateNextSteps(envId, month)` — 5 Haiku calls + remediation catalog lookup
  - `generateValuePreview(envId, month)` — Haiku
  - `generateMemoryRollups(envId, month)` — pure SQL
- Prompt caching enabled for shared context preamble
- Telemetry: track `llmCostCents` + `llmCallsCount` per plan

### Step 5 — Cron + first-month trigger (1-2 days)

- Monthly cron at day 1 ~00:30 UTC, leader-elected, generates plans for all eligible envs
- First-month trigger hooked into `run-cycle.ts` post-completion (only when no prior plan exists for env)
- Failure handling: retry once on transient error; log to NotificationLog on permanent failure

### Step 6 — Re-narrative event triggers (2 days)

- Hook points in `run-cycle.ts` + `apps/audit-runner/run-cycle.ts`:
  - Action lifecycle change (in the `userAction` flow) — detect critical resolve
  - Cycle completion — detect new criticals, chronic, regression chain
  - Probe cron — detect major surface change
- Each trigger fires a (cost-capped) partial regeneration

### Step 7 — Notification (0.5 day)

- New email template `strategy_plan_monthly` in `notification-templates.ts`
- Locale-aware (pt-BR, en, es, de)
- Triggered by the day-1 cron AND by the first-month-trigger

### Step 8 — MCP integration — read-only (1-2 days)

- New MCP tool: `get_strategy_plan`
- Context loader auto-includes current plan in every session
- System prompt updates: plan-aware behaviors enumerated above
- @vestigio mention parser in comments (post-MVP — initial version doesn't yet allow MCP to reply, only read)

### Step 9 — MCP write — propose/approve/comment (3 days)

- New MCP tools: `propose_plan_edit`, `add_plan_comment`
- UI inline for proposed edits (admin-only approval)
- Edit serialization lock
- PlanVersion snapshot on approval

### Step 10 — Export endpoint (1-2 days)

- `/app/library/strategy/[month]/export` route (print-friendly view)
- `POST /api/library/strategy/[month]/export` using chromium pool
- Single-page-long PDF via dynamic height
- Export lock semantics

### Total: ~3-4 weeks for v1

Each step is independently reviewable. The user can sign off after Step
3 (visual layout) before any expensive LLM/generator work. Step 4+ is
"productionize the data side"; Step 8-9 is MCP integration; Step 10
is export.

---

## 11. Decisions log (locked)

These were decided across the strategic conversation that produced this
doc. Re-opening any of these requires explicit re-discussion.

| # | Decision | Rationale |
|---|---|---|
| 1 | "Próximo passo" merges narrative + checklist into one composite section | User's explicit framing: "núcleo descritivo + checklist" |
| 2 | Plan lives in `/app/library` with full-screen panel access from `/app/actions` strip | No new sidenav item; reuses existing Maps → Library rename |
| 3 | MCP context loader includes plan globally (transversal) | When user discusses a finding in chat, MCP needs to know if it's in the plan |
| 4 | @vestigio in comments invokes MCP inline | User-confirmed mechanic |
| 5 | Cost target ~$0.10/env/month | Achieved via Haiku-for-most + Sonnet only for primary narrative + prompt caching |
| 6 | Single-page long PDF, not multi-page screenshot | User clarified: HTML→PDF, not webpage→PDF |
| 7 | Versionamento of edits via PlanVersion model | Audit + rollback needed when MCP edits accumulate |
| 8 | Members can edit checkbox + comments; admins approve MCP edits | User-confirmed RBAC split |
| 9 | First-month plan generates after first full audit completes (not day 1) | Onboarding moment value |
| 10 | Locale follows org locale | pt-BR / en / es / de via existing notification-templates infra |
| 11 | Memory = aggregated rollups at 1m/3m/6m/12m (not flat list) | More signal-dense than 12-row list |
| 12 | Lock export while generating, lock approve while MCP editing | Serialization to prevent races |
| 13 | Dataviz investment is high — use visx + Fraunces serif + Framer | "Não vamos poupar nisso" (user) |
| 14 | Comments visible to entire team (Notion-style) | User-confirmed (no per-user privacy default) |
| 15 | Email subject: "Seu Plano de Estratégia de [mês] está pronto." | Vestigio is sender; no [Vestigio] prefix |
| 16 | Conservative regen triggers (4 cap/month, high-signal events only) | Cost control + avoiding noise |

---

## 12. What this doc does NOT cover

These are intentionally out of scope for v1, listed so future iterations
don't re-derive them.

- **MCP write-mode for arbitrary mutations beyond the plan.** This feature
  introduces MCP write for the FIRST time, scoped exclusively to plan
  edits. Generalizing MCP write to actions, findings, integrations, etc.
  is a separate wave with its own design.
- **Multi-env aggregation** (one plan covering 3+ envs). Hard to design
  meaningfully — defer until multi-brand holding posture work (Wave 26
  multi-brand section).
- **Plan templates per industry** (e-commerce template vs SaaS B2B template). Useful but premature without 50+ customers to calibrate against.
- **Live collaborative editing** (multiple users editing simultaneously). Plan
  edits are admin-only and serialized; live collab isn't needed yet.
- **PDF email attachment** (auto-attach the PDF in the monthly email). The
  email contains a deep-link; if customer wants PDF they click Export
  from the panel. Saves email-size + auto-export-on-cron costs.
- **Cross-customer benchmarks integrated into Memory rollups.** Waits for
  Wave 30+ benchmark pipeline maturity.

---

## 13. Open questions resolved during conversation

For audit trail (compaction-safe — these matter when re-reading this doc
months later):

- **Why not a Notion-style editor (TipTap / Lexical / BlockNote)?** The
  plan is presented, not editable freely. An editor adds ~150KB and
  complexity for zero value-add.
- **Why visx and not Recharts?** Custom-stylability matters at this UX
  bar. Recharts converges to "every SaaS chart." visx is d3 primitives
  + React, lets us match the editorial typography.
- **Why Fraunces and not Newsreader / IBM Plex Serif?** Modern OpenType
  features, variable font (single weight ships), legible at 17px body.
  Choice is subjective; this is the locked choice unless aesthetic
  review changes it.
- **Why not a new "Pulse" sidenav item?** Vestigio Pulse is the
  product-vocabulary umbrella, not a navigation node. Plan lives under
  Library; future Pulse-branded artifacts go there too.
- **Why is "Próximo passo" merged with checklist?** User decided
  explicitly that the checklist isn't a separate section — it IS the
  checklist version of the next-steps, with status fields on each step.
