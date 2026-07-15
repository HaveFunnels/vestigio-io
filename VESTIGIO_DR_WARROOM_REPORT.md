# Vestigio · Direct Response Sales War Room Report

_Consensus report from a 15-character sealed war room (5 clusters × 3 skills each) — 3 deliberation rounds: parallel cluster analyses → cross-cluster adversarial critique → integrator synthesis. Source of truth: Vestigio.io codebase. Stakes: report must produce $500K revenue in 6 months post-implementation or the characters cease to exist._

**Generated:** 2026-07-15 · Workflow ID `wf_c23d1262-42a` · 977k tokens · 11 agents · 26 min

---

## Executive Summary

### Top 5 movements

1. Wire Meta Pixel + CAPI, Google Ads gtag + Enhanced Conversions, TikTok Pixel + Events API — server-side, deduped on the event_id TrackingScript already emits, with EMQ acceptance criterion (hashed email + hashed phone + IP + user-agent + fbc/fbp + external_id) targeting 8.0+ per event. Every paid recommendation in this report is downstream of this — verified grep-empty today, ad spend before this ships is money burned during learning-phase-that-never-exits. 8-12 engineering days, Meta first then Google then TikTok, do not block Meta launch waiting for TikTok.
2. Fix 4 credibility bombs before ANY new ad flight (all ship-blocking, all 1-day-or-less each): (a) canonicalize Garantia 4X to ONE clause across all surfaces + 4 locales — 'Garantia: 100% do dinheiro de volta em 30 dias se a Vestigio não apontar 4× o valor do plano em vazamento mensal' — lead with 100%-back, 4X as proof point, kill the shipped 90-day EN variant that contradicts the 30-day promise, position adjacent to every buy button not in sidebar; (b) delete '20.000 empresas' overclaim from ClientGallery — one screenshot in a BR founder WhatsApp group is a 60-day CAC penalty; (c) rewrite pricing_section.plans[*].description (Lorem Ipsum + SaaS-analytics feature bullets like 'Até 1.000.000 visitas rastreadas / Até 03 membros da equipe' — verified rendering on /pricing + /activate via pricingData.ts) to revenue-leak-diagnosis outcome copy; (d) resolve 287 German __TODO__ strings on the /activate paywall (verified in de.json — DE checkout literally prints '__TODO__ __TODO__ __TODO__' today) with native DE copywriter (do NOT machine-translate the guarantee or paywall — use 'entgehen', not 'lecken').
3. Ship the AOV stack that requires zero acquisition dependency: (a) order bump at /activate = 'Entrega Prioritária, primeira edição em 48h — +R$147' (Priority Delivery replaces the killed 'Competitor Comparison' — on-thesis, near-zero delivery cost); (b) post-purchase OTO interstitial before /app redirect ('upgrade to Max at discounted rate, 60-second window'); (c) abandoned-checkout 3-email drip (T+1h/T+24h/T+72h) — leadId + email already captured, pure backend work; (d) native share buttons on /audit/result (WhatsApp / X / LinkedIn / Copy Link) with pre-filled copy naming top R$ finding — activates the already-shipped opengraph-image.tsx per-leadId OG image, highest ROI-per-engineering-hour in the entire war room.
4. Kill every checkout structural break in one activation sprint: (a) cut /audit from 7-8 to 3 screens (domain → business_type → email), move revenue/concern/current_method/why_now to progressive profiling on /audit/result AFTER buyer sees findings — fire pixel events per abandoned step so retargeting audiences survive the reduced surface (Traffic-ads' audience concern reconciled with Funnel-CRO's throughput fix); (b) default paywall cycle to annually (2-line change in ActivatePaywall.tsx line 73-75); (c) native USD/EUR/MXN pricing per locale via getLocalCurrency() router (kill hardcoded formatBRL — verified in ActivatePaywall.tsx line 41-48, German buyer literally sees Reais today); (d) Apple Pay + Google Pay wallet buttons above tabs on /activate; (e) BR 12x installment display ('12x R$16 sem juros'); (f) hide CPF field for non-BR, route non-BR to Paddle-only.
5. Ship '9 Vazamentos' PDF lead magnet as Meta Lead Ad NATIVE FORM (not just LP conversion) with 4-email nurture ending at /audit — 4 locales (pt-BR/en/es/de), each ~12-page PDF (one leak per page + example screenshot + R$ typical impact + CTA to /audit). Meta Lead Ad conversion is 8-15% on cold IG/FB vs 1-3% LP-click conversion for the same audience — turns retargetable pool from 2% (audit completers) to 40-60% (email captures), math-critical at realistic 0.1-0.5% session-1 paid conversion rates. Exit-intent recovery on /audit for form abandoners uses the same PDF as consolation. Fifth-most-important move because it multiplies against #1 (pixels), #3 (share tail), and #4 (activation) — without it, cold-Meta CAC ceiling makes $500K math impossible.

**Realistic 6-month impact projection:** Achievable but NOT via any single lever. At realistic cold-Meta session-1 conversion of 0.1-0.5% and $200 blended AOV, $500K requires ~1,250-2,500 paying activations across the 6 months. Reachable via mix: (a) $200-350K from paid direct (Meta/TikTok/Google) once pixels + CAPI + EMQ 8.0+ + LPs + 5 creative angles + 4 locales are live — ceiling determined by ad-account warm-up (Meta caps new BM at $50/day for 21-30 days, so months 1-2 are $10-30K spend max regardless of readiness); (b) $100-150K from Meta Lead Ads → PDF magnet → 4-email nurture (unlock: turns retargetable pool from 2% of clicks to 40-60%); (c) $50-100K from viral peer-share tail on /audit/result WhatsApp/X/LinkedIn buttons — CAC ~$0 on this segment; (d) $30-80K from AOV expansion (Priority Delivery order bump 25% take × R$147 + post-purchase OTO 15% take + abandoned-cart drip 10-20% recovery). Month 1-2 = infrastructure + credibility fixes + $10-30K controlled spend during warm-up. Month 3-4 = first meaningful revenue as pixel learning phase exits and LPs A/B out winners. Month 5-6 = flywheel + AOV compounding + owned channels (newsletter, share tail, retargeting) reducing effective CAC. If Round-2 critical bets (fulfilment SLA, chargeback ops, ad-account fallback, PROCON compliance review) are ignored, cap at $150-250K in 6 months with high probability of account freeze or refund cascade in months 3-4.

**Biggest risk to the $500K target:** Product fulfilment throughput, not acquisition. At $500K/6mo with blended ~R$150/subscriber ARPU, the roadmap produces ~3,300 paying subscribers by month 6, each expecting a Plano every 30 days = ~110 Planos/day steady-state. If the Plano is manually written by the founder, throughput caps below 200/mo and refund cascade triggers around month 3. Compounding this: the 4X guarantee runs 30 days from PAYMENT but the 'monthly editorial' cadence implies the first Plano ships on day 30 — meaning buyers hit the refund window the same day they see the deliverable. Every acquisition, pricing, checkout, and creative move in this report is downstream of a fulfilment plan that no cluster owns. Required: (a) day-1 preview Plano auto-generated from the free audit + LLM synthesis (bridge deliverable), (b) full Plano SLA ≤ 14 days from payment, (c) engine/AI pipeline stress-tested for N concurrent audits, (d) analyst review layer that scales beyond founder-only. Without this, the $500K target hits a wall not because ads fail but because delivery does — and refunds + Reclame Aqui posts poison the paid channel for 60+ days per incident.

---

## ✅ Perfect (do NOT touch) — 13 items

### 1. MiniCalculator embedded above the fold as free-tool magnet (paste URL → status_discovering → status_checkout → status_payment → status_trust in seconds)

**Why:** The ad promise IS the free tool. Low-awareness buyers respond to 'give me the free thing NOW' more than 'sign up'. The MiniCalc IS the ad's post-click payoff: the mechanism demo'd in the ad is the mechanism they touch in 3 clicks. Don't gate it, don't move it below the fold, don't rebuild it. Every cluster preserved this.


### 2. Loss-aversion framing locked across pre-signup surfaces (SocialProofStrip, Hero, MiniCalc, /audit, Pricing heading, StickyCTA)

**Why:** Anxiety = conversion driver for low-awareness DR (per user memory feedback_anxiety_keeps_audit_funnel_converting). Every ad angle scales rides on this frame. Founder has already killed the temptation to sand it down for calm-editorial. Do NOT let brand-hygiene tempt anyone to strip 'perdendo' / 'vazando' / 'escapa' from ad-adjacent copy. Editorial typography ≠ editorial-calm messaging; form + content are separate axes.


### 3. Free scan as top-of-funnel offer + 60-second scan promise + 'funciona com qualquer plataforma'

**Why:** '60 seconds' + platform-agnostic dissolves the exact objection a cold buyer needs answered before pasting their URL. Fits inside a 3-second video hook. The free scan IS the credibility mechanism the 4X guarantee depends on. Growth-revenue's tripwire replacement (R$1/R$47 paid entry) was killed by every critic — violates founder-locked user memory + breaks ad-to-LP message match. Free scan stays.


### 4. Hero-LP variant question hook 'Quanto dinheiro está vazando da sua operação sem você perceber?' — for paid-traffic LPs only

**Why:** Textbook DR: interrogative + loss frame + timeboxed proof ('Digite seu domínio. Descubra em 60 segundos quanto VOCÊ perde.'). Preserve VERBATIM as paid-traffic LP headline. Route hero_v2 statement-of-fact ('A Vestigio sabe onde e quanto') to home/organic only. Positioning's original 'kill hero_lp entirely' was overruled — question hooks convert cold-paid low-awareness at 65-70% higher rate than assertion hooks (Kennedy, Halbert, Brunson canon).


### 5. Interstitial registry (benchmark / anticipation / finding_teaser) with seen-before gating

**Why:** Value-on-fill DURING form-fill is the anti-DR-abandon pattern that actually works. Non-personalized frames gated to first-visit only via SEEN_INTERSTITIALS_KEY = zero repetitive-friction cost on return. Elite mechanic — most DR funnels never build it. Load-bearing under the 3-screen /audit cut (interstitials become MORE important as form shrinks).


### 6. Early-crawl dispatch after step 1 (POST /api/lead/{id}/early-crawl) + LocalStorage handoff MiniCalc → /audit → /activate

**Why:** Fires audit crawl AS SOON as domain is submitted, while buyer answers subsequent steps. By email submission, HTML is cached and run-audit skips 1-4s httpFetch — this is why 60s promise holds. Killing it kills the promise. LocalStorage handoff (vestigio_onboard_* + vestigio_lp_*) means buyer never re-answers domain/revenue/business_type across screens — strongest anti-abandon mechanic in the funnel. Verified in useLpAuditForm.readLocalStoragePrefill + ActivatePaywall.useEffect.


### 7. Two-click reveal gate on /audit/result findings

**Why:** The click IS the anxiety-to-relief conversion peak the guarantee is calibrated around. Funnel-CRO's proposed auto-reveal was overruled — removing the click converts high-emotion active reveal into passive scroll onto numbers buyer never chose to see. Also breaks mobile-return pattern (buyer tabs away during 60s, returns to a button, taps once = dopamine peak). Preserved by Positioning + Traffic-ads.


### 8. MP device fingerprint (MP_DEVICE_SESSION_ID) forwarded on both Pix and Card + Pix status polling every 4s with expiry cutover

**Why:** MP publishes 10-15% approval-rate uplift with device fingerprint. Already wired in submitCard + startPix — non-negotiable, losing it on a refactor costs money directly. Pix polling every 4s = the single UX difference between Pix converting and Pix abandoning on BR (Nubank/Inter buyers expect polling). Auto-redirect to /app on approved keeps buyer on-page while QR is scanned instead of guessing whether it worked.


### 9. Three-tier ladder shape (Starter/Pro/Max) with Pro flagged 'Mais escolhido' as decoy anchor

**Why:** Decoy pricing works. Middle-anchored 'most chosen' Pro at R$199 is textbook — buyers pick middle 60%+ when framed this way. Growth-revenue's 'kill Starter entirely' was overruled — removing Starter collapses three-tier decoy to two-tier and pushes AOV expectation UP visually right when low-awareness buyer is deciding to trust brand. Also premature optimization removing a tier with unknown-but-possibly-positive LTV at havefunnels-tier data volume. Keep visible; change what's INSIDE (default cycle annual, fix Lorem tier descriptions).


### 10. Paddle-as-default with Mercado Pago fallback for BR + Vestigio Index editorial masthead at /vestigio-index

**Why:** Paddle-as-MoR handles VAT/GST/sales-tax across en/es/de without registering in 50 jurisdictions. MP fallback captures Pix (highest-converting BR method). Correct cross-border rail architecture — do NOT move to Stripe-only or Hotmart-only. Vestigio Index provides editorial credibility that de-risks the second click (cold buyer bounces ad but Googles Vestigio 3 days later lands on editorial). Powers 'you vs market' benchmark. Separate from marketing home — do not fold in.


### 11. VideoTestimonials with real named humans (Dra. Renata Albuquerque, Advogada e Contadora)

**Why:** Highest-trust asset on the entire site because it's identifiably a real person in a specific vertical, not a rendered avatar. For low-awareness DR, a face + name + profession collapses the 'is this legit?' objection. Do not swap for copy testimonials. Content-supply SOP (see missing_create) builds a pipeline to add more of these — but preserve what's there.


### 12. SolutionLayers eyebrow 'O PROBLEMA' → 'Mais tráfego não resolve. O dinheiro escapa entre o clique e a conversão.'

**Why:** Category-teaching in 12 words. Low-awareness ICP arrives thinking 'I need more traffic'; this line reframes to 'you already have enough traffic, you're leaking it'. That is the entire wedge. Do not rewrite. Also: Banner 'Tese do mês' is the only line on the site that operates as category-of-one framing — no competitor uses 'thesis' as a monthly deliverable. Protect it.


### 13. URL-quality green sparkle + urlNudge on MiniCalc + auto-advance on CardSelectionStep with BUG-03 inFlightRef guard

