# Product Marketing Context

*Last updated: 2026-04-19*

## Product Overview

**One-liner:** Vestigio is the decision engine that shows SaaS companies where they're losing money and what to do about it.

**What it does:** Vestigio audits digital operations automatically, finds revenue leaks, chargeback risks, and conversion failures, quantifies the financial impact of each, and generates a prioritized queue of actions. Every finding is browser-verified with multi-source evidence. Vestigio AI (Pulse) lets operators interrogate their data in natural language.

**Product category:** Revenue Intelligence / Decision Engine (NOT analytics, NOT monitoring, NOT observability)

**Product type:** B2B SaaS

**Business model:** Freemium with usage-based tiers
- Starter: $99/mo (1 env, weekly cycles)
- Pro: $199/mo (3 envs, daily cycles, AI chat, maps, integrations)
- Max: $399/mo (10 envs, SSO, SLA, dedicated AM)

## Target Audience

**Target companies:** B2B SaaS and ecommerce companies running paid traffic, $1M–$50M ARR, growth stage

**Decision-makers:** Founders, Heads of Growth, CTOs, Revenue Ops leads

**Primary use case:** "I'm spending money on traffic but I don't know what's actually broken in my funnel or how much it's costing me"

**Jobs to be done:**
- Show me exactly where I'm losing money (not just that traffic is dropping)
- Tell me what to fix first (ranked by financial impact, not severity labels)
- Prove it with evidence so I can justify the decision to my team

**Use cases:**
- Pre-scale readiness ("Is my funnel ready for more traffic?")
- Post-deploy regression catch ("Did that release break anything?")
- Chargeback risk reduction ("Why is my dispute rate climbing?")
- Revenue recovery ("What's the fastest path to recover $X/month?")

## Personas

| Persona | Cares about | Challenge | Value we promise |
|---------|-------------|-----------|------------------|
| Founder/CEO | Revenue growth, burn rate, scaling safely | "I don't know what I don't know about my funnel" | See every dollar at risk, decide in minutes |
| Head of Growth | CAC payback, conversion rates, campaign ROI | "I'm driving traffic into a broken funnel and I can't see it" | Stop burning ad spend on broken surfaces |
| CTO/Tech Lead | Site reliability, deploy confidence, tech debt | "I need to know if a release broke revenue before users complain" | Automated regression detection with evidence |
| Revenue Ops | Pipeline accuracy, chargeback rates, LTV | "I'm reconciling data across 5 tools to find one problem" | Single source of truth with financial quantification |

## Problems & Pain Points

**Core problem:** SaaS companies scaling with paid traffic are bleeding revenue through invisible funnel problems — broken checkouts, trust gaps, conversion friction — and they can't see it because their analytics tools show *what happened* but not *why* or *how much it costs*.

**Why alternatives fall short:**
- Google Analytics tells you bounce rate, not that your checkout is 2.4s slower than it should be and that's costing $18k/month
- Hotjar shows heatmaps but doesn't quantify financial impact or prioritize fixes
- Internal QA catches bugs but misses revenue-impacting UX problems
- Consultants are expensive, slow, and their reports sit in a drawer

**What it costs them:** Average SaaS company has $30k–$80k/month in addressable revenue leaks they don't know about. Every day without visibility is money left on the table.

**Emotional tension:** "Am I scaling a broken funnel?" / "What if I'm spending money on ads that drive traffic into a wall?" / "I feel like I'm flying blind."

## Competitive Landscape

**Direct competitors:** None with the same causal inference + financial quantification + evidence verification stack. Closest: manual CRO agencies.

**Secondary competitors (different solution, same problem):**
- Google Analytics / Amplitude / Mixpanel — shows what happened, not why or what to do
- Hotjar / FullStory — session replay, no financial quantification
- CRO agencies — manual, expensive ($5k–$20k/month), slow (weeks for a report)

**Indirect competitors (conflicting approach):**
- "We'll figure it out ourselves" — internal team using spreadsheets and gut feeling
- "We'll just drive more traffic" — throwing money at acquisition instead of fixing conversion

**How each falls short:**
- Analytics tools: no causal inference, no action queue, no financial impact
- Session replay: drowning in data, no prioritization, no evidence trail
- Agencies: slow, expensive, one-time reports that go stale
- DIY: time-intensive, incomplete coverage, no continuous monitoring

## Differentiation

**Key differentiators:**
1. **Causal inference engine** — doesn't just correlate, identifies root causes
2. **Financial quantification on every finding** — "$18k–$42k/month" not "high severity"
3. **Evidence verification** — browser-confirmed, cross-referenced, timestamped (not LLM guesses)
4. **Prioritized action queue** — ranked by impact/urgency/effort, not a list of issues
5. **Continuous** — re-audits automatically, catches regressions between cycles

**How we do it differently:** Vestigio combines automated crawling, behavioral analysis, and causal inference to build a financial model of your funnel. Every finding traces back to multi-source evidence. The output isn't a dashboard — it's a ranked queue of decisions.

