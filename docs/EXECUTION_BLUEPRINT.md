# Execution Blueprint — Homepage, Landing Page & Funnel

*Last updated: 2026-04-19*
*Reference: MARKETING_DIRECTION.md, product-marketing-context.md*

---

## How to read this document

Each section follows this format:

```
CURRENT: What exists today (component, position, content)
VERDICT: Keep / Change / Remove / Move / New
DIRECTIVE: Exact change with before→after copy
```

---

# PART 1 — HOMEPAGE (/)

**Audience:** Organic, referral, brand search
**Job:** Create category awareness. Make the visitor think "I need to check if this is happening to me."
**Tone:** Authoritative confidence

---

## Section 1: Hero

**CURRENT:** Position 1. Component: `Hero/index.tsx`
- Headline: "Skip the analytics. / What matters is the decision."
- Subtitle: "Vestigio audits your digital operation automatically and ranks what to fix so you stop leaving money on the table — you skip the analytics and go straight to the decision."
- Pills: 4 problem→solution pairs
- CTA: "Run free diagnostic"
- Microcopy: "Perfect for ecommerce, SaaS, lead gen, infoproducts, services and apps."

**VERDICT:** Change headline, rewrite subtitle, keep pills, keep CTA

**DIRECTIVE:**

| Element | Instead of | Write |
|---------|-----------|-------|
| Headline L1 | "Skip the analytics." | "Your funnel is leaking." |
| Headline L2 | "What matters is the decision." | "Vestigio shows you where — and how much." |
| Subtitle | "Vestigio audits your digital operation automatically and ranks what to fix so you stop leaving money on the table..." | "Every revenue leak ranked by financial impact, with browser-verified evidence. First report in 24 hours." |
| Microcopy | "Perfect for ecommerce, SaaS, lead gen, infoproducts, services and apps." | Remove entirely. The visitor doesn't care about categories here. |

**Pills:** Keep current format (problem → solution), but sharpen:

| Current problem | Current solution | New problem | New solution |
|-----------------|-----------------|-------------|-------------|
| "Traffic but no leads" | "We find the block" | "Paying for traffic, no conversions" | "We show you why" |
| "Ads without return" | "We show the leak" | "Scaling ad spend blindly" | "We quantify the waste" |
| "Pretty site, low sales" | "Focus what converts" | "Site looks fine, sales don't" | "We find what's broken" |
| "Don't know what to fix" | "Ranked queue, ready" | "20 problems, no priority" | "A ranked queue. Fix #1 first." |

**Visual:** Keep the animated trails and halos. They work — atmospheric, not distracting.

---

## Section 2: Social Proof Strip (NEW)

**CURRENT:** Does not exist above the fold. Client gallery is at position 3, below Product Tour.

**VERDICT:** New. Insert between Hero and Product Tour.

**DIRECTIVE:** Single line, centered, subtle. No logos. Just a number.

```
Average first report: 9 findings, $41k/month in recoverable revenue.
```

**Visual:** `text-sm text-zinc-500`, no border, no card. Just a line of text. The understatement IS the design — it reads like a footnote that happens to be devastating.

---

## Section 3: MiniCalculator (MOVED UP)

**CURRENT:** Position 9 (second to last). Component: `MiniCalculator/index.tsx`

**VERDICT:** Move to position 3. Before the Product Tour, not after features.

**DIRECTIVE:**

| Element | Instead of | Write |
|---------|-----------|-------|
| Eyebrow | "FREE AUDIT" | "FREE DIAGNOSTIC" |
| Tagline | "Discover your revenue leaks in seconds" | Remove — the title does this job. |
| Title | "See what you're leaving on the table" | "How much are you losing right now?" |
| Subtitle | "Enter your website URL to get a free snapshot of potential revenue leaks." | "Enter your domain. No signup. No card. 60 seconds." |
| CTA | "Run Free Audit" | "Run Free Diagnostic" |

**Why move up:** After the hero creates the question ("am I leaking?"), the calculator lets them answer it immediately. The Product Tour becomes proof AFTER the visitor has emotional investment.

**Results state — keep as-is.** The findings table with dollar amounts is the strongest element on the site.

---

## Section 4: Product Tour

**CURRENT:** Position 2. Component: `ProductTour/index.tsx`

**VERDICT:** Keep position (now position 4 after calc moves up). Change header copy.

**DIRECTIVE:**

| Element | Instead of | Write |
|---------|-----------|-------|
| Section headline pill | "Explore the platform" | "See your first report" |
| Title | "Not a dashboard. A queue of decisions." | Keep — this is excellent. |
| Subtitle | "Every tab is a different lens on the same revenue picture — ranked, evidenced, and ready to act on." | "This is what you'll see after entering your domain." |
| CTA | "Run Free Audit" | "Run Free Diagnostic" |

