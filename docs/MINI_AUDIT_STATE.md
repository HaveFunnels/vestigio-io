# Mini-Audit — Current State

**Last update:** 2026-06-05 (Wave-22.6 redesign complete, STEP 0-7 + impact spread fix)

A pickup-cold reference for the LP audit funnel: what it does, how
each piece works, where the code lives, what's deliberately deferred.
Read this before touching `/lp/audit/*`, `mini-audit-findings.ts`,
`useLpAuditForm.ts`, or anything in the lead-promotion path.

---

## 1. Purpose

The mini-audit is the **only conversion surface** between the marketing
homepage and the paid product. It's not a free tier — there's no
freemium. It exists to make the visitor think "isso é exatamente o
que eu vou ter, só me deixa entrar" and click **Criar conta agora**
(which routes to Paddle checkout; the account is created post-payment
via webhook).

**Non-goals:** it's NOT a product. It's NOT a trial. It's NOT a
generic SEO audit. Treat it like a sales asset that happens to run
real code.

---

## 2. End-to-end funnel

```
Homepage MiniCalculator                       (fake / static)
  ↓ stashes domain + revenue + business_type in localStorage
/lp/audit                                     7-step form
  Screen 1  domain         text input
  Screen 2  business_type  card grid (4 options, icons)
  Screen 3  revenue        slider (defaults per biz_type)
  Screen 4  concern        JTBD pain — 5 options
  Screen 5  current_method JTBD push — 6 options
  Screen 6  why_now        JTBD pull — 6 options
  Screen 7  email          terminal — fires audit
  ↓ writes back to localStorage for the paid onboarding handoff
/lp/audit/result/[leadId]                     polls until ready
  AuditingState (loading)  5 active + 6 teaser phases, min 18s
  Result view              header + plan + workspaces + map +
                           mcp mockup + findings + cta_final +
                           locked grid + footer
  ↓ Criar conta agora → Paddle checkout
Paddle webhook                                 (existing infra)
  promoteLeadToOrg → User + Org + Env + first full audit
  ↓ activation email → /activate/:token → /app/pulse
```

---

## 3. Detectors (the 17 currently active)

`workers/ingestion/mini-audit-findings.ts:1032-1060`

After STEP 0 cleanup (commit `bcae3616`), the registry runs:

**Original 6 (commercial behavior):**
- `detectRevenuePathFragility`
- `detectCtaBelowFold`
- `detectTrustComposite`
- `detectCompetingCtas`
- `detectVagueCta`
- `detectFormFriction`

**Parser-derived (7, post-cleanup):**
- `detectMissingAnalytics` — *reframed* to "you're scaling the channel that loses money"
- `detectNoSocialProof`
- `detectRedirectChain` — *reframed* to "mobile tab-close moment"
- `detectThinContent`
- `detectExcessiveExternalScripts` — *reframed* to "forgotten widgets taxing mobile"
- `detectNoH1`
- `detectExternalForms`

**Cross-signal (4) — Vestigio moat:**
- `detectSpeedTrustCompound`
- `detectWeakConversionPath`
- `detectSlowHeavyPage`
- `detectTrustlessCheckout`

**Deleted from registry (function bodies still in file as dead code):**
- `detectNoLazyImages`, `detectMissingStructuredData`, `detectMissingCanonical`,
  `detectMissingLang`, `detectIframeOveruse`, `detectWeakMetaDescription`.

**Rule for adding a detector:** every emission must hit `observation
→ buyer behavior → money impact`. SEO/accessibility hygiene with no
buyer-behavior story = slop. See memory entry `no-seo-slop` if in doubt.

**Blurred placeholders (`mini-audit-findings.ts:1094-1115`):** 10
teaser strings describing categories the full produto surfaces (compound
findings, behavioral via pixel, framework deep analysis). NOT random
SEO teasers. Each is a curiosity gap referencing a real paid feature.

---

## 4. Form mechanics

`src/app/(site)/lp/audit/useLpAuditForm.ts` (the brain) +
`src/app/(site)/lp/audit/page.tsx` (the renderer)

**State machine:** screen IDs map 1:1 to backend step numbers (1–7).
Backend version flag = `3`. v1 and v2 paths kept for in-flight leads.

**Backend persistence:** every screen submit PATCHes
`/api/lead/[id]/step/[n]` with anti-bot stack (token, behavioral
score, honeypot, dwell time). Schema validation per step is in
`src/app/api/lead/[id]/step/[n]/route.ts`.

