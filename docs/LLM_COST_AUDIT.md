# LLM Cost Audit — 2026-05-20

Driven by the realization that Wave 19a Phase 2 added ~$0.12/cold-cycle
to the Framework Lens line item. Customer flagged: "12 cents é caro,
precisamos saber se isso é aceitável". This is the per-customer monthly
estimate + leak inventory + explosion scenarios.

---

## 1. Pricing reference

| Model | Input $/M tok | Output $/M tok | Cache write | Cache read |
|-------|--------------:|---------------:|------------:|-----------:|
| Haiku 4.5 | $0.80 | $4.00 | 1.25× input | 0.10× input |
| Sonnet 4.6 | $3.00 | $15.00 | 1.25× input | 0.10× input |
| Opus 4.6 | $15.00 | $75.00 | 1.25× input | 0.10× input |

Opus is **5× Sonnet** and **18-25× Haiku**. Choice of model dominates.

---

## 2. Call site inventory (20 callModel sites, 12 distinct purposes)

### A. Cycle-time (audit-runner, gated by cycleMode)

| Call site | Model | Gated to | Volume per cycle | Source |
|-----------|-------|----------|------------------|--------|
| semantic-enrichment (16 sub-passes) | Haiku | full + shallow_plus = cold + warm | MAX_PAGES=25 total budget | [workers/ingestion/enrichment/semantic-enrichment.ts](workers/ingestion/enrichment/semantic-enrichment.ts) |
| ad-message-match | Haiku | cold only | MAX 5 ad/LP pairs | [workers/ingestion/enrichment/ad-message-match.ts](workers/ingestion/enrichment/ad-message-match.ts) |
| copy-micro-copy | Haiku | inside semantic-enrichment budget | 1 per qualifying page | [workers/ingestion/enrichment/copy-micro-copy.ts](workers/ingestion/enrichment/copy-micro-copy.ts) |
| pricing-psychology | Haiku | inside semantic-enrichment budget | 1 per pricing page | [workers/ingestion/enrichment/pricing-psychology.ts](workers/ingestion/enrichment/pricing-psychology.ts) |
| copy-localization | Haiku | inside semantic-enrichment budget | 1 per multi-locale set | [workers/ingestion/enrichment/copy-localization.ts](workers/ingestion/enrichment/copy-localization.ts) |
| copy-seo-tension | Haiku | inside semantic-enrichment budget | 1 per commercial page | [workers/ingestion/enrichment/copy-seo-tension.ts](workers/ingestion/enrichment/copy-seo-tension.ts) |
| cross-page-copy | Haiku | cold only (≥3 commercial pages) | 1 call/cycle (15-page prompt) | [workers/ingestion/enrichment/cross-page-copy.ts](workers/ingestion/enrichment/cross-page-copy.ts) |
| **run-framework-lens** (new) | Haiku | cold only | **40 cells** (10 frameworks × 4 pages) | [apps/audit-runner/run-framework-lens.ts](apps/audit-runner/run-framework-lens.ts) |

### B. On-demand (user-triggered, cached)

| Call site | Model | Cache shape | Source |
|-----------|-------|-------------|--------|
| pulse-summary | Haiku | In-memory Map, keyed by env+ws+cycle+locale | [route](src/app/api/workspace/pulse-summary/route.ts) |
| copy-tone | Haiku | In-memory Map, env+cycle | [route](src/app/api/workspace/copy-tone/route.ts) |
| copy-persona-rewrite | Haiku | In-memory Map | [route](src/app/api/workspace/copy-persona-rewrite/route.ts) |
| copy-test-recommendations | Haiku | In-memory Map | [route](src/app/api/workspace/copy-test-recommendations/route.ts) |
| **copy-framework-audit** (new) | Haiku | **L1 memory + L2 CopyFrameworkAudit table** | [route](src/app/api/workspace/copy-framework-audit/route.ts) |

### C. Chat pipeline (per user message in /app/chat or Copilot)