**Tab content:** Keep all 6 tabs. The interactive browser mockup is strong.

**Recovery callout** ("Recoverable +$67k/mo"): Keep — this is the emotional payoff of the tour.

---

## Section 5: Problem Statement (REPLACES Solution Layers)

**CURRENT:** Position 4. Component: `SolutionLayers/index.tsx`. Three sticky-stack cards explaining Discover → Prioritize → Validate.

**VERDICT:** Replace content. Keep the sticky-stack visual treatment (it's a great pattern) but change from product process to user problem.

**DIRECTIVE:**

| Element | Instead of | Write |
|---------|-----------|-------|
| Eyebrow | "HOW IT WORKS" | "THE PROBLEM" |
| Title | "Transform Your Platform From Hidden Risks to Revenue Clarity" | "Traffic is not the problem. Scaling a broken system is." |
| Subtitle | (long explanation) | Remove |

**Card 1:**
| Instead of | Write |
|-----------|-------|
| "Discover Before Others — See where the risks..." | "Pages that don't convert. You're paying for traffic that hits a wall. Every visitor that bounces is money you already spent." |

**Card 2:**
| Instead of | Write |
|-----------|-------|
| "Prioritize and Act with Precision — Turn signals into a continuous queue..." | "Checkouts that leak trust. Your payment flow has friction you can't see. The drop-off happens silently — no alert, no notification." |

**Card 3:**
| Instead of | Write |
|-----------|-------|
| "Validate with Confidence — Confirm if it's ready..." | "Fixes you can't verify. You ship a fix, but did it actually work? Without continuous verification, you're guessing." |

**After the 3 cards, add one line:**
```
This is what "scaling in the dark" looks like. And it costs money every day.
```

**Visual:** Keep the sticky-stack animation. Remove the agentic chat flow diagram below — it's too product-oriented for this section.

---

## Section 6: Outcomes (REPLACES Features Bento)

**CURRENT:** Position 6. Component: `Features/index.tsx`. Four bento cards: Action Queue, Revenue Leaks, Continuous Watch, Evidence Orbit.

**VERDICT:** Change content. Keep the bento visual layout (it's visually stunning).

**DIRECTIVE:** Reframe each card from "what the product does" to "what happens to your business."

**Card 1 (Action Queue, amber):**
| Instead of | Write |
|-----------|-------|
| Title: "A clear queue of what to fix first" | "Know what to fix Monday morning" |
| Description: "Every finding ranked by impact, urgency, and effort. No more spreadsheets..." | "A ranked queue. Impact in dollars, not color codes. The first item is worth $42k/month. The ninth is worth $1.5k. You know where to start." |

**Card 2 (Revenue Leaks, red):**
| Instead of | Write |
|-----------|-------|
| Title: "Find where money is bleeding" | "See exactly what each problem costs" |
| Description: "Vestigio quantifies every leak across your funnel — with confidence ranges, not vibes." | "Not 'high severity'. Not a red dot. A dollar amount: −$18,420/month, 94% confidence. You know what to tell your team." |

**Card 3 (Continuous Watch, emerald):**
| Instead of | Write |
|-----------|-------|
| Title: "Catch regressions before your customers do" | "Last week's deploy broke checkout. You'd know in hours, not days." |
| Description: "Each deploy and campaign creates new vectors. Vestigio re-audits continuously..." | "Continuous cycles compare every surface against the last. When something degrades, it shows up in your queue before a customer complains." |

**Card 4 (Evidence Orbit, sky):**
| Instead of | Write |
|-----------|-------|
| Title: "Every finding traces back to multi-source proof" | "Show your team proof, not your opinion" |
| Description: "Browser-verified, cross-checked, timestamped. Stop arguing..." | "Every finding: browser screenshot, DOM snapshot, performance trace, timestamp. Your CTO sees evidence, not a dashboard." |

**Visual:** Keep the animated orbit, chart, action rows, leak rows. They're the best graphics on the site.

---

## Section 7: Use Cases (REPLACES FeaturesWithImage)

**CURRENT:** Position 5. Component: `FeaturesWithImage/index.tsx`. Hidden on mobile. 5 cards explaining product surfaces.

**VERDICT:** Replace with persona-driven scenarios. Make visible on mobile.

**DIRECTIVE:**

| Element | Instead of | Write |
|---------|-----------|-------|
| Eyebrow | "THE FIVE SURFACES" | "BUILT FOR" |
| Title | "Digital Surfaces Vestigio Watches" | "Operators who won't scale blind" |

**Replace 5 product-surface cards with 3 persona scenarios:**

**Card 1: The Founder**
```
"I spend $40k/month on ads. Am I sending traffic into a broken funnel?"
Vestigio answers in 24 hours. With dollar amounts on every finding.
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

---

## Section 8: Counter / Value Props

**CURRENT:** Position 7. Component: `Counter/index.tsx`. Bento grid with Quick Start, Full Visibility, 4X ROI, Vestigio Pulse, Continuous Monitoring, Integrations.

**VERDICT:** Simplify to 3 items. Remove fluff.

**DIRECTIVE:** Keep only the most compelling:

```
[4X ROI Guarantee]     [First report in 24h]     [15,000+ signals per audit]
You literally can't     Enter your domain,        Automated. Continuous.
lose.                   see results tomorrow.     No manual review needed.
```

Remove: Quick Start (redundant with "24h"), Vestigio Pulse (save for later), Integrations (too early to mention).

---

## Section 9: Video Testimonials

**CURRENT:** Position 8. Component: `VideoTestimonials/index.tsx`. Portrait videos.

**VERDICT:** Keep if videos are real customers. Remove if stock/placeholder. 

**DIRECTIVE:** If keeping, move ABOVE the counter section (position 7, before value props). Social proof should precede claims. Add captions summarizing each testimonial's key result.

---

## Section 10: Testimonial Cards / Success Stories

**CURRENT:** Position 9. Component: `Testimonials/index.tsx`. Carousel with industry cards.

**VERDICT:** Replace with real customer outcomes or remove.

**DIRECTIVE:** If real customers:
```
"[Company name] found $67k/month in recoverable revenue in their first cycle."
— [Name], [Role]
```

If no real customers yet, replace with a counter:
```
127 SaaS companies have run their first diagnostic.
```
A real counter is more honest and more compelling than fake success stories.

---

## Section 11: FAQ

**CURRENT:** Position 10. Component: `FAQ/index.tsx`. Multiple questions.

**VERDICT:** Keep. Reduce to 3 questions max.

**DIRECTIVE:**

Keep only:
1. "How is this different from Google Analytics?" → One-line answer: "GA tells you *what* happened. Vestigio tells you *why*, how much it costs, and what to fix first."
2. "Can I try before paying?" → "Yes. Enter your domain, see your first report in 60 seconds. No signup, no card."
3. "How accurate are the financial estimates?" → "Every finding uses confidence ranges, not guesses. Evidence is browser-verified and timestamped."

Remove: Technical questions about verification pipelines, pricing plan details (belongs on /pricing).

---

## Section 12: Final CTA

**CURRENT:** Not rendered on homepage (component exists but isn't imported).

**VERDICT:** Add. This should be the last thing before footer.

**DIRECTIVE:**

```
The money is leaving now.
Every day without visibility is revenue you don't recover.

[Run Free Diagnostic]

You can be looking at your first report in 60 seconds.
```

**Visual:** Full-width, dark bg, centered. Emerald CTA button. No secondary CTA — one action only.

---

# PART 2 — LANDING PAGE (/lp)

**Audience:** Paid traffic (clicked an ad with a financial promise)
**Job:** Convert. One action. Match the ad promise.
**Tone:** Direct financial confrontation

**Total scroll:** 2 screens maximum. No features, no process, no FAQ.

---

## Section 1: Hero + CTA

**DIRECTIVE:**

```
Headline: "SaaS companies lose $38k/month to problems they can't see."
Subtitle: "Enter your domain. See yours in 24 hours."
CTA: [Run Free Diagnostic]
Microcopy: "No signup. No credit card. Just your domain."
```

**Visual:** Minimal. Dark bg, white text, emerald CTA. No pills, no animation. The number does the work.

---

## Section 2: MiniCalculator (immediate)

Same component as homepage. No changes needed — the calculator IS the landing page.

---

## Section 3: What you'll see

**DIRECTIVE:**

```
Title: "Your first report includes:"
3 items (icon + one line each):
- A ranked queue of what's costing you money
- Dollar amounts on every finding (not severity colors)
- Browser-verified evidence you can show your team
```

**Visual:** 3 simple rows with checkmarks. No cards, no bento grid. Speed.

---

## Section 4: One proof point

**DIRECTIVE:**

```
"Average first diagnostic: 9 findings, $41k/month in recoverable revenue."
```

Or if real customer exists:
```
"[Company] recovered $67k/month after their first Vestigio cycle."
— [Name], [Role]
```

---

## Section 5: Final CTA (repeat)

**DIRECTIVE:**

```
You're either finding the leaks or funding them.
[Run Free Diagnostic]
```

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
What domain do you want to audit?
[________________________] ← full-width input
[Continue]
"We only crawl public pages. No access to your code or data."
```

**Step 2: Business type** (4 large cards, tap to select)
```
What kind of business?
[Ecommerce]  [SaaS]
[Lead Gen]   [Hybrid]
← tapping auto-advances
```

**Step 3: Monthly revenue** (one field)
```
What's your approximate monthly revenue?
[________________________] ← accepts "$50k", "1.5m", etc.
[Continue]
"This helps us calibrate impact estimates."
```

**Step 4: Plan selection** (3 cards, one recommended)
```
Pick the plan that matches your revenue at risk.
[Starter $99]  [Pro $199 ★]  [Max $399]
"Every plan pays for itself in the first cycle."
```

**Removed steps:**
- Organization name → auto-generate from domain or ask later in settings
- SaaS-specific fields (login URL, MFA) → move to settings, ask later
- Notification preferences → default to email, configure later
- Review step → unnecessary if each step confirms as they go
- Conversion model → infer from business type

**Result: 7 steps → 4 steps. Zero scrolling per step.**

---

## LP CTA → Lead Funnel

**CURRENT:**
1. Click "Run free diagnostic" on /lp
2. → `/lp/audit` (4-step form: org, domain, metrics, email)
3. → `/lp/audit/result/[id]` (polling, 5 findings, blurred 10)
4. → Paddle checkout (unlock full report)
5. → `/lp/audit/thank-you/[id]`

**VERDICT:** The LP funnel is already better than the homepage funnel. Smaller changes:

**Step 1:** Remove "Organization name" and "Business type" — too much friction for a cold lead. Just ask for domain.

**Step 2:** Domain + ownership checkbox. Keep as-is.

**Step 3:** Revenue + conversion model. Keep but simplify — remove average ticket (optional detail, ask later).

**Step 4:** Email only. Remove phone. Phone is scary for cold leads.

**Result: 4 steps → 3 steps (domain, revenue, email). Faster to value.**

**Result page:** Keep the 5-visible + 10-blurred pattern. It's a strong conversion mechanic.

---

## MiniCalculator → Signup Bridge

**CURRENT:** After MiniCalc results, CTA goes to `/auth/signup` (homepage) or `/lp/audit` (LP).

**PROBLEM:** The homepage path loses the domain the user already entered. They have to enter it AGAIN in onboarding.

**PROPOSED:** Pass domain as URL param: `/auth/signup?domain=acme-store.com`. Onboarding pre-fills step 1 and auto-advances to step 2. The user already entered their domain — don't make them do it again.

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

Never: "Get Started", "Learn More", "Sign Up", "Try Free"

---

## Number Formatting

All financial numbers should follow these rules:
- Always use the minus sign character `−` (U+2212), not hyphen `-`
- Always show ranges: `−$18k–$42k/mo`
- Always include time unit: `/month` or `/mo`
- Use `k` for thousands, `m` for millions — never spell out
- Confidence ranges when shown: `94% confidence`

---

## i18n Priority

All copy changes must be made in this order:
1. `en.json` (canonical)
2. `pt-BR.json` (primary market)
3. `es.json`
4. `de.json`

The `deepmerge` with English fallback means untranslated keys will show English until translated. This is acceptable for launch — better than blocking on translations.

---

## Mobile Considerations

- Hero: headline should be max 2 lines on 375px width
- MiniCalc: full-width inputs, stacked vertically
- Product Tour: tab icons only (no labels) on mobile — already implemented
- Problem cards: stack vertically, no sticky-stack on mobile
- Outcome bento: single column on mobile — already implemented
- Final CTA: full-width button, centered

---

## Implementation Order

| Phase | What | Pages affected | Effort |
|-------|------|---------------|--------|
| **1** | Rewrite hero copy (both pages) | `/`, `/lp` | 2h |
| **2** | Move MiniCalc to position 3 | `/` | 1h |
| **3** | Add social proof strip | `/` | 30min |
| **4** | Rewrite final CTA section | `/` | 30min |
| **5** | Reframe feature bento cards (copy only) | `/` | 2h |
| **6** | Replace Solution Layers content | `/` | 2h |
| **7** | Create stripped /lp (5 sections only) | `/lp` | 4h |
| **8** | Simplify onboarding (7→4 steps) | `/app/onboarding` | 8h |
| **9** | Pass domain from MiniCalc to signup | `/auth/signup`, onboarding | 2h |
| **10** | Simplify LP lead form (4→3 steps) | `/lp/audit` | 3h |
| **11** | Replace persona cards | `/` | 2h |
| **12** | Reduce FAQ to 3 items | `/` | 30min |

**Total estimated: ~28 hours of implementation**

---

## Success Metrics

| Metric | Current (baseline) | Target |
|--------|-------------------|--------|
| Hero → MiniCalc scroll % | Measure | +30% |
| MiniCalc completion rate | Measure | +20% |
| MiniCalc → Signup conversion | Measure | +40% |
| /lp bounce rate | Measure | −25% |
| Onboarding completion rate | Measure | +50% (fewer steps) |
| Time from CTA click to first report | Measure | <2 minutes |