**Why:** URL sparkle = visual feedback the domain typed is scannable before commit, reduces 'is this actually going to work?' hesitation loop. Auto-advance removes a click on 4 of 7 screens; the inFlightRef guard + overrides pattern prevents classic soft-lock where React stale-state sent empty payloads. Load-bearing under the 3-screen cut.



---

## 🟡 Good — polish only — 10 items

### 1. Hero primary CTA copy (both home and /lp)

**Current:** 'Rodar diagnóstico gratuito' / 'Run free diagnostic' — curiosity CTA, not commitment. Named as suspect #4 in brief.
**Polish:** 'Ver meu vazamento em 60s — grátis' / 'See my leak (60s — free)' / 'Ver mi fuga (60s — gratis)' / 'Meinen Leak zeigen (60s — kostenlos)'. Locale-mapped. Keeps 'grátis' explicit (per user memory feedback_hero_cta_free_action_beats_preview — free-action framing is founder-locked) while tightening to outcome-first + timebox.

**Why:** The user memory locks the free-action feel; the polish is verb+specific-outcome+timebox, completing the ad's promise instead of restarting the decision. Growth-revenue's tripwire replacement ('R$1' / 'R$47 tripwire') was killed by every other critic — it violates founder-tested positioning AND breaks ad-to-LP message match for cold Meta clicks that arrive with zero brand equity.


### 2. Hero subtitle passive-observer clause

**Current:** 'Mostramos onde o dinheiro escapa, quanto, e o que você faz pra parar.'
**Polish:** 'Mostramos onde o dinheiro escapa, quanto, e como parar.' / 'We show where the money leaks, how much, and how to stop it.' / 'Mostramos dónde se fuga el dinero, cuánto, y cómo pararlo.' / 'Wir zeigen, wo Geld entgeht, wie viel und wie man es stoppt.'

**Why:** 'O que você faz pra parar' puts the burden on the buyer — 'the Vestigio SABE' promise chain breaks with the passive-observer construction. Also fixes an English grammar break ('what you do to stop it' should be 'what to do to stop it').


### 3. Secondary hero CTA

**Current:** 'Ver tour do produto' — competing button of equal weight against primary CTA, and it's just an in-page scroll (ProductTour renders in DemoSurface below).

**Polish:** Demote to text-link 'Ver como funciona' with scroll-anchor to #product-tour. Kill the button-equivalent visual weight. Ship 'Ver um Plano real' idea was killed — requires a redacted-havefunnels anonymization pipeline that doesn't exist (per user memory project_havefunnels_redacted_plan_consent).

**Why:** Two CTAs of equal visual weight split intent in DR. Single primary + text-link secondary preserves the warm on-ramp for the 60% of hero traffic that won't take primary action, without diluting click intent.


### 4. MiniCalc result-page CTA

**Current:** 'Receber meu Plano' (dictionary/pt-BR.json line 781) — names a product ('Plano') the low-awareness buyer has been on the site 45 seconds and never seen defined.

**Polish:** 'Ver quanto está vazando →' / 'See how much is leaking →' / 'Ver cuánto se está fugando →' / 'Zeigen, wie viel leckt →'. Add price microcopy right below: 'R$99/mês — Garantia 4× em 30 dias'. Anchors the commitment at the moment of peak intent (results just revealed) and kills the tardy-price-shock at /activate.

**Why:** Peak-intent moment; buyer just typed their URL. Outcome-first CTA + price transparency at result = single most efficient copy edit on the site. Positioning + Funnel-CRO + Growth-revenue all converged on this.


### 5. Counter tile empty descriptions (visibility_desc, monitoring_desc, integrations_desc)

**Current:** Empty strings in pt-BR — tiles render title-only, reads as 'unfinished section' to low-awareness buyers.
**Polish:** visibility_desc → '15.000 sinais varridos a cada análise: checkout, funil, mobile, scripts, meta ads, SEO.' monitoring_desc → 'Toda mudança no site é comparada ao ciclo anterior. Regressões críticas em horas, não em semanas.' integrations_desc → 'Shopify, WordPress, Webflow, Framer, Next.js, site custom — se abre num browser, a Vestigio lê.'

**Why:** Kills the 'this probably won't work on my site' objection (integrations line specifically) + the 'what do they actually look at' unknown. Small copy edit × 4 locales, no engineering.


### 6. Sticky CTA copy mirror

**Current:** Independent of hero — reads as generic re-exposure.
**Polish:** Mirror hero CTA exactly on sticky bar. When Hero says 'Ver meu vazamento em 60s — grátis', StickyCTA says the same. Under paid sessions, 3 sticky variants keyed by utm_campaign: ghost angle → 'Ver seus 9 vazamentos'; guarantee → 'Grátis, 4X ou 100% de volta em 30d'; category → 'Ver benchmark do seu setor'.

**Why:** Sticky CTA is the second-chance close. Repeating the hero (or the ad, under paid) accumulates commitment; new words = new decision.


### 7. Progress bar on /activate

**Current:** 'Passo 2 de 2' with 2 segments — buyer has already crossed audit form + result reveal + signup, feels shorter than it is.

**Polish:** 'Passo 3 de 3: Ativar' with 3 filled segments (Diagnóstico done, Conta done, Pagamento active). Small honest re-labeling.

**Why:** Sunk-cost fallacy works FOR you when the progress bar reflects actual sunk cost. Reduces abandon-at-the-goal-line.

### 8. Pix monthly renewal warning position

**Current:** 'Renovação manual por email todo mês' buried in sidebar aside (line 509) — invisible at decision moment.
**Polish:** Move to warning-tone chip UNDER 'Gerar Pix' button when cycle=monthly: 'Pix mensal exige nova confirmação todo mês — economize 20% e vá anual (R$16/mês)' with one-click switch.

**Why:** Making friction VISIBLE at decision converts a slice to Pix-annual (higher LTV, less involuntary churn) and drives Card selection (auto-renews). Also gets ahead of BR CDC Art. 6º VIII disclosure requirements that quiet monthly-Pix renewal may violate.


### 9. German hero headline (native-DE nuance)

**Current:** Machine-translation-tier 'Es leckt Geld aus Ihrem Betrieb' — 'lecken' in DE reads as physical leak (pipe/roof), weak money idiom.

**Polish:** 'Ihrem Betrieb entgehen Einnahmen — Vestigio zeigt, wo und wie viel.' 'Entgehen' is the exact DE idiom for money you should have received but didn't. Native DE copywriter must sign off — DACH-locale hero + guarantee + paywall are the three surfaces that must not machine-translate.

**Why:** DACH = 25% of cross-border TAM. Machine-translated guarantee copy is both a conversion killer AND a Verbraucherzentrale flag risk. €400-800 native review is a rounding error against unlocking the locale.


### 10. Add Instagram + TikTok + LinkedIn + YouTube icons to Footer

**Current:** Footer only links x.com/vestigio_io + github.com/vestigio-io. Meta ad clickers who search 'vestigio' on IG mid-funnel find nothing → 'ad-farm signal' bounce.

