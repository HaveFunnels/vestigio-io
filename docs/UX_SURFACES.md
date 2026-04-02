# UX Surfaces — Vestigio V2

## Philosophy

Vestigio is not a dashboard.

It is a **decision system**.

The UI must:

- prioritize decisions over raw data
- expose risk and revenue clearly
- allow deep inspection without friction
- scale to multiple analysis types without navigation explosion

---

## Core Interaction Model

All surfaces follow the same pattern:

1. Table (or list)
2. Row click
3. Side drawer with full context

This pattern must be consistent across:

- Analysis
- Actions
- Workspaces

---

## Navigation Structure
Onboard
Chat
Actions
Workspaces
Analysis
Settings


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

Cognitive interface for decision-making.

---

### Layout

#### Left Panel
- conversation history

#### Main Panel
- chat stream

#### Right Panel (Context)

- active workspace
- related decisions
- quick actions:
  - create workspace
  - verify claim
  - show evidence

---

### Capabilities

- answer business questions:
  - "can I scale traffic?"
  - "where am I losing money?"

- explain decisions
- trigger verification
- create workspaces

---

## 3. Actions

### Purpose

Unified list of:

- Incidents (risk / downside)
- Opportunities (revenue / upside)

---

### Table Structure

Columns:

- Title
- Type (Incident | Opportunity)
- Impact
- Confidence
- Scope
- Source (decision/workspace)
- Status
- Priority

---

### Row Interaction

Clicking a row opens a **side drawer**

---

### Side Drawer Structure

#### 1. Summary
- description
- impact

#### 2. Why it matters
- business explanation

#### 3. Evidence
- supporting data
- requests/responses
- graph links

#### 4. Recommendation
- what to do
- priority

#### 5. Context
- related workspace(s)
- related decision

#### 6. Actions
- create workspace
- mark resolved
- ignore

---

## 4. Workspaces

### Definition

A Workspace is a **persistent analysis context**.

Examples:

- Preflight
- Revenue Leak
- Trust Risk
- Journey: mobile/desktop

---

### Workspace Types (Icons)

Only 3 types:

- Analysis
- Saved View
- Map

---

## Workspace Structure

All workspaces follow a composable model:
Header
Context Blocks (dynamic)
Primary Table
Optional Panels


---

## Header (Standard)

- name
- type
- scope
- status
- last updated

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

- readiness
- blockers
- confidence
- measurement coverage

---

#### Alerts / Highlights

- key issues
- warnings

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

## Primary Table

Always present.

- Based on Analysis table
- Scoped to workspace
- Can customize visible columns

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

## Workspace Example: Preflight

### Context Blocks

- readiness: NOT READY
- blockers: 3
- confidence: 82%
- measurement coverage: 45%

---

### Table

- filtered findings relevant to readiness

---

### Decision

- can scale: NO

---

## 5. Analysis

### Purpose

Global exploration layer.

---

### Layout

#### Top Bar

- search
- filters:
  - type
  - journey stage
  - domain
  - severity
  - confidence
  - impact

---

### Table

Columns:

- Finding
- Type
- Surface (domain/path)
- Journey Stage
- Status
- Confidence
- Freshness
- Impact

---

### Row Interaction

Click → opens side drawer

---

### Side Drawer

Same structure as Actions:

- summary
- technical details
- why it matters
- evidence
- remediation
- actions

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

### 1. Findings are NOT the product

They support:

- decisions
- actions
- workspaces

---

### 2. Workspaces are the core unit

All meaningful analysis happens inside workspaces.

---

### 3. Actions expose value

Users must clearly see:

- risk (incidents)
- money (opportunities)

---

### 4. Consistency is mandatory

- every table uses row → drawer
- every drawer has same structure
- no special-case interactions

---

### 5. Minimal visual noise

- limited colors
- low roundness
- dense tables
- emphasis on readability

---

### 6. MCP Integration

MCP can:

- create workspaces
- update workspaces
- suggest actions
- attach evidence
- generate insights

---

## Final Principle

> The UI is not a dashboard.
> It is a system to answer:
> - What is broken?
> - Where am I losing money?
> - What should I do next?