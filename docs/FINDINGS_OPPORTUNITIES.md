# FINDINGS_OPPORTUNITIES.md — Strategic Finding & Intelligence Expansion

> Last updated: 2026-04-05
> Grounded in: current codebase inspection
> Companion to: [FINDINGS.md](FINDINGS.md), [COLLECT.md](COLLECT.md), [COLLECT_OPPORTUNITIES.md](COLLECT_OPPORTUNITIES.md)

---

## 1. Purpose

This document maps **finding and intelligence opportunities that strengthen Vestigio's decision-first architecture**. It is not a brainstorm list. It is not a quest to maximize finding count.

Every opportunity here must answer at least one of:
- Does it create a better **decision**?
- Does it strengthen an **action** with clearer resolve path?
- Does it make **preflight** more reliable?
- Does it make **workspaces** more coherent?
- Does it make **MCP** more explainable?
- Does it create a credible **incident** or **opportunity** candidate?

Opportunities that would only produce a low-signal finding in a table — without improving decisions, actions, or operational surfaces — are excluded.

### What was completed

15 of the 20 original opportunities (FO-1 through FO-20) are implemented and listed in [FINDINGS.md § E](FINDINGS.md). The remaining 5 rule-based gaps are included here alongside new composite, AI-driven, and cybersecurity proposals.

---

## 2. Prioritization Principles

Each opportunity is evaluated against these criteria. An opportunity must score well on at least 3 to qualify for "implement now."

| # | Criterion | Question |
|---|-----------|----------|
| P1 | Material decision improvement | Does this change the outcome of a decision, or only add detail to an already-correct one? |
| P2 | Incident / opportunity collapse | Does it cleanly produce an incident or opportunity, or just a finding that sits in a table? |
| P3 | Preflight leverage | Does it change a preflight readiness_score, add a blocker, or add a risk? |
| P4 | Workspace coherence | Does it make a workspace summary more complete, or add noise? |
| P5 | Action clarity | Does it improve an action's resolve_path, effort_hint, or blast_radius? |
| P6 | MCP explainability | Does it make `discuss_finding` or `answer_*` tools more useful? |
| P7 | Retention / recurrence | Does it give users a reason to re-run analysis or track over time? |
| P8 | Evidence grounding | Is it grounded in evidence already collected, or does it need new collection? |
| P9 | Low false-positive risk | Will it fire correctly >90% of the time, or create noise? |

---

## 3. Priority Summary

### Implement Now

High leverage, grounded in existing evidence, directly strengthens decisions or preflight.

| # | Name | Type | Best Surface |
|---|------|------|-------------|
| CO-1 | Scale Trap on Critical Path | Composite | Preflight blocker, Incident candidate |
| CO-2 | Trust Asymmetry at Money Moment | Composite | Revenue finding, Workspace anchor |
| CO-3 | Single Point of Commercial Failure | Composite | Preflight blocker, Incident candidate |
| CO-4 | Confidence & Verification Gap | Composite | Preflight warning, Governance |
| CO-5 | High-Blast-Radius Regression | Composite | Incident candidate, Preflight blocker |
| CO-6 | Opportunity Compression | Composite | Action enhancement, MCP artifact |
| FO-17 | Trust Surface Strength Score | Rule-based | Preflight, Workspace anchor |
| CS-P1 | Security Header Posture | Cybersecurity | Finding, Preflight risk |
| CS-P1 | Mixed Content on Commercial Pages | Cybersecurity | Finding, Incident candidate |
| AI-1 | Policy Content Quality | AI-driven | Chargeback finding enhancement |
| AI-5 | Journey Narrative | AI-driven | MCP artifact (not a finding) |

### Implement Next

Valuable but needs validation, evidence enrichment, or AI calibration.

| # | Name | Type | Best Surface |
|---|------|------|-------------|
| CO-7 | Recovery Gap on Critical Journey | Composite | Revenue finding |
| CO-8 | Journey-Offer Mismatch | Hybrid | Revenue + Chargeback finding |
| FO-5 | Response Time by Criticality | Rule-based | Scale finding, Preflight risk |
| FO-6 | Canonical URL Mismatch | Rule-based | Discoverability finding |
| FO-12 | Surface Relation Anomalies | Rule-based | Cybersecurity + Trust finding |
| CS-P2 | Cookie + Auth Surface Security | Cybersecurity | Findings (4 items, minor collection) |
| AI-4 | Pricing & Offer Clarity | AI-driven | Revenue finding enhancement |
| AI-9 | Regulatory Compliance Surface | AI-driven | Chargeback + Scale finding |

### Explore Later

Promising but needs infrastructure, has higher false-positive risk, or depends on unproven AI capabilities.

| # | Name | Type | Why Later |
|---|------|------|-----------|
| CO-9 | Environment Contamination Risk | Composite | Hard to detect reliably |
| CO-10 | Competitive Readiness Gap | AI-driven | No grounded evidence for benchmarks |
| FO-7 | Meta Tag Quality Assessment | Rule-based | Low decision impact |
| CS-P3 | Certificate, DNS, Payment Surface | Cybersecurity | Needs new collection infrastructure |
| AI-3 | Brand Coherence (Embeddings) | AI-driven | High complexity, niche value |
| AI-10 | Content Freshness Detection | AI-driven | Low decision impact |

### Probably Not Worth It (as standalone findings)

These are better absorbed into existing findings or surfaces.

| Name | Why Not | Better Alternative |
|------|---------|-------------------|
| AI-6: Anomaly Detection via Patterns | Catches edge cases but creates noise | Fold into composite findings (CO-1, CO-3) as supporting signal |
| AI-11: UX Copy Friction | Subjective, low confidence boundary | Fold into AI-4 (Pricing & Offer Clarity) as sub-analysis |
| AI-2: Checkout Copy Analysis | Overlaps with AI-4 and existing trust signals | Fold into AI-4 |
| AI-7: Competitive Benchmarks | Pure LLM knowledge, unverifiable | Wait for CO-10 (Competitive Readiness) with real data |