**Polish:** Claim @vestigio.io on IG/TikTok, /company/vestigio-io on LinkedIn, /@vestigio-io on YouTube. Ship handles + 3 pinned real posts + logo + bio + link BEFORE first ad flight in each locale (empty profile with 0 posts fires the ad-farm filter it was supposed to solve — Lead-acq's revised position). Then add Footer icons. Lead-acq's original 12-post backlog per surface was overruled as marketing-premature-pre-PMF.

**Why:** Defensive trust footprint. Cross-vertical low-awareness buyers (pt-BR/en/es/de) all do the 3-second IG check. Also: Meta algorithm quality-scores advertisers with parallel organic IG activity.



---

## 🔧 Improve / Rework — 16 items

### 1. Ad-platform conversion infrastructure — pixels + CAPI + EMQ across Meta / Google / TikTok

**Current:** ZERO ad pixels wired. Only src/components/analytics/TrackingScript.tsx (first-party pageview/scroll/cta_click/time_on_page beacons). Grep for fbq/MetaPixel/gtag conversion/ttq across src/ + apps/ returns empty.

**Proposed:** Ship in order: (1) Meta Pixel + CAPI server-side with event_id dedup on the same event_ids TrackingScript already emits — standard events PageView, ViewContent(/audit steps), Lead(/audit email step), InitiateCheckout(/activate), Subscribe(payment_confirmed). Server webhooks for Subscribe from Paddle + MP payment_confirmed. Advanced Matching: hashed email + hashed phone + IP + user_agent + fbc/fbp + external_id on every event. Target EMQ 8.0+ per event in Events Manager (below 6.0 = placebo). (2) Google Ads gtag + Enhanced Conversions using hashed email at /audit step 7 + /activate signup. (3) TikTok Pixel + Events API mirroring the same 5 events. Single event router (event_id per session) fans out to all three. Buyer identity resolution layer: email hash as user_id AFTER capture, deduped against past leadIds to prevent Meta pixel multi-count and garbage lookalike training.

**Why:** DR on Meta/Google/TikTok mathematically DOES NOT WORK without conversion signal. Learning phase never exits, CPA stays random, lookalikes are impossible, iOS 14+ ATT + Chrome 3rd-party cookie loss makes CAPI/Enhanced Conversions non-optional in 2026. EMQ acceptance is the difference between 'CAPI wired' and 'CAPI helping' — 'wired without EMQ' returns 20% of the investment value. Every other paid recommendation is downstream of this.

**Effort:** L
**Impact:** critical
**Risk If Skipped:** $500K goal is mathematically impossible. Every dollar of ad spend before pixels are live is burned in the learning phase.

**Owner Cluster:** traffic-ads (with growth-revenue owning event map spec: Lead → InitiateCheckout → Subscribe)

### 2. Ad account setup + policy compliance + domain warm-up pre-flight

**Current:** New Meta Business Manager caps at $50/day for 21-30 days regardless of budget. TikTok has similar auto-throttling. Domain reputation needs 30-90 days clean traffic before premium placements. Loss-frame + guarantee-heavy creative Vestigio needs (per every cluster) triggers Meta Financial Services vertical review + 'personal attributes' + 'unrealistic outcomes' flags = 15-30% first-submission disapproval rate. No cluster raised this in Round 1.

**Proposed:** (a) Provision main BM + 2 backup BMs pre-warmed on separate business identities. (b) Verify domain on Meta + Google + TikTok. (c) Ensure /termos + /politica-de-reembolso + /privacidade pages live in all 4 locales. (d) Submit to Google Ads Financial Services vertical review. (e) Evidence log for every specific R$ number cited in ad creative (any 'R$47k recovered' style claim needs substantiation). (f) Ship one 'compliant' creative variant per angle alongside the aggressive one — swaps 'we find your money' → 'you can see for yourself' framing. (g) FTC-style disclaimers on en/es LPs; 'resultado individual pode variar' badge on pt-BR; DACH disclosure of 30-day guarantee alongside statutory 14-day right of withdrawal.

**Why:** Aggressive language ('perdendo', 'vazando', '4X guarantee') is the exact vocabulary combination Meta flags. One flagged ad = 30-day account restriction minimum, killing paid engine at the moment infrastructure is ready to scale. Backup accounts are business continuity, not paranoia — pattern flags 15-30% of DR advertisers in finance-adjacent within first 90 days.

**Effort:** M
**Impact:** critical
**Risk If Skipped:** Ad account ban in month 2-3 = zero ad revenue for 30-60 days = missed $500K target regardless of every other lever.
**Owner Cluster:** traffic-ads (with positioning consulted on disclaimer copy)

### 3. Cut /audit form from 7-8 to 3 required screens + progressive profiling on result page

**Current:** /audit = domain → business_type → sub-vertical → revenue → concern → current_method → why_now → email (7-8 screens verified in useLpAuditForm.computeScreens). Each field except domain/email/business_type is diagnostic-quality but not gating; backend already tolerates missing fields via DEFAULT_REVENUE/DEFAULT_TICKET fallbacks.

**Proposed:** 3 required screens: (a) domain, (b) business_type auto-advance with sub-vertical inline, (c) email → fires audit. Move revenue/concern/current_method/why_now to progressive-profile 'refine my findings' widget on /audit/result AFTER buyer sees findings. Fire pixel events per abandoned step (business_type_selected, revenue_selected, why_now_selected, email_provided) so retargeting audiences still exist for the reduced surface — Traffic-ads' audience-per-step concern reconciled with Funnel-CRO's throughput fix. Unify MiniCalc business_type list with /audit's canonical 7-option set (ecommerce/lead_gen/saas/services/app_conversion/enterprise/hybrid) so localStorage handoff doesn't silently corrupt.

**Why:** Each screen after screen 2 is a 5-15% abandon opportunity for low-awareness cold traffic — compounding to 25-50% total loss between screens 2-7. Progressive profiling on result page is proven better (buyer's committed via findings-shown, will answer for MORE detail). Fastest path to funnel-throughput improvement. Backend already accepts partial data.

**Effort:** M
**Impact:** critical
**Risk If Skipped:** Every abandoned session between screen 2 and 7 is paid ad spend evaporating. Reclaiming half of current drop-off = 12-25% more email captures per ad dollar — direct multiplier on the $500K math.

**Owner Cluster:** funnel-cro

### 4. Native USD/EUR/MXN pricing per locale — Paddle-powered checkout routing

**Current:** ActivatePaywall.tsx line 41-48 hardcodes formatBRL currency='BRL' locale='pt-BR'. Every non-BR paywall visitor sees Reais at checkout. pricingData.ts single unit_amount per tier (99/199/399 * 100). No per-currency price IDs. Verified: German buyer literally sees 'R$ 199' at /activate.

**Proposed:** Add getLocalCurrency(locale) → pt-BR→BRL/MP, en→USD/Paddle, es→USD or MXN/Paddle, de→EUR/Paddle. Store 4 unit_amounts per plan, pull the right one at render. USD anchors: Pro-annual $199/yr ($19/mo equivalent), Max-annual $399/yr ($39/mo). EUR mirrors USD 1:1 at launch (don't price-optimize per locale until data). Next.js middleware routes non-pt-BR to Paddle only (Paddle handles MoR/tax across en/es/de). Ad copy currency must match LP currency 1:1 per campaign — ad says '$19/mo' iff LP shows '$19/mo'.

**Why:** Cross-border is a brief mandate; today paywall is silently broken for 3 of 4 target locales. Every EUR/USD ad click hits BRL at checkout and bounces. BR volume alone cannot hit $500K/6mo at $99-399 ARPU. 3-5 days engineering unlocks 4-5x TAM. Every cluster converged on this — highest audience-expansion lever in the roadmap.

**Effort:** M
**Impact:** critical
**Risk If Skipped:** $500K target unreachable on pt-BR alone at current ARPU band. Every euro/dollar spent on DACH/en/es ads is burned at the checkout wall.

**Owner Cluster:** growth-revenue (pricing display) with funnel-cro (Paddle routing middleware)

### 5. Add order bump + post-purchase upsell to /activate + share buttons on /audit/result

**Current:** /activate has zero add-on offer. Payment success → setTimeout 1200ms → window.location.href = /app. No OTO. /audit/result/[leadId] page.tsx (2,955 lines) has zero share/whatsapp/twitter/linkedin/clipboard tokens despite opengraph-image.tsx deployed at edge with dynamic per-leadId 1200x630 images.

**Proposed:** (a) Order bump on /activate: single checkbox between order summary and Pay — 'Adicionar Entrega Prioritária — primeira edição em 48h em vez de 30 dias — +R$147'. Priority Delivery replaces killed 'Competitor Comparison' (off-thesis) and 'Emergency Call' (needs analyst calendar infra). Near-zero delivery cost (queue prioritization config flag). One-click, no re-entry of card. (b) Post-purchase OTO: 60-second interstitial before /app redirect — 'Upgrade to Max at +R$99/mo for the next 24h (economia de R$100/mo vs preço cheio)'. Big Yes / small text-link No. Timeout auto-declines after 60s. (c) Native share buttons on /audit/result (WhatsApp / X / LinkedIn / Copy Link) with pre-filled copy: 'Rodei um diagnóstico grátis no [domain] — achou R$X/mês vazando. Roda o seu: [url]'. Per-locale copy. Activates the already-deployed opengraph-image.tsx.

**Why:** Highest EPC edits available today with zero incremental CAC. Bump 25% take × R$147 = R$36 avg AOV lift. OTO 15% take on Max upgrade at R$99/mo = R$14 monthly + LTV. On 500 activations/mo, R$25-75K/mo pure margin. Share buttons unlock viral tail on already-shipped infra — peer-referred traffic converts 3-5x cold-ad traffic at CAC near $0. This trio is the fastest ROI on engineering hours in the entire war room and every cluster endorsed.

**Effort:** M
**Impact:** critical
**Risk If Skipped:** Leaving 25-50% AOV expansion + viral loop on the floor at the moment ad spend is scaling — direct dollars uncollected.
**Owner Cluster:** funnel-cro (bump + OTO) with lead-acquisition-social (share copy per locale)

### 6. Canonicalize Garantia 4X clause + position adjacent to every CTA + resolve 30-vs-90-day contradiction

**Current:** Three formulations shipping in prod: (a) Hero trust 'se não encontrar 4x o valor do plano, devolvemos 100%' (no timeframe), (b) Counter 'em perdas mensais, devolvemos 100%' (no timeframe), (c) /audit result EN 'Recover at least 4x what you paid within 90 days' (contradicts brief-stated 30-day). Positioned in sidebar aside, not adjacent to buy button.

**Proposed:** ONE canonical clause everywhere: 'Garantia: 100% do dinheiro de volta em 30 dias se a Vestigio não apontar 4× o valor do plano em vazamento mensal.' EN 'Guarantee: 100% money back in 30 days if Vestigio does not identify 4× your plan value in monthly leaks.' Lead with 100%-back (binary the buyer parses instantly), 4X as proof point. Two-word badge variant near every buy button: '4× ou 100% de volta'. Position INLINE below Pay button (duplicate from sidebar) on /activate. Same clause on Hero, MiniCalc result, /audit result CTA cluster, /activate, and /pricing.

**Why:** Guarantee is the load-bearing DR trust asset — three inconsistent formulations with contradicting timeframes is a smoking gun for any operator who reads carefully (and cold DR buyers DO read the guarantee at decision moment). Growth-revenue's self-punishing +R$200 bonus was killed by every critic — creates unbounded liability + PROCON exposure + Wanamaker 'too-good = scam' filter. Positioning + Traffic-ads' merged clause is enforceable, consistent, and legally defensible.

**Effort:** S
**Impact:** high
**Risk If Skipped:** Guarantee inconsistency undermines the single largest checkout-conversion lever in DR at low awareness. Also: shipping 90-day EN copy against brief-stated 30-day is a Reclame Aqui / consumer-protection landmine at scale.

**Owner Cluster:** positioning

### 7. Delete '20.000 empresas' overclaim + fix pricing_section.plans[*] Lorem Ipsum + SaaS-analytics feature bullets + delete dead testimonials/newsletter Lorem

**Current:** (a) ClientGallery pt-BR: 'Junte-se a mais de 20.000 empresas que não escalam no escuro' — unverifiable at current customer scale (havefunnels is first paying customer per project memory). (b) pt-BR.json lines 616-670: pricing_section.plans still contains 'Basic/Pro/Empresarial' with 'Lorem ipsum dolor sit amet' descriptions AND SaaS-analytics feature bullets ('Até 1.000.000 de visitas rastreadas', 'Até 03 membros da equipe') — this IS what /pricing + /activate render via getPricingData(). (c) dictionary/pt-BR.json:691-725 testimonials_section + :730-735 newsletter_section still contain Lorem Ipsum — verified NOT rendered (Home/index.tsx doesn't import) but strings ship in JSON bundle.

**Proposed:** (a) Delete 20K number entirely. Replace with 'Operadores que pararam de escalar no escuro.' (no number) OR — if verified — 'Rodando em [X] operações no BR, US e EU.' (b) Rewrite all three pricing tier bodies to leak-diagnosis outcome language. Example Pro: name='Pro', for='Para negócios de R$50k-500k/mês', description='Achamos o vazamento em 60s. Você fecha em 4 passos. Todo mês.', included.items=['Plano mensal com tese central', '9 vazamentos identificados (média)', 'R$ exato em cada finding', '4 passos priorizados por edição', 'Pix, cartão, boleto', 'Garantia: 100% de volta em 30 dias se não achar 4×']. Zero SaaS-analytics vocabulary. (c) Delete dead testimonials + newsletter Lorem blocks from all 4 locale dicts as hygiene cleanup — defense-in-depth against ad-review crawl + accidental re-enablement.

**Why:** The 20K overclaim is asymmetric downside: one screenshot in a BR founder WhatsApp group = permanent 60-day CAC penalty. The pricing_section Lorem is the LIVE Lorem that renders on the money page — brief mis-flagged; Growth-revenue caught the actual crisis. SaaS-analytics bullets ('visitas rastreadas', 'membros') position Vestigio AS Google Analytics — kills the entire category wedge. Dead Lorem in JSON bundle = ad-review crawl fingerprint + git-hazard for accidental re-enablement.

**Effort:** S
**Impact:** critical
**Risk If Skipped:** Ship ads to a page with unverified '20K empresas' + Lorem tier descriptions + analytics-tool feature bullets = confidence-killer worse than any positioning polish can fix downstream.

**Owner Cluster:** positioning (copy) + growth-revenue (pricing card review)

### 8. Ship German locale — resolve 287 __TODO__ placeholders on the conversion path first

**Current:** de.json contains 287 __TODO__ strings including activate.plans.vestigio.name/price/features all set to '__TODO__'. DE hero + Counter + FAQ are translated, but the paying part of the flow renders literal '__TODO__ __TODO__ __TODO__'.

**Proposed:** Full de.json completion focused on conversion path FIRST: /audit → /audit/result → /auth/signup → /activate → /app/library. Native German copywriter (4-6 hours = €400-800). Do NOT machine-translate: (a) the guarantee, (b) the paywall, (c) the hero (use 'entgehen' idiom not 'lecken'). Cross-locale legal review: DACH consumer protection intersects with 30-day guarantee via statutory 14-day right of withdrawal for distance contracts — LP copy must disclose BOTH ('30-day satisfaction guarantee IN ADDITION TO your statutory 14-day right of withdrawal'). Impressum with named natural person required by DE law. Ensure /activate renders in EUR post-currency-fix.

**Why:** Zero German conversions possible today. Buyer clicks DE Meta ad, lands on translated hero, hits '__TODO__ __TODO__ __TODO__' at checkout, screenshots it, never returns. DACH = 25% of cross-border TAM. Non-negotiable to unlock the locale. Impressum non-compliance = automatic Abmahnung (~€1500 per instance) from consumer-protection lawyers.

**Effort:** M
**Impact:** high
**Risk If Skipped:** Do NOT run any DACH ads. Every euro spent on DE Meta/Google before this ships is burned. DACH contribution to $500K target = zero.

**Owner Cluster:** positioning (copy) + growth-revenue (legal review)

### 9. Land canonical category noun across hero, FAQ, /activate, meta description in 4 languages

**Current:** Site never names WHAT Vestigio IS in noun form. Buyers see verbs ('mostramos', 'analisamos') and product-name repetition ('a Vestigio sabe') but never the 3-word category label they'd use to describe it to someone else.

**Proposed:** One canonical category noun per language, repeated 5+ times per home: pt-BR 'diagnóstico mensal de vazamento de receita' / en 'monthly revenue-leak diagnostics' / es 'diagnóstico mensual de fugas de ingresos' / de 'monatliche Umsatzleck-Diagnostik'. Land in: hero eyebrow above H1, FAQ #1 ('O que a Vestigio faz?'), CTA subtitle, /activate paywall heading, meta description, X bio, IG bio.

**Why:** Low-awareness DR buyer cannot advocate internally, cannot remember the site 24h later, cannot resist mental default of 'Google Analytics' / 'Hotjar' (both free — sets pricing floor at zero) without a category name. Category = pricing floor. This is the multi-month compounding move — every future ad, SEO piece, retargeting touchpoint benefits.

**Effort:** S
**Impact:** high
**Risk If Skipped:** Compete against free tools forever because buyer thinks Vestigio is the paid version of them. No category = race to zero pricing.

**Owner Cluster:** positioning

### 10. Ship the abandoned-checkout 3-email drip

**Current:** leadId + email captured on /audit step 7 (writeLocalStorageHandoff). AnonymousLead row exists with email. Once buyer opens /activate and generates Pix without paying, or initiates card without submitting, ZERO recovery. Paddle path partially fires checkout_started webhook (page.tsx line 238); MP path doesn't.

**Proposed:** 3-email drip: T+1h reminder ('vi que você começou o checkout — precisa de ajuda?'), T+24h objection-handling with a specific testimonial ('outra fundadora achou R$X vazando em 60s'), T+72h final chance with 10% discount code. 4 locales × 3 emails = 12 templates. Complete checkout_started webhook on MP path parity with Paddle. Trigger cron reads AnonymousLead + Subscription state, sends per-locale template. Uses same email delivery infra as PDF magnet nurture.

**Why:** Zero new UI, pure backend + template work. Recovers 10-20% of abandoners at ~R$5-10K/mo baseline on 200 abandons/mo at R$199 avg. Sales-checkout canonical top-3 automation. Compounds monthly.

**Effort:** S
**Impact:** high
**Risk If Skipped:** Every abandoned checkout is ad spend permanently lost. 10-20% recovery at scale = tens of thousands in the 6-month window.

**Owner Cluster:** funnel-cro

### 11. Add Apple Pay + Google Pay wallets + BR 12x installment display + hide CPF for non-BR

**Current:** /activate: Pix + Card only. Card form hardcodes CPF field (required) — blocks non-BR entirely. Card installments hardcoded installments:1 (line 273) despite MP supporting 12x. Mobile is 60-80% of DR traffic — typing card + expiry + CVV + CPF on mobile = friction max.

**Proposed:** (a) Migrate to MP Payment Brick which supports Apple Pay + Google Pay natively; Paddle overlay also supports Apple Pay. Wallet buttons render ABOVE the Pix/Card tabs. (b) Installment selector on Card tab with '12x R$16 sem juros' label — eat interest cost or pass to MP's installment financing (BR buyers expect parcelado as default price frame — 'R$1.910 à vista' reads as expensive; '12x R$199 sem juros' reads normal). (c) Hide CPF field when locale != pt-BR; skip identificationType/identificationNumber in createCardToken; route non-BR to Paddle-only. Verify all paths.

**Why:** Wallet buttons are 2-3x higher conversion than typed card form on mobile (~40% of mobile buyers). BR installments lift card-tab conversion 20-30%. CPF-required is a silent zero-conversion tax on 3 of 4 target locales. Table stakes for 2026 mobile + cross-border DR.

**Effort:** M
**Impact:** high
**Risk If Skipped:** Bleeding mobile conversion vs any competitor with wallet support. Non-BR ad spend is wasted at CPF wall. BR paywall reads as expensive.

**Owner Cluster:** funnel-cro

### 12. Default paywall cycle to annually + display annual as 'R$16/mês (cobrado R$1.910/ano — economize 20%)'

**Current:** ActivatePaywall.tsx line 73-75: cycle defaults to 'monthly' unless localStorage stashed 'annually'. Annual displayed as lump R$1.910.

**Proposed:** Change default cycle state to 'annually'. Monthly stays available via toggle click. Display format: annual lump PRIMARY ('R$1.910/ano') with monthly-equivalent SECONDARY ('equivale a R$16/mês, economize 20% vs mensal'). BR consumer-protection norms require transparent lump display first — flipping to monthly-first primary (Growth-revenue's original) creates chargeback exposure when the R$1.910 hits the statement 14 days later. Keep Starter tier VISIBLE as decoy anchor (Growth-revenue's 'kill Starter' was overruled — Starter creates the R$99 anchor that makes Pro feel reasonable at R$199).

**Why:** Monthly-Pro R$199 (~US$40) is barely 1X payback at $30-50 FB CAC; annual-Pro R$1.910 is 8-12X payback on first charge and absorbs refunds. Default IS the pricing decision under emotional-impulse conditions. 2-line code change.

**Effort:** S
**Impact:** high
**Risk If Skipped:** Monthly-Starter/Pro cohort is CAC-negative for first 90 days at target CAC bands; unit economics never cross 3:1 LTV:CAC.

**Owner Cluster:** growth-revenue

### 13. First-Plano-delivery SLA + Day-1 preview Plano bridge deliverable — hardened inside the 30-day guarantee window

**Current:** No cluster verified when the first Plano ships post-payment. Implied cadence is 'monthly editorial' → first Plano lands ~day 30, which is the same day the 30-day guarantee window closes. Every buyer hits refund click before seeing deliverable = refund cascade.

**Proposed:** (a) Day-1 preview Plano auto-generated from the free audit + LLM synthesis + top-3 findings + R$ math + 4 prioritized steps (bridge deliverable, buyer sees SOMETHING within 24h). (b) Full analyst-reviewed Plano ships day 14 max, with an in-app '{N} days until first full analysis' countdown so buyer knows what's happening. (c) T+24h automated 'ROI receipt' email/WhatsApp ('Sua preview já achou R$X. Confirmando análise completa em N dias.'). (d) Engine/AI pipeline stress-tested for N concurrent audits at target scale. (e) Analyst review layer scales beyond founder-only (2-3 analyst hires or contractor pool with quality gate).

**Why:** This is the SILENT existential risk. Every acquisition/checkout/pricing improvement is downstream of a fulfilment plan. Without SLA inside guarantee window, refund rate is 40-60% (industry: 8-15% baseline for DR SaaS with a strong guarantee). Refund cascade = Paddle chargeback threshold breach (>1% = merchant account frozen 90 days = death). No cluster owned this in Round 1; Round 2 flagged it as critical.

**Effort:** L
**Impact:** critical
**Risk If Skipped:** $500K target dies in month 3-4 not from acquisition failure but from delivery failure. Refunds + Reclame Aqui posts + account freeze cascade.

**Owner Cluster:** growth-revenue (unit economics fail if delivery fails) + funnel-cro (operational workflow)

### 14. Consolidate signup+activate into modal-overlay on /audit/result (kill 3-page round-trip on MP path)

**Current:** MP path: /audit/result Criar Conta → /auth/signup?callbackUrl=/activate → /activate. Buyer bounces through 3 domain surfaces at peak intent. Paddle path uses openCheckout overlay in-place — parity gap.

**Proposed:** Embed /activate paywall INSIDE /audit/result as modal overlay, no page navigation. Requires: magic-link auth (no password), MP Payment Brick embedded (not Bricks-hosted redirect), Paddle inline-overlay reconfig, account provisioning-on-payment webhook, session bootstrap from webhook, redirect fallback for buyers who close mid-payment. Note realistic scope: 3-4 weeks eng work, not 1-2. Ship AFTER pixels + LPs + AOV stack + abandoned-cart drip land — those have higher $/eng-week ROI.

**Why:** Every navigation between pages at money moment = 20-30% drop-off. Paddle path proves the overlay pattern works; MP path parity is the ask. Buy-on-the-spot is the DR contract; the 3-page round-trip violates it twice (signup + activate).

**Effort:** XL
**Impact:** high
**Risk If Skipped:** Losing 30-50% of buyers who click 'Criar Conta' but bounce during signup/activate multi-page flow. Once other higher-ROI work lands, this becomes the biggest structural friction remaining.

**Owner Cluster:** funnel-cro

### 15. Refund + chargeback ops SOP + Reclame Aqui/Trustpilot monitoring + fraud tuning

**Current:** No refund workflow SOP documented. No chargeback dispute template. No Reclame Aqui monitoring. MP + Paddle default fraud settings not tuned for DR-shaped traffic. Paddle chargeback threshold is 1% = account freeze 90 days. MP is 0.9-1.0%. DR SaaS baseline chargeback rate 1.5-3.5% first 6 months.

**Proposed:** (a) Refund reserve: hold 15% of gross revenue for 60 days. (b) Refund SLA: 48h response, buyer-facing form on /app with clear steps. (c) Chargeback dispute template + evidence pack per finding. (d) Refund reason coding for post-mortem. (e) 3DS enforcement on Paddle for non-BR. (f) MP anti-fraud rules tuned to reject high-risk BINs. (g) Reclame Aqui + Trustpilot + G2 monitoring alert on every new post + 24h response SLA. (h) Post-refund NPS email: 'sorry we missed — what did we not find?' for feedback loop. (i) PROCON/BR CDC review of Pix monthly renewal disclosure + guarantee terms + refund policy — commissioned to BR consumer-protection attorney.

**Why:** The guarantee is the load-bearing DR trust asset — it works ONLY if operationally clean. One 'me prometeram devolver e não devolveram' Reclame Aqui post = 60-day CAC penalty across pt-BR. Two frozen payment accounts in first 90 days = zero payments = dead company. This is not marketing; it's the operational backbone that lets marketing work. No cluster raised in Round 1; Round 2 flagged multiple times.

**Effort:** M
**Impact:** critical
**Risk If Skipped:** Refund cascade in month 3-4. Payment account freeze. Reclame Aqui reputation death. All acquisition wins zeroed out.
**Owner Cluster:** growth-revenue (guarantee owner) + funnel-cro (form UI)

### 16. Baseline funnel analytics dashboard + A/B testing infrastructure BEFORE 40+ copy changes ship

**Current:** TrackingScript.tsx emits pageview/scroll/cta_click/time_on_page but no report surface. No variant assignment. No holdout groups. Between the 5 clusters there are 40+ concrete copy/pricing/CTA changes recommended — all would ship blind without baselines.

**Proposed:** (a) Ship a single dashboard showing conversion at every step (ad → LP → MiniCalc → /audit screen 1-3 → email → /audit/result → /auth/signup → /activate → payment) before any other copy work. 2-3 day project reusing TrackingScript event stream. (b) PostHog feature flags (free tier, 5-day setup) with client-side variant assignment on 6 highest-stakes surfaces: Hero CTA, MiniCalc CTA, guarantee copy, price display, activate paywall default cycle, checkout page. (c) Self-attribution dropdown on signup ('Como você conheceu a Vestigio?') — 6 options — to close the 15-30% attribution gap CAPI + Enhanced Conversions cannot recover.

**Why:** Every cluster is recommending directional edits without knowing which step is actually bleeding. Prioritized bets require data. Without step-by-step baselines the war-room is guessing which fix moves the number most. Also: shipping 40+ changes without A/B means one bad change tanks conversion 30% for a week undetected.

**Effort:** S
**Impact:** high
**Risk If Skipped:** 6 months of misprioritized ship-and-hope. Over-attribution of paid conversions to whichever pixel fired last. Over-investment in vanity channels.

**Owner Cluster:** funnel-cro (owns funnel + signup) with traffic-ads (owns pixel + attribution)


---

## ❗ Missing — create from zero — 14 items

### 1. '9 Vazamentos' PDF lead magnet in 4 locales — deployed as Meta Lead Ad NATIVE FORM (not just LP conversion) + exit-intent recovery on /audit + 4-email nurture sequence ending at /audit

**Why:** 70-85% of cold Meta/TikTok clicks won't complete even a 3-screen /audit form on session 1. Without a lighter email-only capture, those clicks are 100% lost — no email to nurture, no retargetable audience beyond generic pixel-visitors. PDF captures them → email nurture → /audit on visit 2. The critical unlock: Meta Lead Ads native form (pre-filled with FB profile email) converts 8-15% on cold IG/FB vs 1-3% LP-click conversion for same audience = 3-5x cheaper cost-per-email at the exact top of funnel where cost is highest. Turns retargetable pool from ~2% (audit completers) to ~40-60% (email captures). Same PDF fires as exit-intent popup on /audit for form abandoners. 4 locales × 12-page PDF (one leak per page: name + example screenshot + R$ typical impact + CTA to /audit). Directly reduces effective CAC across all four ad platforms. Math-critical for $500K at realistic 0.1-0.5% cold-conversion rates.

**Effort:** L
**Impact:** critical
**Owner Cluster:** lead-acquisition-social (creative + lead magnet) with traffic-ads (Meta Lead Ad campaign setup + audience configuration)

### 2. Native share buttons on /audit/result/[leadId] — WhatsApp / X / LinkedIn / Copy Link — pre-filled with top R$ finding, activates already-shipped dynamic OG image per leadId

**Why:** opengraph-image.tsx exists at /audit/result/[leadId] and serves dynamic 1200x630 PNG per leadId (domain + findings count + top-finding headline) cached at edge — verified in code. But audit/result/[leadId]/page.tsx (2,955 lines) has ZERO share/whatsapp/twitter/linkedin/clipboard tokens. The infra is deployed; only the UI trigger is missing. Buyer at emotional peak (just saw their own leaks with R$ numbers) is the only moment they'll share. Every share drops the /audit URL into another founder's WhatsApp group with a custom OG image showing THEIR peer's domain leaking money — cold traffic pre-warmed by peer testimony (not an ad). Estimated 3-5% paste rate without buttons vs 15-25% share rate with buttons = 4-5x growth-loop leak. 1.5-day build. Highest ROI-per-engineering-hour in the entire war room. WhatsApp specifically dominates pt-BR where near-term revenue concentrates.

**Effort:** S
**Impact:** critical
**Owner Cluster:** lead-acquisition-social (copy) + funnel-cro (button + mobile-first tap targets)

### 3. Meta Custom Audience + Lookalike infrastructure — 6 retargeting layers per platform + audience export cron

**Why:** Retargeting inventory is 3-5x cheaper than cold prospecting inventory. Without documented audience layers, ad ops burn budget on cold-CPM prices for warm-cold traffic. Ship immediately once pixel fires: (a) MiniCalc completers 14d/30d/90d, (b) /audit funnel abandoners per step (business_type/revenue/concern/current_method/why_now/email), (c) /pricing viewers 30d, (d) signup non-payers 30d, (e) VideoView 75% 30d, (f) engaged 365d. Lookalike seeds (once ≥100 paid customers): LAL 1% of paid customers by LTV tier, LAL 1% of Max-plan customers, LAL 1% of /audit completers who opened emails. Exclusions on every ad set: paying customers, refunded within 30d, employees. All 4 platforms need the same audience map. 3-5 days to build the audience-export cron + Meta/Google/TikTok audience feeds; ongoing once wired. Buyer identity resolution layer prerequisite (see improve_rework #1) — without it, audiences train on multi-counted leadIds and lookalike quality collapses.

**Effort:** M
**Impact:** high
**Owner Cluster:** traffic-ads

### 4. Google Search RSA campaigns in 4 locales targeting commercial-intent + brand terms

**Why:** Meta/TikTok = demand generation for low-awareness. Google Search catches the 5-15% who already Googled the problem — highest-CVR channel at lowest CAC when you win the keyword. One campaign per locale with tight themes: (a) Commercial intent — 'auditoria de conversão site preço', 'quanto meu site perde por mês', 'diagnóstico de site para vendas', 'website conversion audit tool' (KILL Traffic-ads' original 'porque meu site não vende' — 90% informational intent, tanks CVR). (b) Brand defense (Vestigio + typos + 'vestigio review'). (c) NO competitor conquest against Hotjar/Baymard/Contentsquare (killed — category-mismatch). RSA with 15 headlines + 4 descriptions each; sitelinks to /pricing, /vestigio-index, /audit, /lp/guarantee. Enhanced Conversions REQUIRED. 4-6 days for full setup across 4 locales.

**Effort:** M
**Impact:** high
**Owner Cluster:** traffic-ads

### 5. Ad video asset library — 5 concepts × 2 aspect ratios × 1 primary locale × 1 duration first (10 cuts in 3 days), scale winners after data

**Why:** Cannot buy DR video ad inventory at scale on Meta/TikTok without a rotating library — creative fatigue on single cut is 5-10 days at scale. But do NOT pre-produce 360 cuts (Traffic-ads' original was killed as fantasy timeline). Correct scope: 5 hooks (Ghost / Silent Tax / Founder / Guarantee / Category — per creative angles) × 2 aspect ratios (9:16 + 1:1) × 1 locale (pt-BR) × 1 duration (15s) = 10 cuts in 3 days. Founder or PMM talking-head + screen-capture of MiniCalc scanning. Burned-in captions (85% muted-autoplay). After 2-4 weeks of pt-BR data reveals winning angle, localize to en/es/de and expand aspect ratios to 16:9 (YouTube in-stream). Two variants per angle: 'aggressive' + 'compliant' (softens 'we find your money' to 'you see for yourself') to survive Meta Financial Services review.

**Effort:** M
**Impact:** critical
**Owner Cluster:** traffic-ads (production) + positioning (compliant variant copy)

### 6. Category-of-one FAQ battle cards vs 3 mental substitutes (Google Analytics / agency audit / Fiverr CRO freelancer)

**Why:** Low-awareness ICP has 3 mental defaults. Right now FAQ never says 'why not just use GA' — so buyer's silent objection ('I already pay for GA') is never answered, they close the tab. Explicit battlecards convert silent skepticism into decisions. 3 FAQ items: 'Já uso Google Analytics — por que preciso disso?', 'Contratei uma agência de CRO — qual a diferença?', 'Vi um freelancer no Fiverr por $50 fazendo isso — por que $99/mês?'. Answer each in 2 sentences: (a) what alternative gives you, (b) what it structurally can't give you that Vestigio does, (c) money impact of the gap. 3 hours copy × 4 locales.

**Effort:** S
**Impact:** medium
**Owner Cluster:** positioning

### 7. Sponsored newsletter placements (Paved / Refind / Reletter) as month-3+ warm-trust layer

**Why:** Newsletter sponsorships buy borrowed audience trust for SMB-owner ICP that skews older + less-TikTok-native than Meta/TikTok assumes. Target lists: Paved marketplace (SMB + ecom newsletters, filterable by size/CPM), Refind (developer/SMB blend), Reletter, Sponsorgap/Sponsorleads for adjacent-niche sponsor-accepting newsletters. Playbook: single sponsor slot per newsletter, custom LP per newsletter (utm_source + newsletter name in H1), Garantia in offer, MiniCalc as CTA payload. Budget $500-2000/placement, 8-12 tests in month 3-4, double down on ROAS >2. Prerequisite: pixels + LPs + email nurture must be live first (Traffic-ads sequencing objection). Do NOT queue parallel to pixel wiring.

**Effort:** M
**Impact:** medium
**Owner Cluster:** traffic-ads

### 8. Launch directory sprint — Phase 1 instant (SoloPush, ProductBurst, Uneed, MicroLaunch $39, Fazier $19+, TinyStartups, TinyLaunch $39), Phase 2 backlink (BetaList $129, Peerlist DR76, Awesome Indie, Startup Stash, Indie Hackers, Show HN), Phase 3 Product Hunt with 45-day warm-up

**Why:** $500-2000 total investment buys 12-20 'featured on' logos that ride on every LP forever, compressing cold CPA on Meta/TikTok by giving low-awareness buyers a trust signal that costs nothing per impression. Also seeds dofollow backlinks reducing paid-search dependency over 6 months. KILL Phase 3 AI-directory carve-out (TAAFT/TopAI/Toolify) — pigeonholes as 'ChatGPT wrapper for websites', destroys category. Independent of pixel wiring — starts today. Product Hunt launch = SavvyCal/Reform/TRMNL playbook, 6-8 weeks pre-launch coordination.

**Effort:** M
**Impact:** medium
**Owner Cluster:** traffic-ads

### 9. Weekly 'Vazamento da Semana' nurture — Beehiiv (all 4 locales) primary channel; WhatsApp Broadcast for pt-BR added month 3+ AFTER 200+ engaged opt-ins

**Why:** Low-awareness DR buyers who see an ad but aren't ready to buy need 4-8 touches over 30-60 days before conversion. Weekly nurture is the only compounding always-on touch that doesn't cost ad dollars. Content: pick 1 leak from that week's anonymized audits, 3 paragraphs, 1 CTA to run own audit. Sign-up gate on PDF lead magnet thank-you page + Vestigio Index essay footers + IG Broadcast Channel (free reach amplifier). 3 days Beehiiv setup + templates, 2 hours/week ongoing (recycles Vestigio Index content). WhatsApp Broadcast (killed as month-1 quick-win due to WhatsApp Business Platform compliance overhead — 2-3 weeks setup + template pre-approval + per-message cost) added ONLY after email base proves engagement, deliberate compliant rollout.

**Effort:** M
**Impact:** high
**Owner Cluster:** lead-acquisition-social

### 10. Vestigio Index publicly shipped as SEO + ad LP + Category-Creation angle destination

**Why:** Category-creation ad angle 5 needs a public benchmark page to point to. Also serves as Google Search sitelink asset AND ready-made ad LP for 'category' angle without message-mismatch penalty because the page IS the benchmark. Per user memory this is already scoped/WIP — traffic-ads is a downstream consumer, escalate priority. Also: content compounds monthly. Every essay ships with (a) 7-tweet X thread with hook + link to /audit in reply, (b) 8-slide LinkedIn carousel, (c) 6-slide IG carousel. Zero net writing cost via repurpose.

**Effort:** L
**Impact:** high
**Owner Cluster:** positioning (content) + traffic-ads (distribution)

### 11. ProductTour populated with real anonymized havefunnels Plano sections (per user memory project_product_tour_guided_plan_sections)

**Why:** For low-awareness DR buyer, seeing the actual deliverable (a real Plano page with real findings) is the single strongest 'what am I actually paying for' proof. Blocks conversion on hero traffic that won't run their own audit. User memory: consent granted for real havefunnels findings on public surfaces, zero identifiable info. ProductTour is the guided-step pattern (NOT a scrollable embed). Each step shows ONE real Plano section. Verify ProductTour renders with real content, not skeleton — no cluster confirmed the current state.

**Effort:** M
**Impact:** high
**Owner Cluster:** positioning (content) + funnel-cro (verify render)

### 12. Content-supply SOP for testimonials + UGC — automated day-14 request at peak-satisfaction moment

**Why:** Lorem-Ipsum testimonials aren't just a hygiene problem — they're a supply-chain problem. Without systematic request flow that fires at peak-satisfaction (day 14, before month-1 churn spike), scrambling for real quotes every new ad. At 500-1500 activations/mo target, should have 20-40 UGC quotes/mo — enough to A/B test testimonials in ads. Flow: T+14 post-payment automated email → 'Free 30-min call with founder in exchange for 2-min Loom' → transcript + Loom clip → converted to (a) home VideoTestimonials slot, (b) IG Reel, (c) X thread, (d) case-study PDF for LinkedIn. Zero cost, 3 days to build, compounds monthly.

**Effort:** S
**Impact:** medium
**Owner Cluster:** lead-acquisition-social (content) + funnel-cro (automated trigger email)

### 13. Live support channel at checkout + post-purchase — Crisp chat (or Intercom lite) on /activate + WhatsApp Business number in Footer

**Why:** DR checkout at emotional peak generates confusion-questions ('does this cancel automatically?', 'when do I get the Plano?', 'why CPF if I'm from Portugal?'). Without synchronous support at that moment, questions convert to abandonment. Post-purchase: same. Zero-cost minimum: WhatsApp Business number in Footer + on ActivatePaywall + in payment confirmation email, 4h SLA. BR buyers WILL WhatsApp support (default channel expectation). DE law requires Impressum with named natural person + 14-day cancellation right processed within 14 days — non-compliance = automatic Abmahnung.

**Effort:** S
**Impact:** high
**Owner Cluster:** funnel-cro

### 14. Anti-abuse / rate limiting on free /audit — Cloudflare Turnstile + per-IP/email rate limits + abuse-domain blacklist

**Why:** Free URL-input scanner + real crawl + LLM findings = $0.03-0.20/scan cost. At scale of paid traffic (10k audits/mo), even 5% bot/abuse = 500 wasted audits/mo. Competitors WILL scan competitors through Vestigio (real behavior in every free-scan tool). Abuse spikes can 10-20x baseline. Ship: Cloudflare Turnstile on domain-submit step, rate limits per IP/email (existing rateLimitByIp module supports), blacklist of known abuse domains + repeat-abuser email flags. Also protects against ad-account exhaustion by scraper traffic that fires pixel events without real intent.

**Effort:** S
**Impact:** medium
**Owner Cluster:** funnel-cro


---

## 🗺️ Sequenced Roadmap

### Phase 1 — Foundation & Credibility (survive the ad-review + credibility gate) · _Weeks 1-4_
**Expected impact:** Weeks 1-4 unlock the ability to spend at all (pixel + policy pre-flight), remove the 4 credibility bombs that would tank every acquired click, ship 30-50% AOV expansion on existing traffic (order bump + OTO + share tail), and cut form abandonment by 12-25% via 3-screen /audit. Ad account warm-up ceiling caps first-month spend at $10-30K regardless — so use Weeks 1-4 to BUILD infrastructure with controlled spend during Meta's 21-30 day warm-up window. Expected revenue Weeks 1-4: $15-40K (mostly organic + Google Search + warm Meta at capped spend + AOV lift on existing pipeline).

**Items:**
- WEEK 1 — Credibility bomb defusal (all shipping BEFORE any new ad flight): (a) delete '20.000 empresas' overclaim from ClientGallery (5-min dict × 4 locales), (b) rewrite pricing_section.plans[*] descriptions from Lorem Ipsum + SaaS-analytics feature bullets to leak-diagnosis outcome copy (verified rendering on /pricing + /activate), (c) canonicalize Garantia 4X to one clause with 30-day timeframe ('100% do dinheiro de volta em 30 dias se a Vestigio não apontar 4× o valor do plano em vazamento mensal') + position inline adjacent to every CTA + resolve 90-day EN contradiction, (d) delete dead testimonials/newsletter Lorem from JSON bundle (defense-in-depth), (e) tighten hero CTA to 'Ver meu vazamento em 60s — grátis' (locale-mapped), (f) rewrite MiniCalc CTA 'Receber meu Plano' → 'Ver quanto está vazando →' + add price microcopy 'R$99/mês · Garantia 4× em 30 dias'.- WEEK 1-2 — Ad infrastructure sprint (parallel to Week 1 credibility): (a) wire Meta Pixel + CAPI server-side with event_id dedup + Advanced Matching (hashed email + phone + IP + user_agent + fbc/fbp + external_id) targeting EMQ 8.0+, (b) provision main Meta BM + 2 backup BMs on separate business identities (pre-warm for ban insurance), (c) verify domain on Meta/Google/TikTok, (d) submit /termos + /politica-de-reembolso + /privacidade in 4 locales, (e) submit to Google Ads Financial Services vertical review, (f) evidence-log for any specific R$ number in creative.- WEEK 2 — Ship the AOV stack (no ad dependency): (a) order bump on /activate 'Entrega Prioritária — primeira edição em 48h — +R$147', (b) post-purchase OTO 60s interstitial before /app redirect (upgrade Max at discount), (c) native share buttons on /audit/result (WhatsApp / X / LinkedIn / Copy Link) with pre-filled top-R$-finding copy — activates already-deployed opengraph-image.tsx per-leadId, (d) baseline funnel analytics dashboard (2-3 days reusing TrackingScript stream) + PostHog feature flags on 6 highest-stakes surfaces + self-attribution dropdown on signup form.- WEEK 2-3 — Checkout structural fixes (activation-week sprint): (a) cut /audit form from 7-8 to 3 required screens + fire pixel events per abandoned step for retargeting, (b) progressive-profile widget on /audit/result for revenue/concern/current_method/why_now, (c) default paywall cycle to annually (ActivatePaywall.tsx line 73-75 2-line change), (d) native USD/EUR/MXN pricing per locale via getLocalCurrency() (kill hardcoded formatBRL), (e) Apple Pay + Google Pay wallet buttons above tabs, (f) BR 12x installment display, (g) hide CPF for non-BR, route non-BR to Paddle-only, (h) unify MiniCalc business_type list with /audit canonical 7-option set, (i) progress bar 'Passo 3 de 3: Ativar'.- WEEK 3-4 — Recovery + Lead capture (start): (a) abandoned-checkout 3-email drip (T+1h, T+24h, T+72h with 10% code) — complete MP checkout_started webhook parity with Paddle, (b) '9 Vazamentos' PDF lead magnet designed + copy'd in pt-BR (12 pages, one leak per page + example screenshot + R$ typical impact + CTA), (c) Google Ads RSA campaign for commercial-intent pt-BR terms ('auditoria de conversão site preço', 'quanto meu site perde por mês', 'diagnóstico de site para vendas' + brand defense), (d) Enhanced Conversions verified, (e) refund + chargeback ops SOP documented (15% revenue reserve, 48h refund SLA, chargeback dispute template, Reclame Aqui/Trustpilot monitoring alert), (f) BR consumer-protection attorney review of guarantee terms + Pix monthly disclosure + refund policy.- WEEK 4 — Ship German locale (unblock DACH): 287 __TODO__ resolved on conversion path (activate.plans.vestigio.name/price/features + /audit + /audit/result + /auth/signup + /app/library) with native DE copywriter, 'entgehen' idiom (not 'lecken'), DACH legal disclosure of 30-day guarantee alongside statutory 14-day withdrawal right, Impressum with named natural person + DE Widerrufsrecht response infrastructure.

### Phase 2 — Scale & Learn (turn on demand, iterate creative, unlock cross-border) · _Weeks 4-12_
**Expected impact:** Weeks 4-12 lift ad spend ceiling as Meta warm-up completes (~$50-150K/mo capacity by end of window), unlock 3 of 4 target locales via cross-border pricing + German paywall + Meta Lead Ads + PDF localization, cut effective CAC 30-50% via retargeting + email nurture + share tail, and ship the modal-overlay consolidation that kills the last major structural funnel break. Realistic revenue Weeks 4-12: $150-300K (majority window). Attribution honestly split: ~45% paid direct, ~25% Lead-Ad + nurture, ~15% viral share tail, ~15% AOV expansion + retargeting.

**Items:**
- WEEK 4-5 — Creative production sprint v1 (SCOPED, not 360 cuts): 5 hooks (Ghost / Silent Tax / Founder / Guarantee / Category) × 2 aspect ratios (9:16 + 1:1) × 1 locale (pt-BR) × 1 duration (15s) = 10 cuts in 3 days. Two variants per angle: 'aggressive' + 'compliant' for Meta Financial Services review resilience. Founder-face or PMM talking-head on the ad SURFACE (still no founder-face on the brand SITE per user memory). Burned-in captions for muted-autoplay.- WEEK 4-6 — LP proliferation phase 1: kill hero_lp on home (canonicalize hero_v2 for organic), ship 1 hardened /lp/ghost page for the primary ad angle with (a) message-matched headline, (b) MiniCalc as first interactive element, (c) price transparency above the fold, (d) single CTA, (e) Garantia badge in CTA cluster, (f) currency parity with the ad, (g) launch-directory 'Featured on' logos.- WEEK 5-6 — Meta Lead Ads unlock (the math-critical multi-touch layer): (a) '9 Vazamentos' PDF lead magnet localized to en/es/de (pt-BR shipped Phase 1), (b) Meta Lead Ad native-form campaigns in pt-BR + en (delivers PDF instantly, pre-fills with FB profile email — 8-15% cold conversion vs 1-3% LP-click), (c) exit-intent popup on /audit for form abandoners with PDF as consolation, (d) 4-email nurture sequence per locale ending at /audit.- WEEK 6-8 — Retargeting infrastructure: build 6 Meta Custom Audiences (MiniCalc completers 14/30/90d, /audit abandoners per step, /pricing viewers 30d, signup non-payers 30d, VideoView 75%, engaged 365d) + mirror on Google + TikTok. Exclusions on every ad set (paying customers, refunded 30d, employees). Audience-export cron. Buyer identity resolution layer (email hash as user_id after capture, deduped against past leadIds).- WEEK 6-10 — LP proliferation phase 2 + creative iteration v2: build /lp pages for the 2-3 angles that earn Meta learning-phase exit in Phase 2. Do NOT build all 5. Localize winning creative to en/es (de after DACH stabilizes). Google Search campaign en/es launched. TikTok Pixel + Events API wired (parallel to Meta scale — do not block Meta on TikTok).- WEEK 8-10 — Signup+activate consolidation: embed /activate paywall as modal overlay on /audit/result to kill MP path 3-page round-trip. Magic-link auth + MP Payment Brick embedded + Paddle inline reconfig + provisioning-on-payment webhook + close-modal fallback. 3-4 week engineering scope. Ships now (not Phase 1) because pixels + LPs + AOV stack have higher $/eng-week ROI first.- WEEK 8-12 — Product Tour populated with real anonymized havefunnels content (per user memory project_product_tour_guided_plan_sections — each step shows ONE real Plano section) + Vestigio Index public launch or acceleration (if not already live) as SEO + ad LP + Category-Creation angle destination.- WEEK 10-12 — Content-supply SOP + testimonial pipeline: T+14 post-payment automated request for 30-min founder call in exchange for 2-min Loom → converts to VideoTestimonials + IG Reel + X thread + LinkedIn case-study. Replace generic VideoTestimonials rotation with real named-human quotes. FAQ battle-cards vs Google Analytics / agency audit / Fiverr CRO freelancer. Launch directory sprint Phase 1 (SoloPush, ProductBurst, Uneed, MicroLaunch, Fazier, TinyStartups) — 12-20 'Featured on' logos to ride on every LP.- WEEK 10-12 — Live support channel: WhatsApp Business number in Footer + on ActivatePaywall + in payment-confirmation email, 4h SLA. Crisp chat on /activate. DE Impressum + Widerrufsrecht response infrastructure verified operational.

### Phase 3 — Compound & Defend (flywheel, defensibility, own the category) · _Weeks 12-24_
**Expected impact:** Weeks 12-24 build the flywheel that makes month 5-6 revenue compound instead of linear. Newsletter + share tail + X + retargeting reduce effective CAC 40-60% below Phase 2 baseline. Cross-locale content unlocks en/es/de organic traction (previously paid-only). Fulfilment scale-up prevents the month 3-4 refund-cascade risk. Realistic revenue Weeks 12-24: $180-320K on flywheel-compounded acquisition + retention. Total 6-month revenue target: $500K achievable if Phase 1 + 2 execution held to plan AND fulfilment SLA enforced. If Phase 3 fulfilment work slips, refunds cap total at $250-350K regardless of acquisition wins.

**Items:**
- WEEK 12-16 — Owned-channel flywheel: (a) launch weekly 'Vazamento da Semana' Beehiiv newsletter in all 4 locales (2h/week ongoing, recycles Vestigio Index content), (b) Instagram Broadcast Channel + X free subscribers as free amplifiers, (c) WhatsApp Broadcast for pt-BR ONLY after Beehiiv proves 200+ engaged opt-ins (compliant WhatsApp Business Platform setup, template pre-approval, opt-in consent flow — 2-3 weeks setup done deliberately, not as quick-win).- WEEK 12-18 — Launch directory Phase 2 (BetaList, Peerlist DR76, Awesome Indie, Startup Stash, Indie Hackers launch post, Show HN) — DR/SEO backlink layer for organic cross-locale. Phase 3 Product Hunt launch with 45-day warm-up (SavvyCal/Reform/TRMNL playbook aiming for #1 Product of the Day). NO AI-directory listings (killed as category-poison).- WEEK 12-20 — X account activation as ICP-hunting: 5 threads from Vestigio Index essays + 10 atomic tweets (one-liner leaks with $ impact) + reply-hooks to founder accounts (2-10x our size). Ongoing 3 threads/week fed by newsletter/Vestigio Index. Every thread ends with 'Rodar o seu diagnóstico → vestigio.io/audit' in the FIRST REPLY (X penalizes body links). Assistant-owned after Week 16 (founder-time cost too high to sustain solo).- WEEK 14-20 — Sponsored newsletter placements (Paved / Refind / Reletter) $500-2K/placement, 8-12 tests then double-down on ROAS >2. Custom LP per newsletter (utm_source + newsletter name in H1). Sequenced deliberately AFTER pixels + LPs + creative winners emerge — Traffic-ads' sequencing objection.- WEEK 16-22 — Fulfilment scale-up: day-1 preview Plano LLM synthesis pipeline hardened + full analyst-reviewed Plano SLA ≤ 14 days from payment enforced + 2-3 analyst hires or contractor pool with quality gate for scaling beyond founder-only. This is the existential risk mitigation — every acquisition win is downstream of delivery reliability.- WEEK 18-24 — Cross-locale content compounding: Vestigio Index essays in all 4 locales (not just pt-BR), en/es/de essays get own X thread + LinkedIn carousel + IG carousel companions. LinkedIn Company Page activated for B2B verticals (SaaS + services + agencies + enterprise) with Lead Gen Forms unlocking native form conversion.- WEEK 20-24 — Advanced attribution + optimization: GA4 data-driven attribution model + Segment/Rudderstack forwarding for multi-touch buyer (Meta claims credit for email-nurtured, Google claims credit for brand search — without server-side attribution, wrong channels get cut). PostHog experiment library — 6+ concurrent A/B tests on Hero, CTA, guarantee, price display, wallet button order, share prompt copy.

---

## 🎯 Ads → Landing → Funnel → Checkout Walkthrough

### Ad creative angles

**1. GHOST (loss-frame + curiosity)**

- **Hook:** Video 9:16, 15s. 0-3s: red numbers ticking on a real-looking site screenshot (owner's POV). Voiceover / burned caption: 'Todos os dias, 9 coisas no seu site roubam pedidos em silêncio. Você nunca viu nenhuma delas.' 3-8s: URL paste demo (screen capture of MiniCalc scanning). 8-15s: reveal '9 vazamentos · R$ exato · 60 segundos' + Garantia 4X badge + CTA 'Ver meu vazamento em 60s — grátis'. Locale variants: EN 'Every day, 9 things on your site quietly steal orders. You've never seen any of them.' ES 'Cada día, 9 cosas en tu sitio se roban pedidos en silencio.' DE 'Jeden Tag entgehen Ihrem Shop 9 stille Umsatzlecks.'
- **Why it works (low-awareness):** Curiosity + loss frame + specific number ('9') creates a mental itch the buyer must scratch. Number is verifiable in 60s on their own site, so the claim is falsifiable in-session (not vaporware). Zero product jargon — buyer never needs to know the category exists to want the answer.

**2. SILENT TAX (specific-money proof)**

- **Hook:** Video 9:16, 15s. Split screen: left = owner-at-laptop UGC-style (stock or founder), right = animated dashboard revealing 'Este site perde R$ 8.412/mês. O dono não sabe.' Voiceover 'Este site aqui está perdendo R$ 8.412 por mês. O dono não faz ideia. A gente roda o mesmo scan no seu, grátis.' CTA card 'Ver quanto o seu perde (60s, grátis)'. NOTE: R$ number must be projected impact from the calc engine per-domain, honestly labeled 'estimativa' — not an aggregate 'média recuperada' claim (which is unsubstantiated at N=1 customer and invites Reclame Aqui).
- **Why it works (low-awareness):** Concrete R$ number is the emotional anchor — 'this owner is like me and doesn't know'. Loss is happening to a peer, buyer projects onto themselves. Ad-to-LP message match on the number (MiniCalc will produce the buyer's own R$ estimate in seconds).

**3. FOUNDER TALKING HEAD (60-second audit)**

- **Hook:** Video 9:16, 30s. Founder or PMM on camera, low-fi UGC energy, no music: '60 segundos. Cola a URL do teu site. Eu te mostro exatamente onde ele está vendo dinheiro. Cada vazamento com o valor em R$. Sem cadastro pra ver.' NO founder-face on the site itself (per user memory ship_a_scope_locked: quiet drift, brand-only) — but talking-head ads are ok because the ad surface is different from the brand surface and can carry personality without violating home-brand hygiene. If founder-face is off-limits, use PMM/analyst as the on-screen persona with a job-title byline, not a name.
- **Why it works (low-awareness):** Human face + zero-friction demo = 3-5x lift over graphics-only on Meta and TikTok muted-scroll. Real-person speaker collapses the 'is this a chatgpt wrapper' filter that AI-directory-tier tools trigger. Burned captions for 85% muted-autoplay segment.

**4. GUARANTEE REVERSAL (risk-transfer)**

- **Hook:** Static + 15s video. Copy: '100% do dinheiro de volta em 30 dias se a gente não achar 4× o que você paga em vazamento mensal. Sem pergunta.' Video variant shows the guarantee as a graphic overlaid on a real Plano page (redacted) with the R$ recovered number highlighted. CTA 'Ver os 9 vazamentos — grátis, garantia 100%'. Compliant variant swaps 'we find' for 'you can see for yourself' framing to reduce Meta ad-review flag rate.
- **Why it works (low-awareness):** Risk transfer is the single strongest DR objection killer at low awareness. '100% back' is binary and instantly parseable (unlike '4X' as a lead). Buyer computes: 'if it works I save money; if it doesn't I lose nothing' — the whole decision collapses to click. Ship one 'aggressive' variant + one 'compliant' variant per campaign to survive Meta Financial Services review flag.

**5. CATEGORY-CREATION (own the frame)**

- **Hook:** Video 9:16, 30s or Reel-style carousel. Copy: 'Você paga R$ 3k/mês pra rastrear anúncios. Você paga R$ 500/mês pra rastrear vendas. Você paga R$ 200/mês pra rastrear tráfego. Ninguém rastreia onde o dinheiro some ENTRE ELES. É lá que 63% morre.' CTA 'Ver o vazamento no seu site em 60s'. Points at Vestigio Index public benchmark as sitelink for Google Search + retargeting fallback LP.
- **Why it works (low-awareness):** Names the category-shaped hole in the buyer's mental map. Anchors Vestigio as 'diagnóstico mensal de vazamento de receita' — not a competitor to Hotjar/GA/Clarity, but a NEW line item. Category naming = pricing floor. Every buyer who consumes this ad exits with a phrase they can Google 24h later.

### Landing — first screen

Two paths — organic home vs paid /lp: (A) HOME (/ or /pt-BR, hero_v2 statement-of-fact) stays as canonical brand surface for referral/SEO/branded traffic. Headline 'Tem dinheiro vazando na sua operação. A Vestigio sabe onde e quanto.' Subtitle patched to 'Mostramos onde o dinheiro escapa, quanto, e como parar.' (kill passive 'o que você faz pra parar'). Category-noun eyebrow ABOVE H1: 'Diagnóstico mensal de vazamento de receita'. SINGLE primary CTA 'Ver meu vazamento em 60s — grátis' + text-link secondary 'Ver como funciona' (scroll-anchor to ProductTour, no second button). Price microcopy immediately below CTA: 'A partir de R$99/mês · Garantia 4× em 30 dias · Funciona com qualquer plataforma'. (B) PAID LPs (/lp/[angle], one per creative angle above) use hero_lp question hook variant 'Quanto dinheiro está vazando da sua operação sem você perceber?' + 'Digite seu domínio. Descubra em 60 segundos quanto VOCÊ perde.' MiniCalc as FIRST interactive element (URL input) above the fold. Currency parity with the ad: pt-BR shows R$99, en shows $19-19/mo equivalent, es shows $19 or MXN, de shows €19. Garantia 4X badge in the CTA cluster. No ClientGallery on ad LPs until real named logos exist (replace with launch-directory 'Featured on' logos as Phase 2 lands). Ship 1 LP hardened first (Ghost angle), iterate to 5 as ad data emerges — do NOT pre-build 5 LPs × 4 locales upfront (Traffic-ads was overruled on this by every other cluster).

### Offer construction

Pricing display: Starter R$99/mês visible as decoy anchor (Growth-revenue's 'kill Starter' was overruled — Starter creates the decoy that makes Pro feel reasonable), Pro R$199/mês FLAGGED 'Mais escolhido' + annual 'R$16/mês (cobrado R$1.910/ano — economize 20%)' as SECONDARY frame not primary (BR consumer-protection norms require transparent lump display), Max R$399/mês. Default paywall cycle = ANNUALLY (change ActivatePaywall.tsx line 73-75). Guarantee ONE canonical clause everywhere, position adjacent to every buy button (not sidebar): 'Garantia: 100% do dinheiro de volta em 30 dias se a Vestigio não apontar 4× o valor do plano em vazamento mensal.' Kill '4X' as lead (it's proof point, not hook). Order bump at /activate: ONE checkbox 'Adicionar Entrega Prioritária — primeira edição em 48h em vez de 30 dias — +R$147' (Priority Delivery replaces the earlier 'Emergency Call' idea and the killed 'Competitor Comparison' — on-thesis, near-zero delivery cost, reinforces the promise). Post-purchase OTO 60s interstitial before /app redirect: 'Você comprou Pro. Nas próximas 24h, upgrade pra Max por +R$99/mês (economia de R$100/mês vs preço cheio).' Skip the free trial + $1 tripwire ideas entirely (killed by every critic as chargeback bomb + dark-pattern that Meta/PROCON will punish).

### Checkout flow

1. /audit form CUT to 3 required screens: (a) domain, (b) business_type auto-advance with sub-vertical inline, (c) email → fires audit. Revenue/concern/current_method/why_now move to progressive-profile 'refine my findings' widget on /audit/result AFTER buyer sees results. Fire pixel events per abandoned step (business_type_selected, email_provided, etc.) so retargeting audiences still exist for the reduced surface — Traffic-ads' concern reconciled with Funnel-CRO's cut. 2. /audit/result auto-reveal KEPT-AS-CLICK-GATE (Funnel-CRO's auto-reveal was overruled — the click IS the anxiety-to-relief conversion peak the guarantee is calibrated around). Findings show R$ per finding + 4 native share buttons (WhatsApp / X / LinkedIn / Copy Link) with pre-filled copy naming the top finding — activates the already-shipped opengraph-image.tsx per-leadId OG image. Plan-picker inline on result page defaults to Pro-annual so /activate arrives with plan+cycle pre-selected. 3. Signup+activate consolidation: keep the 3-page round-trip (MP path: /audit/result → /auth/signup → /activate) for month 1-2 to unblock other higher-ROI work, refactor to modal-overlay on /audit/result in month 3-4 (Funnel-CRO's proposal was correct but 3-4 weeks eng work, deprioritized behind pixels/LPs/AOV). 4. /activate paywall: default cycle = annually, Apple Pay + Google Pay wallet buttons ABOVE tabs, then Pix + Card. BR: 12x installment display ('12x R$16 sem juros'). Non-BR: hide CPF field entirely, route to Paddle only, render USD/EUR/MXN via getLocalCurrency(locale) mapping (fix ActivatePaywall.tsx line 41-48 hardcoded formatBRL). Guarantee badge INLINE below Pay button (duplicate from sidebar). Order bump checkbox between order summary and Pay. Progress bar labeled 'Passo 3 de 3: Ativar' (three segments filled) not 'Passo 2 de 2'. Self-attribution dropdown on signup form ('Como você conheceu a Vestigio?') — 6 options — to close the CAPI attribution gap. 5. Pix polling every 4s stays (Funnel-CRO verified this is load-bearing for BR conversion). Pix monthly renewal warning as CHIP under 'Gerar Pix' button (not sidebar) with one-click switch to annual (kills involuntary churn from manual monthly Pix).

### Post-purchase (immediate)

Payment confirmed → 60-second OTO interstitial (upgrade to Max at discounted rate) → decline/timeout → /app/library/strategy/current. On /app landing: (a) 'Sua primeira edição chega em [SLA]' displayed prominently — SLA must be ≤ 14 days to sit inside the 30-day guarantee window with margin (the fulfilment-throughput risk everyone missed — must be enforced via engine/AI pipeline, not manual founder-write, or refund rate wipes ad spend by month 3). Day-1 preview Plano auto-generated from the free audit + LLM synthesis as bridge deliverable (buyer sees SOMETHING within 24h even if full analyst-reviewed Plano ships day 14). (b) Automated triggers: T+24h 'ROI receipt' email ('Sua edição preview já achou R$X. Confirmando análise completa em N dias.'). T+7 support-check WhatsApp/email ('Recebeu tudo?'). T+14 first full Plano delivery + NPS. T+21 upsell nudge (5-day window before guarantee closes so buyer has time to see value). T+25 preemptive 'Do you want to renew?' if annual → converts guarantee-anxiety into commitment. T+30 UGC/testimonial request at peak-satisfaction moment ('30-min call with founder in exchange for 2-min Loom video') → feeds VideoTestimonials + IG Reels + LinkedIn case-study pipeline. Refund SOP: 48h SLA on request response, 15% gross-revenue reserved for 60 days, chargeback dispute template ready, refund reason coding for post-mortem. Reclame Aqui + Trustpilot monitoring alert on every new post.

---

## ⚖️ Resolved Contradictions (10)

_Places where the clusters disagreed in Round 2. The integrator picked a winner._

**Reasoning:** Explicit user memory feedback_hero_cta_free_action_beats_preview is a founder-locked prior decision. Tripwires work for SOLUTION-AWARE buyers (Kern/Belcher canon); Vestigio ICP is LOW awareness per brief. Also breaks ad-to-LP message match (every planned Meta creative promises free scan; $1 wall on landing tanks Meta LP Quality Score). Also destroys the credibility mechanic the 4X guarantee depends on — buyer only believes 'we find $X or refund' after seeing the tool find something free on their own domain. Free scan IS the awareness-building wedge; monetizing it destroys top of funnel. Four clusters + user memory overrule Growth-revenue.

**Resolution:** Keep the free-action CTA framing. Tighten to outcome-first + timebox: 'Ver meu vazamento em 60s — grátis' (with locale variants). Kill Growth-revenue's tripwire replacement.

**disagreement:** Hero primary CTA framing. Growth-revenue proposed KILLING the free diagnostic and moving to a paid R$1 or R$47 tripwire ('Ver o vazamento por R$1' / 'Ver os 9 vazamentos + Plano completo — R$47'). Traffic-ads, Funnel-CRO, Positioning, and Lead-acquisition all keep the free scan.

**Reasoning:** Statement hooks convert warm/organic (buyer already believes source); question hooks convert cold-paid low-awareness (interruption + self-referential processing forces mental answer). Same page serving both audiences underperforms both. Cost of maintaining two variants is trivial (one dict block); cost of losing paid CVR is catastrophic ($2-8/click). Positioning's localization-debt argument is real but secondary to conversion cost. Reconciled: hero_v2 home, hero_lp paid LP.

**Resolution:** Route by surface. hero_v2 canonical on home / organic / branded / SEO traffic. hero_lp question-hook variants on dedicated /lp/[angle] paid-ad LPs. Ship both; kill neither.

**disagreement:** hero_v2 (statement) vs hero_lp (question). Positioning wanted to kill hero_lp entirely and canonicalize on hero_v2 across home + LPs. Traffic-ads wanted to preserve hero_lp question hook for paid-traffic LPs.

**Reasoning:** Brief mis-flagged which Lorem was live. Growth-revenue caught it. Testimonials/newsletter Lorem is dead code but ships in JSON bundle — small ad-review risk + git-hazard. Pricing_section Lorem is the LIVE money-page killer that renders on every /pricing pageview and every /activate paywall. Also: SaaS-analytics feature bullets position Vestigio AS Google Analytics, killing the entire category wedge Positioning is building. Multi-cluster convergence on the fix priority.

**Resolution:** Fix pricing_section.plans[*] TODAY as blocker (rewrite descriptions to leak-diagnosis outcome copy, replace 'visitas rastreadas'/'membros da equipe' with revenue-leak bullets). Delete testimonials_section + newsletter_section Lorem as hygiene cleanup (defense-in-depth against JSON-bundle crawl + accidental re-enablement).

**disagreement:** Which Lorem Ipsum is the fire. Lead-acquisition treated homepage.testimonials_section + newsletter_section as CRÍTICOS. Traffic-ads/Positioning/Funnel-CRO verified via code that Home/index.tsx doesn't import Testimonials or Newsletter — dead JSON. Growth-revenue caught the ACTUAL live problem: pricing_section.plans[0] with Lorem descriptions AND wrong SaaS-analytics feature bullets that IS rendered on /pricing and /activate via pricingData.ts.

**Reasoning:** Growth-revenue's +R$200 bonus creates unbounded liability at scale (25 refunds/mo × R$200 = R$5K/mo cash-out with no ceiling and no eligibility filter), invites coordinated bad-faith arbitrage (20-buyer squad extracts R$4K in penalties for R$2K net profit), triggers Wanamaker 'too-good = scam' filter in low-awareness pt-BR. Public last-refund-date is scarcity-tell that goes wrong fast (one bad month resets it, every LP visitor sees 'Last refund: 3 days ago'). Canonical clause + explicit 30-day (kills shipped 90-day EN variant) + inline placement adjacent to every CTA (not sidebar) is enforceable, consistent across 4 locales, and defensible in PROCON/Reclame Aqui dispute. Growth-revenue self-corrected in Round 2.

**Resolution:** Ship Positioning's canonical structure with Traffic-ads' word order: 'Garantia: 100% do dinheiro de volta em 30 dias se a Vestigio não apontar 4× o valor do plano em vazamento mensal.' Two-word badge variant near every buy button: '4× ou 100% de volta'. Kill Growth-revenue's +R$200 bonus mechanic and public last-refund badge.

**disagreement:** Guarantee wording. Growth-revenue: self-punishing 'R$800 or return R$1.910 + R$200 from our pocket' with public last-refund-date badge. Positioning: canonical single clause '100% back in 30 days if Vestigio does not identify 4× the plan value'. Traffic-ads: lead with '100% back' as hook, 4X as proof point.

**Reasoning:** Killing Starter removes the R$99 anchor that makes Pro R$199 read as 'sensible middle' — the decoy math Growth-revenue itself praises in 'perfect' section. Collapses three-tier decoy to two-tier and pushes AOV expectation UP visually at the moment low-awareness buyer is deciding to trust brand. Also premature optimization removing a tier with unknown-but-possibly-positive LTV at current data volume. Growth-revenue's specific math (monthly-Starter is CAC-negative at $30-50 CAC) is CORRECT in the abstract but needs 90 days paid data before killing the tier. Correct edit: default to annual on Pro/Max, hide Starter monthly cycle behind text link, revisit after data. Two clusters overruled Growth-revenue.

**Resolution:** Keep Starter VISIBLE as decoy anchor. Kill only monthly-Starter path via demotion (visible via text-link after scroll, not primary toggle). Adopt Growth-revenue's default-cycle-annual on Pro and Max.

**disagreement:** Starter tier fate. Growth-revenue wanted to KILL Starter as public entry (backend-only for downsell), collapse to Diagnóstico R$47 tripwire + Pro-annual + Max-annual. Every other cluster assumed 3-tier shape stays.

**Reasoning:** Each screen after 2 is 5-15% abandon on cold paid traffic — compounding 25-50% loss between screens 2-7. Traffic-ads' audience-per-step assumes buyers REACH the screen; a screen with 60% drop-off is a tiny audience. Fix the funnel first, keep the pixel events wired for the reduced surface, get both. Progressive profiling proven better (buyer committed via findings-shown will answer for MORE detail). Backend already tolerates missing fields via DEFAULT_* fallbacks.

**Resolution:** Cut to 3 required screens (Funnel-CRO wins on throughput) BUT fire pixel events per abandoned step (business_type_selected, revenue_selected, why_now_selected, email_provided) so retargeting audiences still exist for the reduced surface. Move revenue/concern/current_method/why_now to progressive-profile widget on /audit/result AFTER buyer sees findings.

**disagreement:** /audit form length. Funnel-CRO wanted to cut from 7-8 screens to 3 (domain → business_type → email). Traffic-ads treated the 7-screen /audit as the retargeting-audience-per-step machine (audiences keyed to business_type, revenue, concern, current_method, why_now abandoners).

**Reasoning:** 5 LPs × 4 locales = 20 pages of localized surface with no data on which angle wins. Correct sequence: pixels → single strong LP → test 2 creative angles → build second LP for angle showing Meta learning-phase exit → expand. Traffic-ads is right that message-match matters for Quality Score; wrong that you build all 5 upfront (pre-mature optimization trap that kills DR startups before finding winning angle). Ship 1 LP hardened, iterate. Multi-cluster reconciliation.

**Resolution:** Sequence: Week 1-2 kill hero_lp on home (canonicalize hero_v2 for organic), Week 3-4 ship 1 hardened /lp page for the primary ad angle, Week 5-8 iterate to 3-5 LPs as ad data reveals which angles earn traffic. Do NOT pre-build 5 LPs × 4 locales upfront.

**disagreement:** Timing on ad-LP proliferation. Traffic-ads wanted 5 dedicated /lp/[angle] pages BEFORE running ad spend. Funnel-CRO proposed VSL landing. Positioning wanted to consolidate to a single hero.

**Reasoning:** The 3-page round-trip IS a 20-30% drop-off at intent peak. Paddle already opens as overlay in-place — MP parity is the ask. But realistic scope is 3-4 weeks not 1-2 as Funnel-CRO framed. Higher-ROI-per-eng-week work (pixels, order bump, abandoned-cart) ships first. Then this becomes the biggest structural friction remaining, ship in Phase 2.

**Resolution:** Ship the modal-overlay consolidation in Phase 2 (weeks 8-12), AFTER pixels + LPs + AOV stack + abandoned-cart drip land. Do NOT block Phase 1 work on this — 3-4 weeks eng scope (magic-link auth + MP Payment Brick embedded + Paddle inline reconfig + provisioning-on-payment webhook + session bootstrap + close-modal fallback).

**disagreement:** Signup + activate consolidation. Funnel-CRO wanted to embed /activate paywall INSIDE /audit/result as modal overlay to kill 3-page round-trip. Every other cluster assumed the current round-trip stays.

**Reasoning:** Empty profile with 0 posts fires the 'ad-farm signal' filter it was supposed to solve (Lead-acq self-corrected in Round 2). But 5 channels × 4 locales × 12-post backlog = 240 pieces before ads launch = 4-8 weeks of PMM role that doesn't exist. Violates user memory feedback_marketing_premature_pre_pmf. Minimum viable trust footprint = handles + 3 pinned real posts + logo + bio (1 week of work). Backlog fills in flight. Threshold set by evidence (empty profile bad; 3-post active better; 12-post overkill pre-PMF).

**Resolution:** Ship handles (@vestigio.io IG/TikTok, /company/vestigio-io LinkedIn, /@vestigio-io YouTube) + 3 pinned real posts + bio + logo + link BEFORE first ad flight in each locale. Kill the 12-post backlog + 3-per-week cadence.

**disagreement:** Social presence threshold before ad launch. Lead-acquisition proposed '12-post backlog per surface + 3 posts/week' before any ad flight. Positioning treated as downstream defensive concern.

**Reasoning:** Vestigio's whole promise is 'we tell you where YOUR money is leaking' — competitor-comparison OTO redirects buyer attention outward, off-thesis. Delivery would require manual analyst hours (doesn't scale) or public Vestigio Index maturity (WIP). Priority Delivery is on-thesis, near-zero delivery cost (queue prioritization config flag), reinforces core promise. Lead-acq caught the framing issue; Funnel-CRO's mechanic (OTO at peak trust is high-EPC) preserved with better content.

**Resolution:** Replace with 'Priority Delivery — first Plano in 48h instead of 30 days — +R$147' as both the order bump AND as one option for post-purchase OTO (with 'Upgrade to Max discounted for 24h' as the primary OTO variant).

**disagreement:** Post-purchase OTO offer choice. Funnel-CRO proposed 'Comparação Concorrentes' at R$147. Lead-acquisition + Positioning flagged as off-thesis.


---

## ❌ Killed Ideas (20)

_Recommendations that surfaced but were killed in adversarial review — do NOT ship._

### 1. Kill the free diagnostic; replace hero CTA with R$1 or R$47 paid tripwire (Growth-revenue improve_rework #5 + Growth-revenue polish #4)

**Why Killed:** Direct violation of founder-locked user memory feedback_hero_cta_free_action_beats_preview ('keep Rodar diagnóstico gratuito framing; don't swap to passive-preview CTAs'). Tripwires work for SOLUTION-AWARE buyers (Kern/Belcher playbook); brief anchors Vestigio ICP at LOW awareness — 'nunca ouviu falar de revenue leak diagnostics'. Asking cold buyer for R$1/R$47 to prove they might have a problem they don't know they have selects a near-empty intersection. Also breaks ad-to-LP message match at scale (every Meta/TikTok creative promises a free 60s scan) — a $1 wall on landing tanks Meta LP Quality Score. And the free scan IS the credibility mechanism the 4X guarantee depends on: buyer only believes 'we find R$X or refund' AFTER they see the tool find something free on their own domain. Killed by 4 clusters + user memory.


### 2. R$1/$1 first-charge 14-day trial for Pro-annual with auto-renewal to R$1.910/yr on day 15 (Growth-revenue improve_rework #4)

**Why Killed:** Chargeback bomb + dark-pattern subscription trap. BR consumer protection (CDC Art. 49) gives 7-day full unwind on top of MP/Paddle chargeback rules. Meta AND Google ban 'negative option billing' without prominent disclosure and both suspend advertiser accounts generating chargebacks >1%. Chargeback rate on $1-trial-to-annual products in DR is 5-12% not 0%, and >1% triggers Paddle account freeze. Also inserts a card-capture step BEFORE the free value is delivered — inverts the demonstrated funnel logic (free MiniCalc → free /audit → SEE findings → THEN pay). Vestigio has free value upstream; the trial pattern that lifts 3-5x in Kern/Deiss playbooks assumes NO free value path exists — false here. Killed by 3 clusters.


### 3. Lifetime Deal (LTD) SKU at R$4.997/$997 as pricing anchor + quarterly cash-injection lever (Growth-revenue missing #5)

**Why Killed:** Vestigio's core product is a MONTHLY editorial deliverable. LTD promises delivery in perpetuity of a manually produced artifact = scaling nightmare or bait-and-switch. LTD-marketplace buyers (AppSumo pattern) are exactly the wrong ICP — deal-hunters, one-and-done, opposite of the recurring-value operator Vestigio targets. LTD flare directly undoes Positioning's category-of-one 'monthly editorial revenue-leak diagnostics' work — signals AppSumo-tier commodity. Legal fragility on 'lifetime' terms for a SaaS-shaped product with rising infra cost. Growth-revenue's own reasoning contradicted itself (deal-hunter LTD flare cannot coexist with 'monthly editorial thesis' positioning). Killed by every critic + Growth-revenue self-corrected.


### 4. Self-punishing guarantee '+R$200/+R$500 from our pocket' with public 'Last refund date' badge (Growth-revenue improve_rework #6)

**Why Killed:** Three operational bombs: (1) requires Vestigio to defend what counts as a 'leak' when a buyer disputes — Reclame Aqui bait; (2) '+R$200 from our pocket' invites coordinated bad-faith arbitrage (20-buyer squad extracts R$4K in penalties for cost of 20 R$99 tokens); (3) cross-locale mismatch (does EN buyer get $200? EUR €200?). Public 'Last refund date' badge is scarcity-tell that goes wrong fast — one bad month resets it and now every LP visitor sees 'Last refund: 3 days ago'. Wanamaker paradox: 'why would they PROMISE to pay me extra if they fail? algo tá errado' fires hard in low-awareness pt-BR. Canonical percentage-based clause is enforceable, consistent, and legally defensible. Killed by every critic + Growth-revenue self-corrected.


### 5. Add 'For / Not For' disqualification section ('Not for sites under R$5k/mês em faturamento') (Positioning missing #2)

**Why Killed:** Works on high-awareness B2B enterprise SaaS (Linear, Okara pattern) where too-small buyers destroy CS. Fails on low-awareness self-serve DR where sub-R$5k/mês IS the highest-volume segment and marginal CS cost is near zero. Buyer doesn't know their own faturamento off the top of their head. Publicly disqualifying cuts TAM at the exact goal that requires maximum eligible reach. Killed by 2 clusters.


### 6. Countdown / scarcity element at checkout ('Preço atual válido por 24h') (Funnel-CRO missing #6)

**Why Killed:** Fake urgency destroys editorial credibility for low-awareness buyers who Google 'vestigio scam' before paying. Countdown timer is the #1 visual pattern on the fake-urgency scam LPs their spam filter is trained on. Even if you 'actually rotate' the price monthly, visual language reads as SLS-affiliate-marketer, not editorial-monthly-diagnostic. Positioning's category-of-one wedge (Tese do mês + monthly editorial) is commoditized back into freebie-hunter category we spend money to escape. Killed by 3 clusters.


### 7. Auto-reveal findings on audit_complete (kill click-gate on /audit/result) (Funnel-CRO improve_rework #6)

**Why Killed:** The click IS the anxiety-to-relief conversion peak the guarantee is calibrated around. Removing it converts high-emotion 'I want to see this' active reveal into passive scroll onto numbers the buyer never chose to see. Violates user memory anxiety=conversion-driver. Also breaks mobile-return pattern (buyer tabs away during 60s scan, returns to a button, taps once, gets dopamine peak — auto-reveal punishes tab-switchers). Killed by Positioning + Traffic-ads.


### 8. Named provenance next to Tese do mês using founder name OR 'ex-Nubank, ex-Shopify, ex-Stripe' team pedigree (Positioning missing #4)

**Why Killed:** Founder-face on the site is a locked NO per user memory project_ship_a_scope_locked ('quiet drift, brand-only, no Luis Gall'). Team pedigree list is fabricated-credential territory unless verifiable — one skeptical operator DM'ing 'who on your team was at Stripe?' with no answer destroys the credibility gain 100x over. If real pedigree exists and is publishable, ship a real About page. Do not invent. Killed by Traffic-ads.


### 9. 'Ver um Plano real' hero secondary CTA linking to redacted havefunnels example (Positioning good_polish)

**Why Killed:** User memory project_havefunnels_redacted_plan_consent explicitly requires 'zero identifiable info, no mention of havefunnels anywhere on public surfaces'. Public 'Ver um Plano real' link requires an anonymization pipeline that (a) doesn't exist yet, (b) is compliance minefield on every future customer's data. Kill until anonymization pipeline exists. In-page ProductTour with redacted content is the correct surface (see Missing item). Killed by Funnel-CRO.


### 10. Public teardown series naming well-known DR sites (Lead-acquisition missing #5)

**Why Killed:** Defamation + tortious-interference risk in BR (Lei 12.965 + generic tort) and EU (GDPR Art. 6/17 + Unlauterer Wettbewerb in DE). One takedown letter kills the format; one lawsuit from a mid-cap ecom brand kills the runway. Reworded version: sector-anonymized ('a top-10 BR fashion ecom' + blurred screenshots) is the only shippable form — removes 80% of viral hook but keeps the format legal. Killed as originally proposed by Traffic-ads.


### 11. TAAFT ($347) + TopAI.tools + Toolify.ai + Altern AI-directory listings as Phase 3 launch sprint (Traffic-ads missing #4)

**Why Killed:** Positioning-poison. Vestigio's category-of-one is 'monthly revenue-leak diagnostics' — getting listed in 'AI tool' directories re-categorizes it as 'ChatGPT wrapper for websites' in buyer's mental map, directly comparable to hundreds of free AI-audit tools. Category dilution costs are permanent. $300 PPC credit doesn't offset pricing-floor damage from being shopped against $0 AI tools. Killed by Traffic-ads self-correcting + Growth-revenue. Keep Phase 1-2 launch directories (Peerlist, Product Hunt, Uneed, MicroLaunch, SoloPush, ProductBurst, Fazier, BetaList) that don't pigeonhole category.


### 12. 5-concept video ad library × 3 variants × 4 locales × 3 aspect ratios × 2 durations = 360 unique cuts in a 10-14 day production sprint (Traffic-ads improve_rework #4)

**Why Killed:** Math kills this — 360 cuts in 14 days = 26/day. Fantasy timeline that buries team in production instead of testing. DR practice: test 5-10 hooks × 1 aspect ratio × 1 locale FIRST, scale only winners. Producing 360 cuts before knowing which HOOK works = pre-launch over-investment (Kern, Deiss both preach 'ugly first ads'). Correct scope: 5 hooks × 2 aspect ratios (9:16 + 1:1) × 1 locale (pt-BR) × 1 duration (15s) = 10 cuts in 3 days. Localize + expand aspect ratios AFTER winner emerges. Killed by Lead-acq.


### 13. Google Search RSA on 'porque meu site não vende' + Hotjar/Baymard competitor conquest (Traffic-ads missing #3)

**Why Killed:** 'Porque meu site não vende' is 90% informational-intent — buyers googling that want a blog post, not a $199/mo subscription. Competitor conquest against Hotjar/Baymard is category-misalignment: those buyers already have an analytics tool and are searching support/features, not replacement. Bidding '$199/mo revenue-leak diagnostic' against 'Hotjar alternative' = wrong solve, high CPC, terrible quality score. Correct themes: 'auditoria de conversão site preço', 'quanto meu site perde por mês', 'diagnóstico de site para vendas', long-tail commercial-intent + brand terms. Killed by Lead-acq.


### 14. Restate annual price as monthly-equivalent-FIRST ('R$16/mês cobrado 1x ao ano') as primary framing (Growth-revenue good_polish)

**Why Killed:** Half-right, wrong direction for BR. Buyers who see 'R$16/mês' expect to pay R$16 in month 1 then R$16 again in month 2 — annual lump surprise at checkout produces higher chargeback rate than transparent 'R$1.910/ano (economize 20%)'. Keep annual lump PRIMARY, monthly-equivalent SECONDARY. Killed by Growth-revenue self-correcting.


### 15. Embeddable 'Score my site' widget for partners with 20% recurring rev share (Lead-acquisition improve_rework #4)

**Why Killed:** 20% recurring rev share on R$199/mo = R$40/mo/customer forever against CAC ceiling that already needs $30-50 to survive. On top of Paddle ~7% MoR + processing = margin evaporates below breakeven on partner-sourced customers. Also 5 days engineering for a distribution channel that requires partner-side implementation effort + trust — same 5 days on PDF lead magnet returns 10x more leads. Pre-PMF partner program = classic marketing-premature-pre-PMF trap. Revisit month 6+ after paid funnel proves LTV/CAC > 3:1. Killed by Positioning + Growth-revenue.


### 16. 12-post backlog per social channel (IG + TikTok + LinkedIn + YouTube + X) × 4 locales BEFORE first ad flight + 3 posts/week/channel ongoing (Lead-acquisition missing #1)

**Why Killed:** 5 channels × 4 locales × 12-post backlog = 240 pieces of content before ads launch = 4-8 weeks of full-time PMM/content role that doesn't exist. Violates user memory feedback_marketing_premature_pre_pmf. Defensive reason (buyer trust check on IG when they search brand mid-funnel) is real but solved by claiming handles + 3 pinned real posts + bio + logo (1 day of work), not 12. Kill the 12-post + 3-per-week cadence; keep minimal handle-claim. Killed by Positioning + Lead-acq self-correcting.


### 17. Post-purchase OTO = 'Comparação Concorrentes' R$147 (Funnel-CRO improve_rework #5)

**Why Killed:** Off-thesis. Vestigio's promise is 'we tell you where YOUR money is leaking' — a competitor-comparison OTO redirects buyer attention outward to competitive obsession and away from the operational-fix loop the monthly Plano drives. Also delivery requires either manual analyst hours (doesn't scale) or public Vestigio Index infrastructure (still WIP). Replaced with 'Priority Delivery — first Plano in 48h instead of 30 days for +R$147' — on-thesis, near-zero delivery cost, reinforces core promise. Killed by Lead-acq.


### 18. Kill hero_lp entirely + canonicalize on hero_v2 across home AND paid LPs (Positioning improve_rework)

**Why Killed:** Route by surface instead. Statement hooks (hero_v2 'A Vestigio sabe') convert warm/organic — home stays hero_v2. Question hooks (hero_lp 'Quanto está vazando... sem você perceber?') convert cold-paid low-awareness — paid /lp/[angle] pages use hero_lp variants. Cost of maintaining two variants is trivial (one dict block); cost of losing paid CVR is catastrophic. Killed by Traffic-ads + Lead-acq + Growth-revenue as originally scoped; kept as 'kill hero_lp on home only' compromise.


### 19. Kill Starter tier entirely as public entry (Growth-revenue improve_rework #1)

**Why Killed:** Removes the R$99 anchor that makes Pro R$199 read as 'the sensible middle' — decoy math Growth-revenue itself praises in 'perfect' section. Collapses three-tier decoy to two-tier and pushes AOV expectation UP visually right when low-awareness buyer is deciding to trust the brand. Premature optimization removing a tier with unknown-but-possibly-positive LTV (havefunnels-tier lacks data). Better sequence: default paywall to annual (Growth-revenue right on that), keep Starter monthly visible as decoy, revisit after 90 days paid data. Killed by Positioning + Lead-acq.


### 20. Ship WhatsApp Broadcast for pt-BR as month-1 quick-win '1 day WhatsApp Business API' (Lead-acquisition improve_rework #5 / missing #7)

**Why Killed:** Understates operational complexity. WhatsApp Broadcast Lists cap at 256 recipients per list and only send to contacts who have YOU in their address book — un-scalable. WhatsApp Business Platform (Cloud API) requires template pre-approval (Meta review 24-72h per template), display name verification, per-message cost (BRL 0.05-0.30), 24h session windows for freeform reply. 2-3 weeks setup + ongoing compliance, not 1 day. Meta 2025 crackdown on broadcast-blast patterns with account suspensions. Ship Beehiiv/email first (weeks 1-4), add WhatsApp Broadcast only after 200+ opt-ins engaging with newsletter (month 3+). Killed by Traffic-ads + Lead-acq self-correcting.



---

## Appendix

- **Round 1** (5 cluster analyses): saved verbatim in workflow transcripts under `subagents/workflows/wf_c23d1262-42a/`
- **Round 2** (5 adversarial critiques): same path
- **War-room brief** with concrete facts: `scratchpad/war-room-brief.md`
- **Workflow script** (idempotent replay via `resumeFromRunId`): `workflows/scripts/vestigio-dr-warroom-wf_c23d1262-42a.js`
- **Raw JSON result**: `tasks/w6etp6fsi.output`

