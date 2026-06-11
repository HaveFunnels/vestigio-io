# INSTRUCTIONS_INVENTORY.md — Where the engine's accuracy comes from words

> Last updated: 2026-05-23
> Purpose: map every place in the codebase where natural-language instructions, prompts, or reasoning narratives are load-bearing for analysis accuracy. Each entry includes file path, scale, a representative sample, and a candid assessment of clarity / guidance quality so improvements can be prioritized.

This is a study aid, not a feature spec. The goal is to know what is *promptable* (and therefore tunable) in the engine and where the next dollar of clarity work would compound the most.

---

## Quick map (count, size, leverage)

| # | Category | Files | Entries | Avg length | Customer-visible? | Mutability |
|---|----------|-------|---------|-----------|-------------------|------------|
| 1 | **LLM enricher prompts** | 7 in `workers/ingestion/enrichment/` | ~12 SYSTEM_PROMPTs | 25-60 lines each | No (model only) | High (string change → behavior change) |
| 2 | **Identity / classification LLM** | 2 in `apps/audit-runner/` | 2 prompts | 1-5 lines | No (model only) | High |
| 3 | **MCP conversational system prompt** | `apps/mcp/llm/system-prompt.ts` | 1 prompt | 210 lines | Yes (chat answers) | Very high |
| 4 | **MCP tool descriptions** | `apps/mcp/tools.ts` | 49 strings | 1-3 sentences | Indirect (Claude routes by reading these) | High |
| 5 | **Playbook prompts** | `apps/mcp/playbook-prompts.ts` | 36 prompts | 4-8 sentences | Yes (customer triggers them) | High |
| 6 | **Inference reasoning narratives** | `packages/inference/packs/*.ts` | 177 reasoning strings | 4-7 sentences | Yes (rendered as finding body) | High |
| 7 | **Impact baselines** | `packages/impact/baselines.ts` | 255 cause / effect pairs | 1-2 sentences each | Yes (rendered in finding cards) | Medium |
| 8 | **Root cause taxonomy** | `packages/intelligence/root-causes.ts` | ~80 root causes + mappings | 1 sentence each | Yes (root-cause labels) | Medium |
| 9 | **Copy guidelines KB** | `packages/copy-analysis/guidelines.ts` | 80 guidelines × {rule, good, bad} | ~3 lines each | Indirect (fed into copy-pack LLM context + cited in MCP) | High |
| 10 | **Remediation catalog** | `packages/projections/remediation-catalog.ts` | 293 fix recipes | 1-2 paragraphs each | Yes (Actions UI) | High |
| 11 | **Static-check narratives** | `workers/ingestion/stages/static-checks.ts` | 6 descriptions | 1-2 sentences | Yes (findings) | High |

Total: **~1,000 individual instruction strings** the customer or the LLM depends on for accuracy. The five biggest leverage points are bolded in each section below.

---

## 1. LLM enricher prompts

Every enrichment pass that calls Anthropic has its own SYSTEM_PROMPT defining the analyst persona + scoring rubric + JSON output schema. These are where the model learns *what to look at* on the page.

| File | Persona | Lines | Notes |
|------|---------|-------|-------|
| [workers/ingestion/enrichment/semantic-enrichment.ts](workers/ingestion/enrichment/semantic-enrichment.ts) | **5 different personas** in one file: policy quality analyst, checkout trust analyst, CTA clarity analyst, product page copy analyst, pricing page analyst | 26-30 each, 1501 total | Biggest single concentration. Each persona has its own rubric. **High leverage** — these are the prompts that produce 70% of LLM-derived findings. |
| [workers/ingestion/enrichment/ad-message-match.ts](workers/ingestion/enrichment/ad-message-match.ts) | "ad-landing-page consistency analyst" | ~25 | Compares ad creative ↔ LP. Detects waste signal. |
| [workers/ingestion/enrichment/copy-localization.ts](workers/ingestion/enrichment/copy-localization.ts) | "localization quality analyst specializing in persuasive copy" | ~25 | Cross-locale persuasive structure comparator. |
| [workers/ingestion/enrichment/copy-micro-copy.ts](workers/ingestion/enrichment/copy-micro-copy.ts) | "micro-copy specialist" | ~25 | Form labels, button text, errors, placeholders. |
| [workers/ingestion/enrichment/copy-seo-tension.ts](workers/ingestion/enrichment/copy-seo-tension.ts) | "SEO-conversion tension analyst" | ~25 | Detects over-optimized copy. |
| [workers/ingestion/enrichment/cross-page-copy.ts](workers/ingestion/enrichment/cross-page-copy.ts) | "cross-page narrative consistency analyst" | ~25 | Detects contradictions, tone shifts across pages. |
| [workers/ingestion/enrichment/pricing-psychology.ts](workers/ingestion/enrichment/pricing-psychology.ts) | "pricing psychology specialist" (built dynamically from guidelines KB) | dynamic | The only one that **composes the prompt at runtime** from the guidelines knowledge base (item 9). Pattern worth replicating elsewhere. |