---

## 4. Rule-Based Opportunities

Five gaps remain from the original inventory. Each is partially implemented.

---

### FO-5: Response Time by Page Criticality

| Field | Value |
|-------|-------|
| **Type** | Rule-based |
| **Priority** | Implement next |
| **Why it matters** | Checkout at 2500ms doesn't trigger `slow_response` (3000ms threshold) but may be 3x the site average. Relative slowness on critical pages is a conversion signal that absolute thresholds miss. |
| **Evidence required** | `HttpResponsePayload.response_time_ms` (already collected), page classification (already exists) |
| **Signals / inferences** | New signal: `critical_page_slower_than_average` (checkout/pricing/cart response time > 1.5x site mean). Feeds `revenue_path_fragile` inference with additional weight. |
| **Product value** | Strengthens `revenue_path_fragile` decision. Adds a preflight risk when checkout is relatively slow. Makes `answer_can_i_scale` more precise. |
| **Risk / noise** | Low — deterministic computation. Edge case: sites with few pages may have unreliable averages. Gate on minimum 5 pages. |
| **Best surfaces** | Preflight risk, Revenue workspace finding, Scale readiness finding |

---

### FO-6: Canonical URL Mismatch

| Field | Value |
|-------|-------|
| **Type** | Rule-based |
| **Priority** | Implement next |
| **Why it matters** | `commercial_pages_unlikely_indexed` checks canonical presence but not correctness. A canonical pointing to a different domain on a pricing page means search engines may never index it — direct traffic loss. |
| **Evidence required** | `PageContentPayload.canonical_url` (already collected), actual page URL, HTTP status of canonical target (would need a light probe) |
| **Signals / inferences** | New signals: `canonical_mismatch` (canonical != page URL), `canonical_points_external` (canonical on different domain). Feeds `commercial_pages_weak_search_representation` inference. |
| **Product value** | Strengthens discoverability decisions. Creates opportunity candidate: "Fix canonical → regain search traffic." |
| **Risk / noise** | Low on mismatch detection. Medium on "is this intentional?" — some sites use canonical to consolidate URLs. Gate: only flag on commercial-classified pages. |
| **Best surfaces** | Discoverability workspace finding, Opportunity candidate |

---

### FO-7: Meta Tag Quality Assessment

| Field | Value |
|-------|-------|
| **Type** | Rule-based |
| **Priority** | Explore later |
| **Why it matters** | Title/description quality affects search CTR. But meta tag quality alone rarely changes a business decision — it's optimization, not risk. |
| **Evidence required** | `PageContentPayload.title`, `meta_description`, `h1` (already collected) |
| **Signals / inferences** | New signals: `meta_title_weak` (empty, <30 chars, >60 chars), `meta_description_weak` (empty, <70 chars, >160 chars), `duplicate_title`. Feeds discoverability pack. |
| **Product value** | Low for decisions. Moderate for discoverability workspace completeness. Doesn't change preflight or create incidents. |
| **Risk / noise** | Low false-positive risk. But many sites have imperfect meta tags — risk of flagging universal noise. |
| **Best surfaces** | Discoverability workspace finding only. Not worth a preflight warning or action. |

---

### FO-12: Surface Relation Anomalies

| Field | Value |
|-------|-------|
| **Type** | Rule-based |
| **Priority** | Implement next |
| **Why it matters** | Login redirecting to external domain, form posting to 404, canonical pointing off-domain — these are structural anomalies that indicate misconfiguration or compromise. High overlap with cybersecurity pack. |
| **Evidence required** | `SurfaceRelation` graph (already collected), `HttpResponsePayload.status_code` for targets |
| **Signals / inferences** | New signal: `surface_relation_anomaly` with subtypes (cross_domain_login_redirect, form_action_to_error, canonical_off_domain, script_from_untrusted_origin). Feeds multiple inferences across packs. |
| **Product value** | High for cybersecurity pack. Creates incident candidates when anomalies appear on commercial paths. Strengthens `trust_boundary_crossed` with deeper evidence. |
| **Risk / noise** | Medium — intentional cross-domain patterns exist (SSO, external payment). Gate: only flag when target domain is NOT in known-provider list. |
| **Best surfaces** | Cybersecurity finding, Incident candidate (when on checkout/login), Preflight risk |

---

### FO-17: Trust Surface Strength Score

| Field | Value |
|-------|-------|
| **Type** | Rule-based composite |
| **Priority** | Implement now |
| **Why it matters** | Individual positive findings exist (CTA clarity, trust continuity, policy coverage, low friction, measurement, support) but there's no aggregate. Preflight says "Ready" but doesn't communicate trust surface depth. A composite score answers "HOW ready?" not just "ready or not." |
| **Evidence required** | All existing positive finding conditions (already computed) |
| **Signals / inferences** | New composite: `trust_surface_strength` = count of positive indicators / total possible. E.g., "Trust Surface: 4/6 factors positive." |
| **Product value** | High. Directly strengthens preflight readiness_score granularity. Becomes the workspace anchor for scale_readiness. Makes `answer_can_i_scale` richer: "You're safe to scale, with strong trust surface (5/6)." |
| **Risk / noise** | Very low — deterministic aggregation of existing boolean conditions. |
| **Best surfaces** | Preflight readiness score enrichment, Scale workspace anchor, MCP summary |

---

## 5. AI-Driven Opportunities

### Design constraints

AI-driven findings in Vestigio follow these rules:

1. **Evidence-grounded** — must cite specific evidence payloads. No hallucinated observations.
2. **Deterministic anchor** — paired with at least one rule-based signal. AI enhances, doesn't replace.
3. **Confidence-bounded** — `ai_confidence` score separate from evidence confidence.
4. **Cacheable** — cached per evidence hash. Re-analysis only on evidence change.
5. **Degradation-safe** — if AI unavailable, rule-based findings continue.