**Defaults:** revenue slider seeds at `DEFAULT_REVENUE[business_type]`
(R$100k ecommerce, R$50k lead_gen, R$80k saas, R$120k hybrid).
Conversion model + ticket inferred from business_type, not asked.

**localStorage handoff:** terminal-step success writes 6 keys
(`vestigio_onboard_{domain,business_type,revenue,concern,
current_method,why_now}`). The paid onboarding form
(`src/app/app/onboarding/useOnboardingForm.ts`) reads + deletes them
on mount, prefilling 5 of 7 paid-onboarding steps. Net: a converted
LP visitor sees ONE truly new step (ticket) in paid onboarding —
not 7.

**JTBD storage:** new `AnonymousLead` columns
(`primaryConcern`, `currentOptimizationMethod`, `whyNow`) added in
migration `20260605120000_anonymous_lead_jtbd`. Same stable IDs as
`BusinessProfile` so the localStorage→prisma round-trip is 1:1.

---

## 5. Loading screen

`src/app/(site)/lp/audit/result/[leadId]/page.tsx` →
`AuditingState` component.

**Pacing:** floor of 18 seconds even if the backend finishes in 2–5s.
Enforced via `MIN_LOADING_MS = 18_000` + `minElapsed` state. The
"Ver minha análise" CTA only appears when all THREE conditions met:
backend `audit_complete`, visual phases done, minimum elapsed.

**Visual:**
- Light bg `#fafafa`, Vestigio wordmark centered, favicon below in a
  rounded white card.
- Two card blocks: Active (5 phases, white card) + Teaser (6 phases,
  dashed-border zinc card with "Bloqueado" badge).
- Per-phase indicators: emerald check (done), pulsing emerald dot
  (active), empty ring (pending). Teaser phases use lock icons.
- Sub-CTA below: "Criar conta libera as 6 próximas fases →".
- Zero spinners anywhere — aligns with `skeleton-over-spinner` memory.

**Phase copy** (`lp.audit_result.loading.{active,teaser}_phases` in
i18n, pt-BR + en + de + es). Every line written in
buyer-experiential voice, not engine technical voice. E.g.
"Visitando suas páginas como um usuário simulado" instead of
"Inspecionando JavaScript renderizado."

---

## 6. Result page — section by section

`src/app/(site)/lp/audit/result/[leadId]/page.tsx`

**Top → bottom order:**

1. **Sticky header** (lines ~273-313)
   Brand strip with logo + share + "Criar conta agora" sticky CTA.

2. **ResultHeader** (`function ResultHeader`)
   Favicon + Fraunces "Análise de {domain}" + counts strip
   ("N findings · M críticos · K ações priorizadas"). Numbers are
   real, derived from `negative + blurred`. Critical count is
   heuristic — flagged in code for refinement once engine emits a
   true critical_count.

3. **PlanPreviewSection** (`function PlanPreviewSection`)
   Monthly Strategy Plan preview. Hero metrics shimmer (no numbers
   in DOM). Narrative: 1-2 personalized sentences via
   `cta_final.concern_openings.{primaryConcern}`. Rest of narrative
   is server-side cut. Next-steps list: 2 visible with titles
   + hints, rest as shimmer rows with lock icons (titles NEVER in
   DOM — DevTools-immune).

4. **WorkspacesAccordion** (`function WorkspacesAccordion`)
   4 lenses: Revenue Intelligence, Trust & Conversion, Copy
   Frameworks, Behavioral Signals. Single-open accordion, default
   open = Revenue.

   - **Revenue/Trust**: 2-3 real findings + shimmer rows.
   - **Copy**: framework grid (PAS/AIDA/BAB/4P/Cialdini) with
     ok/warn/fail status pills + concrete example sentence. This is
     the flaunt block.
   - **Behavioral**: 8 integration logos
     (`INTEGRATION_LOGOS` array): 5 real SVGs from `/public/logos/`
     (Meta Ads, Google Ads, Stripe, Shopify, Nuvemshop) + 3 text
     fallbacks (GA4, Hotjar, Clarity). Frames the lock as
     scope-not-deficiency.

5. **MapPreviewSection** (`function MapPreviewSection`)
   Synthetic SVG causal-map illustration. NOT real audit data —
   illustrative content showing the shape of a Vestigio map. 8
   nodes, 11 connections labeled, soft white gradient overlay at
   bottom with a "Mapa real desbloqueia no Pulse" pill.

