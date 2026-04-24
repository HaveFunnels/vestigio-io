# Execution Blueprint — Homepage, Landing Page & Funnel

*Last updated: 2026-04-24 (rev 7 — completed phases 4-8 removed)*
*Reference: MARKETING_DIRECTION.md*

---

## How to read this document

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

**CURRENT:** Component exists (`VSL/index.tsx`). Placeholder video paths. No real video asset.

**STATUS:** 🟡 Partial (component done, awaiting real video asset)

---

## Section 6: MiniCalculator — copy rewrite

**CURRENT:** MiniCalc copy is still the original. Position already has a copy after HomeBigCard (done) + original at bottom.

**DIRECTIVE:**

| Element | Current | Write |
|---------|---------|-------|
| Eyebrow | "Free instant diagnostic" | "FREE DIAGNOSTIC" |
| Tagline | "Try Vestigio on your own domain — no signup, no card." | Remove |
| Title | "See what you're leaving on the table" | "How much are you losing right now?" |
| Subtitle | "Enter your website URL to get a free snapshot of potential revenue leaks." | "Enter your domain. No signup. No card. 60 seconds." |

**STATUS:** 🔲 Not started (copy rewrite only)

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

**CURRENT:** Carousel with 5 generic industry cards (placeholder stats unrelated to Vestigio).

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

**CURRENT:** 4 questions.

**VERDICT:** Reduce to 3 questions.

| # | New Question | New Answer |
|---|---|---|
| 1 | "How is this different from Google Analytics?" | "GA tells you *what* happened. Vestigio tells you *why*, how much it costs, and what to fix first." |
| 2 | "Can I try before paying?" | "Yes. Enter your domain, see your first diagnostic in 60 seconds. No signup, no card." |
| 3 | "How accurate are the financial estimates?" | "Every finding uses confidence ranges, not guesses. Evidence is browser-verified and timestamped." |

**STATUS:** 🔲 Not started

---

## Homepage Section Order

**CURRENT ORDER (Home/index.tsx):**
1. Hero ✅
2. Social Proof Strip ✅
3. VSL 🟡
4. Product Tour ✅
5. ClientGallery ✅
6. MiniCalculator ✅ (copy after HomeBigCard)
7. SolutionLayers ✅ (consequence-driven)
8. FeaturesWithImage ✅ (persona cards)
9. Features ✅ (outcome-first bento)
10. Counter
11. VideoTestimonials ✅
12. Testimonials ← placeholder
13. FAQ
14. MiniCalculator ✅ (original position)
15. CallToAction ✅

---

# PART 2 — LANDING PAGE (/lp)

**Audience:** Paid traffic — e-commerce focused
**Job:** Convert. One action. Match the ad promise.
**Tone:** Direct financial confrontation

**Total scroll:** 2 screens maximum.

---

## LP Structure — strip to 5 sections

The /lp currently renders the full homepage. Strip to:

1. Hero (with LP-specific copy) ✅
2. MiniCalculator (immediate interaction)
3. "What your first diagnostic shows" (3 checkmark rows) 🔲
4. One proof point (stat or real customer quote) 🔲
5. Final CTA (repeat) 🔲

**STATUS:** 🟡 Partial (hero done, page structure not stripped yet)

---

# PART 3 — FUNNEL REDESIGN

---

## Homepage CTA → Signup Flow

**DIRECTIVE:** Simplify from 7 to 4 steps (1 question per screen):

1. Domain + ownership checkbox
2. Business type + conversion model (tap cards)
3. Monthly revenue
4. Plan selection (3 cards, one recommended)

**STATUS:** 🔲 Not started

---

## LP CTA → Lead Funnel

**DIRECTIVE:** Simplify from 4 to 3 steps:

1. Domain + ownership checkbox
2. Revenue (conversion model inferred from crawl)
3. Email only (no phone)

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

Never: "Get Started", "Learn More", "Sign Up", "Try Free", "Run Free Audit"

---

## Number Formatting

- Always use minus sign `−` (U+2212), not hyphen `-`
- Always show ranges: `−$18k–$42k/mo`
- Always include time unit: `/month` or `/mo`
- Use `k` for thousands, `m` for millions
- Confidence ranges when shown: `94% confidence`

---

## Implementation Order

| Phase | What | Status |
|-------|------|--------|
| **9** | Reduce Counter to 3 items | 🔲 |
| **10** | Reduce FAQ to 3 questions | 🔲 |
| **11** | Replace Success Stories (real data or counter) | 🔲 |
| **12** | MiniCalc copy rewrite | 🔲 |
| **13** | Strip /lp to 5 sections only | 🔲 |
| **14** | Simplify onboarding (7→4 steps) | 🔲 |
| **15** | Simplify LP lead form (4→3 steps) | 🔲 |

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
