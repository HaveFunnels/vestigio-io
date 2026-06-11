# Vestigio MCP + LLM Chat

## Overview

AI-powered commerce analyst that identifies revenue leakage, scaling risks, chargeback exposure, and growth opportunities. Claude LLM + 21 MCP tools + 30 expert playbooks.

Three design principles:
1. **Evidence-first** — every claim grounded in tool data from the organization's audit
2. **Cost-aware** — hybrid guard saves ~80% of Haiku calls; tiered summarization keeps tool results under 200 tokens; system prompt caching reduces input cost to 0.1x on multi-turn
3. **Security-layered** — 4-layer defense: sanitizer → fast guard → Haiku guard → output classifier (fail-closed)

---

## Architecture

```
User message
  │
  ▼
[1] Rate Limiter          Per-org sliding window (3/10/30 req/min by plan)
  │                       Redis sorted sets (production) or in-memory (dev)
  │                       Redis failure → in-memory fallback (never fail-open)
  ▼
[2] Input Sanitizer       Unicode NFKC normalization → XSS removal (16 patterns)
  │                       → control char stripping → HTML entity encoding → 2000 char truncate
  ▼
[3] Prompt Gate           Rule-based quality filter (misfire/weak/broad detection)
  │                       Weak prompts → emit prompt_suggestion SSE event (non-blocking)
  ▼
[4] Input Guard           HYBRID — two tiers:
  │  (Fast Guard)         Tier 1: Deterministic scoring (~80% of inputs, zero LLM cost)
  │                         Vestigio compound phrases (+3/+4), single keywords (+0/+1)
  │                         Personal context penalties EN/PT/ES (-3/-4), injection patterns (-5/-8)
  │                         Density check: long inputs with few signals → escalate
  │  (Haiku)              Tier 2: Haiku classifier (~200 tokens, only for ambiguous inputs)
  │                         Fallback: rule-based (10 regex patterns) if Haiku fails
  ▼
[5] Core Model            Sonnet 4.6 (Default) or Opus 4.6 (Ultra, Pro+ only)
  │                       System prompt with canary token + personality + tool rules + org context
  │  ◄── tool_use loop    Max 5 rounds. Verification budget: 1/request.
  │       │               Tool results summarized: top-5 full + next-10 compact (<200 tokens)
  │       ▼               Tool output sanitized for indirect injection patterns
  │  McpServer.callTool   21 tools against cached audit data (no external calls except verification)
  ▼
[6] Output Classifier     Haiku post-screen (FAIL-CLOSED)
  │                       Checks: hallucination, off-topic drift, data leakage, tone
  │                       Canary token check: detects system prompt leakage
  │                       Critical → fallback response. Non-critical → pass-through.
  ▼
[7] Persistence           Messages + tokens + cost → ConversationStore + TokenCostLedger
  │                       Cross-conversation memory updated (per-org, sanitized before injection)
  ▼
[8] SSE Stream            Events: guard, tool_start, tool_done, delta, prompt_suggestion, done, error
                          Frontend parses $$FINDING/ACTION/IMPACT/CREATEACTION$$ markers into ContentBlocks
                          Cards hydrated with real MCP data on "done" event via resolveCardData()
```

### File Map