Not everything AI produces should be a finding. Some are better as:
- **MCP artifact** — enriches `discuss_finding` or `answer_*` without adding to finding count
- **Workspace insight** — contextual text in workspace summary, not a standalone finding
- **Action enhancement** — improves action description/resolve_path, not a new action

---

### AI-1: Policy Content Quality Analysis

| Field | Value |
|-------|-------|
| **Type** | AI-driven (LLM) |
| **Priority** | Implement now |
| **Why it matters** | `thin_refund_policy` fires on word count <200 and `policy_gap` fires on missing pages. But a 500-word refund policy that says "refunds may be granted at our discretion" is worse than a 150-word policy with clear terms. LLM analysis catches what word count can't. |
| **Evidence anchor** | `PolicyPagePayload.body_text`, `.word_count`, `.sections` |
| **Rule-based anchor** | `thin_refund_policy`, `policy_gap`, `refund_policy_gap` |
| **AI role** | Readability scoring (Flesch-Kincaid), ambiguity detection ("may", "reserves the right"), missing section identification (return window, refund timeline, contact method), regulatory completeness (GDPR data retention, consumer protection) |
| **Product value** | Directly strengthens `refund_policy_gap` decision and chargeback resilience workspace. Creates specific, actionable recommendations: "Add a return window clause" vs. generic "improve policy." Makes `discuss_finding` vastly more useful for policy findings. |
| **Risk / drift** | Low — bounded text input, structured output schema. Risk: LLM may flag legitimate legal language as "vague." Gate: only flag ambiguity when it appears in refund/return/cancellation sections. |
| **Best surfaces** | Chargeback finding enhancement (enriches existing finding, not new finding), MCP explainability, Action resolve_path improvement |
| **Output** | `PolicyQualityAssessment { clarity_score, ambiguity_flags[], missing_sections[], regulatory_gaps[], actionable_recommendations[] }` — attached to existing policy findings, not a new finding |

---

### AI-4: Pricing & Offer Clarity Analysis

| Field | Value |
|-------|-------|
| **Type** | AI-driven (LLM) |
| **Priority** | Implement next |
| **Why it matters** | `expectation_misalignment` and `unclear_conversion_intent` detect structural issues. But pricing page content quality — hidden fees ("starting at", "plus applicable fees"), plan differentiation, trial terms clarity — is invisible to rule-based analysis. Pricing confusion is a top-3 abandonment driver and top-3 chargeback trigger. |
| **Evidence anchor** | `PageContentPayload` for pricing/product pages, `StructuredDataItem` (Product, Offer), `FormPayload` |
| **Rule-based anchor** | `expectation_misalignment`, `unclear_conversion_intent` |
| **AI role** | Hidden cost language detection, plan comparison clarity scoring, free trial terms assessment, feature differentiation grading |
| **Product value** | Strengthens `expectation_misalignment` decision. Creates opportunity candidate: "Clarify pricing → reduce chargebacks + improve conversion." Relevant for both commerce and SaaS. |
| **Risk / drift** | Medium — pricing language is nuanced. "Starting at" is standard in some industries. Gate: only flag when combined with existing `expectation_misalignment` signals. |
| **Best surfaces** | Revenue finding enhancement, Chargeback finding enhancement, SaaS workspace insight, Opportunity candidate |

---

### AI-5: Journey Narrative Generation

| Field | Value |
|-------|-------|
| **Type** | AI-driven (LLM) |
| **Priority** | Implement now |
| **Why it matters** | This is NOT a finding. It's an MCP artifact that transforms the full finding set into a human-readable customer journey story. Non-technical stakeholders — the people who approve budget for fixes — need narrative, not tables. |
| **Evidence anchor** | Full evidence graph, all `FindingProjection` results, `SurfaceRelation` topology, page classifications |
| **Rule-based anchor** | All existing findings (input, not replacement) |
| **AI role** | Narrative synthesis: "A visitor arriving at your homepage encounters... → navigates to pricing where... → clicks 'Buy Now' which redirects off-domain to a checkout that..." Highlights friction, trust breaks, and strengths in prose. |
| **Product value** | Transforms `get_workspace_summary` and `answer_*` MCP tools from structured data into executive-readable narrative. High retention value — stakeholders forward these to teams. |
| **Risk / drift** | Low — repackaging existing findings, not generating new analysis. Risk: narrative may overemphasize dramatic issues. Gate: narrative must reference specific findings by ID. |
| **Best surfaces** | MCP artifact only (not a finding, not in workspace tables). Delivered via `get_workspace_summary` or dedicated `get_journey_narrative` tool. |
| **Output** | `JourneyNarrative { executive_summary, journey_stages[], friction_highlights[], strength_highlights[], recommended_reading_order[] }` |

---

### AI-8: Root Cause Leverage Analysis

| Field | Value |
|-------|-------|
| **Type** | Hybrid (rule-based root causes + AI clustering) |
| **Priority** | Implement now (as enhancement to existing root cause system) |
| **Why it matters** | `packages/intelligence/root-causes.ts` maps inferences to root causes. But mappings are predefined. AI can identify emergent clusters — findings that aren't linked by predefined mappings but share operational root causes. "Fix your checkout domain configuration → resolves 4 findings across 3 packs." This directly strengthens the Action system. |
| **Evidence anchor** | All `FindingProjection` results, existing root cause mappings, `ActionProjection` cross-references |
| **Rule-based anchor** | Existing root cause groupings (`trust_failure_at_checkout`, `fragmented_conversion_path`, etc.) |
| **AI role** | Cluster analysis: identify remediation overlap beyond predefined mappings. Rank fix points by leverage (findings resolved × impact). Generate "fix one, resolve many" prioritization. |
| **Product value** | Directly strengthens `get_prioritized_actions` MCP tool and Action priority_score ranking. Makes `answer_fix_first` dramatically more useful. This is the single highest-leverage AI capability for the action system. |
| **Risk / drift** | Medium — AI may create false clusters. Gate: only surface clusters where 3+ findings share a concrete remediation step, and at least 2 findings are already linked by predefined root causes. |
| **Best surfaces** | Action prioritization enhancement, MCP artifact (`get_root_causes` enrichment), Workspace insight |
| **Output** | `LeverageCluster { remediation_action, affected_findings[], affected_packs[], combined_impact, effort_hint, confidence }` — surfaces in existing action views, not as new findings |

