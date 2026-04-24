# Execution Blueprint — Homepage, Landing Page & Funnel

*Last updated: 2026-04-23 (rev 6 — completed items removed, statuses refreshed)*
*Reference: MARKETING_DIRECTION.md*

---

## How to read this document

Each section follows this format:

```
CURRENT: What exists today (component, position, content)
VERDICT: Keep / Change / Remove / Move / New
DIRECTIVE: Exact change with before→after copy
STATUS: 🔲 Not started / 🟡 Partial
```

Completed items have been removed. For historical record, see git history.

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

## Section 1: Hero — REMAINING

Pills should sharpen toward financial specificity:

| Current problem | Current solution | Sharper problem | Sharper solution |
|-----------------|-----------------|-----------------|------------------|
| "Leads not converting?" | "We show you why" | "Paying for traffic, no conversions?" | "We show you why" |
| "Ad spend not returning?" | "We reveal the leak" | "Scaling ad spend blindly?" | "We quantify the waste" |
| "Nice site, no sales?" | "We find the bottleneck" | "Site looks fine, sales don't?" | "We find what's broken" |
| "Deciding in the dark?" | "Impact in dollars" | "20 problems, no priority?" | "A ranked queue. Fix #1 first." |

**STATUS:** 🔲 Not started (pill copy sharpening only — everything else done)

---

## Section 3: VSL (Video Sales Letter)

**CURRENT:** Component exists (`VSL/index.tsx`). Placeholder video paths (`/videos/vsl.mp4`, `/videos/vsl-poster.webp`). No real video asset.

**STATUS:** 🟡 Partial (component done, awaiting real video asset)

---

## Section 5: Outcomes (REPLACES Features Bento)

**CURRENT:** Position 6. Component: `Features/index.tsx`. Four bento cards: Action Queue, Revenue Leaks, Continuous Watch, Evidence Orbit.

**VERDICT:** Move to position 4 (after Product Tour). Keep the bento visual layout. Reframe each card from "what the product does" to "what happens to your business." AIDA role: **Desire** — concrete dollar amounts make the visitor want this for themselves.

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

## Section 6: MiniCalculator (MOVED UP)

**CURRENT:** Position 11 (second to last, before CallToAction). Component: `MiniCalculator/index.tsx`

**VERDICT:** Move to position 5 — after Outcomes, before safety net sections. AIDA role: **Action**.

**Why position 5, not position 3:** At position 5, the visitor has seen Interest (product tour) and Desire (outcomes with $42k/month examples) — Motivation is high. Fewer total MiniCalc entries, but higher conversion downstream.

**DIRECTIVE:**

| Element | Current | Write |
|---------|---------|-------|
| Eyebrow | "Free instant diagnostic" | "FREE DIAGNOSTIC" |
| Tagline | "Try Vestigio on your own domain — no signup, no card." | Remove |
| Title | "See what you're leaving on the table" | "How much are you losing right now?" |
| Subtitle | "Enter your website URL to get a free snapshot of potential revenue leaks." | "Enter your domain. No signup. No card. 60 seconds." |
| CTA | "Run Free Diagnostic" | Keep |

**STATUS:** 🔲 Not started (position change + copy rewrite)

---

## Section 7: Problem Statement (REPLACES Solution Layers)

**CURRENT:** Position 4. Component: `SolutionLayers/index.tsx`. Three sticky-stack cards explaining Discover → Prioritize → Validate.

**VERDICT:** Replace content. Keep the sticky-stack visual treatment. Change from product process to user consequence. Moves to position 6.

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

**Visual:** Keep the sticky-stack animation. Remove the agentic chat flow diagram.

**STATUS:** 🔲 Not started

---

## Section 8: Use Cases (REPLACES FeaturesWithImage)

**CURRENT:** Position 5. Component: `FeaturesWithImage/index.tsx`. Hidden on mobile. 5 cards explaining product surfaces.

**VERDICT:** Replace with persona-driven scenarios. Make visible on mobile.

**DIRECTIVE:**

| Element | Current | Write |
|---------|---------|-------|
| Eyebrow | "Use Cases" | "BUILT FOR" |
| Title | "Audit, prioritize, recover — every layer of your funnel" | "Operators who won't scale blind" |

