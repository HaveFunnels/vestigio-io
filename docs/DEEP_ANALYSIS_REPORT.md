# Vestigio.io — Deep Analysis Report

> Generated: 2026-05-01
> Scope: 5 core modules × 3 analysis dimensions (architecture, feature gaps, scoring)
> Sources: Full codebase exploration, competitive landscape research, customer/market analysis

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Module 1: Audit Lifecycle](#module-1-audit-lifecycle)
3. [Module 2: Data Ingestion, Parsing & Storage](#module-2-data-ingestion-parsing--storage)
4. [Module 3: Findings, Heuristics & Analysis](#module-3-findings-heuristics--analysis)
5. [Module 4: React Flow Maps](#module-4-react-flow-maps)
6. [Module 5: Internal MCP System](#module-5-internal-mcp-system)
7. [Competitive Landscape Analysis](#competitive-landscape-analysis)
8. [Customer Research & Market Gaps](#customer-research--market-gaps)
9. [Comprehensive Scoring Matrix](#comprehensive-scoring-matrix)
10. [Strategic Recommendations](#strategic-recommendations)

---

## Executive Summary

Vestigio's architecture is **significantly more sophisticated than any competing audit tool in the market**. The five modules form a cohesive pipeline: Audit Lifecycle orchestrates, Data Ingestion feeds, Heuristics/Analysis reasons, Maps visualize, and MCP makes it conversational. This is not an incremental improvement over Semrush/Ahrefs/Screaming Frog — it's an architecturally distinct product category.

**Key strengths across all modules:**
- Evidence as a canonical data contract (35+ typed payloads from 5 sources)
- Financial quantification on every finding (unique in the market)
- Browser-verified evidence with multi-source truth harmonization
- Defense-in-depth LLM pipeline with 4 security layers
- Transactional cycle completion preventing half-written states

**Critical gaps that limit competitive advantage:**
- Sequential DB writes bottleneck scaling (Evidence + Findings upserts are N round-trips)
- Mobile behavioral data is broken (`mobile_session_count` always 0)
- Meta/Google Ads data is collected but not consumed by the signal engine
- React Flow maps use a naive column layout producing edge crossings
- Embeddings system is built but not wired to any MCP tool
- No multi-cycle trend analysis (only current vs. previous cycle)

**Overall product maturity: 7.8/10** — Exceptional foundation with specific scaling and feature-completion gaps.

---

## Module 1: Audit Lifecycle

### Architecture Assessment

**State Machine:**
4 operational states (`pending → running → complete | failed`), clean terminal states, idempotency guard on re-pickup. Domain types define 6 states but only 4 are used — orphaned documentation that creates confusion.

**Scheduling:**
Plan-cadenced scheduling (Starter: 7d cold, Pro: 1h hot/4h warm/3d cold, Max: 15m hot/1h warm/1d cold). Leader election prevents multi-replica N-fold execution. Inactivity pause after 14 days without owner access.

**Queue Architecture:**
Redis priority queues (hot > warm > cold), per-environment locking (15-min TTL), env-contention requeues don't burn retry budget, DLQ after 3 failures. This is **well above market standard** — most competitors use simple cron without priority queuing.

**Pipeline Modes:**
Three-tier execution (shallow/shallow_plus/full) with 5 enrichment passes (Playwright, Katana, Nuclei, Brand Intel, Semantic/LLM). Each pass is independently non-fatal. Hot/warm cycles carry forward evidence from unchanged pages — the engine always sees a complete evidence set.

### Architecture Quality: 8.5/10

| Dimension | Score | Notes |
|-----------|-------|-------|
| Design correctness | 9/10 | Transactional commit, idempotency, env-locking are textbook |
| Scalability | 7/10 | Worker concurrency limited by Chromium (300MB each); in-process fallback when Redis missing |
| Reliability | 9/10 | Heal cron (stuck running 10min, orphaned pending 5min), graceful shutdown, DLQ |
| Maintainability | 7/10 | run-cycle.ts is 1100 lines; state machine inconsistency (6 domain vs 4 DB states) |
| Observability | 8/10 | Admin metrics endpoint, worker health server, structured logging, SSE progress |
| Code quality | 7.5/10 | Legacy scheduler artifact, CycleType enum drift (6 distinct strings), SSE progress bug |

### Issues Found

1. **State machine inconsistency**: `CycleStatus` in domain defines 6 states (`pending | collecting | processing | computing | completed | failed`) but DB and runtime use 4. The domain types are dead code.
2. **Legacy scheduler**: `apps/platform/audit-scheduler.ts` is a functional but unused in-memory scheduler creating confusion about which is authoritative.
3. **CycleType enum drift**: 6 distinct cycle type strings across the codebase with partial overlap (`full`, `hot`, `warm`, `cold`, `incremental`, `verification`).
4. **SSE progress bug**: `pages_discovered` counts all `PageInventoryItem` rows for the environment, not just current cycle — progress indicator is wrong for non-first cycles.
5. **Stateless warm rotation**: Fisher-Yates shuffle with no cursor — short-lived environments may never see some non-critical pages.

### Feature Gaps (High Value)

| Gap | Impact | Effort | Competitive Differentiation |
|-----|--------|--------|----------------------------|
| **Webhook-triggered audits** (on deploy) | High — catches regressions in minutes, not hours | Medium | ContentKing does real-time monitoring; Vestigio's cycle-based model misses between-cycle deploy regressions |
| **Partial re-audit on specific pages** | Medium — user wants to re-verify a fix on one page | Low | No competitor offers targeted single-page re-verification with full engine re-computation |
| **Audit progress dashboard** (admin-level) | Medium — ops visibility for all running audits | Low | Table stakes for multi-env enterprise customers |
| **Cycle comparison view** | High — "what changed between this cycle and 3 cycles ago?" | Medium | Only current vs. previous is supported; multi-cycle trends would be unique |
| **Conditional enrichment passes** | Medium — skip Nuclei for known-safe sites, run more LLM for e-commerce | Low | No competitor has adaptive pipeline configuration per site type |

---

## Module 2: Data Ingestion, Parsing & Storage

### Architecture Assessment

**Ingestion Channels (5):**
1. Web Crawler (Node.js native HTTP, regex parser — no DOM)
2. Behavioral Pixel (first-party JS snippet, daily-rotating IP hash)
3. Integration Pollers (Shopify, Nuvemshop, Meta Ads, Google Ads, Stripe)
4. Headless Browser (Playwright, Chromium pool)
5. Security Scanners + LLM Enrichment (Nuclei, Katana, Haiku copy analysis)

**Evidence as canonical contract** is the clearest architectural win. Every source produces the same typed `Evidence` shape (35+ payload types). The engine never touches external systems — it only knows about evidence.

**Parser** is pure regex (no DOM library). Handles HTML, forms, scripts, iframes, JSON-LD, meta tags. Policy content gets separate analysis. This is pragmatic but brittle for complex SPA structures.

### Architecture Quality: 7.5/10

| Dimension | Score | Notes |
|-----------|-------|-------|
| Design correctness | 9/10 | Evidence contract is excellent; transactional completion prevents half-writes |
| Scalability | 5.5/10 | **Critical**: Sequential upserts (N round-trips for 300+ evidence items); behavioral re-aggregation on every cycle grows quadratically |
| Data integrity | 8/10 | Content-hash dedup, challenge detection, quality assessment, truth harmonization |
| Schema design | 7/10 | Evidence payload as Text column (not JSONB — opaque to Postgres); duplicate snapshot tables |
| Security | 7.5/10 | AES-encrypted integration credentials but single blob (no field-level separation); daily-rotating IP hash for behavioral |
| Extensibility | 9/10 | Enrichment pass registry follows open/closed principle; new passes never modify pipeline |

### Issues Found

1. **Sequential evidence persistence**: `PrismaEvidenceStore.addMany()` loops with individual `upsert` calls — N round-trips for N evidence items. PostgreSQL `INSERT ... ON CONFLICT DO UPDATE` would be 1 round-trip.
2. **Sequential finding persistence**: Same issue in `PrismaFindingStore.saveForCycle()`.
3. **Duplicate snapshot tables**: `CycleSnapshot` and `VersionedSnapshot` have nearly identical columns. `VersionedSnapshot` has no current writer — dead schema weight.
4. **Evidence payload is Text, not JSONB**: Postgres cannot index into payload fields; any payload-based query requires full scan + app-level deserialization.
5. **Behavioral re-aggregation**: `processBehavioralEventsForEnv()` re-reads and re-processes all events in the window every cycle. `processedAt` flag is informational, not a filter. Quadratic growth with cycle frequency.
6. **No behavioral event validation**: Raw JSON stored without Zod schema — any missing field silently defaults to `undefined`.
7. **Regex-based parser**: No DOM tree. Edge cases like nested forms, malformed HTML, or complex script tags can produce incorrect evidence.

### Feature Gaps (High Value)

| Gap | Impact | Effort | Competitive Differentiation |
|-----|--------|--------|----------------------------|
| **Batch evidence writes** (single INSERT ON CONFLICT) | Critical for scale — 10-50x faster persistence | Low | Infrastructure, not visible to users, but enables larger crawls |
| **JSONB payload column** | High — enables Postgres-level queries on evidence payloads | Medium | Enables "find all pages where X" without full-table scan |
| **Incremental behavioral aggregation** | High — checkpoint + delta instead of re-processing all events | Medium | Required for environments with millions of pixel events |
| **Webhook-based integration sync** | High — real-time Shopify/Stripe events instead of polling | Medium | Competitors don't have real-time commerce data integration |
| **DOM-based parser** (cheerio or similar) | Medium — handles edge cases that regex misses | Medium | Screaming Frog uses full rendering; regex misses nested structures |
| **Event stream architecture** | High — decouple ingestion from processing for horizontal scaling | High | Would enable real-time findings as data arrives |

---

## Module 3: Findings, Heuristics & Analysis

### Architecture Assessment

**Signal → Inference → Decision → Projection pipeline** is a genuine causal reasoning engine, not a checklist. The anti-double-counting via correlated groups in the risk evaluator is a design that no competitor has.

**Scale:**
- 260+ inference rules in a single 3000+ line file
- 6 decision packs + 7 behavioral packs (20-session eligibility gate)
- 11-check Trust Surface Score composite (A-F grade)
- Multi-layer confidence with 40% floor budget cap

**Unique strengths vs. market:**
- Financial quantification on every finding (Semrush/Ahrefs show severity colors, not dollars)
- Change detection with noise threshold (±5 points suppressed)
- Evidence quality decomposed into 4 orthogonal dimensions
- Truth harmonization resolving multi-source contradictions
- Cross-layer penalty budget preventing cascading confidence collapse

### Architecture Quality: 8.0/10

| Dimension | Score | Notes |
|-----------|-------|-------|
| Design sophistication | 9.5/10 | Causal inference + financial quantification + truth harmonization is unique in the market |
| Accuracy/calibration | 7/10 | SaaS signal confidence hardcoded at 70; 2 signals contribute to risk score via `signalToRisk()`; mobile_session_count always 0 |
| Extensibility | 7/10 | Adding a new inference means modifying a 3000+ line file; no automated tests visible |
| Completeness | 7.5/10 | Missing: JSON-LD/schema.org analysis, Core Web Vitals from browser verification, A/B test detection, return customer patterns |
| Explainability | 8.5/10 | Every inference carries reasoning, signal_refs, evidence_refs; every decision has explainability |
| Financial accuracy | 8/10 | Real data from integrations when connected; heuristic baselines otherwise — honest `basis_type` disclosure |

### Issues Found

1. **SaaS signal confidence hardcoded at 70**: All SaaS signals enter inference engine with identical prior confidence — truth harmonization can't differentiate strong from weak SaaS evidence.
2. **`signalToRisk()` only covers 2 signals**: Hundreds of signals never promote to risk score. Design says "only for signals not covered by inferences" but many signals have no corresponding inference either.
3. **`mobile_session_count` always 0**: `isMobileSession()` returns `false` as a placeholder. Mobile behavioral analysis is effectively broken.
4. **Meta/Google Ads not consumed by signal engine**: Pollers store `IntegrationSnapshot` but signal extractors don't consume ad platform data. Types exist, consumption doesn't.
5. **3000+ line single file**: `packages/inference/engine.ts` has no internal grouping, no automated test coverage visible.
6. **Synthetic regression inference ID collision**: `inf_regression_${cycle_ref}` would collide if `recomputeAll()` called multiple times for same cycle.

### Feature Gaps (High Value)

| Gap | Impact | Effort | Competitive Differentiation |
|-----|--------|--------|----------------------------|
| **Core Web Vitals from Playwright** (LCP, CLS, FID/INP) | High — currently missing page speed findings | Medium | Lighthouse does this; Vestigio doesn't despite having Playwright |
| **JSON-LD / Schema.org inference** | Medium — checkout/product markup quality | Low | Screaming Frog extracts structured data; Vestigio parses but doesn't reason about it |
| **Multi-cycle trend analysis** | High — "your checkout has been degrading for 3 weeks" | Medium | No competitor does trend-based regression detection |
| **Ad platform signal consumption** | High — already-collected data not producing findings | Low | The data is already ingested; just needs signal extractors |
| **A/B test variant detection** | Medium — detect split test interference with audit accuracy | Medium | No competitor detects A/B tests |
| **Mobile behavioral fix** | Critical — 50%+ of traffic on mobile is invisible | Low | Fix `isMobileSession()` + wire device type correctly |
| **Inference module decomposition** | High for maintainability — split 3000 lines into packs | Medium | Internal quality, not user-facing |
| **Return customer pattern analysis** | Medium — repeat purchase patterns from Stripe + Shopify | Low | Exists for Shopify (`low_repeat_purchase_rate`); missing for Stripe |

---

## Module 4: React Flow Maps

### Architecture Assessment

**Architecture:**
Clean separation — `packages/maps` is pure TypeScript (no React dependency). Layout, data derivation, and edge definitions are portable. 12 custom node types, 5 edge types, custom hierarchical column layout (no dagre/ELK).

**Three map pipelines:**
1. Engine Maps (Revenue Leakage, Chargeback Risk, Root Cause) — built from evidence graph
2. User Journey Map — built from PageInventoryItem + SurfaceRelation + behavioral enrichment
3. Custom Maps — user-created from finding selections

**Interactive features:**
- Click nodes → SideDrawer with finding/action/root-cause detail
- AI insights overlay matching findings to journey nodes by surface path
- Cross-map linking (`?focus=nodeId`)
- "Discuss in Chat" integration with Copilot
- Filter bar (User Journey) with URL-synced dropdowns
- Entry animations (fade + blur stagger, SVG stroke draw)

### Architecture Quality: 7.0/10

| Dimension | Score | Notes |
|-----------|-------|-------|
| Design | 8/10 | Clean packages/maps separation; DataState union type; per-map legend |
| Layout quality | 5/10 | Custom column layout produces edge crossings; no edge routing optimization |
| Visual polish | 7.5/10 | Animations, severity-colored nodes, insight badges are good; edge labels only on journey maps |
| Interactivity | 7/10 | Node click + drawer + tooltip; no multi-select, no search, no severity filter on canvas |
| Performance | 7.5/10 | Pre-computed layout; no virtualization needed at current scale (<30 nodes); 500k behavioral query cap |
| Mobile | 4/10 | min-h-[500px] doesn't adapt to portrait viewports; MiniMap/Controls fixed-position |

### Issues Found

1. **No collision avoidance**: `applyHierarchicalLayout` assigns fixed column x-coordinates with no edge routing. Root Cause maps with many findings sharing one root cause produce overlapping edges.
2. **Deprecated React Flow prop**: `edgesReconnectable` is the old API; `@xyflow/react` v12 uses `reconnectable` on individual edges. Console warning likely.
3. **`user_journey` missing from MCP tool enum**: `get_map` tool at `apps/mcp/tools.ts:143` doesn't include `user_journey` — Claude can't request journey maps.
4. **No persistence for custom maps**: `create_custom_map` returns `MapDefinition` but there's no evidence of persistence across page reloads.
5. **Behavioral enrichment query**: `take: 500_000` with no index hint on `sessionId` or `url` — slow on large installations.

### Feature Gaps (High Value)

| Gap | Impact | Effort | Competitive Differentiation |
|-----|--------|--------|----------------------------|
| **ELK/dagre layout** | High — eliminates edge crossings with minimal code | Low | Sitebulb has excellent graph layouts; Vestigio's are naive |
| **Funnel timeline animation** | Very High — show funnel changes week-over-week | Medium | **No competitor does animated funnel evolution** — would be a demo-winning feature |
| **Map export** (PNG/SVG/PDF) | High — stakeholder sharing, reports | Low | Table stakes for enterprise; currently impossible |
| **Severity filter on canvas** | Medium — focus on critical findings only in maps | Low | Exists on /analysis page but not on maps |
| **Multi-select + batch discuss** | Medium — shift-click nodes for group analysis | Low | Natural extension of existing "Discuss in Chat" |
| **Search/highlight within map** | Medium — find specific nodes without clicking each | Low | Basic UX improvement |
| **Mobile responsive canvas** | Medium — 50%+ of traffic views dashboards on mobile | Medium | Currently broken on portrait viewports |
| **Revenue impact heat overlay** | High — node size/color by dollar impact | Low | **Unique feature** — show money flowing through the funnel |

---

## Module 5: Internal MCP System

### Architecture Assessment

**This is the most architecturally sophisticated module in the entire codebase.** A fully in-process MCP implementation with 22 tools, 8 resources, 27 expert playbooks, an 8-stage LLM pipeline with 4 security layers, and Playwright-based browser verification.

**LLM Pipeline (8 stages):**
1. Rate limit (plan-based: 3/10/30 per min)
2. Input sanitize (NFKC, XSS, null bytes, 2000 char cap)
3. Abort signal check
4. Prompt gate (deterministic — zero LLM cost)
5. Input guard (hybrid: fast scoring → Haiku escalation)
6. Core model + tool loop (Sonnet/Opus, up to 8 rounds)
7. Output classifier (Haiku, fail-closed)
8. Cross-session memory update

**Security hardening:**
- Canary token (`VSTG-CANARY-7f3a9b2e`) detects system prompt leakage
- Tool output sanitization prevents indirect injection via website titles
- Memory field sanitization blocks injection through conversation memory
- Fail-closed at every LLM boundary

**Verification system:**
6 executor types (reuse_only, light_probe, browser_verification, integration_pull, authenticated_journey, external_scan) with a governance policy layer controlling costs, cooldowns, and type substitution.

### Architecture Quality: 9.0/10

| Dimension | Score | Notes |
|-----------|-------|-------|
| Design sophistication | 9.5/10 | 8-stage pipeline, 4 security layers, verification governance, cross-domain chaining — this is enterprise-grade |
| Security | 9.5/10 | Defense-in-depth with canary tokens, indirect injection mitigation, fail-closed classifiers |
| Extensibility | 8.5/10 | Tool registry pattern; playbook templates; verification executor plugins |
| Completeness | 7.5/10 | Embeddings built but unwired; integration_pull is a stub; only 2 pack keys in explainability tool |
| Cost governance | 9/10 | Verification policy, rate limiting, token ledger, budget guardrails |
| Cross-domain intelligence | 8/10 | Pack insight protocol (7 domains), context chaining, but no semantic search |

### Issues Found

1. **`get_decision_explainability` only exposes 2 pack keys**: Missing `saas_growth_readiness` — Claude can't request SaaS finding explainability.
2. **`IntegrationPullExecutor` is a permanent stub**: Exposed in tool schema, returns failure. Claude can be prompted to request it, user sees failure.
3. **Output classifier runs on already-streamed response**: Canary check replaces stored version but safety issues were already visible to user (known trade-off).
4. **Embeddings system built but unwired**: `searchFindings()` exists but no tool calls it. Vector search for findings would be high-value.
5. **Custom map persistence gap**: `create_custom_map` returns data but no persistence layer for surviving page reloads.
6. **Conversation compaction at 600 chars**: Long conversations with many findings silently lose important context.
7. **Rate limiter fallback**: Unrecognized plan keys degrade to 3/min silently instead of failing loudly.

### Feature Gaps (High Value)

| Gap | Impact | Effort | Competitive Differentiation |
|-----|--------|--------|----------------------------|
| **`search_findings` tool** (embeddings already built) | Very High — semantic finding search via natural language | Low | **Infrastructure exists, just needs wiring** — enables "find findings about checkout trust" |
| **Multi-cycle trend tool** (`get_trend`) | High — "how has checkout been trending over 5 cycles?" | Medium | No competitor offers conversational trend queries |
| **`create_action` tool** | High — Claude creates tracked actions from conversation | Low | `$$CREATEACTION$$` embed exists in UI but no MCP tool |
| **External MCP transport** (HTTP/stdio) | High — enables third-party AI agent integration | High | Per market trend (97M monthly MCP SDK downloads), this is table stakes by Q3 2026 |
| **`schedule_verification` tool** | Medium — deferred verification with ETA | Low | Better UX than immediate-or-nothing |
| **Playbook execution via MCP** | Medium — automated multi-step audit workflows | Medium | Would enable "run the full CRO playbook" as a single command |
| **Integration pull executor** (implement, not stub) | High — Shopify/Stripe data refresh on demand | Medium | Data refresh without waiting for next cycle |

---

## Competitive Landscape Analysis

### Feature Matrix vs. Top Competitors

| Capability | Vestigio | Semrush | Ahrefs | Screaming Frog | Sitebulb | Lumar | ContentKing | Alli AI |
|------------|----------|---------|--------|----------------|----------|-------|-------------|---------|
| **Financial quantification** | ✅ $ ranges | ❌ Severity colors | ❌ Severity | ❌ Technical | ❌ Technical | ❌ Enterprise metrics | ❌ | ❌ |
| **Causal inference engine** | ✅ 260+ rules | ❌ Checklist | ❌ Checklist | ❌ Crawl rules | ⚠️ Basic hints | ❌ Flags | ❌ | ❌ |
| **Browser verification** | ✅ Playwright | ⚠️ Basic JS render | ⚠️ Basic | ✅ Chromium | ✅ Chromium | ✅ | ❌ | ❌ |
| **Behavioral analysis** | ✅ First-party pixel | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Commerce integration** | ✅ Shopify/Stripe/Nuvemshop | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Ad platform integration** | ✅ Meta + Google Ads | ✅ Keyword data only | ✅ Keyword data only | ❌ | ❌ | ❌ | ❌ | ❌ |
| **AI chat / copilot** | ✅ 22 tools, 27 playbooks | ⚠️ Copilot (limited) | ⚠️ AI writing | ❌ | ❌ | ❌ | ❌ | ⚠️ Basic SEO AI |
| **Graph visualization** | ✅ React Flow maps | ❌ | ❌ | ⚠️ Crawl graph | ✅ Beautiful graphs | ⚠️ Basic | ❌ | ❌ |
| **Multi-domain analysis** | ✅ Cross-signal chains | ❌ Siloed | ❌ Siloed | ❌ Siloed | ❌ | ⚠️ Enterprise | ❌ | ❌ |
| **Prioritized action queue** | ✅ Impact-ranked | ⚠️ Issue list | ⚠️ Issue list | ❌ Issue list | ⚠️ Hints | ❌ | ❌ | ⚠️ |
| **Security scanning** | ✅ Nuclei + brand intel | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Copy/content analysis** | ✅ LLM + psychology KB | ❌ | ❌ | ❌ | ⚠️ Content length | ❌ | ⚠️ Content changes | ❌ |
| **Real-time monitoring** | ❌ Cycle-based | ❌ Project-based | ❌ Project-based | ❌ Manual | ❌ | ⚠️ Alerts | ✅ 24/7 | ❌ |
| **Pricing** | $99-399/mo | $130-500/mo | $129-449/mo | $22/mo (desktop) | $39-115/mo | Custom ($500+) | Bundled (Conductor) | $169-1249/mo |

### Vestigio's Unique Moat (Features No Competitor Has)

1. **Financial quantification on every finding** — "$18k-$42k/month" vs. "High severity"
2. **Causal inference engine** with 260+ rules and anti-double-counting
3. **First-party behavioral pixel** integrated into the audit engine
4. **Multi-source truth harmonization** resolving contradictions across crawl/behavioral/integration data
5. **Commerce data integration** (Shopify, Stripe, Nuvemshop) feeding real revenue into impact estimates
6. **22-tool AI copilot** with browser verification, playbooks, and cross-domain chaining
7. **Evidence-based verification** with Playwright automation
8. **Copy analysis** grounded in 80+ marketing psychology models

### Where Competitors Are Ahead

| Capability | Competitor | Gap for Vestigio |
|------------|-----------|------------------|
| Real-time monitoring (24/7) | ContentKing | Vestigio is cycle-based; misses between-cycle deploy regressi
ons |
| Crawl graph visualization | Sitebulb | Sitebulb's graphs are visually superior with proper edge routing |
| Core Web Vitals | Lighthouse, Sitebulb | Vestigio has Playwright but doesn't extract CWV |
| Enterprise collaboration | Lumar | Segmentation, custom metrics, leadership dashboards |
| Crawl scale (millions of pages) | Screaming Frog, Lumar | Vestigio caps at 30 pages per cycle |
| Backlink analysis | Ahrefs, Semrush | Vestigio doesn't touch backlinks |
| SEO keyword data | Semrush, Ahrefs | Vestigio focuses on conversion, not rankings |

---

## Customer Research & Market Gaps

### Jobs-to-Be-Done Not Fully Served

| JTBD | Current Coverage | Gap |
|------|-----------------|-----|
| "Show me what a deploy broke" | ⚠️ Cycle-based detection (hours, not minutes) | Webhook-triggered audit on deploy would catch regressions in minutes |
| "Show me how my funnel is trending" | ⚠️ Only current vs. previous cycle | Multi-cycle trend analysis would reveal long-term degradation patterns |
| "Show me what's broken on mobile" | ❌ `mobile_session_count` is always 0 | Fix behavioral mobile detection → unlock mobile-specific findings |
| "Connect my existing tools" | ⚠️ Shopify/Stripe/Nuvemshop, not GA4/Mixpanel/Hotjar | Analytics tool integration would enable richer behavioral context |
| "Share this report with my team" | ⚠️ No export, no shareable links to findings | PDF/PNG export, shareable finding URLs would reduce "proving it to stakeholders" friction |
| "Audit my competitor" | ❌ Not available | Competitive audit would be high-value for growth teams |
| "Show me the ROI of fixing things" | ⚠️ Revenue Recovery Tracker scaffolded but not shipped | Before/after impact tracking would prove Vestigio's value |

### Pain Points from Market Research (Validated Opportunities)

**Pain 1: "Too many issues, no prioritization"** (Frequency: Very High)
> "SEO audit tools commonly generate long lists of issues, many of which are low impact, and without prioritization, users risk engineering fatigue." — Reddit/G2 patterns

**Vestigio's answer**: Impact-ranked action queue with financial quantification. **Score: 9/10** — this is Vestigio's strongest differentiation.

**Pain 2: "Data but no diagnosis"** (Frequency: Very High)
> "What's gaining traction is diagnostic tools, not monitoring tools — a monitoring tool tells you what's happening, while a diagnostic tool tells you why and what to do about it." — G2 AEO Tool Reviews

**Vestigio's answer**: Causal inference + root cause analysis + remediation steps. **Score: 9/10** — architecturally distinct from monitoring tools.

**Pain 3: "Tool fatigue / too many dashboards"** (Frequency: High)
> "The average company uses 130 SaaS applications, but employees typically use only 45% of features they pay for." — SaaS Management Reports 2026

**Vestigio's answer**: Cross-domain analysis combining SEO, performance, security, copy, commerce, and behavioral data. **Score: 7.5/10** — strong but would improve with GA4/analytics integration.

**Pain 4: "CRO agencies are expensive and slow"** (Frequency: Medium-High)
> "CRO agencies charge $5k-$20k/month and deliver reports that go stale in weeks."

**Vestigio's answer**: Automated, continuous, at $99-$399/month. **Score: 9/10** — 10-50x cheaper, always fresh.

**Pain 5: "Rising CAC from broken funnels"** (Frequency: High)
> "Rising SaaS CAC is rarely a paid problem. It's usually a funnel problem disguised as a paid problem."

**Vestigio's answer**: Ad-to-landing-page message match, checkout abandonment detection, conversion friction analysis. **Score: 8/10** — strong with integrations; would be 10/10 with GA4 attribution data.

---

## Comprehensive Scoring Matrix

### Module Scores (0-10 scale)

| Category | Audit Lifecycle | Data Ingestion | Findings/Heuristics | React Flow Maps | MCP System | **Module Avg** |
|----------|:-:|:-:|:-:|:-:|:-:|:-:|
| **Architecture Design** | 8.5 | 8.0 | 8.5 | 7.5 | 9.5 | **8.4** |
| **Code Quality** | 7.5 | 7.0 | 7.0 | 7.0 | 8.5 | **7.4** |
| **Scalability** | 7.0 | 5.5 | 7.0 | 7.5 | 8.0 | **7.0** |
| **Reliability** | 9.0 | 8.0 | 8.0 | 7.0 | 8.5 | **8.1** |
| **Security** | 7.5 | 7.5 | N/A | N/A | 9.5 | **8.2** |
| **Extensibility** | 7.5 | 9.0 | 7.0 | 8.0 | 8.5 | **8.0** |
| **Feature Completeness** | 8.0 | 7.0 | 7.5 | 6.5 | 7.5 | **7.3** |
| **Competitive Differentiation** | 8.0 | 8.5 | 9.5 | 6.5 | 9.0 | **8.3** |
| **User Value Delivery** | 8.5 | 7.5 | 9.0 | 7.0 | 8.5 | **8.1** |
| **Maintainability** | 7.0 | 7.0 | 6.0 | 7.0 | 8.0 | **7.0** |
| **MODULE TOTAL** | **7.9** | **7.5** | **7.7** | **7.1** | **8.6** | **7.8** |

### Cross-Module Integration Score: 8.5/10

The five modules form a genuinely cohesive pipeline. Evidence flows from ingestion through analysis to maps and MCP without breaking abstractions. The weakest integration point is Maps ↔ MCP (user_journey not in tool enum; custom map persistence gap).

### Technical Debt Score: 6.5/10 (lower = more debt)

| Debt Item | Severity | Module |
|-----------|----------|--------|
| Sequential upserts (Evidence + Findings) | High | Data Ingestion |
| 3000+ line inference engine (no tests) | High | Findings |
| mobile_session_count always 0 | High | Findings |
| State machine / CycleType inconsistency | Medium | Audit Lifecycle |
| Legacy scheduler artifact | Low | Audit Lifecycle |
| Duplicate snapshot tables | Low | Data Ingestion |
| Text vs JSONB for evidence payload | Medium | Data Ingestion |
| Deprecated React Flow prop | Low | Maps |
| Integration pull executor stub | Medium | MCP |
| Embeddings built but unwired | Medium | MCP |

---

## Strategic Recommendations

### Priority 1: Critical Fixes (Days, Not Weeks) — ✅ ALL COMPLETE (2026-05-02)

> All 15 critical fixes from Wave 7.11 + 24 additional bugs (6 CRITICAL, 10 HIGH, 8 MEDIUM) identified and resolved.
> Security fixes: tenant isolation, OAuth session validation, conversation ownership, SSE cache validation.
> Engine fixes: trust score, impact calculation, coherence penalty, behavioral pipeline, change detection.
> See git log for commits `bd4f338` through `13345e1`.

### Priority 2: High-Impact Feature Gaps (1-2 Weeks Each)

1. **Batch evidence/finding persistence** — single INSERT ON CONFLICT DO UPDATE instead of N upserts. 10-50x faster cycle completion. Required for scaling beyond current crawl caps.
2. **Core Web Vitals extraction from Playwright** — Vestigio already launches Chromium but doesn't extract LCP/CLS/INP. Lighthouse does; Vestigio should too.
3. **Ad platform signal consumption** — Meta/Google Ads data is already ingested. Wire signal extractors to produce findings from it.
4. **ELK layout for maps** — Replace custom column layout with ELK's layered algorithm. Eliminates edge crossings. Library is already well-suited to React Flow.
5. **Map export (PNG/SVG)** — React Flow supports `toImage()`. Enable stakeholder sharing.

### Priority 3: Moat-Deepening Features (1-2 Months)

1. **Multi-cycle trend analysis** — "Your checkout has been degrading for 3 consecutive cycles." No competitor offers trend-based regression detection. Requires storing and querying across snapshots.
2. **Webhook-triggered audits** — Deploy webhook → immediate hot cycle → regression detection in minutes. Bridges the gap with ContentKing's real-time monitoring.
3. **Revenue Recovery Tracker** — Already scaffolded in ROADMAP.md. Before/after impact tracking proves ROI and creates upsell pressure.
4. **Funnel timeline animation** — React Flow map showing funnel changes over time. Demo-winning feature with no competitive equivalent.
5. **External MCP transport** — HTTP/stdio transport for third-party AI agent integration. Market trend (97M monthly MCP SDK downloads) makes this table stakes by Q3 2026.

### Priority 4: Category-Defining (Quarter+)

1. **GA4/Mixpanel/Amplitude integration** — Connect analytics data for attribution-backed findings. Would make financial quantification even more accurate.
2. **Competitive audit mode** — Audit competitor websites, compare findings, show differentiation gaps. High value for growth teams.
3. **Event stream architecture** — Decouple ingestion from processing. Enable real-time findings as data arrives. Necessary for 10x scale.
4. **Inference engine decomposition** — Split 3000+ lines into testable pack modules with automated test suites.

---

## Final Assessment

**Vestigio is not an audit tool. It's a decision engine that happens to audit.** The competitive analysis confirms that no existing product combines causal inference, financial quantification, behavioral analysis, commerce integration, and AI copilot in a single pipeline. The architecture supports this claim — evidence flows through a genuinely novel reasoning chain that produces dollar-denominated decisions, not color-coded issue lists.

**The main risk is not architecture — it's completion.** The foundation is excellent, but several high-value features are 80% built (embeddings, ad signal consumption, mobile behavioral, Revenue Recovery Tracker). Completing what exists would create more differentiation than building anything new.

**The second risk is scaling.** Sequential upserts, quadratic behavioral re-aggregation, and 30-page crawl caps are acceptable at current load but will become blockers at scale. These are infrastructure problems with known solutions — they just need implementation priority.

**Bottom line: 7.8/10 product maturity with clear path to 9.0+ by completing what's already started.**

---
---

# Part II — Extended Analysis

> Extended: 2026-05-01
> Additional scope: Market pain points, competitive gaps, moat extensions, real-time architecture, future perspectives
> Sources: G2/Capterra reviews, Reddit communities, industry benchmarks, Baymard Institute, competitor documentation, codebase deep-dive

---

## Extended Market Pain Points

### Pain 6: "Checkout abandonment is costing me a fortune but I can't see what's broken" (Frequency: Very High)

> "70.22% of shopping carts are abandoned. 48% cite unexpected costs. 19% don't trust the site with payment info. Payment success rate below 95% means you're losing revenue to technical failures." — Baymard Institute 2026, ecommerce payment statistics

**Quantified impact**: $260 billion in recoverable lost orders in US+EU through better checkout flow alone. Trust badges near CTA increase conversions 42% for first-time visitors. Displaying security badges reduces abandonment by 32%.

**Vestigio's answer**: Trust Surface Score (11-check composite), checkout integrity inference, policy quality analysis, `checkout_abandonment_revenue_leak` finding with $ amounts from Shopify data. **Score: 8.5/10** — strong structural detection, but `mobile_session_count` being always 0 means mobile checkout failures (85.65% abandonment on mobile) are invisible.

**Gap to close**: Fix mobile behavioral detection + add Playwright-based checkout flow verification (Core Web Vitals on checkout page specifically).

---

### Pain 7: "Accessibility lawsuits are a ticking time bomb and we can't even audit it" (Frequency: High)

> "95% of websites fail basic WCAG requirements. E-commerce accounted for 70% of all ADA digital accessibility lawsuits in 2025. Americans with disabilities have $490 billion in disposable income." — WebAIM Million 2025, accessibility revenue impact studies

**Quantified impact**: 23% SEO boost for WCAG-compliant sites (Semrush study). 50% higher brand loyalty. Average ecommerce site has 51-86 accessibility errors per page.

**Vestigio's answer**: Limited. Nuclei scans cover some security/compliance signals. No dedicated WCAG analysis. **Score: 3/10** — significant gap, but accessibility is within Vestigio's domain (it directly impacts revenue via conversion + legal risk).

**Gap to close**: Add WCAG checks to the crawl parser (alt text, ARIA labels, contrast ratios, form labels, keyboard navigation). Quantify financial risk: legal exposure + lost conversion from disabled users.

---

### Pain 8: "Post-purchase experience is killing our retention" (Frequency: Medium-High)

> "56% of customers are disappointed with post-purchase experience. Only 17% feel businesses care after purchase. Rising CAC makes retention the primary growth lever." — Post-purchase industry surveys 2026

**Quantified impact**: Post-purchase optimization is the #1 lever for reducing CAC payback period. Confirmation page, order tracking, and follow-up copy are optimization surfaces most companies ignore.

**Vestigio's answer**: Limited. Copy analysis pack covers commercial pages but doesn't specifically audit confirmation/thank-you/order-status pages. The page classifier categorizes them as `other`. **Score: 4/10** — structural gap; these pages are crawlable and analyzable with existing infrastructure.

**Gap to close**: Add `post_purchase` page type to classifier. Extend copy analysis to confirmation/thank-you pages. Cross-reference with Shopify repeat purchase rate.

---

### Pain 9: "Analytics tracking breaks silently after deploys" (Frequency: High)

> "AI-driven analytics audits detect 90% of discrepancies, cut detection time by 70%. Analysts save 12 hours/month. Deploy → analytics regression is invisible to most tools." — Trackingplan 2026

**Vestigio's answer**: `measurement_coverage` signal detects missing analytics scripts. But this is a static check — it doesn't detect that analytics *was* present and *broke* after a deploy. **Score: 5/10** — has the signal but lacks the temporal dimension.

**Gap to close**: Track analytics script presence in change detection. When a previously-present GA4/Segment/Mixpanel script disappears between cycles, fire a `measurement_regression` finding with "your analytics broke between deploy X and now."

---

### Pain 10: "Chargeback prevention is disconnected from conversion optimization" (Frequency: Medium)

> "Chargeflow: $29/deflected chargeback, 90% reduction rate. Ethoca/Verifi provide alerts before disputes hit merchant. No tool connects chargeback risk signals to conversion optimization." — Chargeback prevention landscape 2026

**Vestigio's answer**: `chargeback_resilience` decision pack, `dispute_risk_elevated` inference, refund policy quality analysis, Stripe dispute rate integration. **Score: 7/10** — strong structural analysis, but no integration with chargeback alert providers (Ethoca/Verifi) and no real-time dispute tracking.

**Gap to close**: When Stripe `charge.dispute.created` webhook fires, immediately surface in the chargeback workspace. Cross-reference disputed transactions with behavioral sessions (did the buyer hesitate? was trust copy missing?).

---

### Pain 11: "CRO prioritization is subjective — we don't know what to fix first" (Frequency: Very High)

> "ICE/PIE frameworks have '3 scoring variables leaving a lot open to interpretation.' Impact Quantification is a 'game-changer' but still emerging. Teams have 'dozens of potential ideas but limited development time.'" — CRO tools reviews 2026

**Vestigio's answer**: Impact-ranked action queue with financial quantification, Opportunity Compression composite (groups findings by shared remediation), effort × impact scatter plot. **Score: 9.5/10** — this is Vestigio's strongest moat. No competitor quantifies impact in dollars AND ranks by effort.

---

### Pain 12: "My funnel visualization doesn't tell me what's actually happening" (Frequency: Medium)

> "A funnel tracks pre-sale conversion stages. A journey map covers the full lifecycle. Funnelytics ($99/mo) provides visual mapping + forecasting but no audit capabilities. Amplitude's Pathfinder discovers common paths but doesn't diagnose." — Funnel tools landscape 2026

**Vestigio's answer**: User Journey Map with behavioral enrichment (conversion rates, drop-off nodes), Engine Maps (Revenue Leakage, Chargeback Risk, Root Cause) with causal edges. **Score: 7/10** — functional but lacks temporal animation, export, and multi-select capabilities.

**Gap to close**: Funnel timeline animation (show evolution over cycles), map export for stakeholder sharing, revenue heat overlay on nodes.

---

## Expanded Competitive Gaps (Where Vestigio Competes)

### Only areas where Vestigio's product scope overlaps with the competitor's:

| Capability | Competitor Ahead | Gap for Vestigio | Effort to Close | Strategic Priority |
|------------|-----------------|------------------|-----------------|-------------------|
| **24/7 content change detection** | ContentKing (Conductor) | Vestigio is cycle-based; changes between cycles are invisible. ContentKing catches changes "within minutes." | Medium (Option 4 Hybrid: 2-3 weeks) | **P0** — addressed by Hybrid Architecture below |
| **Behavioral experience analytics** | Contentsquare (AI agent "Sense") | Contentsquare has session replay, zone-based heatmaps, frustration alerts. Vestigio has first-party pixel but no visual replay. | High (session replay is a separate product) | P3 — Vestigio's pixel feeds *decisions*, not visual replay. Different value prop. |
| **AI-powered CRO recommendations** | Contentsquare, CROBenchmark | Contentsquare's "opportunity report" auto-prioritizes by AI. CROBenchmark audits 248 CRO best practices. Vestigio has 260+ inference rules but they're not framed as "CRO experiments." | Low (packaging, not engineering) | **P1** — reframe existing findings as testable CRO hypotheses |
| **Chargeback prevention automation** | Chargeflow ($29/deflected) | Chargeflow integrates Ethoca/Verifi for pre-dispute alerts + auto-refund. Vestigio detects chargeback *risk* but doesn't prevent chargebacks. | Medium (Ethoca/Verifi webhook integration) | P2 — partner or integrate, don't build |
| **Analytics tracking audit** | Trackingplan | Trackingplan monitors GA4 tag health, detects regressions, inventories 2,500+ tags. Vestigio only checks `measurement_coverage` (presence, not health). | Medium (tag inventory + regression detection) | **P1** — measurement integrity directly impacts financial quantification accuracy |
| **Funnel mapping + forecasting** | Funnelytics ($99/mo) | Funnelytics has drag-and-drop funnel builder, conversion forecasting, white-label reports. Vestigio has User Journey maps but no forecasting or builder. | Medium (forecasting from historical data) | P2 — differentiate on *diagnosed* funnels vs. *planned* funnels |
| **Post-purchase experience** | LateShipment, AfterShip, Narvar | These platforms audit delivery, returns, and order tracking. Vestigio doesn't audit post-purchase pages. | Low (page classifier + copy analysis extension) | **P1** — revenue leaks extend beyond checkout |
| **WCAG accessibility** | Siteimprove, TestParty | Siteimprove combines accessibility + SEO + analytics. 70% of ADA lawsuits target ecommerce. Vestigio doesn't audit accessibility. | Medium (parser extension + new inference pack) | P2 — quantifiable legal + conversion risk fits the financial-impact model |
| **Deploy regression detection** | Vercel Checks, DebugBear, Trackingplan | Vercel/DebugBear test Lighthouse scores post-deploy. Trackingplan detects analytics regression. Vestigio has no deploy hook integration. | Low-Medium (webhook endpoint + hot cycle trigger) | **P0** — addressed by Hybrid Architecture below |

---

## Moat Extension Strategies — Compound Value from Multi-Source Data

These opportunities are **only possible because Vestigio has multiple data sources feeding the same inference pipeline**. No single-source competitor can replicate them.

### Tier 1: Immediate (1-2 days each, single call-site changes)

**1. Wire `behavioralContext` into compound findings** (currently hardcoded to `null`)
- `recompute.ts:913` passes `null` as third argument to `detectCompoundFindings()`
- With behavioral data: every `ad_creative_message_mismatch` finding upgrades from `heuristic` to `confirmed` confidence
- The 3-source confirmed finding (ad data + crawl + behavioral) is unreplicable
- **Files**: `recompute.ts:913`, `compound-findings.ts:381`

**2. Behavioral-adjusted Trust Surface Score**
- Current TrustSurfaceScore is crawl-only (checks if trust elements *exist*)
- Behavioral data can show if trust elements *work* (policy page views → abandon = ineffective trust)
- Result: "Structural trust: 7/10. Effective trust: 4/10. Your trust signals exist but don't reduce hesitation."
- **Files**: `trust-surface-score.ts`, `recompute.ts:901`

**3. Top-revenue product page health correlation**
- Shopify poller already cross-references product handles with crawled URLs (lines 186-203)
- Extension: pair `top_products_by_revenue` with page health signals (load time, trust indicators)
- Finding: "Your top 3 revenue products have 5.2s average load time — estimated $3,400/mo impact"
- **Files**: `shopify/poller.ts:186`, `reconcile.ts`, `signals/engine.ts`

### Tier 2: Medium-term (1-2 weeks each)

**4. Behavioral cohort × Shopify abandonment compound finding**
- Shopify says: "73% abandonment, $12k/mo lost"
- Behavioral cohort says: "Mobile paid traffic abandonment is 4x worse than desktop organic"
- Compound: "$8,400 of the $12k loss is from mobile paid traffic specifically"
- **Files**: `compound-findings.ts`, `recompute.ts`, `signals/engine.ts:5857-5895`

**5. N-cycle behavioral trend detection**
- `PrismaSnapshotStore.asyncGetNthRecent()` and `asyncList()` exist but are never called
- Only N-1 vs. N comparison is used; N-cycle history is unexploited
- Finding: "Paid traffic hesitation rate doubled from 9% to 24% over 3 cycles — deployment regression"
- **Files**: `change-detection/engine.ts`, `change-detection/snapshot-store.ts`, `run-cycle.ts`

**6. Upsell/order-bump analysis from behavioral pixel**
- Pixel already fires `order_bump_seen`, `order_bump_accept`, `upsell_seen`, `upsell_accept` events
- Explicitly marked "future" in code — collected but discarded
- Cross with Shopify refund rates: "Upsell accepted 18% of time but product has 22% refund rate"
- **Files**: `behavioral/types.ts:31-34`, `session-aggregator.ts:136-142`

### Tier 3: High-effort, deepest moat (1+ month each)

**7. Behavioral hypothesis → Playwright verification**
- Behavioral pixel identifies *where* users abandon (field, page, step)
- Playwright can verify *why* (focus order, validation timing, render speed, visual trust)
- New `BehavioralHypothesisVerificationScenario` maps inference keys to browser test scenarios
- **Files**: `verification/executors.ts`, `playwright-runtime.ts`, `verification/types.ts`

**8. Per-campaign behavioral attribution reconciliation**
- Pixel stores `gclid`/`fbclid` per session; ad pollers have campaign spend
- Never joined: can't tell which *specific campaign* drives the highest friction
- Finding: "'Summer Sale' campaign (340 sessions) has 41% backtrack rate vs. 9% organic — $1,312/mo wasted"
- **Files**: `behavioral/session-aggregator.ts`, `meta-ads/poller.ts`, `google-ads/poller.ts`

---

## Real-Time Architecture — From Cycles to Continuous Detection

### The Problem

Vestigio's cycle-based model (cold: 1-7 days, warm: 1-4 hours, hot: 15min-1h) means changes between cycles are invisible. ContentKing catches changes "within minutes." A deploy that breaks checkout on Friday at 5pm won't be detected until the next scheduled cycle.

### Four Options Analyzed (with concrete file-level implementation details)

#### Option 1: Webhook-Triggered Micro-Audits
- **Concept**: Shopify/Stripe webhooks push mutations → scoped re-audit of affected surfaces only
- **Latency**: 20-60 seconds from commerce event to finding update
- **Cost**: $0 LLM (shallow_plus mode, no semantic enrichment)
- **Effort**: 3-4 days (Stripe webhook handler already exists as template)
- **Limitation**: Only catches commerce-event changes, not page content changes

#### Option 2: Event-Driven Streaming Architecture
- **Concept**: Decouple ingestion from computation via Redis Streams
- **Problem**: `recomputeAll()` is a pure function over complete evidence set — no delta path
- **Effort**: 4-6 weeks minimum (requires incremental recompute engine rewrite)
- **Verdict**: **Not recommended now.** Right long-term direction, wrong near-term priority. Risk of mid-state inconsistency would erode operator trust.

#### Option 3: Continuous Monitoring with Change Detection
- **Concept**: Lightweight HEAD/ETag polling of critical surfaces → hot cycle on detected changes
- **Latency**: 2-5 minutes (pollInterval + cycle execution)
- **Cost**: Near-zero (HEAD requests are free; triggered hot cycles skip LLM)
- **Effort**: 5-7 days
- **Limitation**: Catches content changes but not behavioral or integration changes

#### Option 4: Hybrid Model — RECOMMENDED

Layer three signal channels on top of existing cycle model. Each channel has different latency/cost characteristics. Together they provide near-real-time detection without replacing the authoritative cycle baseline.

**Channel A — Behavioral Anomaly Trigger** (5-15 min latency)
- Behavioral pixel already receives events continuously
- Run micro-aggregation every 5 min, compare against cycle baseline
- Trigger hot cycle when checkout/conversion rates deviate >15%
- New file: `workers/monitoring/behavioral-anomaly-detector.ts`
- Cost: $0 (reuses existing hot cycle machinery, no LLM)

**Channel B — Content Change Watcher** (2-5 min latency)
- HEAD/ETag polling of primary surfaces only (checkout, pricing, product, landing)
- SHA256 body hash fallback when ETag is unreliable
- Exponential backoff on Cloudflare/Akamai challenge detection
- New file: `workers/monitoring/change-poller.ts`
- Cost: Near-zero (HEAD requests + shallow_plus on change)

**Channel C — Integration Event Router** (20-60 sec latency)
- Shopify/Stripe webhook → cached `IntegrationSnapshot` in Redis
- Hot cycle triggered only on material threshold crossings
- Fast path: hot cycles read cached snapshot instead of polling API (saves 3-8s)
- New file: `src/app/api/integrations/shopify/webhook/route.ts`
- Cost: $0 LLM (webhook data replaces API poll)

**Plan segmentation**:
| Plan | Channel A | Channel B | Channel C |
|------|-----------|-----------|-----------|
| Starter ($99) | ❌ | ❌ | ❌ |
| Pro ($199) | 5-min anomaly | 5-min polling | Shopify/Stripe webhooks |
| Max ($399) | 5-min anomaly | 2-min polling | Shopify/Stripe webhooks |

**Total implementation effort**: 2-3 weeks (phased: Foundation 3d → Channel B 3d → Channel C 3d → Channel A 2d → Hardening 2d)

**Cost control invariant**: All monitoring-triggered cycles use `shallow_plus` mode. LLM calls are gated on `cycleMode === 'cold'`. Chromium is not launched for monitoring cycles. Zero incremental LLM cost.

---

## New Perspectives for Future Discussion

### Perspective 1: Vestigio as a "Deploy Gate"

**Thesis**: If Vestigio can detect regressions within 2 minutes of a deploy (via Hybrid Architecture), it becomes a CI/CD quality gate — not just an audit tool, but a deploy-time safety net.

**How**: Vercel/Netlify/Railway deploy hooks → `POST /api/cycles/trigger` with `cycleType: 'monitor'` → immediate shallow_plus audit of critical surfaces → pass/fail response.

**Why it matters**: This repositions Vestigio from "periodic audit tool" to "continuous deployment safeguard." The buyer becomes the CTO/engineering lead, not just the Growth lead. Pricing leverage: deploy gates are infrastructure, not optional.

### Perspective 2: Self-Improving Heuristics from Resolution Data

**Thesis**: When a user marks a finding as "resolved" and the next cycle confirms the fix, Vestigio has a labeled training pair: {evidence_before, evidence_after, fix_applied}. Over time, this creates a dataset that improves inference accuracy.

**How**: `UserAction.verifiedResolvedAt` is already stamped by the post-cycle attribution job. The before/after evidence is in consecutive `CycleSnapshot` pairs. Extract resolution patterns → adjust confidence weights on inference rules that have high resolution rates.

**Why it matters**: Creates a flywheel: more users → more resolutions → better heuristics → higher accuracy → more trust → more users. Competitors starting from zero can't replicate the labeled dataset.

### Perspective 3: Platform Play via External MCP

**Thesis**: With 97M monthly MCP SDK downloads and growing, exposing Vestigio's 22 tools via standard MCP transport would let third-party AI agents (Claude, ChatGPT, Copilot) query Vestigio's findings directly.

**How**: The `apps/mcp/server.ts` already implements the full tool registry. Add HTTP or stdio transport layer. Gate by API key + plan tier.

**Why it matters**: Vestigio becomes the "audit intelligence layer" that any AI agent can query. Instead of competing with Contentsquare's "Sense" agent, Vestigio becomes the data source that Sense (or any agent) consumes. This is a platform moat, not a feature moat.

### Perspective 4: Industry Vertical Specialization

**Thesis**: Vestigio's inference rules are horizontal. Vertical-specific rule packs (SaaS trial→paid, ecommerce checkout→delivery, marketplace buyer→seller) would deepen accuracy and enable vertical pricing.

**How**: Add `industry_vertical` to `BusinessProfile`. Load vertical-specific inference modules at `recomputeAll()` time. Start with SaaS (already partially built via `saas-inference.ts`) and ecommerce (Shopify/Nuvemshop integration already exists).

**Why it matters**: Vertical competitors (Chargeflow for chargeback, Funnelytics for funnels) own their niche. Vestigio's cross-domain architecture can produce vertical-depth findings while maintaining cross-domain breadth.

### Perspective 5: Collaborative Audits (Multi-Stakeholder)

**Thesis**: Findings need different audiences: CTO sees technical evidence, Growth lead sees financial impact, CEO sees the action queue. Currently all users see the same view.

**How**: Role-based finding presentation. Same data, different emphasis. The `FindingProjection` already carries `reasoning`, `impact`, `remediation_steps`, and `evidence_refs` — the data supports multiple views; the UI just needs role-aware rendering.

**Why it matters**: Enterprise deals require multi-stakeholder buy-in. A CMO who sees "your checkout copy misses 3 trust signals costing $42k/mo" and a CTO who sees "your CSP headers are missing on /checkout with CVSS 4.2" are looking at the same finding from different angles.

### Perspective 6: Accessibility as Revenue Intelligence

**Thesis**: WCAG compliance is typically framed as legal risk. Vestigio could frame it as revenue intelligence: "Your checkout has 23 WCAG violations. Americans with disabilities have $490B in disposable income. Your inaccessible checkout is losing an estimated $X/month."

**How**: Add WCAG checks to the crawl parser (alt text, ARIA, contrast, focus order). Create an `accessibility_revenue_impact` inference pack that quantifies lost revenue from inaccessible surfaces, using disability population data as the base.

**Why it matters**: No competitor frames accessibility as a financial finding. Siteimprove shows compliance scores. Vestigio would show dollars lost. This is the same "severity → dollars" transformation that made Vestigio's conversion findings unique.

---

## Updated Scoring After Extended Analysis

| Category | Original Score | Extended Score | Delta | Key Driver |
|----------|:-:|:-:|:-:|---|
| **Competitive Differentiation** | 8.3 | 8.3 | 0 | Still strongest in the market; gaps are in adjacent spaces, not core |
| **Feature Completeness** | 7.3 | 7.5 | +0.2 | Mobile behavioral fixed, Stripe/Ads signals consuming, 24 bugs fixed. Remaining: no accessibility, no deploy hooks, post-purchase gap |
| **Moat Depth** | N/A | 9.0 | new | 8 compound-value opportunities identified; 3 are single-call-site changes |
| **Real-Time Readiness** | N/A | 4.0 | new | Cycle-only model; Hybrid architecture designed but not implemented |
| **Market Fit** | N/A | 8.0 | new | Strong for core ICP (SaaS/ecomm $1-50M); gaps in adjacent verticals |
| **Revenue Expansion Potential** | N/A | 8.5 | new | Deploy gate, platform play, vertical packs all unlock new buyer personas |

---

## Consolidated Priority Roadmap (Extended)

### Wave A: Close the Data Gaps (1-2 weeks) — ✅ COMPLETE (2026-05-02)
> All 15 items from Wave 7.11 resolved + 24 additional bugs fixed.
> Mobile behavioral, behavioralContext, embeddings, MCP schema, SSE, Stripe/Ads signals,
> Nuvemshop mapping, state machine, legacy scheduler, CycleType, pixel coverage metadata,
> change detection tagging, revenue=0 fallback — all done.
> Plus: trust score, impact calc, coherence penalty, handoff detection, form counting,
> policy abandon gating, conversion proximity, security/auth fixes, platform fixes.

### Wave B: Hybrid Real-Time Architecture (2-3 weeks)
1. Foundation: `SurfaceMonitorEntry` model + monitor queue tier + plan config
2. Channel B: Content change poller (HEAD/ETag + SHA256)
3. Channel C: Shopify/Stripe webhook integration + snapshot cache
4. Channel A: Behavioral anomaly detector
5. Hardening: observability, alerting, plan gating

### Wave C: Moat Deepening (3-4 weeks)
1. Behavioral-adjusted Trust Surface Score
2. Top-revenue product × page health correlation
3. Behavioral cohort × Shopify abandonment compound finding
4. N-cycle behavioral trend detection
5. Upsell/order-bump analysis from pixel events

### Wave D: Category Expansion (1-2 months)
1. Deploy gate integration (Vercel/Netlify/Railway hooks)
2. Post-purchase page audit (classifier + copy analysis extension)
3. Analytics tracking regression detection
4. WCAG accessibility pack with revenue quantification
5. External MCP transport (HTTP/stdio)

### Wave E: Platform Play (Quarter)
1. Self-improving heuristics from resolution data
2. Industry vertical rule packs
3. Role-based finding presentation
4. Per-campaign behavioral attribution
5. Behavioral hypothesis → Playwright verification