---

### AI-9: Regulatory Compliance Surface

| Field | Value |
|-------|-------|
| **Type** | AI-driven (LLM knowledge application) |
| **Priority** | Implement next |
| **Why it matters** | Policy gaps, consent issues, and checkout security indicators are already detected. But they're not mapped to specific regulatory frameworks. "Missing refund policy" becomes "Missing refund policy → violates EU Consumer Rights Directive → payment processor may flag account" when the detected locale is EU. Regulatory context transforms generic findings into urgent ones. |
| **Evidence anchor** | `PolicyPagePayload`, `consent_undermining_measurement` signal, `PageContentPayload.lang`, detected locale, checkout security indicators |
| **Rule-based anchor** | `policy_gap`, `consent_undermining_measurement`, `refund_policy_gap` |
| **AI role** | Map observed evidence to specific regulatory requirements by detected locale. Not legal advice — surface-level compliance risk indicators with citations. |
| **Product value** | Strengthens severity classification of existing findings. A `policy_gap` in an EU-targeted site is higher severity than one targeting a market with less regulation. Creates incident candidates when regulatory risk is high. |
| **Risk / drift** | Medium-high — regulations change, LLM knowledge may lag. Gate: only surface when locale detection confidence > 0.7 and regulatory claim can be anchored to a specific rule/directive. Include "not legal advice" disclaimer. |
| **Best surfaces** | Finding severity enhancement (not new findings), Incident candidate (for high regulatory risk), Chargeback workspace insight, Scale workspace insight |

---

### AI-12: Structured Data Accuracy Validation

| Field | Value |
|-------|-------|
| **Type** | AI-driven (cross-validation) |
| **Priority** | Implement next |
| **Why it matters** | JSON-LD structured data is collected. But schema claims ("InStock", "$29.99", "4.5 stars") may not match visible page content. Google penalizes structured data/content mismatches by removing rich results — a direct traffic and trust loss. |
| **Evidence anchor** | `StructuredDataItem` (Product, Offer, Organization, Review), `PageContentPayload.body_text` |
| **Rule-based anchor** | `trust_signals_thin_on_commercial`, discoverability signals |
| **AI role** | Cross-validate: compare structured data claims against visible page content. Flag discrepancies (schema price != displayed price, schema "InStock" but page says "Sold Out"). |
| **Product value** | Creates a discoverability finding with clear action: "Update your Product schema to match displayed price." Opportunity candidate: "Fix schema accuracy → restore rich results." |
| **Risk / drift** | Medium — page content extraction may miss dynamic prices. Gate: only flag clear mismatches where both values are confidently extracted. |
| **Best surfaces** | Discoverability finding, Opportunity candidate, Action with clear resolve_path |

---

## 6. Cybersecurity Opportunities

### Pack thesis

**Pack question:** "Is the site's security posture creating trust risk or attack surface liability?"

Vestigio is NOT a vulnerability scanner. The cybersecurity pack:
- Assesses **surface-visible security posture** from evidence already used for trust/revenue analysis
- Quantifies **business impact** of security gaps (trust erosion, compliance risk, processor sanctions)
- Correlates security indicators with existing trust/checkout decisions

It answers security questions through the Vestigio lens: **what does this security gap cost the business?**

### Phase 1 — Zero collection dependency (Implement Now)

These use evidence already in `HttpResponsePayload.headers`, `ScriptPayload`, `RedirectPayload`, and `SurfaceRelation`. Only signal extraction needed.

---

#### CS-1: Security Header Posture

| Field | Value |
|-------|-------|
| **Type** | Rule-based |
| **Priority** | Implement now |
| **Why it matters** | Headers are collected but not analyzed. Missing HSTS on checkout = browsers may not enforce HTTPS. Missing CSP on form pages = XSS attack surface. PCI DSS 4.0 requires certain headers. |
| **Evidence** | `HttpResponsePayload.headers` — already collected |
| **Signals** | `hsts_missing`, `csp_missing_or_weak`, `clickjack_protection_missing`, `security_headers_score` (composite) |
| **Severity logic** | Critical: no HSTS on checkout. High: no CSP on form pages. Medium: missing on non-commercial. Low: weak but present. |
| **Product value** | Preflight risk (security posture feeds readiness). Incident candidate when checkout lacks HSTS. Strengthens `checkout_integrity` decision. |
| **Risk / noise** | Very low — headers are deterministic. |
| **Best surfaces** | Cybersecurity finding, Preflight risk, Scale readiness decision enhancement |

---

#### CS-3: Mixed Content on Commercial Pages

| Field | Value |
|-------|-------|
| **Type** | Rule-based |
| **Priority** | Implement now |
| **Why it matters** | HTTP resources on HTTPS pages = active mixed content. Browsers block scripts, warn on forms. On checkout pages, this is a conversion killer and PCI indicator. |
| **Evidence** | `ScriptPayload.src`, `FormPayload.action`, `IframePayload.src` — scheme comparison against page URL |
| **Signals** | `mixed_content_script`, `mixed_content_form_action`, `mixed_content_on_checkout` (critical) |
| **Product value** | Incident candidate when mixed content appears on checkout. Preflight blocker. Directly feeds `checkout_integrity`. |
| **Risk / noise** | Very low — scheme comparison is deterministic. |
| **Best surfaces** | Incident candidate, Preflight blocker, Revenue integrity decision enhancement |