**Sample (semantic-enrichment, policy analyst)**:
> "You are a policy quality analyst. You assess e-commerce policy pages (refund, privacy, terms, shipping, etc.) for clarity, completeness, and consumer-friendliness."

**Improvement opportunities**:
- These 7 personas were written independently; the voice is **inconsistent across passes**. Some use first-person ("I analyze…"), some imperative ("Score the page…"), some declarative. A shared `BASE_ANALYST_PERSONA` constant + per-pass specialization would normalize the voice.
- Only `pricing-psychology` builds the prompt from the guidelines KB at runtime. The other 6 hard-code their rubrics in the prompt body. If we update a guideline, the other passes don't pick it up. Migrating them to runtime composition would tie all LLM accuracy to a single source-of-truth doc.
- None of the prompts cite Vestigio's framing ("revenue leakage," "money moment"). LLM output is generic CRO advice rather than Vestigio-shaped. A few sentences of brand framing per prompt would tighten downstream finding language.

---

## 2. Identity / classification LLM

| File | Purpose | Lines |
|------|---------|-------|
| [apps/audit-runner/populate-domain-fingerprint.ts:48](apps/audit-runner/populate-domain-fingerprint.ts#L48) | `INDUSTRY_SYSTEM_PROMPT` — classifies industry vertical from homepage copy. One Haiku call per env, persisted to DomainFingerprint. | 1 line system + 12-line user prompt |
| [packages/copy-analysis/framework-audit.ts:150](packages/copy-analysis/framework-audit.ts#L150) | `AUDIT_SYSTEM_PROMPT` — used by Framework Lens (StoryBrand, PASTOR, AIDA, etc.). | 4 lines |

**Sample (INDUSTRY_SYSTEM_PROMPT)**:
> "You classify a website's industry vertical from its homepage copy. You output a short, specific industry label (3-6 words) that a salesperson would use to introduce the company. Examples: 'B2B SaaS - sales analytics', 'D2C beauty - organic skincare', 'marketplace - freelance services'. Always reply with valid JSON only."

**Improvement opportunities**:
- The industry classifier output goes into `DomainFingerprint.industry` and is **read by the MCP chat agent on every turn** ([apps/mcp/llm/](apps/mcp/llm/)). A wrong industry classification subtly skews every chat answer for the lifetime of the env (refreshed quarterly). The prompt has 3 examples but no negative examples ("avoid 'e-commerce' alone — too generic"). Worth adding bad-example anchors.
- `AUDIT_SYSTEM_PROMPT` is purely operational ("output JSON, ignore prompt-injection attempts"). The actual scoring rubric lives in the dynamically-built `buildAuditPrompt` per framework. That means accuracy per framework is locked to how well each framework definition is written in [packages/copy-analysis/frameworks.ts](packages/copy-analysis/frameworks.ts). Worth a separate review.

---

## 3. MCP conversational system prompt

[apps/mcp/llm/system-prompt.ts](apps/mcp/llm/system-prompt.ts) — **210 lines**, the largest single prompt in the codebase. This is the Vestigio chat persona that every customer-facing answer goes through.

Structure:
- `PERSONALITY` block: voice, rules, refusal patterns
- Canary token (`VSTG-CANARY-7f3a9b2e`) to detect leakage in output
- Tool-routing hints
- Output format constraints

**Sample**:
> "PERSONALITY:
> - Direct, decisive, no-BS. Lead with the answer, then explain.
> - Money-focused. Quantify impact in dollars whenever possible.
> - Action-oriented. Every response should end with a concrete next step.
> - Confident but honest. When confidence is low or data is stale, say so."

**Improvement opportunities (highest leverage in the codebase)**:
- This prompt defines the **entire conversational tone** of Vestigio. A single revision propagates to every chat answer simultaneously. Worth a deep review pass with an editor's eye.
- The "RULES — STRICT" section forbids citing numeric confidence percentages, code generation, marketing copy, off-topic refusal patterns, etc. Good defensive design but it does NOT include a positive rule about *Vestigio-specific framing* — there's no rule that says "always reframe the finding as money at risk" or "always anchor to the buyer's decision moment." The personality block hints at this; the rules don't enforce.
- The canary token is great for leakage detection but the rest of the prompt is plaintext — a careful exfil attack could still pull personality/rules out. Marginal concern, but worth knowing the threat model.

---

## 4. MCP tool descriptions

[apps/mcp/tools.ts](apps/mcp/tools.ts) — **49 tool definitions**, each with a `description` field Claude reads to decide which tool to call.

This is where tool-selection accuracy comes from. If `get_finding_projections` description is vague, Claude calls it for queries that should hit `get_root_causes` instead.

**Sample (good — narrow, specific)**:
> `analyze_copy`: "Get copy analysis summary. If a URL is provided, returns findings for that specific page. If no URL, returns overall copy health (dimension scores, top issues, grade)."

**Sample (improvable — overlaps with neighbors)**:
> `answer_intent`: "Answer one of the canonical business questions with a structured McpAnswer (direct answer + confidence + freshness + recommended next step + supporting refs)."

The 5 intents (`can_i_scale`, `where_losing_money`, `payment_health`, `underlying_cause`, `fix_first`) are documented in the `input_schema.intent` enum description, but the top-level description doesn't hint at when to prefer this over the deeper-data tools (`get_root_causes`, `get_prioritized_actions`). Claude routes correctly most of the time but the description doesn't make it obvious.

**Improvement opportunities**:
- 49 descriptions written incrementally across 6 months. **Inconsistent voice + varying specificity**. Some lead with the data shape; some lead with the use case.
- Some tools are nearly synonymous from Claude's POV: `get_finding_projections` vs `get_prioritized_actions` vs `analyze_findings`. The descriptions don't disambiguate strongly enough.
- Consider adding a "use when..." / "not for..." pair per tool. PostHog Code's tool registry uses this pattern and reportedly cut wrong-tool calls ~40%.

---

## 5. Playbook prompts

[apps/mcp/playbook-prompts.ts](apps/mcp/playbook-prompts.ts) — **36 pre-canned questions** the customer can launch from the chat UI. Each is essentially a prompt template that Claude expands using the customer's data.

| Category | Count |
|---|---|
| Revenue Leaks | 4 |
| Conversion | 4 |
| Chargeback | 3 |
| Onboarding | 4 |
| Strategic (sweep/seasonal/executive) | 6 |
| Copy Audit | 5 |
| ... | rest split across other lenses |

**Sample**:
> `revenue_compound_leaks`: "I want to find compound revenue leaks — places where multiple findings share a causal root and stack their impact. Walk me through any root cause that has more than 2 findings attached. For each: explain the causal chain, sum the impact, and tell me which one fix would resolve the most simultaneously..."

These are simultaneously **chat prompts** AND **product copy** (the title + description show up in the playbook picker UI). Quality of writing here directly drives:
- Customer's *expectation* of what Vestigio knows (do they trust the playbook will give them something specific?)
- Claude's *output structure* (the prompt's wording often determines whether the answer is a bulleted list, a narrative, or a single recommendation)

**Improvement opportunities**:
- Several playbooks tell Claude to "walk me through" — Claude tends to over-deliver on this verb, producing very long replies. A single editing pass replacing "walk me through" with "summarize" / "rank" / "list" would shorten + sharpen answers.
- Playbook prompts don't reference Vestigio-specific concepts ("money moment," "revenue leakage chain"). Customer reads them as generic CRO playbooks. Tightening with vocabulary that only Vestigio uses would make these feel proprietary.

---

## 6. Inference reasoning narratives

[packages/inference/packs/*.ts](packages/inference/packs/) — **177 inference functions**, each calling `createInference({ reasoning: ... })` with a 4-7 sentence narrative. The narrative is what the customer sees as the "why" on every finding card.

Largest pack reasoning blocks:
- `evidence-derived.ts` — 28 reasoning strings (Phase 30/2/2B/2C bundle)
- `behavioral.ts` — 20
- `copy-alignment.ts` — 19
- `commerce-context.ts` — 14
- `security-posture.ts` — 13

**Sample (commerce-context, `cart_variant_weak_pricing_control`)**:
> "Multiple cart or checkout route variants were discovered through deep crawling. Alternate cart paths often carry weaker price validation, missing inventory checks, or inconsistent tax calculations compared to the primary flow. When pricing controls are not uniform across all cart variants, the weakest path becomes the attack surface — bots route through whichever variant applies the fewest safeguards."

**Improvement opportunities**:
- These were written largely in one pass over Waves 18-20 — voice is **fairly consistent** (third-person, present tense, causal chain). One of the higher-quality areas of the codebase.
- However: most reasoning narratives **end on the abstract harm** ("buyers abandon," "trust degrades") rather than the *quantified consequence* ("a 1% conversion drop on R$ 100k MRR = R$ 1k/mo at risk"). Impact baselines (item 7) carry the number but it's rendered separately. Inlining a one-line `What this costs:` summary inside the reasoning would tighten the read.
- The 4 mostly-empty packs (action-value-map, friction-tax, trust-revenue-gap, path-efficiency, etc.) use the `inferCohort` builder and the reasoning lives inside `builders.ts` rather than inline. That's a different access pattern; worth knowing.

---

## 7. Impact baselines

[packages/impact/baselines.ts](packages/impact/baselines.ts) — **255 entries**, each with `cause` + `effect` text strings + range_min/max/midpoint multipliers.

| Field | Purpose |
|---|---|
| `cause` | One-sentence root cause statement (rendered on finding card) |
| `effect` | One-sentence buyer-behavior outcome (rendered on finding card) |
| `high/medium/low` | Range buckets for impact estimation |

**Sample (`trust_boundary_crossed`)**:
> cause: "Checkout trust continuity broken"
> effect: "Buyers exit the funnel when handoff to a third-party payment domain breaks visual continuity..."

**Improvement opportunities**:
- Cause + effect strings are the **canonical product framing** of each finding — they show on cards, in alerts, in chat answers. **Highest leverage per word** of any instruction surface.
- Quality varies: some causes are crisp (`"Checkout trust continuity broken"`), some are vague (`"Mobile commercial path blocked"`). A pass with the "customer would underline this if they read it on the dashboard" filter would tighten ~30% of them.
- The POSITIVE_IMPACT_BASELINES sub-section (Phase 1.2, ~5 entries) hasn't been expanded to match the loss side. Each negative cause could have a paired retention narrative ("Checkout trust continuity intact — buyers complete the handoff without resistance"). Wave 21.5 surfaces retention value but only 5 keys have prose. Worth expanding.

---

## 8. Root cause taxonomy

[packages/intelligence/root-causes.ts](packages/intelligence/root-causes.ts) — 799 lines, ~80 root cause entries + the `inference_key → root_cause` mapping.

Each root cause has a key like `decision_moment_anxiety`, a category like `funnel_journey_friction`, an impact_types array. The labels surface in the UI as "Causa raiz" badges on each finding.

**Sample of key/category pairs**:
> `first_impression_failure` → category: `funnel_journey_friction` → impact: `revenue_loss`
> `decision_moment_anxiety` → category: `funnel_journey_friction` → impact: `revenue_loss + trust_erosion`

**Improvement opportunities**:
- The labels themselves ("decision_moment_anxiety", "consideration_friction") read like technical taxonomy keys, not customer language. They get i18n'd via [`dictionary/pt-BR.json` console.root_causes.*](dictionary/pt-BR.json) but the i18n keys are the raw labels — so a missing translation = the customer sees `decision_moment_anxiety` literally. Worth auditing the i18n coverage of this file specifically.
- Several inference keys have NO root_cause mapping (they fall through to `'unknown'`). The Wave 20.6 invariant check now catches them; current count is 15 mapped recently. See `scripts/check-invariants.ts`.

---

## 9. Copy guidelines KB

[packages/copy-analysis/guidelines.ts](packages/copy-analysis/guidelines.ts) — **80 guidelines × {rule, good_example, bad_example}**. The body of knowledge that powers the copy-pack LLM enrichers (item 1) and the analyze_copy MCP tool (item 4).

**Sample (`hero_value_prop_5s`)**:
> rule: "The hero value proposition must be understood within 5 seconds of landing on the page."
> good_example: "Your hero clearly states the outcome ('Get paid faster — invoice in 30 seconds')."
> bad_example: "Hero says 'Welcome to Acme — the future of business' without explaining the outcome."

**Improvement opportunities**:
- This is one of the **highest-quality instruction surfaces** in the codebase. Each guideline is structured (rule + concrete examples), enabling consistent LLM grounding.
- However: only `pricing-psychology` enricher reads these at runtime. Other copy-pack enrichers hard-code their rubrics in their SYSTEM_PROMPT. Reusing this KB across all copy enrichers (per item 1 above) would tie copy-pack accuracy to a single editable doc.
- Guidelines are en-only. The copy-pack analyzes pt-BR + es + en customer sites but evaluates them against English rules. Some of the rules (e.g. "headline length") translate without loss; others (e.g. specific word choice rules) don't.

---

## 10. Remediation catalog

[packages/projections/remediation-catalog.ts](packages/projections/remediation-catalog.ts) — **293 fix recipes**. Each finding key maps to one or more concrete remediation steps that appear in the Actions UI.

**Sample (`trust_boundary_crossed`)**:
> "Mantenha o checkout no mesmo domínio do site principal. Use sub-rotas (/checkout) em vez de redirecionar para um domínio terceiro. Se for inevitável (Stripe Checkout hospedado, Pagar.me etc.), comunique explicitamente — 'Você será redirecionado para [provedor] — pagamento seguro' — e use logos do provedor antes do redirect."

**Improvement opportunities**:
- This catalog is **partially pt-BR, partially en**. A pass to ensure full bilingual parity is overdue.
- Some entries are concrete recipes; others are abstract advice ("improve trust signals"). The concrete ones are 10x more actionable. Pass with the "could a non-technical operator follow this in 15 minutes?" filter would tighten ~25%.
- Several finding keys recently added (Wave 20.6 sweep, the 15 orphans) don't have remediation entries. They fall through to a generic message. Worth completing.

---

## 11. Static-check narratives

[workers/ingestion/stages/static-checks.ts](workers/ingestion/stages/static-checks.ts) — only **6 inline `description` strings** that get attached to findings directly from static checks (SPF/DKIM/DMARC missing, favicon missing, etc.).

**Sample (DMARC missing)**:
> "Anyone can send emails pretending to be your brand — without DMARC, phishing emails using your domain go unchallenged, eroding buyer trust and triggering fraud alerts at payment processors."

**Improvement opportunities**:
- Small surface, high quality. These 6 strings are some of the best-written in the codebase — concrete cause, concrete consequence, money/trust framing.
- Pattern to replicate in items 6 + 7 above.

---

## Recommendation: priority order for improvement work

If we had two engineering days to spend on instruction quality, in order of ROI:

1. **MCP conversational system prompt (item 3)** — single edit, propagates to every chat answer. Add Vestigio-specific framing rules; tighten the "what we never say" list.
2. **Impact baseline cause/effect strings (item 7)** — most-rendered customer-facing strings in the product. Pass with the underline-test filter; expand positive baselines from 5 to ~30.
3. **MCP tool descriptions (item 4)** — add "use when... / not for..." pairs. Reduces wrong-tool routing measurably.
4. **LLM enricher prompts (item 1)** — extract a shared persona, migrate the 6 hard-coded prompts to read from the guidelines KB.
5. **Remediation catalog (item 10)** — bilingual parity audit + concrete-recipe pass.

Items 5 (playbooks), 6 (inference reasoning), 8 (root causes), 9 (copy guidelines), 11 (static checks) are already in good shape and benefit from incremental polish rather than dedicated investment.

---

## How to add a new instruction surface to this inventory

When a new wave adds a prompt, a system message, a description string, or a reasoning narrative:

1. Identify the category (or add a new one).
2. Drop a one-line entry in the appropriate table.
3. Sample the writing if it's customer-visible.
4. Note any improvement opportunity that's obvious on first read.

The inventory is searchable: `git grep "instruction"` should always land back here.