6. **McpChatMockup** (`function McpChatMockup`)
   Animated typing simulation. 3 phases:
   - 0.6s after reveal: user bubble appears.
   - 1.6s: AI typing indicator (3 pulsing dots).
   - 3s+: char-by-char response typing at ~24ms/char.
   Response string in i18n intentionally trails off with `░░░░`
   placeholders. Cursor blinks at cutoff. **Zero LLM calls.**

7. **Negative findings** (existing FindingCard list)
   The "ações priorizadas" header changed to Fraunces. Cards still
   use the pre-redesign dark-zinc styles — debt flagged.

8. **Positive findings** (existing)

9. **CostSummaryBanner** (existing — debt)

10. **CTAFinalSection** (`function CTAFinalSection`)
    The emotional close. Emerald-50/40 card, Fraunces 28-36px
    headline, JTBD-personalized line composed of:
    - `cta_final.why_now_clauses.{whyNow}` — short clause (e.g. "vão
      aumentar investimento em mídia").
    - `cta_final.concern_closes.{primaryConcern}` — full sentence
      with `{org}` interpolation.
    - `cta_final.method_lines.{currentOptimizationMethod}` —
      competitive-positioning paragraph (optional; null falls
      back gracefully).
    4-bullet checklist (Plan / queue / AI / map), single emerald
    "Criar conta agora" CTA, trust line "Sem trial, sem amarração".

11. **Locked findings grid** (existing — debt; still has the legacy
    UnlockSection inside it)

12. **Footer**

---

## 7. Lockdown strategy (no blur)

Per spec: blur is DevTools-immune-fail. Strategies actually used:

| Surface | Technique |
|---|---|
| Hero metrics in Plan | Skeleton-shimmer (no numbers in DOM) |
| Narrative beyond 2 sentences | Server-side cut — text not in DOM |
| Next-step titles #3+ | Shimmer rows with lock icons; titles never sent to client |
| Map preview | Synthetic SVG illustration (no real audit data) |
| MCP response | Typing animation that stops mid-sentence; string ends with `░░░░` |
| Workspaces lockable items | Shimmer rows + lock icons |
| Counts everywhere | Real numbers (intentional — they ARE the curiosity hook) |

**Rule for adding a locked section:** never `filter: blur(8px)`. If
the buyer needs to not see content X, X should not exist in the DOM.
Either skeleton-shimmer it or server-cut it.

---

## 8. Telemetry

`src/libs/product-telemetry.ts` (extended in STEP 7) +
`src/lib/lp-audit-track.ts` (client helper) +
`src/app/api/lead/[id]/track/route.ts` (API endpoint).

**Storage:** same `ProductEvent` table as authenticated events.
`userId` and `orgId` made nullable in migration
`20260605160000_product_event_anon`; new `leadId` column carries the
anon trail. Compound index `(leadId, event, createdAt)` for funnel
queries.

**Events:**
- `lp_audit_landing` — POST /api/lead/start success.
- `lp_audit_form_step` — per successful step PATCH, with
  `{ step, screen }` properties.
- `lp_audit_audit_started` — terminal submit before fireAudit.
- `lp_audit_result_viewed` — "Ver minha análise" click.
- `lp_audit_cta_clicked` — any Paddle checkout open.
- `lp_audit_checkout_complete` — reserved for the webhook (not
  wired today; debt item).

**Client mechanics:** uses `navigator.sendBeacon` when available so
the event survives the fast page navigation when the visitor clicks
the CTA → Paddle redirect.

**Backfilling on conversion:** when the lead → user promotion fires,
the userId/orgId backfill is NOT wired today. Historical anon rows
stay anon-tagged. If we ever need to stitch the funnel across
conversion, a one-shot script can update the rows by leadId.

---

## 9. JTBD personalization map

Which JTBD field affects which surface:

| Field | Surface | i18n key |
|---|---|---|
| `primaryConcern` | Plan narrative opening | `lp.audit_result.plan_preview.concern_openings.{value}` |
| `primaryConcern` | CTA final close | `lp.audit_result.cta_final.concern_closes.{value}` |
| `whyNow` | CTA final eyebrow line | `lp.audit_result.cta_final.why_now_clauses.{value}` |
| `currentOptimizationMethod` | CTA final method line | `lp.audit_result.cta_final.method_lines.{value}` |

All 4 personalization sites have null-safe fallbacks. The lead row's
JTBD fields are exposed via `/api/lead/{id}` (lines ~115-130 of the
endpoint) so the result page renders them.

---

## 10. Visual language

**Tokens:**
- Background: `bg-[#fafafa]` (the LP shell + loading + result use this).
- Card: `rounded-2xl border border-zinc-200 bg-white` (matches the
  in-app dashboard bento cards).
- Headlines: `font-[family-name:var(--font-fraunces)]`,
  20-28px depending on section.
- Numbers: `font-[family-name:var(--font-jetbrains-mono)] tabular-nums`.
- CTA: `bg-emerald-500 text-white shadow-lg shadow-emerald-500/20`
  for the primary; `bg-emerald-100 text-zinc-900` for the secondary
  matching the StepShell button family from PR9.
- Accent palette: rose (revenue), amber (trust), sky (copy), violet
  (behavioral) — only the icon chip carries the workspace hue, the
  card itself stays white-on-zinc.

**Shimmer:** `.skeleton-shimmer` class defined in
`src/styles/globals.css` (added during the in-app
FirstAuditCard refactor, PR11). Reused across the loading screen and
Plan preview.

**Light + dark theme:** mostly light-only today. The Plan/CTA/loading
sections use semantic `bg-white`, `border-zinc-200` style colors that
look correct on white but haven't been audited under a dark theme
override yet. **Debt.**

---

## 11. Cost guardrails

The mini-audit pipeline (`apps/audit-runner/run-mini-audit.ts`) is
brutally cheap by design:

- 1 HTTP fetch on the root URL.
- 1 `parsePage` call.
- 1 `runStagedPipeline` call in `mode: 'shallow'` (Stage A only).
- Optional `/checkout` + `/cart` probe when conversionModel ===
  'checkout'.
- **Zero LLM tokens.** Zero Tavily/Brave. Zero chromium.
- Cache 14 days per `domainHash`. **A second visitor on the same
  domain pays zero net cost.**

**Rule for adding a feature:** don't add anything that calls an LLM,
SERP API, or chromium to the anon path. If the new surface needs
real data, route it through the existing static detectors OR ship
behind the paywall (post-account).

Single-visitor cost ceiling: ~$0.005. Should remain there.

---

## 12. Impact range display

`src/components/console/ImpactBadge.tsx` (post-impact-spread fix,
commit `4eac805d`).

When `(max - min) / midpoint > 0.5`, the badge renders
**midpoint-only** instead of `min – max`. The full range stays
available in the MethodologyPopover for the curious buyer.

This affects all 10+ ImpactBadge consumers (findings, plan, actions,
mini-audit, etc.) simultaneously. Compact variant unchanged.

---

## 13. File map (quick reference)

| Path | Role |
|---|---|
| `src/app/(site)/lp/audit/page.tsx` | LP form orchestrator |
| `src/app/(site)/lp/audit/useLpAuditForm.ts` | Form state + anti-bot + handoff |
| `src/app/(site)/lp/audit/result/[leadId]/page.tsx` | Loading + result page (all sections inline) |
| `src/app/api/lead/start/route.ts` | Lead session start |
| `src/app/api/lead/[id]/step/[n]/route.ts` | Per-step PATCH (v1/v2/v3 versions) |
| `src/app/api/lead/[id]/run-audit/route.ts` | Fire mini-audit |
| `src/app/api/lead/[id]/track/route.ts` | Anon telemetry POST |
| `src/app/api/lead/[id]/route.ts` | Lead GET (used by result page polling) |
| `src/lib/lp-audit-track.ts` | Client telemetry helper (sendBeacon-aware) |
| `src/libs/product-telemetry.ts` | Shared event recorder |
| `workers/ingestion/mini-audit-findings.ts` | 17 detectors + blurred placeholders |
| `apps/audit-runner/run-mini-audit.ts` | The actual pipeline runner |
| `packages/impact/mini-impact.ts` | Mini-audit-specific impact math |
| `packages/impact/baselines.ts` | Shared % range registry |
| `apps/audit-runner/promote-lead.ts` | Lead → User on Paddle webhook |
| `src/app/app/onboarding/useOnboardingForm.ts` | Paid onboarding (consumes the handoff) |
| `dictionary/{pt-BR,en,de,es}.json` | i18n strings for everything |

**Migrations touched:**
- `20260604180000_business_profile_primary_concern` — JTBD on
  BusinessProfile + Organization.
- `20260605120000_anonymous_lead_jtbd` — JTBD on AnonymousLead.
- `20260605160000_product_event_anon` — nullable userId/orgId +
  leadId on ProductEvent.

---

## 14. Debt / known gaps

Tracked but not yet shipped:

1. **Vocab sweep** — "Auditoria"/"Audit" → "Análise"/"Analysis" in
   ~50+ customer-facing strings across dictionaries + emails.
   Memory: `vocab-sweep-pending`.
2. **Legacy result-page components** — FindingCard,
   CostSummaryBanner, LockedFindingCard still use pre-redesign
   dark-zinc styles. Light-theme cleanup needed.
3. **`lp_audit_checkout_complete` event** — not fired from the
   Paddle webhook today. When wired, the funnel is end-to-end
   measurable.
4. **Dead detector bodies** — 6 deleted-from-registry detector
   functions still exist in `mini-audit-findings.ts`. Harmless
   but confusing. Can be deleted in any small cleanup PR.
5. **JTBD prefill for businessType override** — `inferBusinessType`
   in `run-mini-audit.ts` silently overrides the user's declared
   business type if confidence ≥0.3. Should disclose to the user
   ("we detected X — confirm?"). Memory: discussed but not
   shipped.
6. **Light + dark theme audit** — mostly white-on-zinc only. A pass
   under `prefers-color-scheme: dark` would catch any hardcoded
   colors.
7. **Backfill anon events on conversion** — when a lead promotes to
   a user, the historical anon ProductEvent rows stay anon-tagged.
   A one-shot script (or webhook hook) could stitch them by leadId.
8. **Score circle / urgency timer** — removed in STEP 3. Document
   the rationale so they don't get added back: capped score
   undermines clean-site credibility; urgency timer reads as
   marketing furniture not product.
9. **Cache key includes JTBD** — second visitor with different
   `concern` gets a different cache entry. Doubled cache entries
   per domain but no real cost. Tracked, not flagged urgent.

---

## 15. How to test locally

```bash
npm run dev
# Visit http://localhost:3000/lp/audit
# Walk the 7 screens with any domain (havefunnels.com works as a
# realistic baseline since that's our paying customer).
# Email step routes to /lp/audit/result/[leadId]?
# Loading screen should sit ~18s before unlocking "Ver minha análise".
# Result page renders all 7 sections (header → plan → workspaces →
# map → MCP mockup → findings → CTA final → locked grid → footer).
# CTA click should open Paddle (assuming NEXT_PUBLIC_PADDLE_LP_PRICE_ID
# is set in .env.local).
```

To inspect tracked events in dev:

```sql
SELECT event, properties, createdAt
FROM "ProductEvent"
WHERE "leadId" IS NOT NULL
ORDER BY "createdAt" DESC
LIMIT 50;
```

---

## 16. Commit ledger

The Wave-22.6 mini-audit redesign:

| Step | Commit | What |
|---|---|---|
| 0 | `bcae3616` | Detector cleanup (23 → 17, reframes, blurred retune) |
| 1 | `042b048b` | Form v3 (3→7 steps, JTBD, revenue, handoff) |
| 2 | `231b19a3` | Loading screen 5 active + 6 teaser |
| 3 | `7bbf1321` | Light theme + ResultHeader + PlanPreviewSection |
| 4 | `83e2f995` | WorkspacesAccordion + framework flaunt + integrations |
| 5 | `7e72f62b` | MapPreviewSection (SVG) + McpChatMockup (typing) |
| 6 | `098127ea` | CTAFinalSection (JTBD-personalized close) |
| 7 | `2f2c2599` | Anon telemetry on ProductEvent + lp_audit_* events |
| Polish | `4eac805d` | Impact spread tightening (midpoint-only when > 50%) |

---

## 17. When in doubt

- "Is this a product feature?" → no, it's a sales asset. Build
  accordingly.
- "Should the anon path call an LLM?" → no. Static detectors only.
- "Should I blur this?" → no. Server-side cut or skeleton-shimmer.
- "Should I show this number?" → counts yes, content no (until they
  pay).
- "Is this copy buyer-experiential?" → if it reads like a Screaming
  Frog report, rewrite.
- "Does this CTA say 'unlock' or 'paywall'?" → say "Criar conta
  agora" instead.

---

## Related memory entries

- `no-seo-slop` — findings rule.
- `skeleton-over-spinner` — loading state rule.
- `no-terminal-aesthetic` — no visible AI labor.
- `vocab-analise-not-auditoria` — "Análise" not "Auditoria" in copy.
- `vocab-sweep-pending` — tracking the unresolved sweep.