**3 persona scenarios:**

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

**Visual:** Clean cards, no icons. Just the quote + answer.

**STATUS:** 🔲 Not started

---

## Section 9: Counter / Value Props

**CURRENT:** Position 7. Component: `Counter/index.tsx`. Bento grid with 6 items.

**VERDICT:** Simplify to 3 items.

**DIRECTIVE:**

```
[4X ROI Guarantee]     [First diagnostic in 60s]     [15,000+ signals per cycle]
You literally can't     Enter your domain,            Automated. Continuous.
lose.                   see results immediately.      No manual review needed.
```

Remove: Quick Start (redundant), Vestigio Pulse (save for later), Integrations (too early).

**STATUS:** 🔲 Not started

---

## Section 11: Testimonial Cards / Success Stories

**CURRENT:** Position 9. Component: `Testimonials/index.tsx`. Carousel with 5 generic industry cards (placeholder stats unrelated to Vestigio).

**VERDICT:** Replace with real customer outcomes or honest counter.

**DIRECTIVE:**

If real customers exist:
```
"[Company name] found $67k/month in recoverable revenue in their first cycle."
— [Name], [Role]
```

If no real customers yet:
```
127 companies have run their first diagnostic.
```

**STATUS:** 🔲 Not started

---

## Section 12: FAQ

**CURRENT:** Position 10. Component: `FAQ/index.tsx`. 4 questions.

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

## Section 13: Final CTA

**CURRENT:** Component: `CallToAction/index.tsx`.
- Title: "Ready to put your platform on autopilot?" ← AVOID words
- Primary CTA: "Get started free" ← should be "Run Free Diagnostic"
- Secondary CTA: "Try live demo" ← one action only

**VERDICT:** Rewrite. One CTA only.

**DIRECTIVE:**

```
Title:    "The money is leaving now."
Subtitle: "Every day without visibility is revenue you don't recover."
CTA:      [Run Free Diagnostic]
Micro:    "You can be looking at your first diagnostic in 60 seconds."
```

Remove secondary CTA. One action only.

**STATUS:** 🔲 Not started

---

## Homepage Section Order

**CURRENT ORDER (Home/index.tsx):**
1. Hero ✅
2. Social Proof Strip ✅
3. VSL 🟡
4. Product Tour ✅
5. ClientGallery ✅
6. SolutionLayers
7. FeaturesWithImage
8. Features
9. Counter
10. VideoTestimonials ✅ (real client videos from R2 CDN)
11. Testimonials ← placeholder, should replace
12. FAQ
13. MiniCalculator ← wrong position
14. (CallToAction missing from composition)

**TARGET ORDER (AIDA-aligned):**
1. Hero ✅ — **Attention**: loss-frame, curiosity gap
2. Social Proof Strip ✅ — **Attention** reinforcement
3. VSL 🟡 — **Attention → Interest** bridge
4. Product Tour ✅ — **Interest**: "this is how it works"
5. Outcomes (Features bento) — **Desire**: dollar amounts
6. MiniCalculator (MOVED from 13) — **Action**: "now test on your domain"
7. ClientGallery — social proof strip (quiet)
8. Problem Statement (rewritten SolutionLayers) — safety net
9. Use Cases (rewritten FeaturesWithImage) — safety net
10. Counter (reduced to 3 items) — safety net
11. Video Testimonials ✅ — real client social proof
12. FAQ (reduced to 3 questions) — objection handling
13. CallToAction (rewritten) — final action

**Removed until real content available:**
- Success Stories (generic placeholder stats)

---

# PART 2 — LANDING PAGE (/lp)

**Audience:** Paid traffic — e-commerce focused (clicked an ad with a financial promise)
**Job:** Convert. One action. Match the ad promise.
**Tone:** Direct financial confrontation

**Total scroll:** 2 screens maximum. No features, no process, no FAQ.

---

## Section 1: Hero + CTA — REMAINING

The /lp currently renders the full homepage (all sections). It should be stripped to 5 sections only:

1. Hero (with LP-specific copy) ✅
2. MiniCalculator (immediate interaction)
3. "What your first diagnostic shows" (3 checkmark rows)
4. One proof point (stat or real customer quote)
5. Final CTA (repeat)