| Call site | Model | Purpose | Avg tokens |
|-----------|-------|---------|------------|
| input-guard | Haiku | Prompt-injection screen | ~200 in, ~30 out |
| core-chat | **Sonnet 4.6 default**, Opus 4.6 if Ultra | Main reply | ~5000 in, ~2000 out |
| core-chat follow-up | Same as above | After tool use | ~3000 in, ~1500 out |
| output-classifier | Haiku | Suggest follow-up prompts | ~500 in, ~150 out |

---

## 3. Monthly cost estimate per active customer

Assuming **Plan Max** (hot 15min-1h, warm daily, cold weekly), **typical
20-page commercial site**, **2 chat users with 50 messages each per
month, ~10% using Opus**.

### A. Cycle-time (deterministic)

| Item | Cycles/week | Calls/cycle | Tokens/call (in/out) | Weekly | Monthly |
|------|------------:|------------:|---------------------:|-------:|--------:|
| semantic-enrichment (warm+cold) | 8 | 25 | ~1500/800 | $0.88 | **$3.80** |
| ad-message-match (cold only) | 1 | 5 | ~2000/300 | $0.02 | **$0.09** |
| cross-page-copy (cold only) | 1 | 1 | ~15000/1200 | $0.02 | **$0.09** |
| **run-framework-lens** (cold only) | 1 | 40 | ~2500/600 | $0.13 | **$0.55** |
| **Cycle subtotal** | | | | **$1.05** | **$4.53** |

### B. On-demand (estimate with cache-warm patterns)

| Item | Calls/month | Tokens (in/out) | Monthly |
|------|------------:|-----------------|--------:|
| pulse-summary (5 unique scopes × 4 cycles cache-cold) | 20 | ~1200/500 | $0.04 |
| copy-tone | 4 | ~2000/600 | $0.02 |
| copy-persona-rewrite (10 manual triggers) | 10 | ~2500/800 | $0.07 |
| copy-test-recommendations | 5 | ~2500/600 | $0.03 |
| copy-framework-audit fill-ins (Phase 2 should make rare) | 5 | ~2500/600 | $0.03 |
| **On-demand subtotal** | | | **$0.19** |

### C. Chat (heaviest variable component)

Per message:
- input-guard: 200×$0.0000008 + 30×$0.000004 = $0.00028
- core-chat Sonnet: 5000×$0.000003 + 2000×$0.000015 = $0.045
- core-chat Opus: 5000×$0.000015 + 2000×$0.000075 = $0.225
- follow-up (50% of msgs): ~$0.022 Sonnet / ~$0.11 Opus
- output-classifier: ~$0.001

Per message total:
- **Sonnet path: ~$0.07** (input_guard + core + 50%×follow-up + classifier)
- **Opus path: ~$0.34** (5× Sonnet)

100 messages/month/customer (2 users × 50):
- 90 on Sonnet + 10 on Opus = 90×$0.07 + 10×$0.34 = **$9.70/month**

### TOTAL per Max-plan customer/month

```
Cycle-time:    $4.53
On-demand:     $0.19
Chat:          $9.70
─────────────────────
Estimated:    $14.42/month per Max customer
```

Plan Max is **$199/mo** → **LLM cost ~7.2% of revenue**. Tolerable but
worth scrutiny — the chat path is the biggest line item and the most
elastic.

Plan Pro (no chat? — verify): drops to ~$5/mo LLM on ~$49/mo plan = 10%.
Plan Starter (limited usage): probably ~$1-2/mo LLM on ~$19/mo plan = 5-10%.

---

## 4. 🚨 Leaks (observability + caching)

### L1 — 95% of LLM spend is invisible

**Only chat pipeline writes to `TokenCostLedger`** (input_guard, core_chat,
output_classifier). The 17 other call sites have **zero observability**:

- semantic-enrichment + 6 sub-enrichments
- ad-message-match
- cross-page-copy
- pulse-summary
- copy-tone / persona-rewrite / test-recommendations
- copy-framework-audit (Phase 1 + Phase 2)

**Risk:** we can't answer "which customer drove last month's $X bill"
or "did the new enrichment we shipped explode our cost". A single broken
loop could burn $thousands silently.

