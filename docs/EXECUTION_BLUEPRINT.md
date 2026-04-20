# Execution Blueprint — Homepage, Landing Page & Funnel

*Last updated: 2026-04-20 (rev 3 — post-audit alignment pass)*
*Reference: MARKETING_DIRECTION.md*

---

## How to read this document

Each section follows this format:

```
CURRENT: What exists today (component, position, content)
VERDICT: Keep / Change / Remove / Move / New
DIRECTIVE: Exact change with before→after copy
STATUS: ✅ Done / 🔲 Not started / 🟡 Partial
```

### Terminology rules (binding across all copy)

| Use | Never use | Why |
|-----|-----------|-----|
| Diagnostic / cycle | Report | "Report" implies static deliverable, undermines decision engine |
| Diagnose / Find / See | Audit / Discover | "Audit" sounds like compliance; "Discover" is passive |
| Decision engine | Platform / Solution | Generic SaaS words, zero differentiation |
| Watch / Catch | Monitor | "Monitor" sounds like uptime tool |
| Vestigio Pulse AI | MCP calls / Agentic insights | Internal jargon, meaningless to users |
| 60 seconds | 24 hours | MiniCalc results are near-instant; "24 hours" creates unnecessary friction |

---

# PART 1 — HOMEPAGE (/)

**Audience:** Organic, referral, brand search
**Job:** Create category awareness. Make the visitor think "I need to check if this is happening to me."
**Tone:** Authoritative confidence (McKinsey clarity, Stripe restraint)

---

## Section 1: Hero

**CURRENT:** Position 1. Component: `Hero/index.tsx`
- Headline L1: "There's money leaking from your operation." (en) / "Tem dinheiro vazando na sua operação." (pt-BR)
- Headline L2: "You just don't know how much." (en) / "Você só não sabe quanto." (pt-BR)
- Subtitle: "Problems identified and ranked. Decisions ready to execute. Real evidence." (en) / "Problemas identificados e ranqueados. Decisões prontas pra executar. Evidência real." (pt-BR)
- Pills: 4 problem→solution pairs
- CTA: "Run free diagnostic"
- Microcopy: Removed

**STATUS:** ✅ Done (headline, subtitle, pills, CTA, microcopy removed)

**REMAINING:**

Pills should sharpen toward financial specificity:

| Current problem | Current solution | Sharper problem | Sharper solution |
|-----------------|-----------------|-----------------|------------------|
| "Leads not converting?" | "We show you why" | "Paying for traffic, no conversions?" | "We show you why" |
| "Ad spend not returning?" | "We reveal the leak" | "Scaling ad spend blindly?" | "We quantify the waste" |
| "Nice site, no sales?" | "We find the bottleneck" | "Site looks fine, sales don't?" | "We find what's broken" |
| "Deciding in the dark?" | "Impact in dollars" | "20 problems, no priority?" | "A ranked queue. Fix #1 first." |

**Visual:** Keep the animated trails and halos. They work — atmospheric, not distracting.

---

## Section 2: Social Proof Strip (NEW)

**CURRENT:** Does not exist. Client gallery is at position 3, inside HomeBigCard.

**VERDICT:** New. Insert between Hero and Product Tour (inside HomeBigCard).

**DIRECTIVE:** Single line, centered, subtle. No logos. Just a number.

```
Empresas como a sua encontram em média 9 vazamentos críticos e −R$81k/mês no primeiro diagnóstico Vestigio.
```

The `−R$81k/mês` is highlighted in `font-mono font-semibold text-red-400` — the financial impact pops without breaking the understated tone.

**Visual:** `text-[13px] text-zinc-500`, centered, no border, no card. The `−R$81k/mês` highlight is the only color accent. Loss-frame maintained from hero.

**STATUS:** ✅ Done

---

## Section 3: Product Tour

**CURRENT:** Position 2. Component: `ProductTour/index.tsx`
- Title: "Not a dashboard. A queue of decisions."
- Subtitle: "Every tab is a different lens on the same revenue picture — ranked, evidenced, and ready to act on."
- Eyebrow: "Product Tour"