```
apps/mcp/llm/                  # LLM Pipeline
  pipeline.ts                  # Orchestrator — hybrid guard + tool loop + canary check
  client.ts                    # Anthropic SDK singleton, retry/backoff/timeout/AbortSignal
  fast-guard.ts                # Deterministic scorer: compound phrases, personal context, density
  input-guard.ts               # Haiku classifier + rule-based fallback
  output-classifier.ts         # Haiku post-screen (fail-closed on all error paths)
  system-prompt.ts             # Personality, tool rules, i18n, canary token, cache_control
  tool-adapter.ts              # MCP→Claude bridge, tiered summarization, indirect injection sanitization
  context-manager.ts           # Sliding window (6 msgs), auto-compaction (600 chars), token budget (8K)
  sanitizer.ts                 # NFKC normalization, XSS removal, control chars, HTML encoding
  rate-limiter.ts              # Redis (sorted sets) or in-memory, with Redis→in-memory failover
  embeddings.ts                # OpenAI text-embedding-3-small (vector) or TF-IDF (fallback)
  conversation-memory.ts       # Per-org memory in PlatformConfig, sanitized before prompt injection
  types.ts                     # ModelTier, PipelineRequest/Response, guard/classifier types

apps/mcp/                      # MCP Engine
  server.ts                    # McpServer — tool dispatch, verification orchestration
  tools.ts                     # 20 tool definitions with input schemas
  playbook-prompts.ts          # 30 expert analysis prompts across 8 categories
  answers.ts                   # Deterministic answer composers
  prompt-gate.ts               # Quality filter (misfire/weak/broad/repetitive)
  context.ts                   # Engine context builder
  context-chaining.ts          # Finding→root_cause→action→verification chains

apps/platform/                 # Persistence
  token-cost.ts                # Cost calculator (integer arithmetic, actual Claude pricing)
  token-ledger.ts              # Per-call audit trail (InMemory + Prisma)
  conversation-store.ts        # Chat persistence (InMemory + Prisma), atomic cost updates

src/app/api/chat/route.ts      # POST — SSE streaming, multi-level auth, budget, persistence
src/app/api/conversations/     # CRUD: list, create, load, rename, soft-delete
src/lib/use-chat-stream.ts     # React hook — SSE consumer, block marker parser, card resolution
src/lib/chat-types.ts          # 11 ContentBlock types, model configs, SSE event types
src/app/(console)/chat/        # Chat page — sidebar + messages + input + playbooks
src/components/console/chat/   # 15 rendering components
```

---

## Models

| Frontend | Backend ID | Anthropic Model | Role | Cost |
|----------|-----------|----------------|------|------|
| *(hidden)* | `haiku_4_5` | `claude-haiku-4-5-20251001` | Guards + classifier | overhead |
| **Default** | `sonnet_4_6` | `claude-sonnet-4-6` | Chat | 1 unit |
| **Ultra** | `opus_4_6` | `claude-opus-4-6` | Deep analysis (Pro+) | 3 units |

System prompt static portion (~700 tokens) cached via `cache_control: { type: "ephemeral" }`. Multi-turn cost drops to 0.1x for subsequent messages.

---

## Tools (21)

| Tool | Description |
|------|-------------|
| `answer_can_i_scale` | Scale readiness with blockers and confidence |
| `answer_where_losing_money` | Revenue leakage with quantified impact |
| `answer_underlying_cause` | Root cause analysis across packs |
| `answer_fix_first` | Prioritized actions ranked by impact |
| `get_finding_projections` | All findings with financial impact (severity, range, confidence, pack, root cause) |
| `get_action_projections` | All actions with impact estimates, priority scores, decision status, verification maturity |
| `get_root_causes` | Root causes connecting problems across packs |
| `get_workspace_summary` | High-level overview: packs, root causes, health status |
| `get_prioritized_actions` | Deduplicated global action ranking |
| `get_preflight_status` | Readiness score, blockers, risks |
| `get_revenue_integrity_summary` | Leakage points, trust gaps, measurement gaps |
| `get_decision_explainability` | Why a specific decision was made (per pack) |
| `get_graph_path_summary` | Evidence graph: pages, hosts, providers, redirects, trust gaps |
| `get_workspace_projections` | Workspace summaries with scoped findings and change summaries |
| `get_change_report` | Cycle-to-cycle change report: regressions, improvements, trend |
| `get_map` | Causal visualization (revenue_leakage, chargeback_risk, root_cause) |
| `discuss_finding` | Deep dive into one finding |
| `analyze_findings` | Cross-analysis of multiple findings |
| `request_verification` | Browser/HTTP verification. **Budget: 1/request. User must ask explicitly.** |
| `get_verification_status` | Poll verification result |
| `list_verifications` | List all verification requests |