**Fix sketch:** every `callModel` site must wrap with a `recordToLedger`
counterpart. Either via a thin wrapper `callModelTracked(purpose, ...)`
or by moving the ledger write into `apps/mcp/llm/client.ts:callModel`
itself with a `purpose` arg.

### L2 — In-memory cache leak (repeated billing per deploy)

These routes use `const cache = new Map<...>()` module-scoped:
- pulse-summary
- copy-tone
- copy-persona-rewrite
- copy-test-recommendations
- copy-framework-audit (just fixed in Wave 19a Phase 1)

**Cost impact:** every Railway deploy invalidates these caches. A
customer with a daily cycle and ~5 deploys/week is paying 5× extra
each week for cache-miss fan-outs.

**Fix sketch:** mirror the CopyFrameworkAudit pattern for pulse-summary,
copy-tone, persona-rewrite, test-recommendations. Single shared
`LlmResultCache` table keyed by (env, cycle, purpose, key_hash, locale)
would cover all 4 at once.

### L3 — No per-customer cost circuit-breaker

There's no enforcement of "this org has spent >$X this month, stop
running enrichments". A run-cycle that hits a Haiku retry-storm bug, or
a chat user with a malformed prompt that triggers retries, will run
until the Anthropic billing alert catches it (hours/days later).

**Fix sketch:** before every callModel, lookup org's monthly cost-to-
date from TokenCostLedger; if > threshold (e.g. $50/mo for Max), fall
back to "LLM disabled" path. Requires L1 fixed first.

---

## 5. 💥 Explosion scenarios

| Scenario | Multiplier | Per-customer cost |
|----------|-----------:|------------------:|
| Cold cycle moves from weekly → daily | 7× cycle costs | +$30/mo |
| MAX_PAGES on semantic-enrichment 25 → 100 | 4× | +$11/mo |
| MAX_AD_LP_PAIRS 5 → 50 | 10× ad-message | +$0.81/mo |
| All chat moves to Opus default | 5× chat | +$39/mo |
| Heavy power user (500 msg/mo on Opus) | 5× heavy | +$170/mo |
| Retry storm on Haiku timeout (3 retries × 25 calls × 7 days) | 21× warm enrichment | +$80/mo |
| New enrichment ships without budget guard | unbounded | unbounded |

**Highest-risk:** the chat path. Opus default + a single power user could
double the bill. Today there's a plan gate (Ultra-only Opus) — that
gate must stay tight.

**Most insidious:** retry storms. The LLM client has timeout but no
explicit retry cap visible in this audit. Worth verifying [apps/mcp/llm/client.ts](apps/mcp/llm/client.ts)
doesn't loop on certain error codes.

---

## 6. Recommendations (prioritized)

1. **[1 day] Add per-call-site cost telemetry** — wrap every callModel
   with TokenCostLedger writes. Without this, we're decision-making
   blind.
2. **[1 day] DB-cache the remaining 4 on-demand routes** — pulse-summary,
   copy-tone, persona-rewrite, test-recommendations. Mirror Wave 19a
   pattern. Eliminates L2.
3. **[Half day] Add monthly cost cap per org** — read TokenCostLedger
   aggregate before every callModel; soft-disable above threshold.
4. **[Half day] Audit retry behavior in [apps/mcp/llm/client.ts](apps/mcp/llm/client.ts)** — confirm
   timeouts don't trigger silent retries that compound.
5. **[Discussion] Reduce semantic-enrichment cadence to cold-only?**
   Today it runs on warm AND cold. Customer's pricing/H1 don't change
   between warms — same rationale as Framework Lens Phase 2. Would
   save ~$3/mo per customer.

---

## 7. Verdict on the $0.12/cold cycle Framework Lens

In isolation: tolerable. ~$0.55/customer/month on a $199 plan = 0.3%.
**The framework lens isn't the problem.**

The actual problem the audit revealed:
- **$14/customer/month projected** with most line items unmonitored
- **No circuit breakers** to catch runaway costs
- **Cache-leak pattern** repeated in 4 unmigrated routes

The Framework Lens addition is small change. The systemic issue is
that we don't have observability or guardrails on the $14 we ARE
spending. That's where the next investment lives.
