# UX Surfaces — Vestigio V2

## Philosophy

Vestigio is not a dashboard.

It is a **decision system** with an **operating layer**.

The UI must:

- prioritize operational decisions over raw data
- expose risk and revenue clearly through categorized actions
- allow deep inspection without friction
- surface change between cycles and verification lifecycle explicitly
- scale to multiple analysis types without navigation explosion

---

## Core Interaction Model

All surfaces follow the same pattern:

1. Table (or list) with category tabs and filters
2. Row click
3. Side drawer with full context, verification state, and change badges

This pattern must be consistent across:

- Actions (primary surface)
- Analysis
- Workspaces

---

## Navigation Structure

Sidebar order (top to bottom):

1. **Actions** → `/app/actions` (default landing page)
2. **Workspaces** → `/app/workspaces`
3. **Chat** → `/app/chat`
4. **Analysis** (expandable) → Findings (`/app/analysis`) + Inventory (`/app/inventory`)
5. **Maps** → `/app/maps`

**Default landing**: `/app/actions` (not `/app/analysis`)


---

## 1. Onboard

### Goal

- Minimize time-to-value
- Collect business context
- Initialize first analysis

---

### Steps

#### Step 1 — Domain

- Input domain
- Basic validation
- Platform detection (auto)

---

#### Step 2 — Business Context

- Business type:
  - Ecommerce or Digital Store
  - Digital Download
  - Lead Gen
  - SaaS

- Metrics:
  - monthly revenue
  - average ticket
  - chargeback % (optional) - Depending on Business Type
  - churn % (if applicable) -  Depending on Business Type

---

#### Step 3 — Conversion Model

- checkout
- whatsapp, SMS, E-mail
- form
- external

---

#### Step 4 — Pixel (Optional)

- snippet
- explanation:
  - Enrichment and Real user Behavior
  - Optional, but Ideal

---

#### Step 5 — Create First Workspace

Automatically create:
Workspace:
name: "Preflight"
type: preflight
scope: full domain + Inferred Journey


---

## 2. Chat

### Purpose

Cognitive interface for decision-making with change awareness.

---

### Layout

#### Left Panel (ConversationSidebar)
- conversation history with date grouping
- hover delete, active highlight
- collapsible on desktop

#### Main Panel
- chat stream with rich content blocks
- navigation CTA blocks (buttons linking to Actions, Maps, Analysis, Workspaces)
- change report awareness: chat can surface what changed between cycles

#### Model Selector
- compact pill dropdown: Default (Sonnet) / Ultra (Opus)
- plan gating and cost badge (Default = 1 unit, Ultra = 3 units)

---

### Content Blocks

Chat responses are composed of typed content blocks:

- `markdown` — formatted text
- `tool_call` — spinner/checkmark with label and expandable result
- `finding_card` — inline finding with severity, impact, pack
- `action_card` — inline action with priority, savings estimate
- `impact_summary` — revenue impact visualization
- `confidence` — confidence badge
- `navigation_cta` — buttons to navigate to other surfaces (Actions, Maps, etc.)
- `suggested_prompts` — clickable follow-up question pills, including change-related prompts
- `quote` — blockquote with source
- `data_rows` — key-value table with severity badges
- `create_action` — editable form to save as action

### Suggested Prompts for Changes

When a change report is available, chat surfaces prompts like:

- "What regressed since last cycle?"
- "Show me resolved issues"
- "What new incidents appeared?"

---

### Capabilities

- answer business questions:
  - "can I scale traffic?"
  - "where am I losing money?"
  - "what changed since last cycle?"

- explain decisions
- trigger verification
- create workspaces
- surface change reports between cycles
- navigate user to relevant surfaces via CTA blocks

---

## 3. Actions (Primary Surface)

### Purpose

**The primary value surface and default landing page.**

Operational queue of categorized items:

- **Incidents** (risk / downside)
- **Opportunities** (revenue / upside)
- **Verifications** (pending or completed verification tasks)

---

### Category Tabs

Top-level tab bar for filtering:

| Tab | Shows |
|---|---|
| All | Everything |
| Incidents | Risk, downside, regressions, blockers |
| Opportunities | Revenue upside, uplift hypotheses |
| Verifications | Pending and completed verification tasks |

---

### Change Summary Banner

When a change report is available, the Actions page displays a summary banner at the top showing:

- counts of regressions, improvements, new issues, resolved items
- overall trend indicator
- links to the ChangeTimeline component for details

---