**Safety**: 20 safe (read-only, cached data) + 1 expensive (`request_verification` -- Playwright/HTTP).

**Summarization**: Findings top-5 full + next-10 compact (~200 tokens). Actions top-5 + next-5. All others <200 tokens. Change report summarized to trend + top regressions.

---

## Playbooks (30)

Expert prompts for cross-finding correlational analysis. 8 categories, plan-gated.

| Category | Count | Examples |
|----------|-------|---------|
| Revenue Leaks | 5 | Full audit, compound leaks, quick wins, hidden costs, seasonal risk |
| Conversion | 4 | Bottleneck map, checkout deep dive, mobile gap, A/B test candidates |
| Chargeback | 3 | Risk matrix, policy gaps, 30-day prevention roadmap |
| Onboarding | 3 | Friction map, first-visit trust barriers, signup flow |
| Trust | 3 | Signal completeness (7 dimensions), gap analysis, checkout confidence |
| Landing vs App | 3 | Promise-reality gap, CTA analysis, pricing transparency |
| Measurement | 3 | Analytics blind spots, fix ROI calculator, confidence review |
| Competitive | 3 | Weakness map, differentiation, scale readiness (10x test) |

Plus 3 cross-category: cross-pack correlation, executive summary, regression watchlist.

**UX**: Empty state shows 5 featured cards. PlaybooksDrawer has full catalog with category tabs, search, expand-to-preview, budget indicator. Click "Use prompt" → paste into chat.

---

## Content Blocks (11)

Messages are `ContentBlock[]`. Each type has a dedicated renderer.

| Type | What it shows |
|------|-------------|
| `markdown` | Headings, bold, italic, lists, tables, code blocks, links, blockquotes |
| `finding_card` | Severity bar + title + $min-$max/mo + pack + confidence + root cause |
| `action_card` | Priority circle + title + savings + cross-pack badge |
| `impact_summary` | Red box: $mid ($min–$max) /mo |
| `confidence` | Colored dot + percentage |
| `tool_call` | Spinner→checkmark, label ("Analyzing findings..."), duration, expandable result |
| `suggested_prompts` | Clickable follow-up question pills |
| `create_action` | Amber form: editable title, description, severity, impact. "Save as action" |
| `navigation_cta` | Buttons to Analysis, Maps, Actions pages |
| `quote` | Left-bordered blockquote with source |
| `data_rows` | Key-value table with severity badges |

**Markers**: Claude emits `$$FINDING{id}$$`, `$$ACTION{id}$$`, `$$IMPACT{json}$$`, `$$CREATEACTION{json}$$`. Frontend parses into typed blocks. Cards hydrated with real MCP data on stream completion.

---

## Security

### Defense Layers

| Layer | Cost | What it catches |
|-------|------|----------------|
| **Input Sanitizer** | 0 | XSS (16 patterns removed), control chars, null bytes. NFKC normalization catches fullwidth/homoglyph bypass (`＜script＞` → caught). |
| **Fast Guard** | 0 | ~80% of inputs. Compound Vestigio phrases (+4), personal context penalties in EN/PT/ES (-4), injection patterns (-8). Density check for long inputs with sprinkled keywords. |
| **Haiku Guard** | ~200 tokens | Ambiguous inputs only. 6 categories: clean, injection, off_topic, pii, xss, policy. Strict first-object JSON parsing (no multi-JSON bypass). |
| **Output Classifier** | ~200 tokens | Hallucination, drift, leakage, tone. **Fail-closed**: crash/unparseable → treat as unsafe. Canary token detects system prompt leakage. |

### Additional Hardening

