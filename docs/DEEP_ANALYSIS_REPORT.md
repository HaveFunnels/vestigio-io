# Vestigio.io — Deep Analysis Report: MCP + Prompts

**Generated:** 2026-05-07
**Agents used:** Sales Engineer, MCP Server Architect, RAG Architect

---

## 1. Score Summary

### Prompt Quality (Sales Engineer)

| Category | Avg Score | Sales Weight |
|---|---|---|
| Featured Playbooks (5) | 7.9 | 25% |
| Quick Action Presets (6) | 7.1 | 20% |
| Context-Aware Quick Actions (18) | 6.5 | 15% |
| Decidir Popover | 6.9 | 15% |
| Context-Aware Conversation (11) | 6.1 | 10% |
| Prompt Gate Suggestions | 5.8 | 10% |
| Hardcoded Prompts (6) | 3.5 | 5% |
| **Composite** | **6.79/10** | |

- **Sales Demo Readiness:** 7.5/10
- **Self-Service Activation:** 6.0/10

### MCP Architecture (Server Architect)

| Criterion | Score |
|---|---|
| Context Quality | 8 |
| Tool Design | 8 |
| Token Efficiency | 7 |
| Safety & Guardrails | 8 |
| Conversation Coherence | 6 |
| Response Precision | 8 |
| Cost Optimization | 7 |
| Scalability | 5 |
| Error Resilience | 7 |
| Extensibility | 7 |
| **Weighted Average** | **7.1/10** |

- **Production Readiness:** 7/10
- **Architecture Maturity:** 7/10

### RAG / Context Quality (RAG Architect)

| Criterion | Score |
|---|---|
| Retrieval Precision | 7 |
| Context Completeness | 7 |
| Grounding Quality | 8 |
| Context Window Efficiency | 7 |
| Retrieval Strategy | 8 |
| Knowledge Base Integration | 6 |
| Conversation Memory | 6 |
| Freshness Management | 8 |
| Multi-Turn Coherence | 5 |
| Hallucination Prevention | 8 |
| **Average** | **7.0/10** |

- **Response Accuracy:** ~82%
- **Context Utilization:** ~65%

---

## 2. Top Findings

### Critical Issues

1. **i18n gap: hardcoded English prompts.** 6 prompts in TSX files + ALL prompt-gate rewrites/reasons are English-only. For havefunnels.com (pt-BR), this creates a broken bilingual experience. Files: `inventory/page.tsx`, `workspaces/perspective/[slug]/page.tsx`, `workspaces/[id]/page.tsx`, `FindingDetailPanel.tsx`, `InsightsDrawerContent.tsx`, `prompt-gate.ts`.

2. **Conversation coherence degrades after 5 turns.** Sliding window = 6 messages (3 turns) with local summarization that only captures first sentence + dollar amounts. ~60-70% of analytical context is lost by turn 5. The LLM repeats earlier analysis or misses user directives.

3. **Horizontal scaling blocked.** MCP server, embedding cache, memory cache, session state, and rate limiter are all in-memory. Sticky sessions or single-process deployment required.

### High-Priority Improvements

4. **Dollar impact missing from Decidir prompt.** `buildRemediationPrompt` has access to `action.impact` but doesn't include it. "Estimated recovery: $X/month" should be the first line.

5. **projectAll() called redundantly.** 4-6 times per request across different tool handlers. Should be cached on EngineContext.

6. **"What changed?" / "Any regressions?" shown to first-time users.** These produce empty results on first visit. Should be conditionally hidden.

7. **No filtered finding retrieval.** `get_finding_projections` returns ALL findings. Need `pack_filter`, `severity_filter`, `limit` params.

8. **KB content never reaches the LLM.** KB markers are client-side only. Add `get_kb_article` tool to ground remediation advice in curated content.

9. **Tool result summary limit (200 tokens) drops important data.** Maps, workspace projections, and change reports with many items lose significant detail.

10. **Output classifier runs post-streaming.** User already saw the response before safety check completes.

### Medium-Priority Improvements