**Visual:** Minimal. Dark bg, white text, emerald CTA. No pills, no animation on LP hero.

**STATUS:** 🟡 Partial (hero done, page structure not stripped yet)

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
2. → `/auth/signup`
3. After auth → `/app/onboarding` (7-step form)
4. Step 7: Plan selection → Paddle checkout
5. After payment → redirect to `/app/inventory`

**DIRECTIVE:** Simplify to 4 steps (1 question per screen):

**Step 1: Domain**
```
What domain should we diagnose?
[________________________]
☐ I own or manage this domain
[Continue]
"We only crawl public pages. No access to your code or data."
```

**Step 2: Business type + Conversion model** (4 large cards, tap to select)
```
What kind of business?
[Ecommerce]  [SaaS]  [Lead Gen]  [Hybrid]
← tapping reveals: "How do customers complete a purchase?"
[Online checkout]  [WhatsApp/Chat]  [Form/Contact]
```

**Step 3: Monthly revenue**
```
What's your approximate monthly revenue?
[________________________]
[Continue]
"This helps us calibrate impact estimates."
```

**Step 4: Plan selection** (3 cards, one recommended)
```
Pick the plan that matches your revenue at risk.
[Monthly / Annual ← 20% off]
[Starter $99]  [Pro $199 ★]  [Max $399]
```

**Result: 7 steps → 4 steps. Zero scrolling per step.**

**STATUS:** 🔲 Not started

---

## LP CTA → Lead Funnel

**CURRENT:** 4-step form (org, domain, metrics, email)

**DIRECTIVE:** Simplify to 3 steps:

**Step 1:** Domain + ownership checkbox
**Step 2:** Revenue (conversion model inferred from crawl signals)
**Step 3:** Email only (no phone)

**Result: 4 steps → 3 steps. Faster to value.**

Result page: Keep the 5-visible + 10-blurred pattern.

**STATUS:** 🔲 Not started

---

# PART 4 — CROSS-CUTTING DIRECTIVES

---

## CTA Consistency

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

- Always use minus sign `−` (U+2212), not hyphen `-`
- Always show ranges: `−$18k–$42k/mo`
- Always include time unit: `/month` or `/mo`
- Use `k` for thousands, `m` for millions
- Confidence ranges when shown: `94% confidence`

---

## Mobile Considerations

- Hero: headline should be max 2 lines on 375px width
- MiniCalc: full-width inputs, stacked vertically
- Product Tour: tab icons only (no labels) on mobile — done
- Problem cards: stack vertically, no sticky-stack on mobile
- Outcome bento: single column on mobile — done
- Final CTA: full-width button, centered

---

## Implementation Order

| Phase | What | Pages | Status |
|-------|------|-------|--------|
| **4** | ~~Move MiniCalc to position 5~~ → Added copy after HomeBigCard | `/`, `/lp` | ✅ |
| **5** | Rewrite final CTA section | `/`, `/lp` | ✅ |
| **6** | Reframe feature bento cards (copy only) | `/` | ✅ |
| **7** | Replace Solution Layers content | `/` | 🔲 |
| **8** | Replace persona cards (FeaturesWithImage) | `/` | 🔲 |
| **9** | Reduce Counter to 3 items | `/` | 🔲 |
| **10** | Reduce FAQ to 3 questions | `/` | 🔲 |
| **11** | Replace Success Stories (real data or counter) | `/` | 🔲 |
| **12** | Strip /lp to 5 sections only | `/lp` | 🔲 |
| **13** | Simplify onboarding (7→4 steps) | `/app/onboarding` | 🔲 |
| **14** | Simplify LP lead form (4→3 steps) | `/lp/audit` | 🔲 |

---

## Known Issues (not yet fixed)

| Issue | Impact | Effort |
|-------|--------|--------|
| Magic Link signup doesn't collect user name | Users have no name | Medium |
| Apple Sign-in configured but no UI button | Dead code | Low |
| LP result page mixes English and Portuguese | Confusing for non-PT visitors | Medium |
| Blurred findings don't show financial impact | Missed FOMO opportunity | Low |
| No upgrade triggers for Maps/AI Chat/Integrations | Starter users miss Pro features | Medium |
| Paddle checkout double-open race condition | `setTimeout(1500ms)` is fragile | Low |