- **Canary token** (`VSTG-CANARY-*`) embedded in system prompt. If it appears in Claude's response → response replaced with generic fallback + error logged.
- **Memory injection protection**: All cross-conversation memory fields sanitized (5 injection patterns neutralized, 200 char cap, control chars stripped) before system prompt injection.
- **File attachment sanitization**: Filenames stripped of path traversal, control chars, newlines (80 char cap). Total file content capped at 25K chars. Max 3 files.
- **Tool result indirect injection**: Tool output sanitized for embedded injection patterns ("ignore instructions", `[SYSTEM]` tags, `system prompt`, HTML tags) since finding titles originate from external website data.
- **Rate limiter fail-safe**: Redis failure → automatic fallback to in-memory rate limiting (never fail-open).
- **Total payload enforcement**: Message + files hard-capped at 30K chars.
- **Verification budget**: Enforced in pipeline with count passed to tool-adapter. Blocked tools not recorded as successful calls.

### Auth Chain

```
NextAuth session → userId → Membership.findFirst({ userId }) → org → env belongs to org
```

### Budget Protection

| Control | Limit |
|---------|-------|
| Rate limit | 3/10/30 req/min (vestigio/pro/max) |
| Daily budget | 5/25/100 queries/day |
| Ultra cost | 3 units, checked atomically before commit |
| Verification | 1 per request |
| Tool loop | 5 rounds max |
| Message size | 2000 chars |
| Conversation | 50 messages, 50KB total |
| Payload (msg+files) | 30K chars |

---

## Conversation Persistence

```
Conversation
  ├─ id, organizationId, userId, environmentId
  ├─ title (auto from first message, inline-editable)
  ├─ status: active | archived | deleted (soft delete)
  ├─ messageCount, totalCostCents, totalInputTokens, totalOutputTokens
  └─ messages[]

ConversationMessage
  ├─ role: user | assistant
  ├─ content, model, inputTokens, outputTokens, costCents
  ├─ toolCalls: JSON [{ tool, ms }]
  └─ purpose: core_chat | context_summary

TokenCostLedger
  ├─ orgId, userId, conversationId, model, purpose
  ├─ inputTokens, outputTokens, cacheCreation, cacheRead
  └─ costCents, latencyMs, isToolUse
```

Dual store: InMemory (dev) + Prisma (production). Cross-conversation memory per-org in PlatformConfig.

---

## Context Management

- **Window**: Last 6 messages in full (3 turns)
- **Overflow**: Older messages summarized locally (zero LLM cost) — extracts dollar amounts, finding refs, first sentence
- **Compaction**: Summary capped at 600 chars. Oldest entries dropped first.
- **Token budget**: 8000 tokens total. Trim removes from middle (preserves summary + latest message).
- **Exploration state**: Tracks explored packs, maps, and asked questions to avoid repetition.

---

## Chat UI

```
┌───────────────────────────────────────────────────┐
│ Sidebar (280px)  │         Chat Area               │
│ ┌──────────────┐ │ ┌───────────────────────────┐   │
│ │ Search...    │ │ │ Budget bar (radial ring)   │   │
│ │ + New chat   │ │ ├───────────────────────────┤   │
│ │              │ │ │                           │   │
│ │ Today        │ │ │  [User message]       ──► │   │
│ │  ▸ Revenue   │ │ │  [ThinkingIndicator]      │   │
│ │  ▸ Scale     │ │ │  [ToolCallStep ✓]         │   │
│ │ Yesterday    │ │ │  [Markdown + FindingCard]  │   │
│ │  ▸ Checkout  │ │ │  [ImpactSummary]          │   │
│ │              │ │ │  [SuggestedPrompts]       │   │
│ │              │ │ │  [copy|retry|👍👎]        │   │
│ └──────────────┘ │ ├───────────────────────────┤   │
│                  │ │ [FileChips] [📎] [🎤]     │   │
│                  │ │ [textarea]    [Model ▾]   │   │
│                  │ └───────────────────────────┘   │
└───────────────────────────────────────────────────┘
```