11. **Missing "Quick Health Check" playbook** for trial activation.
12. **Playbooks are single-shot exhaustive** — discourage multi-turn engagement.
13. **No evidence-level drill-down tool** for "what exactly did you see?"
14. **Canary token hardcoded** — should derive from environment.
15. **Empty `.catch(() => {})` handlers** throughout — silent data loss.
16. **Greedy JSON regex in input-guard.ts** vs strict parser in pipeline.ts — inconsistency.
17. **System prompt with 26 tool definitions** sent even when user's plan doesn't support all tools.
18. **chars_per_token = 4 estimate** is wrong for pt-BR (~2.5-3 chars/token), overrunning context budget by ~30%.

---

## 3. Architectural Strengths (consensus across all 3 agents)

1. **Hybrid Input Guard** — Fast deterministic scoring (80% coverage) + Haiku fallback. Best-in-class cost optimization.
2. **Pre-Composed Business Answer Tools** — `answer_*` pattern converts hallucination-prone synthesis into structured retrieval.
3. **Multi-Layer Defense** — Input sanitization → fast guard → Haiku guard → core → Haiku classifier → canary detection. Fail-closed at every layer.
4. **Financial Impact Framing** — Every playbook demands dollar-denominated answers. The core differentiator vs. generic analytics.
5. **Verification Governance** — Policy-gated, budget-aware, 7-strategy taxonomy with closed-loop recomputation.

---

## 4. Priority Roadmap

### Next Sprint (1-2 weeks)

| # | Action | Impact | Effort |
|---|--------|--------|--------|
| 1 | Move 6 hardcoded prompts + prompt-gate strings to i18n | Critical (pt-BR broken) | Medium |
| 2 | Add dollar impact to `buildRemediationPrompt` | High (sales value) | Low |
| 3 | Cache `projectAll()` on EngineContext | High (CPU 3-5x reduction) | Low |
| 4 | Hide "What changed?" / "Regressions?" for first-cycle users | High (activation) | Low |
| 5 | Increase sliding window to 10 messages | High (coherence) | Low |
| 6 | Fix greedy JSON regex in input-guard.ts | Medium (security) | Low |
| 7 | Replace empty `.catch(() => {})` with console.warn | Medium (visibility) | Low |
| 8 | Add `limit`/`pack_filter` to finding projection tools | Medium (token efficiency) | Medium |

### Next Quarter (4-12 weeks)

| # | Action | Impact | Effort |
|---|--------|--------|--------|
| 1 | LLM-assisted conversation summarization (Haiku) | High (coherence +15%) | Medium |
| 2 | Redis-backed session/state store | Critical (scaling) | High |
| 3 | Add `get_kb_article` tool | Medium (grounding) | Medium |
| 4 | Add `get_finding_evidence` tool | Medium (user trust) | Medium |
| 5 | Tool registry pattern (replace switch statements) | Medium (maintenance) | Medium |
| 6 | Streaming-aware output classification | Medium (safety) | High |
| 7 | Conditional tool inclusion by plan tier | Low (token savings) | Medium |
| 8 | "Quick Health Check" playbook | Medium (activation) | Low |
| 9 | Embedding store migration to Redis/vector DB | Medium (scaling) | Medium |
| 10 | Circuit breaker for Anthropic API degradation | Medium (reliability) | Medium |

---

## 5. Missing Prompts (Sales Engineer recommendations)

1. **"Quick Health Check"** — 3 numbers (total revenue at risk, trust score, critical count) + 1 urgent fix. Demo opener + trial activation.
2. **"Competitor Benchmark"** — "How does my site compare to similar businesses?" Unique differentiator.
3. **Dashboard: "What regressed?"** — Shows monitoring value.
4. **Inventory: "Which pages drive the most revenue?"** — Connects inventory to financial impact.
5. **"Create a ticket"** Decidir option — Formats output as Jira/Linear ticket for delegation.

---

## 6. Prompt Anti-Patterns Identified

1. **Revenue Leak Audit packs 4 asks into 1 prompt** — risk of sprawling diluted response. Should be a 2-turn sequence.
2. **"Discuss" in Decidir opens blank copilot** — wasted opportunity. Should prefill context.
3. **Group context templates enumerate titles without severity/impact** — LLM receives wall of titles with no prioritization signal.
4. **Empty state prompt ("Give me a summary of what you see")** too vague — should be "Give me my site's health and top 3 issues costing me money."
5. **Prompt gate suggestions are deterministic** — misses paraphrases ("what problems do I have?" won't match "what's wrong?").