### Table Structure

Columns:

- Priority (#)
- Title + root cause subtitle
- Category badge (Incident / Opportunity / Verification / Observation) with colored dot
- Severity badge (Critical / High / Medium / Low)
- Est. Impact (range badge with min-max)
- Confidence (monospace percentage)
- Effort hint (Trivial / Low / Medium / High / Very High)
- Verification maturity badge (VerificationBadge component)
- Change badge (ChangeBadge — regression / improvement / new / resolved / stable)
- Operational status (timeline of status transitions)

---

### Row Interaction

Clicking a row opens a **side drawer**

---

### Side Drawer Structure

#### 1. Summary
- description + impact
- category badge, severity badge, verification maturity badge, change badge

#### 2. Operational Status Timeline
- visual timeline of status transitions (opened, acknowledged, mitigated, verified, closed)

#### 3. VerificationPanel
- stepped progress bar showing verification lifecycle
- method label (static_only, browser_verified, mixed)
- freshness indicator with time since last verification
- degradation warnings when evidence is stale
- sufficiency warnings (VerificationSufficiencyWarning) when verification is incomplete

#### 4. Evidence
- supporting data
- evidence quality bars
- requests/responses
- graph links
- suppression transparency (shows if and why any evidence was suppressed)

#### 5. Recommendation
- what to do
- priority
- effort hint

#### 6. Context
- related workspace(s)
- related decision

#### 7. Resolve Paths
- mark resolved (with verification confirmation)
- request verification (triggers browser or probe verification)
- suppress (with transparency logging)
- ignore

---

## 4. Workspaces

### Definition

A Workspace is a **persistent operational instrument**.

Workspaces are not views — they are living, versioned contexts that track state across cycles.

Examples:

- Preflight (Scale Readiness)
- Revenue Integrity
- Chargeback Resilience

---

### Workspace Types

| Type | Label | Purpose |
|---|---|---|
| `preflight` | Scale Readiness | Launch/traffic readiness assessment |
| `revenue` | Revenue Integrity | Revenue leakage detection |
| `chargeback` | Chargeback Resilience | Chargeback risk management |

---

### Detail Route

Each workspace has a detail page at `/workspaces/[id]` showing:

- full findings table scoped to the workspace
- cycle-to-cycle comparison via ChangeTimeline
- trust strength panels
- coherence summary
- verification sufficiency warnings

---

## Workspace Structure

All workspaces follow a composable model:
Header
Context Blocks (dynamic)
Cycle Comparison (ChangeTimeline)
Trust Strength Panels
Primary Table (with VerificationBadge, ChangeBadge per finding)
Optional Panels


---

## Header (Standard)

- name
- type badge (colored by workspace type)
- scope
- status
- last updated
- trend arrows (improvement/regression vs previous cycle)

Actions:

- refresh
- edit
- pin

---

## Context Blocks (Dynamic)

Each workspace defines its own blocks.

---

### Supported Block Types

#### Metric Cards

Examples:

- readiness (with overall readiness badge for preflight)
- blockers
- confidence
- measurement coverage
- total monthly loss
- highest impact finding

---

#### Alerts / Highlights

- key issues
- warnings
- verification sufficiency warnings (VerificationSufficiencyWarning component)

---

#### Impact Summary

- revenue impact
- risk exposure

---

#### Scope Information

- domain
- journey stage
- environment

---

#### Decision Summary

- final answer
- short explanation

---

#### Trust Strength Panels

- per-category trust assessment
- strength indicators (strong / moderate / weak)
- supporting evidence references

---

## Cycle Comparison

When multiple audit cycles exist, workspaces show:

- **ChangeTimeline** — vertical timeline of changes ordered by criticality
- **ChangeBadge** per finding — regression / improvement / new / resolved / stable
- **Trend arrows** on workspace cards and headers

---

## Primary Table

Always present.

- Based on Analysis table
- Scoped to workspace
- Can customize visible columns
- Includes VerificationBadge and ChangeBadge per row
- Evidence quality bars per finding

---

## Optional Panels

Depending on workspace:

### Map
- react flow
- journey / trust / funnel

---

### Insights
- structured explanations

---

### Notes
- manual or MCP generated

---

## Workspace Example: Preflight (Checklist Mode)

Preflight workspaces render in **checklist mode** when readiness data is available.

### Checklist Rendering (PreflightChecklist)

- list of items with **pass / fail / warning** status icons
- each item shows: title, status, severity, and related finding reference
- **overall readiness badge** at the top: READY / READY WITH RISKS / NOT READY / N/A
- items grouped by blocker / risk / opportunity

### Context Blocks

- readiness: NOT READY (or READY / READY WITH RISKS)
- blockers: 3
- confidence: 82%
- measurement coverage: 45%

---

### Table (below checklist)

- filtered findings relevant to readiness
- VerificationBadge and ChangeBadge per row

---

### Decision

- can scale: NO

---

## 5. Analysis (Findings)

### Purpose

Global exploration layer for all findings with financial impact.

---

### Layout

#### Top Bar

- search
- filters:
  - polarity
  - severity
  - pack (decision pack)
  - hide positive signals toggle
  - clear filters

---

### Table

Columns:

- Checkbox (multi-select)
- Polarity icon (negative / positive / neutral)
- Finding title + root cause subtitle
- Severity badge (Critical / High / Medium / Low)
- Confidence (monospace %)
- Est. Impact (range badge)
- Impact type (Revenue Loss, Conversion Loss, etc.)
- Pack label (Scale, Revenue, Chargeback, SaaS)
- **Verification maturity badge** (VerificationBadge — unverified / pending / partially / verified / degraded / stale)
- **Change badge** (ChangeBadge — regression / improvement / new / resolved / stable)
- **Evidence quality bar** (visual indicator of evidence completeness)
- "Discuss" button

---

### Row Interaction

Click → opens side drawer

---

### Side Drawer

- Summary with cause + badges (severity, confidence, pack, surface, verification maturity, change)
- Effect description
- Root Cause in monospace container
- Impact Breakdown (Monthly Range, Midpoint, Impact Type)
- Reasoning
- Evidence Contradictions (amber alert if applicable)
- **VerificationPanel** (stepped progress, freshness, degradation warnings)
- **VerificationSufficiencyWarning** (when verification is incomplete for high-impact findings)
- **Suppression transparency** (if any evidence is suppressed, reason is shown)
- "Discuss" button (navigates to Chat with context)

---

## 6. Settings

---

### General (From Saas Boilerplate)

- account
- billing

---

### Domains
- domains


---

### Data

- routes discovered
- coverage %
- pixel coverage
- detected providers:
  - stripe
  - shopify
  - etc

- audit history

---

### Integrations (Future)

- analytics
- ads
- CRM

---

## Global UX Rules

---

### 1. Actions are the primary surface

Users land on Actions first. The product communicates value through operational items — incidents, opportunities, verifications — not raw findings.

---

### 2. Findings support decisions

Findings exist to back up actions and workspace conclusions. They are not the product surface users interact with first.

---

### 3. Workspaces are persistent operational instruments

All meaningful deep analysis happens inside workspaces. They track state across cycles and expose change over time.

---

### 4. Actions expose value

Users must clearly see:

- risk (incidents)
- money (opportunities)
- verification needs

categorized and tracked through tabs (All / Incidents / Opportunities / Verifications).

---

### 5. Consistency is mandatory

- every table uses row → drawer
- every drawer has same structure (with VerificationPanel and change badges)
- no special-case interactions

---

### 6. Minimal visual noise

- limited colors
- low roundness
- dense tables
- emphasis on readability

---

### 7. Monitoring and Change Visibility

The continuous monitoring loop is now visible in the UX:

- **Change summary banner** on Actions page
- **ChangeTimeline** component in workspace details
- **ChangeBadge** per finding/action row (regression / improvement / new / resolved / stable)
- **Workspace trend arrows** showing direction vs previous cycle
- Chat surfaces change report awareness with suggested prompts

---

### 8. Verification Lifecycle is Explicit

Every finding and action exposes its verification state:

- **VerificationBadge** — maturity indicator (unverified / pending / partially / verified / degraded / stale)
- **VerificationPanel** — stepped progress bar with method, freshness, degradation warnings
- **VerificationSufficiencyWarning** — alert when high-impact items lack sufficient verification
- **Suppression transparency** — when evidence is suppressed, the reason is visible

---

### 9. MCP Integration

MCP can:

- create workspaces
- update workspaces
- suggest actions
- attach evidence
- generate insights
- fetch change reports (`get_change_report` tool)
- emit navigation CTA blocks directing users to relevant surfaces

---

## Final Principle

> The UI is not a dashboard.
> It is an operating system to answer:
> - What is broken?
> - What changed?
> - Where am I losing money?
> - What should I do next?
> - Can I trust this conclusion?