**VERDICT:** Keep position (stays at 3, after social proof strip). Change header copy. AIDA role: **Interest** — show how it works.

**DIRECTIVE:**

| Element | Current | Write |
|---------|---------|-------|
| Eyebrow pill | "Product Tour" | "Inside your decision engine" |
| Title | Keep — "Not a dashboard. A queue of decisions." is excellent | Keep |
| Subtitle | "Every tab is a different lens on the same revenue picture..." | "Your action queue, your evidence trail, your financial clarity — from day one." |
| CTA | "Run free diagnostic" | Keep |

**Tab content:** Keep all 6 tabs. The interactive browser mockup is strong.
**Recovery callout** ("Recoverable +$67k/mo"): Keep — this is the emotional payoff of the tour.

**STATUS:** 🔲 Not started (copy changes only)

---

## Section 4: Outcomes (REPLACES Features Bento)

**CURRENT:** Position 6. Component: `Features/index.tsx`. Four bento cards: Action Queue, Revenue Leaks, Continuous Watch, Evidence Orbit.

**VERDICT:** Move to position 4 (after Product Tour). Keep the bento visual layout (visually stunning). Reframe each card from "what the product does" to "what happens to your business." AIDA role: **Desire** — concrete dollar amounts make the visitor want this for themselves.

**DIRECTIVE:**

**Card 1 (Action Queue, amber):**

| Current | Write |
|---------|-------|
| "A clear queue of what to fix first" | "Know what to fix Monday morning" |
| "Every finding ranked by impact, urgency, and effort. No more spreadsheets..." | "A ranked queue. Impact in dollars, not color codes. The first item is worth $42k/month. The ninth is worth $1.5k. You know where to start." |

**Card 2 (Revenue Leaks, red):**

| Current | Write |
|---------|-------|
| "Find where money is bleeding" | "See exactly what each problem costs" |
| "Vestigio quantifies every leak across your funnel — with confidence ranges, not vibes." | "Not 'high severity'. Not a red dot. A dollar amount: −$18,420/month, 94% confidence. You know what to tell your team." |

**Card 3 (Continuous Watch, emerald):**

| Current | Write |
|---------|-------|
| "Catch regressions before your customers do" | "Last week's deploy broke checkout. You'd know in hours, not days." |
| "Each deploy and campaign creates new vectors. Vestigio re-audits continuously..." | "Continuous cycles compare every surface against the last. When something degrades, it shows up in your queue before a customer complains." |

**Card 4 (Evidence Orbit, sky):**

| Current | Write |
|---------|-------|
| "Every finding traces back to multi-source proof" | "Show your team proof, not your opinion" |
| "Browser-verified, cross-checked, timestamped..." | "Every finding: browser screenshot, DOM snapshot, performance trace, timestamp. Your CTO sees evidence, not a dashboard." |

**Visual:** Keep the animated orbit, chart, action rows, leak rows. They're the best graphics on the site.

**STATUS:** 🔲 Not started

---

## Section 5: MiniCalculator (MOVED UP)

**CURRENT:** Position 11 (second to last, before CallToAction). Component: `MiniCalculator/index.tsx`

**VERDICT:** Move to position 5 — after Outcomes, before safety net sections. AIDA role: **Action** — the visitor has seen the problem (hero), the proof (product tour), and the desire (outcomes with dollar amounts). Now they're Solution-Aware and ready to act.