15 components: ConversationSidebar, ChatMessageRenderer, ChatMarkdown, ChatInputBar, ModelSelector, MessageActions, ThinkingIndicator, ToolCallStep, FindingCard, ActionCard, CreateActionCard, FileUploadZone, VoiceInput, StreamingCursor, PlaybooksDrawer.

---

## SSE Events

| Event | Data | Frontend action |
|-------|------|----------------|
| `guard` | `{ safe, category }` | If blocked → show error message |
| `tool_start` | `{ tool, label }` | Add ToolCallBlock (spinning) |
| `tool_done` | `{ tool, summary }` | Update ToolCallBlock (checkmark) |
| `delta` | `{ text }` | Accumulate text → parse markers → ContentBlocks |
| `prompt_suggestion` | `{ original, suggested, reason }` | Show rewrite suggestion |
| `done` | `{ request_id, response, tokens, cost_cents, findings_data, actions_data, mcp_remaining }` | Resolve cards, finalize message |
| `error` | `{ message, code }` | Show error banner |

---

## Plan Limits

| Feature | Vestigio ($99/mo) | Pro ($199/mo) | Max ($399/mo) |
|---------|-------------------|---------------|---------------|
| Daily queries | 5 | 25 | 100 |
| Rate limit | 3/min | 10/min | 30/min |
| Ultra model | No | Yes | Yes |
| Pro playbooks | No | Yes | Yes |
| Playwright/day | 0 | 5 | 20 |
| Environments | 1 | 3 | 10 |
| Team members | 1 | 3 | 10 |

---

## i18n

Locale detected from `NEXT_LOCALE` cookie or `Accept-Language` header. Claude responds in the user's language (EN, PT-BR, ES, DE). Technical terms stay in English.

---

## Environment Variables

```bash
ANTHROPIC_API_KEY=sk-ant-...       # Required — Claude API key
VESTIGIO_LLM_ENABLED=true         # Required — false = deterministic fallback
DATABASE_URL=postgresql://...      # Required — conversation persistence
OPENAI_API_KEY=sk-...             # Optional — vector semantic search (recommended >100 findings)
REDIS_URL=redis://...             # Optional — distributed rate limiting (Railway auto-injects)
```

---

## Limitations

1. **Cached data only** — findings may be stale if site changed since last audit. Freshness tracked and communicated.
2. **1 verification per request** — prevents cost overrun but limits automated re-checking.
3. **6-message context window** — older messages compressed. Long conversations lose nuance from early exchanges.
4. **No conversation export** — can't export as PDF/text yet.
5. **Single org per chat** — no cross-org analysis.
6. **In-memory stores in dev** — no persistence without PostgreSQL.

## Possible Improvements

1. Conversation export (`GET /api/conversations/[id]/export?format=pdf|txt|md`)
2. Conversation branching (alternate paths from a message)
3. Multi-org pattern analysis (admin, anonymized)
4. Autonomous agent (proactive re-analysis on data changes)
5. Collaborative conversations (multi-user threads)
6. Custom playbooks (user-created prompt templates)
7. API access (REST/GraphQL for Slack, Notion, Linear integration)

---

## Test Suites

| Suite | Tests | What it verifies |
|-------|-------|-----------------|
| `tests/mcp.test.ts` | 43 | MCP engine: server lifecycle, tools, answers, verification, scope isolation, freshness |
| `tests/playbook-coverage.test.ts` | 57 | All 30 playbooks: structure, guard pass, tool availability, data fields, system prompt, summarization, cross-pack |
| `tests/fast-guard-adversarial.test.ts` | 47 | Guard bypass resistance: PT/ES off-topic, keyword weaponization, injection camouflage, personal context |
| `tests/security-hardening.test.ts` | 38 | NFKC normalization, memory injection, canary token, personal context penalties, density check, sanitizer |

```bash
npx tsx tests/mcp.test.ts
npx tsx tests/playbook-coverage.test.ts
npx tsx tests/fast-guard-adversarial.test.ts
npx tsx tests/security-hardening.test.ts
npx tsc --noEmit
```