**Why that's better:** You skip the analysis phase entirely. No interpreting charts, no correlating data sources, no spreadsheet prioritization. You get a queue that says "fix this first, it's costing you $42k/month, here's the evidence."

**Why customers choose us:** Speed (first report in 24h), financial clarity (dollar amounts, not color-coded severity), and evidence (they can show their team proof, not opinions).

## Objections

| Objection | Response |
|-----------|----------|
| "How is this different from GA4?" | GA4 tells you *what* happened. Vestigio tells you *why*, *how much it costs*, and *what to do first*. We're the layer that turns analytics into decisions. |
| "We already have a CRO agency" | Agencies deliver a report once and it goes stale. Vestigio monitors continuously, catches regressions automatically, and costs 10x less. Your agency can use Vestigio's findings. |
| "Can I trust automated findings?" | Every finding is browser-verified with multi-source evidence. You see the proof — screenshots, DOM snapshots, performance traces — not just a score. |
| "We don't have time for another tool" | Vestigio isn't a tool you operate — it operates for you. The output is a queue of decisions, not a dashboard you need to interpret. |

**Anti-persona:** Companies with <$10k/month revenue (not enough at stake), companies not running paid traffic (no urgency), companies that want a BI dashboard (we're not a visualization tool).

## Switching Dynamics

**Push (frustrations driving them away from current approach):**
- "I'm spending 4 hours/week in GA4 and still can't tell my team what to fix"
- "Our last agency audit found 12 issues but didn't rank them or quantify impact"
- "We shipped a release that broke checkout and didn't know for 3 days"

**Pull (what attracts them to Vestigio):**
- Dollar amounts on every finding ("Oh, THAT's what it's costing me")
- Prioritized queue ("I know what to fix Monday morning")
- Evidence trail ("I can show my CTO proof, not my opinion")

**Habit (what keeps them stuck):**
- "GA4 is free and we already have it set up"
- "We've always done CRO reviews manually"
- "Our dev team reviews performance on deploys"

**Anxiety (what worries them about switching):**
- "Will it find real issues or generate noise?"
- "Is the financial quantification accurate?"
- "How long until I see value?"

## Customer Language

**How they describe the problem:**
- "I don't know what I don't know"
- "We're scaling in the dark"
- "I feel like we're leaving money on the table but I can't prove it"
- "Our funnel is leaking but I don't know where"
- "Analytics tells me traffic is down, not why"

**How they describe us:**
- "It's like a CRO audit that never stops running"
- "Finally I can see exactly what's broken AND what it costs"
- "The action queue changed how my team prioritizes"

**Words to use:**
- Decision, clarity, action, impact, evidence, recover, queue, priority
- "What to fix first", "how much it costs", "ranked by impact"
- Revenue, dollars, financial, quantified, verified, proven

**Words to avoid:**
- Audit (sounds passive/compliance), Analytics (positions as another dashboard)
- Insights (vague), Optimize (overused), Streamline (meaningless)
- Innovative, cutting-edge, next-gen, AI-powered (as primary positioning)
- Monitor (sounds like uptime monitoring), Observe (sounds like observability)

**Glossary:**

| Term | Meaning |
|------|---------|
| Finding | A detected issue with financial quantification and evidence |
| Action | A prioritized fix derived from one or more findings |
| Action Queue | The ranked list of what to fix, ordered by financial impact |
| Cycle | One complete audit run across all surfaces |
| Surface | A page or endpoint being monitored |
| Vestigio AI / Pulse | The conversational AI that reasons over audit data |
| Evidence Trail | Browser-verified proof attached to every finding |
| Workspace | A themed view grouping findings by business question (revenue, chargeback, etc.) |

## Brand Voice

**Tone:** Confident authority. We know what we're talking about. Not aggressive, not salesy — intellectually commanding. Think McKinsey clarity with Stripe's restraint.

**Style:** Direct, specific, financial. Lead with numbers when possible. Short sentences. No fluff. Every word earns its place.

**Personality:**
- Authoritative (we've seen hundreds of funnels)
- Precise (dollar amounts, not vague severity)
- Urgent but not desperate (the money is leaving now, but we're calm about it)
- Evidence-first (we prove, we don't claim)
- Opinionated (we believe most analytics is waste — we say so)

## Proof Points

**Metrics:**
- 15,000+ signals analyzed per audit
- First report in 24 hours
- 4X ROI guarantee
- Average recoverable revenue: $67.2k/month across 9 actions

**Value themes:**

| Theme | Proof |
|-------|-------|
| Financial clarity | Every finding shows dollar range (e.g., −$18k–$42k/month) |
| Speed to value | Domain in, first report out in 24h, no integration required |
| Evidence quality | Browser-verified, cross-referenced, timestamped — not LLM guesses |
| Continuous | Automated cycles catch regressions between deploys |
| Actionable | Output is a ranked queue, not a dashboard to interpret |

## Goals

**Business goal:** Establish Vestigio as the category-defining decision engine for SaaS revenue intelligence. Convert free users to Pro within 14 days.

**Conversion action:** Run free diagnostic (enter domain → see first report)

**Current metrics:** Pre-launch / early stage — establishing baseline.