**Why position 5, not position 3:** Moving MiniCalc before Product Tour (as originally proposed) optimizes for MiniCalc entries but hurts signup conversion. At position 3, the visitor enters the MiniCalc with only hero + social proof — no understanding of what Vestigio does, no trust built, no objections addressed. BJ Fogg model: Ability is high (free, 60s) but Motivation is low (haven't seen value). At position 5, the visitor has seen Interest (product tour) and Desire (outcomes with $42k/month examples) — Motivation is high. Second-order effect: fewer total MiniCalc entries, but higher conversion downstream.

**DIRECTIVE:**

| Element | Current | Write |
|---------|---------|-------|
| Eyebrow | "Free instant diagnostic" | "FREE DIAGNOSTIC" |
| Tagline | "Try Vestigio on your own domain — no signup, no card." | Remove — the title does this job. |
| Title | "See what you're leaving on the table" | "How much are you losing right now?" |
| Subtitle | "Enter your website URL to get a free snapshot of potential revenue leaks." | "Enter your domain. No signup. No card. 60 seconds." |
| CTA | "Run Free Diagnostic" | Keep |

**Results state — keep as-is.** The findings table with dollar amounts is the strongest element on the site.

**STATUS:** 🔲 Not started (position change + copy rewrite)

---

## Section 6: Problem Statement (REPLACES Solution Layers)

**CURRENT:** Position 4. Component: `SolutionLayers/index.tsx`. Three sticky-stack cards explaining Discover → Prioritize → Validate. Uses `homepage.solution_layers` i18n.

**VERDICT:** Replace content. Keep the sticky-stack visual treatment (great pattern) but change from product process to user consequence. Moves to position 6 — safety net for visitors who scrolled past MiniCalc without converting.

**DIRECTIVE:**

| Element | Current | Write |
|---------|---------|-------|
| Eyebrow | "What Vestigio does" | "THE PROBLEM" |
| Title | "Refuse to scale your business in the dark." | "Traffic is not the problem. Scaling a broken system is." |
| Subtitle | "See early, prioritize with clarity..." | Remove |

**Card 1:**
```
Current: "Discover before others — See where the risks, leaks, and opportunities are..."
Write:   "Pages that don't convert. You're paying for traffic that hits a wall. 
          Every visitor that bounces is money you already spent."
```

**Card 2:**
```
Current: "Prioritize and act with precision — Turn signals into a continuous queue..."
Write:   "Checkouts that leak trust. Your payment flow has friction you can't see. 
          The drop-off happens silently — no alert, no notification."
```

**Card 3:**
```
Current: "Validate with confidence — Confirm if it's ready..."
Write:   "Fixes you can't verify. You ship a fix, but did it actually work? 
          Without continuous verification, you're guessing."
```

**After the 3 cards, add one line:**
```
This is what "scaling in the dark" looks like. And it costs money every day.
```

**Visual:** Keep the sticky-stack animation. Remove the agentic chat flow diagram — it's too product-oriented for this section.

**STATUS:** 🔲 Not started

---

## Section 7: Use Cases (REPLACES FeaturesWithImage)

**CURRENT:** Position 5. Component: `FeaturesWithImage/index.tsx`. Hidden on mobile. 5 cards explaining product surfaces.

**VERDICT:** Replace with persona-driven scenarios. Make visible on mobile.

**DIRECTIVE:**

| Element | Current | Write |
|---------|---------|-------|
| Eyebrow | "Use Cases" (i18n) | "BUILT FOR" |
| Title | "Audit, prioritize, recover — every layer of your funnel" | "Operators who won't scale blind" |

**Replace 5 product-surface cards with 3 persona scenarios:**

**Card 1: The Founder**
```
"I spend $40k/month on ads. Am I sending traffic into a broken funnel?"
Vestigio answers in 60 seconds. With dollar amounts on every finding.
```

**Card 2: The Head of Growth**
```
"We shipped last week. Did anything break?"
Vestigio compares every surface against the last cycle. Regressions show up ranked by impact.
```

**Card 3: The CTO**
```
"Chargebacks are climbing. Where's the root cause?"
Vestigio traces chargeback risk to specific surfaces, policies, and trust gaps. Evidence attached.
```

**Visual:** Clean cards, no icons. Just the quote + answer. The simplicity is the design.

**STATUS:** 🔲 Not started

---

## Section 8: Counter / Value Props

**CURRENT:** Position 7. Component: `Counter/index.tsx`. Bento grid with 6 items: Quick Start, Full Visibility, 4X ROI, Vestigio Pulse, Continuous Monitoring, Integrations.

**VERDICT:** Simplify to 3 items. Remove fluff.

**DIRECTIVE:** Keep only the most compelling:

```
[4X ROI Guarantee]     [First diagnostic in 60s]     [15,000+ signals per cycle]
You literally can't     Enter your domain,            Automated. Continuous.
lose.                   see results immediately.      No manual review needed.
```

Remove: Quick Start (redundant with "60s"), Vestigio Pulse (save for later), Integrations (too early to mention).

**STATUS:** 🔲 Not started

---

## Section 9: Video Testimonials

**CURRENT:** Position 8. Component: `VideoTestimonials/index.tsx`. Portrait videos with placeholder content from another product.

**VERDICT:** Remove until real customer videos exist. Placeholder content ("Review Harvest", "Pooper Scoopers") is worse than no social proof.

**DIRECTIVE:** Hide the component from the homepage composition. Re-add when real Vestigio customer testimonial videos are available. When re-adding, position ABOVE the counter section (social proof should precede claims).

**STATUS:** 🔲 Not started

---

## Section 10: Testimonial Cards / Success Stories

**CURRENT:** Position 9. Component: `Testimonials/index.tsx`. Carousel with 5 generic industry cards (placeholder stats unrelated to Vestigio).

**VERDICT:** Replace with real customer outcomes or replace with honest counter.

**DIRECTIVE:**

If real customers exist:
```
"[Company name] found $67k/month in recoverable revenue in their first cycle."
— [Name], [Role]
```

If no real customers yet, replace entire carousel with a single counter line:
```
127 companies have run their first diagnostic.
```

A real counter is more honest and more compelling than fake success stories. Generic industry stats ("51.42% Engagement Rate", "2.8x Revenue Growth") have no connection to Vestigio's value prop and damage credibility.

**STATUS:** 🔲 Not started

---

## Section 11: FAQ

**CURRENT:** Position 10. Component: `FAQ/index.tsx`. 4 questions (generic "what does Vestigio do", technical verification, try before buying, pricing plans).

**VERDICT:** Reduce to 3 questions. Replace with strategic conversion questions.

**DIRECTIVE:**

| # | Current Question | New Question | New Answer |
|---|---|---|---|
| 1 | "What does Vestigio actually do?" | "How is this different from Google Analytics?" | "GA tells you *what* happened. Vestigio tells you *why*, how much it costs, and what to fix first." |
| 2 | "Can I try it before committing?" | "Can I try before paying?" | "Yes. Enter your domain, see your first diagnostic in 60 seconds. No signup, no card." |
| 3 | "How does the verification system work?" | "How accurate are the financial estimates?" | "Every finding uses confidence ranges, not guesses. Evidence is browser-verified and timestamped." |
| 4 | "What pricing plans are available?" | **Remove** | Belongs on /pricing, not homepage. |

**STATUS:** 🔲 Not started

---

## Section 12: Final CTA

**CURRENT:** Rendered on homepage. Component: `CallToAction/index.tsx`.
- Title: "Ready to put your platform on autopilot?" ← uses AVOID word "autopilot" and "platform"
- Subtitle: "Join SaaS teams using Vestigio to automate auditing..." ← uses AVOID words "automate", "auditing"
- Primary CTA: "Get started free" ← should be "Run Free Diagnostic"
- Secondary CTA: "Try live demo" ← blueprint says one action only

**VERDICT:** Rewrite. One CTA only.

**DIRECTIVE:**

```
Title:    "The money is leaving now."
Subtitle: "Every day without visibility is revenue you don't recover."
CTA:      [Run Free Diagnostic]
Micro:    "You can be looking at your first diagnostic in 60 seconds."
```

Remove secondary CTA ("Try live demo"). One action only.

**Visual:** Full-width, dark bg, centered. Emerald CTA button.

**STATUS:** 🔲 Not started

---

## Homepage Section Order

**CURRENT ORDER (Home/index.tsx):**
1. Hero ✅
2. ProductTour
3. ClientGallery
4. SolutionLayers
5. FeaturesWithImage
6. Features
7. Counter
8. VideoTestimonials ← placeholder, should hide
9. Testimonials ← placeholder, should hide or replace
10. FAQ
11. MiniCalculator ← wrong position
12. CallToAction

**TARGET ORDER (AIDA-aligned):**
1. Hero ✅ — **Attention**: loss-frame, curiosity gap
2. Social Proof Strip ✅ — **Attention** reinforcement: −R$81k/mês
3. Product Tour — **Interest**: "this is how it works"
4. Outcomes (Features bento) — **Desire**: dollar amounts, concrete impact
5. MiniCalculator (MOVED from 11) — **Action**: "now test on your domain"
6. ClientGallery — social proof strip (quiet)
7. Problem Statement (rewritten SolutionLayers) — safety net: consequence of inaction
8. Use Cases (rewritten FeaturesWithImage) — safety net: persona scenarios
9. Counter (reduced to 3 items) — safety net: value props
10. FAQ (reduced to 3 questions) — safety net: objection handling
11. CallToAction (rewritten) — final action

**Removed until real content available:**
- VideoTestimonials (placeholder from another product)
- Success Stories (generic placeholder stats)

---

# PART 2 — LANDING PAGE (/lp)

**Audience:** Paid traffic — e-commerce focused (clicked an ad with a financial promise)
**Job:** Convert. One action. Match the ad promise.
**Tone:** Direct financial confrontation

**Total scroll:** 2 screens maximum. No features, no process, no FAQ.

---

## Section 1: Hero + CTA

**CURRENT (implemented):**
```
Headline L1: "Online stores lose an average of $81k/mo to invisible leaks." (en)
             "Lojas online perdem em média R$81k/mês em vazamentos invisíveis." (pt-BR)
Headline L2: "Enter your domain. Find out in 60 seconds how much YOU lose." (en)
             "Digite seu domínio. Descubra em 60 segundos quanto VOCÊ perde." (pt-BR)
```

**STATUS:** ✅ Done (separate `hero_lp` i18n namespace, all 4 locales)

**REMAINING:** The /lp currently renders the full homepage (all sections). It should be stripped to 5 sections only:

1. Hero (with LP-specific copy) ✅
2. MiniCalculator (immediate interaction)
3. "What your first diagnostic shows" (3 checkmark rows)
4. One proof point (stat or real customer quote)
5. Final CTA (repeat)

**Visual:** Minimal. Dark bg, white text, emerald CTA. No pills, no animation on LP hero. The number does the work.

**STATUS:** 🟡 Partial (hero done, page structure not stripped yet)

---

## Section 2: MiniCalculator (immediate)

Same component as homepage. No changes needed — the calculator IS the landing page.

---

## Section 3: What you'll see

**DIRECTIVE:**

```
Title: "Your first diagnostic shows:"
3 items (icon + one line each):
- A ranked queue of what's costing you money
- Dollar amounts on every finding (not severity colors)
- Browser-verified evidence you can show your team
```

**Visual:** 3 simple rows with checkmarks. No cards, no bento grid. Speed.

**STATUS:** 🔲 Not started

---

## Section 4: One proof point

**DIRECTIVE:**

```
"Average first diagnostic: 9 findings, $41k/month in recoverable revenue."
```

Or if real customer exists:
```
"[Company] found $67k/month in recoverable revenue in their first Vestigio cycle."
— [Name], [Role]
```

**STATUS:** 🔲 Not started

---

## Section 5: Final CTA (repeat)

**DIRECTIVE:**

```
You're either finding the leaks or funding them.
[Run Free Diagnostic]
```

**STATUS:** 🔲 Not started

---

# PART 3 — FUNNEL REDESIGN

---

## Homepage CTA → Signup Flow

**CURRENT:**
1. Click "Run free diagnostic" on homepage
2. → `/auth/signup` (standard auth page with Google/GitHub/Magic Link/Password)
3. After auth → `/app/onboarding` (7-step form)
4. Step 7: Plan selection → Paddle checkout
5. After payment → `/app/onboarding/thank-you` → redirect to `/app/inventory`

**PROBLEMS:**
- 7-step onboarding is too many steps
- Multiple fields per step creates cognitive load
- Plan selection happens AFTER 6 steps of data entry (user already invested, but also tired)
- No progressive disclosure — user sees all fields at once per step

**PROPOSED:**

### New Onboarding: 1 question per screen

**DIRECTIVE:** Each step is a full-screen card with ONE field and a prominent "Continue" button. No scrolling. The progress indicator shows how many steps remain.

**Step 1: Domain** (most important — gets them invested)
```
What domain should we diagnose?
[________________________] ← full-width input
☐ I own or manage this domain  ← inline legal checkbox
[Continue]
"We only crawl public pages. No access to your code or data."
```

**Step 2: Business type + Conversion model** (4 large cards, tap to select → sub-question appears)
```
What kind of business?
[Ecommerce]  [SaaS]
[Lead Gen]   [Hybrid]
← tapping reveals: "How do customers complete a purchase?"
[Online checkout]  [WhatsApp/Chat]  [Form/Contact]
← tapping auto-advances
```

**Step 3: Monthly revenue** (one field)
```
What's your approximate monthly revenue?
[________________________] ← accepts "$50k", "1.5m", etc.
[Continue]
"This helps us calibrate impact estimates."
```

**Step 4: Plan selection** (3 cards, one recommended, with annual toggle)
```
Pick the plan that matches your revenue at risk.
[Monthly / Annual ← 20% off]
[Starter $99]  [Pro $199 ★]  [Max $399]
"Every plan pays for itself in the first cycle."
```

**Result: 7 steps → 4 steps. Zero scrolling per step.**

**STATUS:** 🔲 Not started

---

## LP CTA → Lead Funnel

**CURRENT:**
1. Click "Run free diagnostic" on /lp
2. → `/lp/audit` (4-step form: org, domain, metrics, email)
3. → `/lp/audit/result/[id]` (polling, 5 findings, blurred 10)
4. → Paddle checkout (unlock full diagnostic)
5. → `/lp/audit/thank-you/[id]`

**DIRECTIVE:** Simplify to 3 steps:

**Step 1:** Domain + ownership checkbox
**Step 2:** Revenue (conversion model inferred from crawl signals)
**Step 3:** Email only (no phone — phone is scary for cold leads)

**Result: 4 steps → 3 steps (domain, revenue, email). Faster to value.**

**Result page:** Keep the 5-visible + 10-blurred pattern. It's a strong conversion mechanic.

**STATUS:** 🔲 Not started

---

## MiniCalculator → Signup Bridge

**CURRENT (implemented):** MiniCalc passes `?domain=` to `/auth/signup`. Signup page persists domain to `localStorage` (survives OAuth redirect). Onboarding reads and pre-fills the domain field.

**STATUS:** ✅ Done

---

# PART 4 — CROSS-CUTTING DIRECTIVES

---

## CTA Consistency

Every CTA across both pages should use the same language:

| Context | CTA Text |
|---------|----------|
| Hero primary | "Run Free Diagnostic" |
| MiniCalc submit | "Run Free Diagnostic" |
| Product Tour | "Run Free Diagnostic" |
| Final section | "Run Free Diagnostic" |
| After results | "Create Free Account" |
| After results secondary | "View Pricing" |

Never: "Get Started", "Learn More", "Sign Up", "Try Free", "Run Free Audit"

---

## Number Formatting

All financial numbers should follow these rules:
- Always use the minus sign character `−` (U+2212), not hyphen `-`
- Always show ranges: `−$18k–$42k/mo`
- Always include time unit: `/month` or `/mo`
- Use `k` for thousands, `m` for millions — never spell out
- Confidence ranges when shown: `94% confidence`

---

## i18n

All homepage and LP components now use `next-intl` with translations in all 4 locales (en, pt-BR, es, de). English is the canonical language; others are translations.

All copy changes must be made in this order:
1. `en.json` (canonical)
2. `pt-BR.json` (primary market)
3. `es.json`
4. `de.json`

**STATUS:** ✅ Done (full i18n migration completed for all homepage sections)

---

## Mobile Considerations

- Hero: headline should be max 2 lines on 375px width
- MiniCalc: full-width inputs, stacked vertically
- Product Tour: tab icons only (no labels) on mobile — already implemented
- Problem cards: stack vertically, no sticky-stack on mobile
- Outcome bento: single column on mobile — already implemented
- Final CTA: full-width button, centered

---

## Implementation Order (updated)

| Phase | What | Pages | Status |
|-------|------|-------|--------|
| **1** | Rewrite hero copy (both pages) | `/`, `/lp` | ✅ Done |
| **2** | Full i18n migration (all homepage sections) | `/` | ✅ Done |
| **3** | MiniCalc → Signup domain persistence | `/auth/signup`, onboarding | ✅ Done |
| **4** | Move MiniCalc to position 5 (after Outcomes) | `/` | 🔲 |
| **5** | Add social proof strip | `/` | 🔲 |
| **6** | Rewrite final CTA section | `/` | 🔲 |
| **7** | Reframe feature bento cards (copy only) | `/` | 🔲 |
| **8** | Replace Solution Layers content | `/` | 🔲 |
| **9** | Replace persona cards (FeaturesWithImage) | `/` | 🔲 |
| **10** | Reduce Counter to 3 items | `/` | 🔲 |
| **11** | Reduce FAQ to 3 questions | `/` | 🔲 |
| **12** | Hide VideoTestimonials + Success Stories | `/` | 🔲 |
| **13** | Strip /lp to 5 sections only | `/lp` | 🔲 |
| **14** | Simplify onboarding (7→4 steps) | `/app/onboarding` | 🔲 |
| **15** | Simplify LP lead form (4→3 steps) | `/lp/audit` | 🔲 |

---

## Success Metrics

| Metric | Current (baseline) | Target |
|--------|-------------------|--------|
| Hero → MiniCalc scroll % | Measure | +30% |
| MiniCalc completion rate | Measure | +20% |
| MiniCalc → Signup conversion | Measure | +40% |
| /lp bounce rate | Measure | −25% |
| Onboarding completion rate | Measure | +50% (fewer steps) |
| Time from CTA click to first diagnostic | Measure | <2 minutes |

---

# PART 5 — CRO CORRECTIONS (applied)

*Applied 2026-04-19 after running CRO skill audits against actual codebase.*

---

## Pricing Copy (applied in code)

| Current (fixed) | New |
|-----------------|-----|
| "Agentic insights" / "5x more agentic insights" | "Vestigio Pulse AI" / "5x Vestigio Pulse AI" |
| "50 MCP calls/mo" / "250 MCP calls/mo" | "Vestigio Pulse AI interactions/mo" |
| Plan: "Essential intelligence for small teams getting started" | "See what's costing you money. Fix the top 3." |
| Plan: "Full analysis suite for growing businesses that need an edge" | "Full financial clarity across 3 environments. Daily." |
| Plan: "Unlimited scale with dedicated support for large organizations" | "Enterprise-grade. 10 environments. Dedicated support. SLA." |

## Auth Flow (applied in code)

- Trust signals added to `/auth/signup`: "No credit card required" + "First diagnostic in 60s"
- Domain persistence: MiniCalc → signup → onboarding via `localStorage`
- OAuth callbacks redirect to `/app` (was `/admin`)
- Onboarding pre-selects recommended plan (Pro)

## Known Bugs (fixed in code)

| Bug | Fix |
|-----|-----|
| Name field `maxlength="10"` | Changed to `maxlength="100"` |
| OAuth callbacks to `/admin` | Changed to `/app` |
| Lorem Ipsum in i18n sections | Replaced with proper copy |
| "MCP calls" jargon in pricing | Replaced with "Vestigio Pulse AI" |

## Known Issues (not yet fixed)

| Issue | Impact | Effort |
|-------|--------|--------|
| Magic Link signup doesn't collect user name | Users have no name | Medium |
| Apple Sign-in configured but no UI button | Dead code | Low |
| LP result page mixes English and Portuguese | Confusing for non-PT visitors | Medium |
| Blurred findings don't show financial impact | Missed FOMO opportunity | Low |
| No upgrade triggers for Maps/AI Chat/Integrations | Starter users miss Pro features | Medium |
| Thank-you page uses hardcoded zinc colors | Broken in light mode | Low |
| Paddle checkout double-open race condition | `setTimeout(1500ms)` is fragile | Low |