---

#### CS-9: Open Redirect Indicators

| Field | Value |
|-------|-------|
| **Type** | Rule-based |
| **Priority** | Implement now |
| **Why it matters** | Redirect chains with user-controllable parameters (?url=, ?redirect=, ?next=) create phishing vectors. On login/checkout flows, this is an active trust risk. |
| **Evidence** | `RedirectPayload` (full chain), URL parameter analysis |
| **Signals** | `redirect_with_url_parameter`, `redirect_chain_to_unknown_domain`, `auth_redirect_to_external` |
| **Product value** | Incident candidate when on login/checkout. Strengthens `trust_boundary_crossed`. |
| **Risk / noise** | Low — parameter detection is deterministic. Medium — some legitimate redirect patterns exist (OAuth). Gate: only flag when target is NOT a known provider. |
| **Best surfaces** | Incident candidate, Cybersecurity finding |

---

#### CS-11: Exposed Sensitive Endpoints

| Field | Value |
|-------|-------|
| **Type** | Rule-based |
| **Priority** | Implement now |
| **Why it matters** | Publicly accessible admin panels, API docs, .env files, .git metadata = data exposure risk. Also feeds Environment Contamination composite finding. |
| **Evidence** | `HttpResponsePayload.status_code` for probed sensitive paths. Needs: add sensitive paths to crawl discovery candidate list. |
| **Signals** | `admin_panel_exposed`, `sensitive_file_accessible`, `api_docs_public`, `debug_endpoint_accessible` |
| **Product value** | Incident candidate (immediate). Not a preflight concern — this is operational security. |
| **Risk / noise** | Low on detection. Medium on "is /dashboard an admin panel or a product feature?" Gate: combine status_code 200 with content analysis (login form presence = admin, not product). |
| **Best surfaces** | Incident candidate, Cybersecurity finding |

---

### Phase 2 — Minor collection extension (Implement Next)

These need small parser or extraction enhancements. See [COLLECT_OPPORTUNITIES.md](COLLECT_OPPORTUNITIES.md).

| # | Finding | Collection Needed | Signals | Product Surface | Effort |
|---|---------|-------------------|---------|----------------|--------|
| CS-2 | Cookie security | Parse `Set-Cookie` header | `session_cookie_insecure`, `third_party_tracking_without_consent` | Cybersecurity finding, Privacy | Low |
| CS-4 | Information disclosure | Error page body text on 4xx/5xx | `server_version_exposed`, `error_page_information_leak` | Cybersecurity finding | Low |
| CS-5 | Script supply chain risk | `integrity` attribute from `<script>` | `external_scripts_without_sri`, `high_risk_scripts_on_checkout` | Incident candidate on checkout, Finding | Low |
| CS-7 | Auth surface security | Password field type detection in forms | `login_form_insecure_transport`, `auth_surface_missing_protection` | Incident candidate, Finding | Low |

---

### Phase 3 — Infrastructure dependency (Explore Later)

These need new collection capabilities.

| # | Finding | Infrastructure Needed | Business Impact | Effort |
|---|---------|----------------------|-----------------|--------|
| CS-6 | Certificate/TLS posture | `socket.getPeerCertificate()` (COLLECT_OPPORTUNITIES 1.3) | Trust + availability (cert expiry = browser warnings) | Medium |
| CS-8 | Payment surface security | Cross-correlation of existing evidence (complex logic) | PCI surface indicators | Medium |
| CS-10 | Email deliverability (SPF/DKIM/DMARC) | DNS TXT record lookup | Chargeback risk (undelivered confirmations) | Medium |
| CS-12 | Privacy/consent compliance | Depends on CS-2 + browser verification consent flow | Regulatory fines (GDPR) | Medium |

---

### Cross-pack correlations

Cybersecurity findings don't live in isolation. They strengthen existing decisions:

| Security Finding | Existing Decision It Strengthens | Combined Insight |
|-----------------|--------------------------------|------------------|
| CS-1 (no HSTS on checkout) | `checkout_integrity` | Security weakness amplifies fragile checkout |
| CS-3 (mixed content) | `trust_boundary_crossed` | Transport security break = trust break |
| CS-5 (no SRI on scripts) | `untrusted_embeds_near_purchase` | Supply chain risk compounds embed trust |
| CS-9 (open redirect) | `trust_boundary_crossed` | Redirect vulnerability = exploitable trust break |
| CS-10 (email deliverability) | `post_purchase_confirmation_absent` | Delivery failure amplifies missing confirmation |

---

## 7. Composite & Operational Findings

These are the highest-leverage opportunities in this document. They create **new decision types** or **strengthen existing decisions** by combining signals that are already computed but not correlated.

Composite findings replace multiple micro-findings with a single, higher-signal insight. They are the kind of findings that make Vestigio's decisions unique.

---

### CO-1: Scale Trap on Critical Path

> "You're ready to operate, but not ready to scale this route."

| Field | Value |
|-------|-------|
| **Does it make sense?** | Yes — this is the core preflight gap. Individual metrics (response time, checkout integrity, measurement) may all be "acceptable" while their combination at scale creates failure. |
| **Type** | Rule-based composite |
| **Priority** | Implement now |
| **Evidence** | `response_time_ms` on critical pages, `checkout_integrity` score, `measurement_coverage`, `revenue_path_fragile` score, provider dependency count, redirect chain length |
| **Signals / inferences** | Composite: combine `checkout_integrity` + `revenue_path_fragile` + `commercial_pages_slow` + single-provider-dependency. Fire when 3+ signals are individually "acceptable" (not triggering findings) but collectively indicate fragility at scale. |
| **Decision impact** | Changes `scale_readiness_pack` outcome from "safe_to_scale" → "ready_with_risks" when combined marginal metrics exceed threshold. |
| **Product surface** | **Preflight warning** (primary). Incident candidate when planned_spend is high. Workspace anchor for scale readiness. |
| **Risk / noise** | Medium — "marginal but collectively bad" is a judgment call. Gate: require 3+ marginal signals simultaneously on the same commercial path. Use z-score or percentile ranking, not arbitrary thresholds. |
| **What it replaces** | Not a new finding — adjusts the preflight readiness_score calculation to account for combined marginal risk. |

---

### CO-2: Trust Asymmetry at Money Moment

> "Trust is strong before the click and weak at the moment of money."

| Field | Value |
|-------|-------|
| **Does it make sense?** | Yes — this is Vestigio's core thesis operationalized. The DELTA between pre-checkout trust and at-checkout trust is more important than either absolute value. A beautiful landing page that sends you to a sketchy checkout is worse than a mediocre site with consistent trust. |
| **Type** | Rule-based composite |
| **Priority** | Implement now |
| **Evidence** | Trust signal density pre-checkout (landing/product pages: policies visible, brand consistency, HTTPS, structured data) vs at-checkout (provider trust, domain consistency, form security, policy accessibility) |
| **Signals / inferences** | New composite: `trust_asymmetry_score` = trust_density_pre_checkout - trust_density_at_checkout. Positive = trust drops at money moment. Feeds a new inference: `trust_erodes_at_purchase`. |
| **Decision impact** | Directly strengthens `trust_break_in_checkout` and `checkout_integrity` decisions. Creates a more nuanced severity: "trust breaks" are worse when there was strong trust before (higher drop = higher disappointment). |
| **Product surface** | **Revenue workspace anchor** (primary). Finding in revenue integrity and chargeback packs. Makes `answer_where_losing_money` more precise. |
| **Risk / noise** | Low — trust signal density is a deterministic count. Gate: only meaningful when pre-checkout has 3+ positive signals (establishes a "promise" that checkout then breaks). |
| **What it replaces** | Enriches existing `trust_break_in_checkout` finding with delta context, rather than creating a new standalone finding. |

---

### CO-3: Single Point of Commercial Failure

> "Your conversion depends too much on a single fragile point."

| Field | Value |
|-------|-------|
| **Does it make sense?** | Yes — graph-based SPOF detection. If the only path to checkout is one page, and that page has any issue (slow, off-domain, error-prone), ALL conversion dies. This is different from "checkout is broken" — it's "there is no alternative when checkout breaks." |
| **Type** | Rule-based (graph analysis) |
| **Priority** | Implement now |
| **Evidence** | Evidence graph topology (nodes, edges), `SurfaceRelation` paths to checkout, `commercial_pages_disconnected` signal, checkout entry point count |
| **Signals / inferences** | New signal: `commercial_path_spof` — fires when graph analysis shows single path to checkout AND that path has any existing risk signal (slow, fragile, off-domain). Combines graph topology with path quality. |
| **Decision impact** | Escalates any existing finding on the SPOF page. A `slow_response` on a page with 5 alternative paths is Low severity; on a SPOF page it's Critical. Changes `scale_readiness_pack` to add blocker. |
| **Product surface** | **Preflight blocker** (primary). Incident candidate. Scale readiness decision. |
| **Risk / noise** | Medium — simple sites may naturally have one path. Gate: only fire when (a) the SPOF page has an existing risk signal AND (b) the site has commercial complexity suggesting alternatives should exist. |
| **What it replaces** | Upgrades severity of existing findings on SPOF pages rather than creating a new finding. |

---

### CO-4: Confidence & Verification Gap

> "Your most critical decisions rest on unverified or under-corroborated evidence."

This consolidates three related ideas: "Critical Route Under-Observed" (#5), "False Confidence Risk" (#10), and "Path Dependency Without Proof" (#11). They share the same core: **confidence in a decision is higher than the evidence quality warrants.**

| Field | Value |
|-------|-------|
| **Does it make sense?** | Yes — this is the governance layer's most important meta-finding. A preflight "Ready" status backed by single-source, unverified, stale evidence is dangerous. This prevents overconfidence. |
| **Type** | Rule-based composite |
| **Priority** | Implement now |
| **Evidence** | `verification_maturity` per decision, `evidence_quality.composite` per finding, `evidence_quality.corroboration` scores, decision confidence vs evidence quality gap |
| **Signals / inferences** | New composite: `confidence_exceeds_evidence` — fires when decision.confidence_score > evidence_quality.composite × 1.3 on critical-path decisions. Also: `critical_decision_unverified` when decision.effective_severity >= High AND verification_maturity in [unverified, stale]. |
| **Decision impact** | Adds a preflight warning: "Readiness assessment based on limited evidence. Recommend browser verification before scaling." Forces honest confidence communication. |
| **Product surface** | **Preflight warning** (primary). Governance meta-finding. MCP explainability: `answer_can_i_scale` should caveat when confidence gap exists. Triggers `request_verification` recommendation. |
| **Risk / noise** | Low — deterministic comparison of confidence vs evidence quality scores. |
| **What it becomes** | NOT a new finding visible in workspace tables. A preflight caveat and MCP annotation that surfaces alongside existing findings. The finding equivalent of an asterisk. |

---

### CO-5: High-Blast-Radius Regression

> "A recent change degraded more than one critical route simultaneously."

| Field | Value |
|-------|-------|
| **Does it make sense?** | Yes — extends existing change detection. A single regression is tracked. But when 3+ decisions regress in the same cycle with overlapping contributing factors, it suggests a single root cause caused widespread damage. |
| **Type** | Rule-based (change detection extension) |
| **Priority** | Implement now |
| **Evidence** | `CycleChangeReport.regressions[]`, `DecisionChange.contributing_factors`, `DecisionChange.severity` |
| **Signals / inferences** | New composite: `high_blast_radius_regression` — fires when 3+ decisions have change_class == 'regression' in the same cycle AND contributing_factors overlap. Computes blast_radius (count of affected decisions × severity). |
| **Decision impact** | Creates an incident automatically. Becomes a preflight blocker for the affected cycle. The existing `revenue_path_regressed` finding handles single regressions; this handles correlated multi-regression events. |
| **Product surface** | **Incident candidate** (primary). Preflight blocker. Change report highlight. MCP alert via `get_change_report`. |
| **Risk / noise** | Low — regression detection is deterministic. Risk: early audit cycles with no baseline may produce false regressions. Gate: only fire after 2+ completed cycles. |
| **What it replaces** | Upgrades `revenue_path_regressed` from single-decision to multi-decision blast radius. |

---

### CO-6: Opportunity Compression

> "A single fix would unlock gains across multiple fronts."

| Field | Value |
|-------|-------|
| **Does it make sense?** | Yes — this is the action system's highest-leverage enhancement. Root cause mappings exist. But the "fix one thing, resolve many" insight isn't surfaced as a first-class concept. When 4 findings across 3 packs share a remediation (e.g., "move checkout on-domain"), that's not 4 actions — it's 1 high-leverage action. |
| **Type** | Hybrid (rule-based root causes + AI clustering via AI-8) |
| **Priority** | Implement now (rule-based version), enhance with AI later |
| **Evidence** | All `FindingProjection` results, root cause mappings, `ActionProjection` data |
| **Signals / inferences** | Rule-based: group findings by root_cause_key where root cause affects 3+ findings across 2+ packs. Compute `leverage_score` = sum of finding impacts. AI enhancement (AI-8): identify emergent clusters beyond predefined mappings. |
| **Decision impact** | Reranks action priority. The action resolving the most findings gets highest priority_score regardless of individual finding severity. Answers `answer_fix_first` with genuine leverage analysis. |
| **Product surface** | **Action prioritization** (primary). MCP artifact for `get_prioritized_actions` and `answer_fix_first`. NOT a new finding — it's a re-ranking of existing actions. |
| **Risk / noise** | Low for rule-based version (existing root cause mappings). Medium for AI clustering (false clusters). |
| **What it becomes** | An enhancement to the action priority_score algorithm and MCP response format. Not a new finding. |

---

### CO-7: Recovery Gap on Critical Journey

> "When something fails on the critical path, the user has no clear recovery route."

| Field | Value |
|-------|-------|
| **Does it make sense?** | Yes, but partially. "Error page without navigation back" and "checkout failure without retry" are real UX failures. However, detecting recovery paths requires browser verification (does the error page have a back link? does the checkout offer retry?). Static crawl can detect 404 pages without navigation links, but deeper recovery analysis needs interaction. |
| **Type** | Rule-based (static) + Hybrid (with browser verification) |
| **Priority** | Implement next |
| **Evidence** | `critical_path_broken` signal (4xx/5xx on critical pages), `PageContentPayload` on error pages (link count, navigation presence), browser verification failure events |
| **Signals / inferences** | New signal: `error_page_without_recovery` (4xx/5xx page with <2 internal links). Enhanced by browser: `checkout_failure_without_retry` (checkout verification failure with no visible retry path). |
| **Decision impact** | Strengthens `friction_on_critical_path` decision. Escalates `critical_path_broken` when recovery is absent (broken + no recovery = worse than broken + retry path). |
| **Product surface** | Revenue finding enhancement. Action with specific resolve_path: "Add retry/back navigation to checkout error states." |
| **Risk / noise** | Medium — link count on error pages is a rough proxy for "recovery path." Custom 404 pages may have navigation but still be confusing. Gate: only flag on commercial-classified pages. |

---

### CO-8: Journey-Offer Mismatch

> "The journey demands more commitment than the offer has justified."

| Field | Value |
|-------|-------|
| **Does it make sense?** | Yes — this captures the "asks too much too soon" pattern. A 6-step checkout for a $9 product. A login-required trial that doesn't explain what you're getting. Friction that exceeds the perceived value of the offer. |
| **Type** | Hybrid (rule-based signals + AI-4 pricing analysis) |
| **Priority** | Implement next |
| **Evidence** | Checkout step count (redirect chain length), friction signals, pricing page content, trial messaging, `expectation_misalignment` inference |
| **Signals / inferences** | New composite: combine `friction_on_critical_path` + `expectation_misalignment` + checkout complexity (redirect hops, form count). For SaaS: `activation_friction_high` + `upgrade_timing_wrong`. AI enhancement (AI-4): analyze if pricing page sets adequate expectations for the friction that follows. |
| **Decision impact** | Strengthens `expectation_misalignment` and `activation_friction_high` decisions with "mismatch" context. |
| **Product surface** | Revenue finding, Chargeback finding (mismatch → disputes). SaaS workspace finding. Opportunity candidate: "Simplify checkout → reduce mismatch." |
| **Risk / noise** | Medium-high without AI (hard to quantify "too much friction for the offer" rule-based). Lower with AI-4 pricing analysis providing offer value context. |

---

### CO-9: Environment Contamination Risk

> "Production and staging surfaces are mixed dangerously."

| Field | Value |
|-------|-------|
| **Does it make sense?** | Partially. Staging URLs in production, debug endpoints, test data visible to real users — these are real but hard to detect reliably from external crawl. Overlaps significantly with CS-11 (Exposed Endpoints). |
| **Type** | Rule-based |
| **Priority** | Explore later |
| **Evidence** | `HttpResponsePayload` for sensitive paths, `SurfaceRelation` pointing to staging subdomains, page content with test/demo data patterns |
| **Signals** | `staging_url_in_production` (links to staging.*, dev.*, test.* subdomains), `debug_endpoint_accessible` (CS-11 overlap) |
| **Risk / noise** | High — "staging" subdomain may be intentional. "Test data" detection is fragile. Many false positives expected. |
| **Recommendation** | Defer. Partially covered by CS-11. Revisit when browser verification can assess content quality more deeply. |

---

### CO-10: Competitive Readiness Gap

> "Your critical route works but falls below competitive standard for scaling."

| Field | Value |
|-------|-------|
| **Does it make sense?** | The idea is strong but execution is weak. "Your checkout has 2 more steps than the Shopify median" requires benchmarking data Vestigio doesn't collect. LLM "knowledge" of industry norms is unreliable and unverifiable. |
| **Type** | AI-driven |
| **Priority** | Explore later |
| **Evidence** | `PlatformIndicatorPayload`, checkout signals, policy coverage, provider coverage |
| **AI role** | LLM benchmark comparison (AI-7). Unverifiable knowledge base. |
| **Risk / noise** | High — LLM benchmarks may be wrong, outdated, or fabricated. No way to verify "industry median checkout is 3 steps." |
| **Recommendation** | Defer until Vestigio has enough audit data across clients to build real benchmarks from observed patterns. Then this becomes rule-based and grounded. |

---

## 8. Final Roadmap

### Wave 1 — Implement Now

Directly strengthens decisions, preflight, and actions. Grounded in existing evidence.

| # | Item | Type | Effort | Primary Surface |
|---|------|------|--------|----------------|
| CO-1 | Scale Trap on Critical Path | Composite | Medium | Preflight warning |
| CO-2 | Trust Asymmetry at Money Moment | Composite | Medium | Revenue workspace anchor |
| CO-3 | Single Point of Commercial Failure | Composite | Medium | Preflight blocker |
| CO-4 | Confidence & Verification Gap | Composite | Low | Preflight warning |
| CO-5 | High-Blast-Radius Regression | Composite | Low | Incident candidate |
| CO-6 | Opportunity Compression | Composite | Medium | Action prioritization |
| FO-17 | Trust Surface Strength Score | Rule-based | Low | Preflight enrichment |
| CS-1 | Security Header Posture | Cybersecurity | Low | Finding + Preflight risk |
| CS-3 | Mixed Content on Commercial Pages | Cybersecurity | Low | Incident candidate |
| CS-9 | Open Redirect Indicators | Cybersecurity | Low | Incident candidate |
| CS-11 | Exposed Sensitive Endpoints | Cybersecurity | Low | Incident candidate |
| AI-1 | Policy Content Quality | AI-driven | Medium | Finding enhancement |
| AI-5 | Journey Narrative | AI-driven | Low-medium | MCP artifact |
| AI-8 | Root Cause Leverage | Hybrid | Medium | Action enhancement |

**Wave 1 net effect:** 6 new composite capabilities, 4 cybersecurity findings, 3 AI enhancements, 1 rule-based score. Most are NOT new findings — they strengthen existing decisions, preflight, and actions.

### Wave 2 — Implement Next

Needs validation, minor collection extension, or AI calibration.

| # | Item | Type | Effort | Dependency |
|---|------|------|--------|-----------|
| CO-7 | Recovery Gap on Critical Journey | Composite | Medium | Browser verification for depth |
| CO-8 | Journey-Offer Mismatch | Hybrid | Medium | AI-4 for full value |
| FO-5 | Response Time by Criticality | Rule-based | Low | None |
| FO-6 | Canonical URL Mismatch | Rule-based | Low | Light probe for target validation |
| FO-12 | Surface Relation Anomalies | Rule-based | Medium | Feeds cybersecurity pack |
| CS-2 | Cookie Security | Cybersecurity | Low | Parse Set-Cookie header |
| CS-4 | Information Disclosure | Cybersecurity | Low | Error page body capture |
| CS-5 | Script Supply Chain | Cybersecurity | Low | `integrity` attribute extraction |
| CS-7 | Auth Surface Security | Cybersecurity | Low | Password field detection |
| AI-4 | Pricing & Offer Clarity | AI-driven | Medium | Pricing page content analysis |
| AI-9 | Regulatory Compliance Surface | AI-driven | Medium | Locale detection confidence |
| AI-12 | Structured Data Accuracy | AI-driven | Medium | JSON-LD cross-validation |

### Wave 3 — Explore Later

Promising but needs infrastructure, has higher risk, or depends on unproven capabilities.

| # | Item | Type | Why Wait |
|---|------|------|----------|
| CO-9 | Environment Contamination | Composite | High false-positive risk |
| CO-10 | Competitive Readiness Gap | AI-driven | No grounded benchmark data |
| FO-7 | Meta Tag Quality | Rule-based | Low decision impact |
| CS-6 | Certificate/TLS | Cybersecurity | Needs socket-level collection |
| CS-8 | Payment Surface Security | Cybersecurity | Complex correlation logic |
| CS-10 | Email Deliverability (DNS) | Cybersecurity | Needs DNS TXT collection |
| CS-12 | Privacy/Consent Compliance | Cybersecurity | Depends on CS-2 |
| AI-3 | Brand Coherence | AI-driven | High complexity, niche |
| AI-10 | Content Freshness | AI-driven | Low decision impact |

---

### What this roadmap does NOT add

- Zero new "micro-findings" that just populate tables
- Zero AI capabilities that replace rule-based decisions
- Zero cybersecurity items that turn Vestigio into a scanner

### What this roadmap DOES add

- **6 composite capabilities** that make decisions smarter (CO-1 through CO-6)
- **4 cybersecurity findings** with zero collection dependency that create incident candidates
- **3 AI enhancements** that make existing findings and actions more useful
- **1 trust strength score** that makes preflight more granular
- A clear path from Wave 1 → 2 → 3 with explicit dependencies
