// ──────────────────────────────────────────────
// Copy & CRO Guidelines Knowledge Base
//
// Foundation for the Copy Analysis Pack (Wave 3.10).
// The Haiku LLM receives a subset of these guidelines
// when analyzing each page, and cites specific guideline
// IDs in its findings.
//
// Sources:
//   - Copywriting best practices (headline formulas, CTA, style)
//   - Page CRO (7 conversion dimensions)
//   - Marketing psychology (behavioral economics, cognitive biases)
//
// Used by: copy-analysis engine, Haiku prompt builder, findings UI.
// ──────────────────────────────────────────────

// ─── Types ──────────────────────────────────────

export type GuidelineCategory =
  | 'value_proposition'
  | 'headline'
  | 'cta'
  | 'social_proof'
  | 'trust_signals'
  | 'objection_handling'
  | 'urgency_scarcity'
  | 'copy_style'
  | 'page_structure'
  | 'navigation'
  | 'pricing_psychology'
  | 'above_fold'
  | 'funnel_alignment'
  | 'onboarding';

export type PageType =
  | 'homepage'
  | 'landing_page'
  | 'pricing'
  | 'product'
  | 'checkout'
  | 'about'
  | 'feature'
  | 'blog'
  | 'error'
  | 'onboarding'
  | 'all_commercial';

export type FunnelStage = 'awareness' | 'consideration' | 'decision' | 'retention';

export type CroDimension =
  | 'value_prop_clarity'       // Rank 1 — highest impact
  | 'headline_effectiveness'   // Rank 2
  | 'cta_hierarchy'            // Rank 3
  | 'visual_hierarchy'         // Rank 4
  | 'trust_signals'            // Rank 5
  | 'objection_handling'       // Rank 6
  | 'friction_reduction';      // Rank 7

export interface CopyGuideline {
  /** Unique identifier cited in findings, e.g. "hero_value_prop_5s" */
  id: string;
  /** Thematic category */
  category: GuidelineCategory;
  /** The principle in ~1 sentence */
  rule: string;
  /** What good looks like */
  good_example: string;
  /** What bad looks like */
  bad_example: string;
  /** Page types where this guideline applies */
  page_types: PageType[];
  /** Funnel stages where this applies */
  funnel_stages: FunnelStage[];
  /** Relevant psychological / behavioral models */
  psychology_models?: string[];
  /** Which CRO dimension this maps to */
  cro_dimension?: CroDimension;
  /** Framework origin for traceability */
  source: string;
}

// ─── Guidelines ─────────────────────────────────

export const COPY_GUIDELINES: CopyGuideline[] = [

  // ═══════════════════════════════════════════════
  // COPYWRITING — Core Principles (1-9)
  // ═══════════════════════════════════════════════

  {
    id: 'vp_5_second_rule',
    category: 'value_proposition',
    rule: 'A first-time visitor must understand what you do, who it is for, and why it matters within 5 seconds of landing.',
    good_example: '"Vestigio finds hidden revenue leaks in your SaaS stack — automatically."',
    bad_example: '"Welcome to our innovative platform. We leverage cutting-edge technology to deliver world-class solutions."',
    page_types: ['homepage', 'landing_page', 'product', 'feature'],
    funnel_stages: ['awareness', 'consideration'],
    psychology_models: ['cognitive_load', 'first_impression_bias'],
    cro_dimension: 'value_prop_clarity',
    source: 'Copywriting / 5-Second Rule',
  },
  {
    id: 'benefits_over_features',
    category: 'value_proposition',
    rule: 'Lead with outcomes the customer cares about, not product capabilities. Features tell; benefits sell.',
    good_example: '"Cut SaaS waste by 23% in 30 days" (outcome)',
    bad_example: '"AI-powered SaaS spend analysis dashboard" (feature)',
    page_types: ['homepage', 'landing_page', 'product', 'feature', 'pricing'],
    funnel_stages: ['awareness', 'consideration'],
    psychology_models: ['goal_gradient'],
    cro_dimension: 'value_prop_clarity',
    source: 'Copywriting / Benefits > Features',
  },
  {
    id: 'specificity_over_vagueness',
    category: 'value_proposition',
    rule: 'Use concrete numbers and specifics instead of abstract claims. Specific = credible; vague = ignorable.',
    good_example: '"328 companies saved an average of $41K/year"',
    bad_example: '"Many companies save significant amounts of money"',
    page_types: ['all_commercial'],
    funnel_stages: ['awareness', 'consideration', 'decision'],
    psychology_models: ['anchoring_effect'],
    cro_dimension: 'value_prop_clarity',
    source: 'Copywriting / Specificity Principle',
  },
  {
    id: 'customer_language',
    category: 'copy_style',
    rule: 'Mirror the exact words your buyers use to describe their problems and desired outcomes, not internal company jargon.',
    good_example: '"Stop overpaying for tools nobody uses" (customer language)',
    bad_example: '"Optimize your technology expenditure portfolio" (company language)',
    page_types: ['all_commercial'],
    funnel_stages: ['awareness', 'consideration'],
    psychology_models: ['processing_fluency'],
    cro_dimension: 'value_prop_clarity',
    source: 'Copywriting / Customer Language',
  },
  {
    id: 'one_idea_per_section',
    category: 'page_structure',
    rule: 'Each section should communicate exactly one idea. Multiple ideas per section dilute the message and confuse skimmers.',
    good_example: 'Hero = value prop. Next section = social proof. Next = how it works.',
    bad_example: 'Hero section that pitches the product, lists features, shows testimonials, and has a pricing table.',
    page_types: ['homepage', 'landing_page', 'product', 'feature'],
    funnel_stages: ['awareness', 'consideration'],
    cro_dimension: 'visual_hierarchy',
    source: 'Copywriting / One Idea Per Section',
  },
  {
    id: 'simple_words',
    category: 'copy_style',
    rule: 'Use simple, conversational words. Replace corporate jargon: "use" not "utilize", "help" not "facilitate", "use" not "leverage".',
    good_example: '"We help you find and cancel wasted subscriptions."',
    bad_example: '"We facilitate the identification and remediation of underutilized SaaS expenditures."',
    page_types: ['all_commercial'],
    funnel_stages: ['awareness', 'consideration', 'decision'],
    cro_dimension: 'value_prop_clarity',
    source: 'Copywriting / Simplicity',
  },
  {
    id: 'active_voice',
    category: 'copy_style',
    rule: 'Use active voice. The subject should perform the action. Passive voice weakens urgency and obscures who does what.',
    good_example: '"Vestigio scans your stack in 60 seconds."',
    bad_example: '"Your stack is scanned by our platform in approximately 60 seconds."',
    page_types: ['all_commercial'],
    funnel_stages: ['awareness', 'consideration', 'decision'],
    cro_dimension: 'value_prop_clarity',
    source: 'Copywriting / Active Voice',
  },
  {
    id: 'confident_copy',
    category: 'copy_style',
    rule: 'Remove hedge words: "almost", "very", "really", "quite", "just", "basically", "actually". They signal uncertainty.',
    good_example: '"Reduce SaaS waste by 30%."',
    bad_example: '"You can actually reduce SaaS waste by almost 30% or so."',
    page_types: ['all_commercial'],
    funnel_stages: ['awareness', 'consideration', 'decision'],
    cro_dimension: 'value_prop_clarity',
    source: 'Copywriting / Confident Copy',
  },
  {
    id: 'show_dont_tell',
    category: 'copy_style',
    rule: 'Describe concrete outcomes instead of using adjectives. "Fast" means nothing; "loads in 0.8s" means everything.',
    good_example: '"See your first finding in 90 seconds — no code, no integration."',
    bad_example: '"Our incredibly fast and powerful platform is truly amazing."',
    page_types: ['all_commercial'],
    funnel_stages: ['awareness', 'consideration'],
    cro_dimension: 'value_prop_clarity',
    source: 'Copywriting / Show, Don\'t Tell',
  },

  // ═══════════════════════════════════════════════
  // COPYWRITING — 13 Headline Formulas (10)
  // ═══════════════════════════════════════════════

  {
    id: 'hl_outcome_without_pain',
    category: 'headline',
    rule: 'Headline formula: "{Outcome} without {pain}". Promises the desired result while removing the feared cost.',
    good_example: '"Cut SaaS costs without losing the tools your team loves"',
    bad_example: '"SaaS Cost Optimization Platform"',
    page_types: ['homepage', 'landing_page', 'feature'],
    funnel_stages: ['awareness'],
    psychology_models: ['loss_aversion', 'framing_effect'],
    cro_dimension: 'headline_effectiveness',
    source: 'Copywriting / Headline Formulas',
  },
  {
    id: 'hl_outcome_by_mechanism',
    category: 'headline',
    rule: 'Headline formula: "{Outcome} by {mechanism}". Makes the promise credible by revealing the method.',
    good_example: '"Recover $41K/year by detecting zombie subscriptions automatically"',
    bad_example: '"Save money on software"',
    page_types: ['homepage', 'landing_page', 'feature'],
    funnel_stages: ['awareness', 'consideration'],
    psychology_models: ['anchoring_effect'],
    cro_dimension: 'headline_effectiveness',
    source: 'Copywriting / Headline Formulas',
  },
  {
    id: 'hl_never_again',
    category: 'headline',
    rule: 'Headline formula: "Never {unpleasant thing} again". Taps into loss aversion by promising permanent relief.',
    good_example: '"Never overpay for unused SaaS seats again"',
    bad_example: '"Better license management"',
    page_types: ['homepage', 'landing_page'],
    funnel_stages: ['awareness'],
    psychology_models: ['loss_aversion'],
    cro_dimension: 'headline_effectiveness',
    source: 'Copywriting / Headline Formulas',
  },
  {
    id: 'hl_pain_question',
    category: 'headline',
    rule: 'Headline formula: "{Question highlighting pain point}?" Makes readers say "yes" internally, opening them to the solution.',
    good_example: '"How much is your team spending on tools nobody uses?"',
    bad_example: '"About Our Solution"',
    page_types: ['homepage', 'landing_page', 'blog'],
    funnel_stages: ['awareness'],
    psychology_models: ['commitment_consistency'],
    cro_dimension: 'headline_effectiveness',
    source: 'Copywriting / Headline Formulas',
  },
  {
    id: 'hl_feature_for_audience',
    category: 'headline',
    rule: 'Headline formula: "{Feature/product} for {audience}". Instantly qualifies the reader and signals relevance.',
    good_example: '"SaaS spend intelligence for finance teams that hate spreadsheets"',
    bad_example: '"Comprehensive Enterprise Solutions"',
    page_types: ['homepage', 'landing_page', 'feature'],
    funnel_stages: ['awareness'],
    cro_dimension: 'headline_effectiveness',
    source: 'Copywriting / Headline Formulas',
  },
  {
    id: 'hl_category_differentiator',
    category: 'headline',
    rule: 'Headline formula: "The {category} that {differentiator}". Positions you within a known category, then breaks the mold.',
    good_example: '"The SaaS audit tool that pays for itself in week one"',
    bad_example: '"Next-Generation Platform"',
    page_types: ['homepage', 'landing_page'],
    funnel_stages: ['awareness', 'consideration'],
    psychology_models: ['anchoring_effect'],
    cro_dimension: 'headline_effectiveness',
    source: 'Copywriting / Headline Formulas',
  },
  {
    id: 'hl_social_proof_number',
    category: 'headline',
    rule: 'Headline formula: "[Number] [people] use [product] to [outcome]". Combines social proof with benefit.',
    good_example: '"328 finance teams use Vestigio to eliminate SaaS waste"',
    bad_example: '"Trusted by Companies Worldwide"',
    page_types: ['homepage', 'landing_page'],
    funnel_stages: ['awareness', 'consideration'],
    psychology_models: ['social_proof', 'bandwagon_effect'],
    cro_dimension: 'headline_effectiveness',
    source: 'Copywriting / Headline Formulas',
  },
  {
    id: 'hl_what_if',
    category: 'headline',
    rule: 'Headline formula: "What if you could {outcome}?" Invites imagination and plants the seed of possibility.',
    good_example: '"What if you could see every wasted dollar in your SaaS stack — tonight?"',
    bad_example: '"Imagine the Possibilities"',
    page_types: ['homepage', 'landing_page'],
    funnel_stages: ['awareness'],
    psychology_models: ['endowment_effect'],
    cro_dimension: 'headline_effectiveness',
    source: 'Copywriting / Headline Formulas',
  },
  {
    id: 'hl_everything_you_need',
    category: 'headline',
    rule: 'Headline formula: "Everything you need to {outcome}". Positions the product as the complete solution.',
    good_example: '"Everything you need to stop SaaS sprawl — in one dashboard"',
    bad_example: '"Our Suite of Products"',
    page_types: ['homepage', 'landing_page', 'product'],
    funnel_stages: ['consideration'],
    psychology_models: ['paradox_of_choice'],
    cro_dimension: 'headline_effectiveness',
    source: 'Copywriting / Headline Formulas',
  },
  {
    id: 'hl_stop_doing',
    category: 'headline',
    rule: 'Headline formula: "Stop {undesirable action}. Start {desirable action}." Creates contrast between old and new world.',
    good_example: '"Stop guessing what your SaaS stack costs. Start knowing."',
    bad_example: '"Transition to Better Software Management"',
    page_types: ['homepage', 'landing_page'],
    funnel_stages: ['awareness'],
    psychology_models: ['loss_aversion', 'framing_effect'],
    cro_dimension: 'headline_effectiveness',
    source: 'Copywriting / Headline Formulas',
  },
  {
    id: 'hl_number_ways',
    category: 'headline',
    rule: 'Headline formula: "{Number} ways to {outcome}". Uses specificity and list-appeal to attract clicks.',
    good_example: '"7 ways Vestigio finds money you are leaving on the table"',
    bad_example: '"Multiple Benefits of Our Platform"',
    page_types: ['blog', 'landing_page', 'feature'],
    funnel_stages: ['awareness', 'consideration'],
    psychology_models: ['anchoring_effect'],
    cro_dimension: 'headline_effectiveness',
    source: 'Copywriting / Headline Formulas',
  },
  {
    id: 'hl_how_to',
    category: 'headline',
    rule: 'Headline formula: "How to {outcome} (even if {objection})". Promises a method and pre-handles a common objection.',
    good_example: '"How to cut SaaS spend 30% (even if you have no idea what tools you are paying for)"',
    bad_example: '"Learn About Cost Optimization"',
    page_types: ['blog', 'landing_page'],
    funnel_stages: ['awareness', 'consideration'],
    psychology_models: ['commitment_consistency'],
    cro_dimension: 'headline_effectiveness',
    source: 'Copywriting / Headline Formulas',
  },
  {
    id: 'hl_get_outcome_timeframe',
    category: 'headline',
    rule: 'Headline formula: "Get {outcome} in {timeframe}". Adds urgency and tangibility with a time anchor.',
    good_example: '"Get your first SaaS savings report in 90 seconds"',
    bad_example: '"Quick and Easy Setup"',
    page_types: ['homepage', 'landing_page', 'product'],
    funnel_stages: ['awareness', 'consideration'],
    psychology_models: ['goal_gradient', 'anchoring_effect'],
    cro_dimension: 'headline_effectiveness',
    source: 'Copywriting / Headline Formulas',
  },

  // ═══════════════════════════════════════════════
  // COPYWRITING — CTA & Structure (11-14)
  // ═══════════════════════════════════════════════

  {
    id: 'cta_formula',
    category: 'cta',
    rule: 'CTA copy should follow: [Action Verb] + [What They Get] + [Qualifier]. The button text should communicate value, not just action.',
    good_example: '"Start My Free Audit", "See My Savings Report", "Get My Dashboard"',
    bad_example: '"Submit", "Sign Up", "Click Here"',
    page_types: ['all_commercial'],
    funnel_stages: ['awareness', 'consideration', 'decision'],
    psychology_models: ['endowment_effect'],
    cro_dimension: 'cta_hierarchy',
    source: 'Copywriting / CTA Formula',
  },
  {
    id: 'cta_weak_labels',
    category: 'cta',
    rule: 'Flag generic CTA labels that communicate no value: "Submit", "Sign Up", "Learn More", "Click Here", "Get Started", "Contact Us". Replace with benefit-driven copy.',
    good_example: '"See How Much You Can Save" instead of "Learn More"',
    bad_example: '"Submit" on a demo request form',
    page_types: ['all_commercial'],
    funnel_stages: ['awareness', 'consideration', 'decision'],
    psychology_models: ['processing_fluency'],
    cro_dimension: 'cta_hierarchy',
    source: 'Copywriting / Weak CTAs',
  },
  {
    id: 'page_section_flow',
    category: 'page_structure',
    rule: 'Commercial pages should follow a persuasion-logical flow: Hero/value prop -> social proof -> problem agitation -> solution/how it works -> features/benefits -> objection handling -> final CTA.',
    good_example: 'Page flows: hero with clear value prop, logos strip, problem section, product tour, testimonials, FAQ, CTA.',
    bad_example: 'Page starts with company history, followed by team bios, then a feature list with no CTA until the footer.',
    page_types: ['homepage', 'landing_page', 'product', 'feature'],
    funnel_stages: ['awareness', 'consideration'],
    cro_dimension: 'visual_hierarchy',
    source: 'Copywriting / Page Structure',
  },
  {
    id: 'filler_phrases',
    category: 'copy_style',
    rule: 'Flag AI-sounding filler phrases that add no information: "That being said", "It\'s worth noting", "At its core", "In today\'s digital landscape", "Harness the power of", "Unlock your potential".',
    good_example: 'Direct, specific copy with no filler.',
    bad_example: '"In today\'s fast-paced digital landscape, it\'s worth noting that at its core, our platform..."',
    page_types: ['all_commercial'],
    funnel_stages: ['awareness', 'consideration', 'decision'],
    cro_dimension: 'value_prop_clarity',
    source: 'Copywriting / Anti-Patterns',
  },

  // ═══════════════════════════════════════════════
  // PAGE CRO — 7 Dimensions (15-21)
  // ═══════════════════════════════════════════════

  {
    id: 'cro_vp_clarity',
    category: 'value_proposition',
    rule: 'The value proposition must pass the 5-second test: a stranger should understand what you sell, who it is for, and why they should care within 5 seconds. Use customer language, not feature specs.',
    good_example: 'Homepage hero: "Find and fix the SaaS subscriptions draining your budget" + subhead with specifics.',
    bad_example: 'Homepage hero: "Welcome to [Company]. We are a leading provider of innovative solutions for modern enterprises."',
    page_types: ['homepage', 'landing_page', 'product'],
    funnel_stages: ['awareness', 'consideration'],
    psychology_models: ['cognitive_load', 'processing_fluency'],
    cro_dimension: 'value_prop_clarity',
    source: 'Page CRO / Value Prop Clarity',
  },
  {
    id: 'cro_headline_effectiveness',
    category: 'headline',
    rule: 'The headline must communicate the core value, be specific enough to differentiate, and match the traffic source (ad copy, email subject, referral context).',
    good_example: 'Ad says "Cut SaaS waste" -> landing page headline: "Cut SaaS waste by 23% — see your report in 90 seconds"',
    bad_example: 'Ad says "Cut SaaS waste" -> landing page headline: "Welcome to Our Platform"',
    page_types: ['homepage', 'landing_page', 'feature', 'product'],
    funnel_stages: ['awareness', 'consideration'],
    cro_dimension: 'headline_effectiveness',
    source: 'Page CRO / Headline Effectiveness',
  },
  {
    id: 'cro_cta_placement',
    category: 'cta',
    rule: 'Every commercial page needs one clear primary CTA visible above the fold. Secondary CTAs may exist but must not compete visually. CTA copy should communicate value, not just action.',
    good_example: 'One prominent green button "Start My Free Audit" above fold, secondary "Watch Demo" as text link.',
    bad_example: 'Three equally-styled buttons above fold: "Free Trial", "Book Demo", "See Pricing" — no hierarchy.',
    page_types: ['homepage', 'landing_page', 'pricing', 'product', 'feature'],
    funnel_stages: ['awareness', 'consideration', 'decision'],
    psychology_models: ['paradox_of_choice', 'hicks_law'],
    cro_dimension: 'cta_hierarchy',
    source: 'Page CRO / CTA Hierarchy',
  },
  {
    id: 'cro_visual_hierarchy',
    category: 'page_structure',
    rule: 'The page must be scannable: clear heading hierarchy (H1 > H2 > H3), sufficient white space, content chunks of 3-4 lines max, supporting visuals that reinforce (not decorate).',
    good_example: 'Short paragraphs, bold key phrases, visual break every 300px, clear H2 section headers.',
    bad_example: 'Wall of text with no headings, stock photos unrelated to content, no white space.',
    page_types: ['all_commercial'],
    funnel_stages: ['awareness', 'consideration', 'decision'],
    cro_dimension: 'visual_hierarchy',
    source: 'Page CRO / Visual Hierarchy',
  },
  {
    id: 'cro_trust_social_proof',
    category: 'social_proof',
    rule: 'Social proof must be specific, attributed, and ideally photographed. "Great product!" is worthless; "Vestigio saved us $41K in Q3 — Sarah Chen, CFO at Acme" is powerful. Include review scores, case study metrics, and security badges.',
    good_example: '"We cut SaaS spend 31% in 60 days" — Maria S., VP Finance at TechCo [photo + logo]',
    bad_example: '"Great product, highly recommended!" — J.D.',
    page_types: ['homepage', 'landing_page', 'pricing', 'product'],
    funnel_stages: ['consideration', 'decision'],
    psychology_models: ['social_proof', 'authority_bias'],
    cro_dimension: 'trust_signals',
    source: 'Page CRO / Trust & Social Proof',
  },
  {
    id: 'cro_objection_handling',
    category: 'objection_handling',
    rule: 'Address the top objections on-page before the visitor has to ask: price/value justification, "will this work for me?", implementation difficulty, data security concerns, and guarantees/refund policy.',
    good_example: 'FAQ section addressing: "How long does setup take?" (5 min), "Is my data safe?" (SOC 2), "What if it doesn\'t work?" (money-back guarantee).',
    bad_example: 'No FAQ. No guarantee mention. Pricing with no context on ROI or value.',
    page_types: ['homepage', 'landing_page', 'pricing', 'product'],
    funnel_stages: ['consideration', 'decision'],
    psychology_models: ['loss_aversion', 'status_quo_bias'],
    cro_dimension: 'objection_handling',
    source: 'Page CRO / Objection Handling',
  },
  {
    id: 'cro_friction_reduction',
    category: 'page_structure',
    rule: 'Minimize friction: reduce form fields to the minimum needed, make next steps obvious, ensure mobile responsiveness, keep load times under 3s. Every unnecessary field or unclear step loses conversions.',
    good_example: 'Signup form: email only. Next step is clearly labeled. Mobile-optimized with tap-friendly targets.',
    bad_example: '12-field form requiring company size, industry, phone number, and job title for a free trial.',
    page_types: ['all_commercial'],
    funnel_stages: ['decision', 'retention'],
    psychology_models: ['bj_fogg_behavior_model', 'paradox_of_choice'],
    cro_dimension: 'friction_reduction',
    source: 'Page CRO / Friction Reduction',
  },

  // ═══════════════════════════════════════════════
  // MARKETING PSYCHOLOGY — Cognitive Biases (22-35)
  // ═══════════════════════════════════════════════

  {
    id: 'psych_anchoring',
    category: 'pricing_psychology',
    rule: 'The first number a visitor sees frames all subsequent price perception. Show the higher/enterprise price first, or anchor with cost-of-inaction, so the actual price feels reasonable.',
    good_example: '"Companies lose $147K/year to SaaS waste. Vestigio costs $99/month." (anchor: $147K)',
    bad_example: 'Showing the cheapest plan first with no context on value or cost of inaction.',
    page_types: ['pricing', 'landing_page', 'homepage'],
    funnel_stages: ['consideration', 'decision'],
    psychology_models: ['anchoring_effect'],
    cro_dimension: 'objection_handling',
    source: 'Marketing Psychology / Anchoring',
  },
  {
    id: 'psych_framing',
    category: 'copy_style',
    rule: 'The same information, framed differently, produces different decisions. Frame in terms of what the reader gains or — even more powerfully — what they stand to lose.',
    good_example: '"Don\'t lose $3,400/month to forgotten subscriptions" (loss frame)',
    bad_example: '"Save money on subscriptions" (vague gain frame)',
    page_types: ['all_commercial'],
    funnel_stages: ['awareness', 'consideration', 'decision'],
    psychology_models: ['framing_effect', 'loss_aversion'],
    cro_dimension: 'value_prop_clarity',
    source: 'Marketing Psychology / Framing Effect',
  },
  {
    id: 'psych_loss_aversion',
    category: 'value_proposition',
    rule: 'Losses are psychologically weighted ~2x more than equivalent gains. "Don\'t lose $X/mo" is more motivating than "Save $X/mo". Use loss framing for high-stakes decisions.',
    good_example: '"You are losing $3,400/month to SaaS waste. Stop the bleed."',
    bad_example: '"You could potentially save some money on your subscriptions."',
    page_types: ['homepage', 'landing_page', 'pricing'],
    funnel_stages: ['awareness', 'consideration'],
    psychology_models: ['loss_aversion', 'prospect_theory'],
    cro_dimension: 'value_prop_clarity',
    source: 'Marketing Psychology / Loss Aversion',
  },
  {
    id: 'psych_social_proof',
    category: 'social_proof',
    rule: 'People follow the crowd, especially under uncertainty. Use specific numbers ("328 teams" not "many companies"), named individuals, and recognizable logos. The more similar the proof is to the reader, the stronger it is.',
    good_example: '"Join 328 finance teams who cut SaaS waste by 23% on average" + named logos',
    bad_example: '"Trusted by thousands of happy customers around the world"',
    page_types: ['all_commercial'],
    funnel_stages: ['awareness', 'consideration', 'decision'],
    psychology_models: ['social_proof', 'bandwagon_effect'],
    cro_dimension: 'trust_signals',
    source: 'Marketing Psychology / Social Proof',
  },
  {
    id: 'psych_scarcity',
    category: 'urgency_scarcity',
    rule: 'Limited availability increases perceived value — but only when authentic. Fake countdown timers destroy trust. Use real scarcity: limited beta spots, seasonal pricing, capacity constraints.',
    good_example: '"Only 12 onboarding slots left this quarter — we cap at 50 to ensure white-glove setup."',
    bad_example: '"HURRY! Only 2 left! (timer resets on page refresh)"',
    page_types: ['landing_page', 'pricing', 'checkout'],
    funnel_stages: ['decision'],
    psychology_models: ['scarcity_heuristic'],
    cro_dimension: 'cta_hierarchy',
    source: 'Marketing Psychology / Scarcity',
  },
  {
    id: 'psych_authority',
    category: 'trust_signals',
    rule: 'Expert endorsements, certifications, "as seen in" logos, and industry awards increase credibility. Position authority signals near decision points (pricing, CTA).',
    good_example: '"SOC 2 Type II certified. As featured in TechCrunch, Forbes, and SaaStr."',
    bad_example: 'No trust badges anywhere. No certifications mentioned. No media mentions.',
    page_types: ['homepage', 'landing_page', 'pricing', 'about'],
    funnel_stages: ['consideration', 'decision'],
    psychology_models: ['authority_bias'],
    cro_dimension: 'trust_signals',
    source: 'Marketing Psychology / Authority Bias',
  },
  {
    id: 'psych_reciprocity',
    category: 'funnel_alignment',
    rule: 'Give genuine value before asking for anything in return. A free tool, calculator, or audit creates a sense of obligation and demonstrates competence simultaneously.',
    good_example: '"Free SaaS Waste Calculator — see your estimated savings in 30 seconds. No email required."',
    bad_example: '"Fill out this 15-field form to talk to our sales team."',
    page_types: ['homepage', 'landing_page', 'blog'],
    funnel_stages: ['awareness'],
    psychology_models: ['reciprocity'],
    cro_dimension: 'friction_reduction',
    source: 'Marketing Psychology / Reciprocity',
  },
  {
    id: 'psych_commitment_consistency',
    category: 'funnel_alignment',
    rule: 'A small "yes" makes a big "yes" more likely. Use micro-commitments (quiz, calculator, free tool) before asking for signup or purchase. Foot-in-the-door technique.',
    good_example: '"Take the 30-second SaaS health quiz" -> show results -> "Want the full report? Enter your email."',
    bad_example: 'Going straight from awareness to "Buy our $500/mo enterprise plan".',
    page_types: ['homepage', 'landing_page', 'onboarding'],
    funnel_stages: ['awareness', 'consideration'],
    psychology_models: ['commitment_consistency', 'foot_in_the_door'],
    cro_dimension: 'friction_reduction',
    source: 'Marketing Psychology / Commitment & Consistency',
  },
  {
    id: 'psych_paradox_of_choice',
    category: 'navigation',
    rule: 'Too many options cause decision paralysis (Hick\'s Law). Limit navigation items to 5-7, pricing tiers to 3-4, and CTAs per viewport to 1-2. Recommend one default option.',
    good_example: '3 pricing tiers with the middle one highlighted as "Most Popular".',
    bad_example: '6 pricing tiers with 40+ feature rows and no recommendation.',
    page_types: ['pricing', 'homepage', 'landing_page'],
    funnel_stages: ['consideration', 'decision'],
    psychology_models: ['paradox_of_choice', 'hicks_law'],
    cro_dimension: 'friction_reduction',
    source: 'Marketing Psychology / Paradox of Choice',
  },
  {
    id: 'psych_endowment',
    category: 'onboarding',
    rule: 'Once users feel psychological ownership of something, they do not want to lose it. Free trials, personalized dashboards, and "your report is ready" language trigger the endowment effect.',
    good_example: '"Your personalized savings report is ready. Don\'t lose your findings — create a free account to save them."',
    bad_example: '"Sign up for a free trial to see if our product might work for you."',
    page_types: ['onboarding', 'landing_page', 'product'],
    funnel_stages: ['consideration', 'decision', 'retention'],
    psychology_models: ['endowment_effect'],
    cro_dimension: 'friction_reduction',
    source: 'Marketing Psychology / Endowment Effect',
  },
  {
    id: 'psych_goal_gradient',
    category: 'onboarding',
    rule: 'People accelerate effort as they approach a goal. Show progress bars, "step 2 of 3", and "almost done" cues during onboarding and checkout to reduce abandonment.',
    good_example: '"Step 2 of 3 — you are 67% done. Just connect your SSO and we will start scanning."',
    bad_example: 'Multi-step signup with no indication of how many steps remain.',
    page_types: ['onboarding', 'checkout'],
    funnel_stages: ['decision', 'retention'],
    psychology_models: ['goal_gradient', 'zeigarnik_effect'],
    cro_dimension: 'friction_reduction',
    source: 'Marketing Psychology / Goal Gradient',
  },
  {
    id: 'psych_zero_price',
    category: 'pricing_psychology',
    rule: '"Free" is disproportionately attractive — it eliminates risk entirely. Emphasize "free" in trial CTAs. "Start free" outperforms "Start trial". But clarify what happens after free ends.',
    good_example: '"Start free — no credit card required. Upgrade only if you love it."',
    bad_example: '"Start your 14-day trial" (doesn\'t say free, doesn\'t address post-trial)',
    page_types: ['pricing', 'homepage', 'landing_page'],
    funnel_stages: ['consideration', 'decision'],
    psychology_models: ['zero_price_effect'],
    cro_dimension: 'cta_hierarchy',
    source: 'Marketing Psychology / Zero-Price Effect',
  },
  {
    id: 'psych_charm_pricing',
    category: 'pricing_psychology',
    rule: 'Charm pricing ($99 vs $100, $9.99 vs $10) leverages left-digit bias — the brain encodes the first digit disproportionately. Use .99 or .95 endings for consumer-facing prices.',
    good_example: '$99/month (reads as "ninety-something")',
    bad_example: '$100/month (reads as "a hundred dollars")',
    page_types: ['pricing'],
    funnel_stages: ['decision'],
    psychology_models: ['charm_pricing', 'left_digit_bias'],
    cro_dimension: 'objection_handling',
    source: 'Marketing Psychology / Charm Pricing',
  },

  // ═══════════════════════════════════════════════
  // MARKETING PSYCHOLOGY — Pricing (35-37)
  // ═══════════════════════════════════════════════

  {
    id: 'psych_rule_of_100',
    category: 'pricing_psychology',
    rule: 'For items under $100, show discounts as percentages (25% off). For items over $100, show dollar amounts ($50 off). Whichever looks like the bigger number wins.',
    good_example: '"$29/mo plan: 20% off" (percentage looks bigger). "$499/mo plan: Save $100" (dollar looks bigger).',
    bad_example: '"$499/mo plan: 20% off" (20% does not feel as large as $100 off).',
    page_types: ['pricing', 'checkout'],
    funnel_stages: ['decision'],
    psychology_models: ['rule_of_100', 'framing_effect'],
    cro_dimension: 'objection_handling',
    source: 'Marketing Psychology / Rule of 100',
  },
  {
    id: 'psych_good_better_best',
    category: 'pricing_psychology',
    rule: 'Use 3 pricing tiers (Good/Better/Best) with the middle tier highlighted as recommended. The highest tier serves as a decoy that makes the middle tier look reasonable.',
    good_example: '3 tiers: Starter ($29), Growth ($79 — "Most Popular"), Enterprise ($199). Growth column highlighted.',
    bad_example: 'Single pricing option with no context, or 5+ tiers creating decision paralysis.',
    page_types: ['pricing'],
    funnel_stages: ['decision'],
    psychology_models: ['decoy_effect', 'anchoring_effect', 'paradox_of_choice'],
    cro_dimension: 'objection_handling',
    source: 'Marketing Psychology / Good-Better-Best',
  },
  {
    id: 'psych_mental_accounting',
    category: 'pricing_psychology',
    rule: 'Reframe prices into smaller mental accounts. "$1/day" feels cheaper than "$30/month" which feels cheaper than "$360/year", even though $360/year is the best deal.',
    good_example: '"Less than your daily coffee — $2.99/day" or "Just $99/month (less than one wasted subscription)"',
    bad_example: '"$1,188 annual subscription" with no per-month or per-day breakdown.',
    page_types: ['pricing', 'landing_page'],
    funnel_stages: ['decision'],
    psychology_models: ['mental_accounting', 'framing_effect'],
    cro_dimension: 'objection_handling',
    source: 'Marketing Psychology / Mental Accounting',
  },

  // ═══════════════════════════════════════════════
  // MARKETING PSYCHOLOGY — Behavioral (38-43)
  // ═══════════════════════════════════════════════

  {
    id: 'psych_peak_end',
    category: 'page_structure',
    rule: 'People judge experiences by their peak moment and their ending. Nail the first impression (hero) and the last impression (final CTA section/footer). A weak ending undermines everything before it.',
    good_example: 'Strong hero with clear value prop, strong final section: compelling CTA + guarantee + urgency.',
    bad_example: 'Great hero, then the page trails off into a generic footer with no final CTA or reinforcement.',
    page_types: ['homepage', 'landing_page', 'product', 'feature'],
    funnel_stages: ['awareness', 'consideration'],
    psychology_models: ['peak_end_rule'],
    cro_dimension: 'visual_hierarchy',
    source: 'Marketing Psychology / Peak-End Rule',
  },
  {
    id: 'psych_zeigarnik',
    category: 'onboarding',
    rule: 'Incomplete tasks stay in memory and create psychological tension to finish. Use progress bars, checklists, and "you are almost done" messaging to pull users through multi-step flows.',
    good_example: '"Your account is 80% set up. Complete these 2 steps to start seeing savings."',
    bad_example: 'Onboarding with no progress indicator and no sense of what is left.',
    page_types: ['onboarding', 'checkout'],
    funnel_stages: ['decision', 'retention'],
    psychology_models: ['zeigarnik_effect'],
    cro_dimension: 'friction_reduction',
    source: 'Marketing Psychology / Zeigarnik Effect',
  },
  {
    id: 'psych_ikea_effect',
    category: 'onboarding',
    rule: 'People value things they helped create. Let users customize, configure, or build something during onboarding — they will value the result more and be less likely to churn.',
    good_example: '"Name your workspace, choose your alert preferences, invite your team" — makes it feel like theirs.',
    bad_example: 'Fully automated onboarding where the user clicks nothing and sees a pre-built dashboard.',
    page_types: ['onboarding', 'product'],
    funnel_stages: ['retention'],
    psychology_models: ['ikea_effect'],
    cro_dimension: 'friction_reduction',
    source: 'Marketing Psychology / IKEA Effect',
  },
  {
    id: 'psych_fogg_behavior',
    category: 'page_structure',
    rule: 'Behavior = Motivation x Ability x Prompt (BJ Fogg). For every desired action: increase motivation (benefits, social proof), increase ability (reduce friction, simplify), and provide a clear prompt (CTA).',
    good_example: 'High motivation (loss-framed value prop) + high ability (1-click signup) + clear prompt ("Start Free Audit").',
    bad_example: 'Low motivation (vague benefit) + low ability (12-field form) + weak prompt ("Submit").',
    page_types: ['all_commercial'],
    funnel_stages: ['awareness', 'consideration', 'decision'],
    psychology_models: ['bj_fogg_behavior_model'],
    cro_dimension: 'friction_reduction',
    source: 'Marketing Psychology / BJ Fogg Model',
  },
  {
    id: 'psych_east_framework',
    category: 'page_structure',
    rule: 'EAST framework: make the desired action Easy (reduce steps), Attractive (design + incentive), Social (show others doing it), and Timely (right moment, right context).',
    good_example: 'CTA is easy (1-click), attractive (benefit-driven copy + strong design), social ("Join 328 teams"), timely (shown after problem agitation).',
    bad_example: 'CTA is hard (multi-step), unattractive (gray "Submit" button), anti-social (no proof), untimely (appears before context).',
    page_types: ['all_commercial'],
    funnel_stages: ['awareness', 'consideration', 'decision'],
    psychology_models: ['east_framework'],
    cro_dimension: 'cta_hierarchy',
    source: 'Marketing Psychology / EAST Framework',
  },
  {
    id: 'psych_status_quo',
    category: 'cta',
    rule: 'People prefer the default option (status-quo bias). Make the desired action the pre-selected default: annual billing pre-selected, recommended plan pre-highlighted, opt-in pre-checked (where legal).',
    good_example: 'Pricing toggle defaults to annual billing (the better deal for both parties).',
    bad_example: 'Monthly billing is the default, requiring users to actively discover the annual discount.',
    page_types: ['pricing', 'checkout', 'onboarding'],
    funnel_stages: ['decision'],
    psychology_models: ['status_quo_bias', 'default_effect'],
    cro_dimension: 'friction_reduction',
    source: 'Marketing Psychology / Status-Quo Bias',
  },

  // ═══════════════════════════════════════════════
  // ADDITIONAL — Above-Fold & Funnel-Specific
  // ═══════════════════════════════════════════════

  {
    id: 'above_fold_essentials',
    category: 'above_fold',
    rule: 'Above the fold must contain: (1) a clear headline communicating the value prop, (2) a supporting subheadline with specifics, (3) one primary CTA, and (4) a visual that reinforces the message (screenshot, demo, illustration).',
    good_example: 'H1: "Find your SaaS waste in 90 seconds" + subhead with specifics + "Start Free Audit" button + product screenshot.',
    bad_example: 'Stock photo of people in an office. No headline visible without scrolling. CTA buried below fold.',
    page_types: ['homepage', 'landing_page', 'product'],
    funnel_stages: ['awareness'],
    psychology_models: ['cognitive_load', 'peak_end_rule'],
    cro_dimension: 'headline_effectiveness',
    source: 'Page CRO / Above-Fold Essentials',
  },
  {
    id: 'funnel_tofu_alignment',
    category: 'funnel_alignment',
    rule: 'Top-of-funnel pages (awareness) should educate and intrigue, not sell hard. Lead with the problem, show you understand it, and offer a low-commitment next step (content, free tool, quiz).',
    good_example: 'Blog post explaining "5 signs your SaaS stack is leaking money" with a soft CTA to a free calculator.',
    bad_example: 'Blog post that opens with "Buy Vestigio today for only $99/month!" — too aggressive for awareness stage.',
    page_types: ['blog', 'landing_page'],
    funnel_stages: ['awareness'],
    psychology_models: ['reciprocity', 'commitment_consistency'],
    cro_dimension: 'value_prop_clarity',
    source: 'Funnel Alignment / TOFU',
  },
  {
    id: 'funnel_mofu_alignment',
    category: 'funnel_alignment',
    rule: 'Mid-funnel pages (consideration) should compare, demonstrate, and differentiate. Show how your product solves their specific problem better than alternatives. Case studies, demos, and comparisons work here.',
    good_example: 'Feature page with a product tour, comparison table vs manual tracking, and a customer case study.',
    bad_example: 'Feature page that just lists features with no context on why they matter or how they compare.',
    page_types: ['feature', 'product', 'landing_page'],
    funnel_stages: ['consideration'],
    psychology_models: ['anchoring_effect', 'social_proof'],
    cro_dimension: 'value_prop_clarity',
    source: 'Funnel Alignment / MOFU',
  },
  {
    id: 'funnel_bofu_alignment',
    category: 'funnel_alignment',
    rule: 'Bottom-of-funnel pages (decision) should remove risk and friction. Lead with guarantees, social proof, simple pricing, and a frictionless signup/checkout. Handle every objection before the CTA.',
    good_example: 'Pricing page with clear tiers, FAQ answering objections, money-back guarantee badge, and 1-click signup.',
    bad_example: 'Pricing page with no FAQ, no guarantee, and a "Contact Sales" button as the only option.',
    page_types: ['pricing', 'checkout'],
    funnel_stages: ['decision'],
    psychology_models: ['loss_aversion', 'status_quo_bias'],
    cro_dimension: 'objection_handling',
    source: 'Funnel Alignment / BOFU',
  },
  {
    id: 'testimonial_specificity',
    category: 'social_proof',
    rule: 'Testimonials must include specific results, full attribution (name, title, company), and ideally a photo. Generic praise from anonymous sources has near-zero persuasive value.',
    good_example: '"Vestigio found $41K in annual savings in our first week." — Sarah Chen, CFO at Acme Corp [headshot]',
    bad_example: '"Great tool!" — Anonymous',
    page_types: ['homepage', 'landing_page', 'pricing', 'product'],
    funnel_stages: ['consideration', 'decision'],
    psychology_models: ['social_proof', 'authority_bias'],
    cro_dimension: 'trust_signals',
    source: 'Page CRO / Testimonial Quality',
  },
  {
    id: 'security_trust_badges',
    category: 'trust_signals',
    rule: 'Display security and compliance badges (SOC 2, GDPR, SSL, PCI) near forms, checkout, and pricing. These reduce perceived risk at the exact moment the visitor is most hesitant.',
    good_example: 'SOC 2 badge + "256-bit encryption" + "GDPR compliant" shown directly beneath the signup form.',
    bad_example: 'Security information buried in a footer link. No badges near forms or pricing.',
    page_types: ['pricing', 'checkout', 'landing_page'],
    funnel_stages: ['decision'],
    psychology_models: ['authority_bias', 'loss_aversion'],
    cro_dimension: 'trust_signals',
    source: 'Page CRO / Trust Badges',
  },
  {
    id: 'pricing_value_context',
    category: 'pricing_psychology',
    rule: 'Never show price in isolation. Always pair pricing with value context: ROI calculation, cost-of-inaction anchor, or per-unit-of-value reframe ($/employee, $/finding).',
    good_example: '"$99/mo. Average customer saves $3,400/mo. That is a 34x return."',
    bad_example: '"Pro Plan: $99/month. Enterprise Plan: $499/month." — no value context at all.',
    page_types: ['pricing'],
    funnel_stages: ['decision'],
    psychology_models: ['anchoring_effect', 'mental_accounting'],
    cro_dimension: 'objection_handling',
    source: 'Pricing Psychology / Value Context',
  },
  {
    id: 'cta_anxiety_reducers',
    category: 'cta',
    rule: 'Place micro-copy beneath CTAs that reduces anxiety: "No credit card required", "Cancel anytime", "Takes 30 seconds", "Free forever plan available".',
    good_example: 'Button: "Start My Free Audit" + beneath: "No credit card required. Takes 90 seconds."',
    bad_example: 'Button: "Start Trial" with no clarification on cost, commitment, or time investment.',
    page_types: ['homepage', 'landing_page', 'pricing'],
    funnel_stages: ['consideration', 'decision'],
    psychology_models: ['loss_aversion', 'bj_fogg_behavior_model'],
    cro_dimension: 'cta_hierarchy',
    source: 'CRO / Anxiety Reducers',
  },
  {
    id: 'error_page_recovery',
    category: 'navigation',
    rule: 'Error pages (404, 500) should maintain brand voice, offer clear navigation back to key pages, and include search or popular links. A dead-end error page loses visitors permanently.',
    good_example: '404 page with friendly message, search bar, links to homepage/pricing/docs, and consistent branding.',
    bad_example: 'Browser default 404 page with no branding, no navigation, and no way to recover.',
    page_types: ['error'],
    funnel_stages: ['awareness', 'consideration', 'decision', 'retention'],
    cro_dimension: 'friction_reduction',
    source: 'UX / Error Recovery',
  },
  {
    id: 'mobile_copy_density',
    category: 'copy_style',
    rule: 'On mobile, copy density must be dramatically reduced. Headlines should be shorter, paragraphs 1-2 sentences max, and CTAs must be thumb-friendly (minimum 44px tap target).',
    good_example: 'Mobile hero: 6-word headline, 1-line subhead, full-width CTA button with 48px height.',
    bad_example: 'Desktop copy pasted directly to mobile: 15-word headline, 4-line paragraphs, tiny text links as CTAs.',
    page_types: ['all_commercial'],
    funnel_stages: ['awareness', 'consideration', 'decision'],
    cro_dimension: 'visual_hierarchy',
    source: 'CRO / Mobile Optimization',
  },
  {
    id: 'heading_hierarchy',
    category: 'page_structure',
    rule: 'Use proper heading hierarchy (one H1 per page, H2 for sections, H3 for subsections). Skipping levels (H1 -> H4) or using multiple H1s hurts both SEO and scannability.',
    good_example: 'Single H1 as hero headline. H2 for each major section (Social Proof, Features, Pricing). H3 for sub-items.',
    bad_example: 'Three H1 tags on the page. Section headers using <p> with bold styling instead of H2.',
    page_types: ['all_commercial'],
    funnel_stages: ['awareness', 'consideration', 'decision'],
    cro_dimension: 'visual_hierarchy',
    source: 'Page CRO / Heading Hierarchy',
  },
  {
    id: 'nav_item_count',
    category: 'navigation',
    rule: 'Main navigation should have 5-7 items maximum. More than 7 triggers cognitive overload and paradox of choice. Group secondary items under dropdowns.',
    good_example: 'Nav: Product | Pricing | Customers | Resources | Company (5 items)',
    bad_example: 'Nav: Home | Features | Pricing | Blog | About | Team | Careers | Contact | Docs | API | Partners | Press (12 items)',
    page_types: ['all_commercial'],
    funnel_stages: ['awareness', 'consideration', 'decision'],
    psychology_models: ['paradox_of_choice', 'hicks_law'],
    cro_dimension: 'friction_reduction',
    source: 'UX / Navigation Simplicity',
  },
  {
    id: 'landing_page_no_nav',
    category: 'navigation',
    rule: 'Dedicated landing pages (from ads/campaigns) should minimize or remove top navigation to keep focus on the single conversion goal. Every exit link is a leak.',
    good_example: 'Landing page with logo (links home) but no full navigation bar. Single CTA repeated throughout.',
    bad_example: 'Paid ad lands on homepage with full nav, footer links, blog links — dozens of exit points.',
    page_types: ['landing_page'],
    funnel_stages: ['awareness', 'consideration'],
    psychology_models: ['paradox_of_choice'],
    cro_dimension: 'friction_reduction',
    source: 'CRO / Landing Page Focus',
  },
  {
    id: 'subhead_supports_head',
    category: 'headline',
    rule: 'The subheadline must expand on the headline with specifics: who it is for, how it works, or a concrete proof point. Never repeat the headline in different words.',
    good_example: 'H1: "Stop SaaS waste." Subhead: "Vestigio scans your stack in 60 seconds and shows exactly which subscriptions to cut."',
    bad_example: 'H1: "The Best SaaS Management Tool." Subhead: "We are a top-rated SaaS management solution."',
    page_types: ['homepage', 'landing_page', 'product', 'feature'],
    funnel_stages: ['awareness', 'consideration'],
    cro_dimension: 'headline_effectiveness',
    source: 'Copywriting / Subheadline',
  },
  {
    id: 'feature_benefit_pairing',
    category: 'value_proposition',
    rule: 'When listing features, always pair each feature with its benefit: "Feature: what it does -> Benefit: why the user should care." A feature alone does not sell.',
    good_example: '"Automated license detection (feature) — so you never pay for seats nobody uses (benefit)."',
    bad_example: '"Automated license detection. Multi-cloud support. API access. SSO integration." (feature dump, no benefits)',
    page_types: ['feature', 'product', 'pricing', 'landing_page'],
    funnel_stages: ['consideration'],
    cro_dimension: 'value_prop_clarity',
    source: 'Copywriting / Feature-Benefit Pairing',
  },
  {
    id: 'guarantee_placement',
    category: 'objection_handling',
    rule: 'Place guarantees (money-back, SLA, satisfaction) near the primary CTA and on the pricing page. A guarantee at the moment of decision can be the tipping point.',
    good_example: '"30-day money-back guarantee. No questions asked." — displayed beneath the "Start Free Trial" button.',
    bad_example: 'Guarantee mentioned only in the Terms of Service page that nobody reads.',
    page_types: ['pricing', 'checkout', 'landing_page'],
    funnel_stages: ['decision'],
    psychology_models: ['loss_aversion', 'status_quo_bias'],
    cro_dimension: 'objection_handling',
    source: 'CRO / Guarantee Placement',
  },
  {
    id: 'comparison_to_alternatives',
    category: 'objection_handling',
    rule: 'Address "vs alternatives" on-page: vs doing nothing, vs spreadsheets, vs competitors. Visitors are comparing anyway — control the narrative.',
    good_example: 'Section: "Vestigio vs. manual audit" with side-by-side comparison showing time, accuracy, and cost differences.',
    bad_example: 'No mention of alternatives. Visitor has to leave the page to compare, and they may not come back.',
    page_types: ['homepage', 'landing_page', 'product', 'feature'],
    funnel_stages: ['consideration'],
    psychology_models: ['anchoring_effect', 'framing_effect'],
    cro_dimension: 'objection_handling',
    source: 'CRO / Competitive Positioning',
  },
  {
    id: 'onboarding_first_value',
    category: 'onboarding',
    rule: 'Users must reach their first "aha moment" within the first session. Design the onboarding flow to deliver one meaningful result (a finding, a metric, a recommendation) as fast as possible.',
    good_example: '"Connect your accounts (2 min) -> see your first savings recommendation (instant)." First value in under 3 minutes.',
    bad_example: '7-step onboarding wizard that ends with "We will email you when your dashboard is ready in 24-48 hours."',
    page_types: ['onboarding'],
    funnel_stages: ['retention'],
    psychology_models: ['goal_gradient', 'endowment_effect', 'peak_end_rule'],
    cro_dimension: 'friction_reduction',
    source: 'Onboarding / Time to First Value',
  },
  {
    id: 'empty_state_guidance',
    category: 'onboarding',
    rule: 'Empty states (no data yet) must not feel broken. Show instructive copy, example data, or a clear single action to populate the view. Empty states are an onboarding opportunity.',
    good_example: '"No findings yet. Connect your first integration to start your audit." + illustrated example of what the dashboard will look like.',
    bad_example: 'Blank white screen with "No data" text and no guidance on what to do next.',
    page_types: ['onboarding', 'product'],
    funnel_stages: ['retention'],
    psychology_models: ['zeigarnik_effect'],
    cro_dimension: 'friction_reduction',
    source: 'Onboarding / Empty States',
  },
  {
    id: 'checkout_reassurance',
    category: 'trust_signals',
    rule: 'Checkout and payment pages need maximum reassurance: security badges, guarantee reminder, summary of what they get, and customer support contact visible.',
    good_example: 'Checkout shows: order summary, "30-day guarantee" badge, "256-bit secure" icon, "Questions? Chat with us" link.',
    bad_example: 'Bare Stripe checkout embed with no branding, no guarantee, no support contact.',
    page_types: ['checkout'],
    funnel_stages: ['decision'],
    psychology_models: ['loss_aversion', 'authority_bias'],
    cro_dimension: 'trust_signals',
    source: 'CRO / Checkout Reassurance',
  },
  {
    id: 'about_page_credibility',
    category: 'trust_signals',
    rule: 'About pages must establish credibility: founder story, team photos, company metrics, funding/investors, mission. Faceless companies lose trust.',
    good_example: 'Founder photos + "why we built this" story + team size + key investors + office/remote culture shots.',
    bad_example: 'About page with only a company description paragraph and no team, no story, no proof of real humans.',
    page_types: ['about'],
    funnel_stages: ['consideration', 'decision'],
    psychology_models: ['authority_bias', 'social_proof'],
    cro_dimension: 'trust_signals',
    source: 'Trust / About Page',
  },
  {
    id: 'blog_cta_relevance',
    category: 'cta',
    rule: 'Blog post CTAs must be contextually relevant to the content topic. A post about "SaaS waste" should CTA to a SaaS audit tool, not a generic "Subscribe to newsletter".',
    good_example: 'Post about SaaS waste -> CTA: "See how much your company is wasting — run a free audit."',
    bad_example: 'Post about SaaS waste -> CTA: "Subscribe to our newsletter for updates."',
    page_types: ['blog'],
    funnel_stages: ['awareness'],
    psychology_models: ['reciprocity', 'commitment_consistency'],
    cro_dimension: 'cta_hierarchy',
    source: 'Content CRO / Blog CTAs',
  },
  {
    id: 'pricing_faq',
    category: 'objection_handling',
    rule: 'Pricing pages must include an FAQ section addressing: "Is there a free trial?", "Can I cancel anytime?", "What happens to my data?", "Do you offer discounts?", "What support is included?".',
    good_example: 'FAQ with 6-8 questions covering trial, cancellation, data, discounts, support, and setup time.',
    bad_example: 'Pricing page with tiers and a "Contact us" link. No FAQ. No objection handling.',
    page_types: ['pricing'],
    funnel_stages: ['decision'],
    psychology_models: ['status_quo_bias', 'loss_aversion'],
    cro_dimension: 'objection_handling',
    source: 'CRO / Pricing FAQ',
  },
  {
    id: 'readability_grade_level',
    category: 'copy_style',
    rule: 'Commercial web copy should target a 6th-8th grade reading level. Shorter sentences (15-20 words max). One-syllable words where possible. Hemingway-clear.',
    good_example: '"We find the tools you pay for but don\'t use. Then we help you cancel them."',
    bad_example: '"Our sophisticated platform leverages proprietary algorithms to systematically identify underutilized technology expenditures across your organizational infrastructure."',
    page_types: ['all_commercial'],
    funnel_stages: ['awareness', 'consideration', 'decision'],
    cro_dimension: 'value_prop_clarity',
    source: 'Copywriting / Readability',
  },
  {
    id: 'power_words',
    category: 'copy_style',
    rule: 'Use power words that trigger emotion and action: "free", "instantly", "proven", "guaranteed", "exclusive", "limited", "you/your". Avoid weak words: "maybe", "might", "could", "hope", "try".',
    good_example: '"Get your free audit instantly — results guaranteed."',
    bad_example: '"You might want to try our tool and see if it could possibly help."',
    page_types: ['all_commercial'],
    funnel_stages: ['awareness', 'consideration', 'decision'],
    cro_dimension: 'headline_effectiveness',
    source: 'Copywriting / Power Words',
  },
  {
    id: 'cta_repetition',
    category: 'cta',
    rule: 'Repeat the primary CTA at multiple scroll depths: above fold, mid-page after social proof, and at page bottom. Visitors decide at different points — the CTA should be there when they are ready.',
    good_example: 'CTA appears in hero, after testimonials section, and in the final section before the footer.',
    bad_example: 'Single CTA only in the hero. Visitor who scrolls past it finds no way to convert without scrolling back up.',
    page_types: ['homepage', 'landing_page', 'product', 'feature'],
    funnel_stages: ['awareness', 'consideration', 'decision'],
    cro_dimension: 'cta_hierarchy',
    source: 'CRO / CTA Repetition',
  },
  {
    id: 'microcopy_clarity',
    category: 'copy_style',
    rule: 'Microcopy (form labels, error messages, tooltips, placeholder text) must be specific and helpful. "Invalid input" tells the user nothing. "Please enter a valid email address" tells them exactly what to fix.',
    good_example: 'Form error: "Please enter a valid email (e.g. name@company.com)"',
    bad_example: 'Form error: "Error" or "Invalid input"',
    page_types: ['all_commercial'],
    funnel_stages: ['decision', 'retention'],
    cro_dimension: 'friction_reduction',
    source: 'UX Writing / Microcopy',
  },
  {
    id: 'social_proof_placement',
    category: 'social_proof',
    rule: 'Place social proof immediately after the first claim/value proposition — usually right below the hero. Logo bars go first (fast credibility), testimonials deeper (detailed credibility).',
    good_example: 'Hero section -> immediately followed by "Trusted by [logos of 5 known companies]" strip.',
    bad_example: 'Testimonials buried at the very bottom of the page, after the footer newsletter signup.',
    page_types: ['homepage', 'landing_page', 'product'],
    funnel_stages: ['awareness', 'consideration'],
    psychology_models: ['social_proof', 'anchoring_effect'],
    cro_dimension: 'trust_signals',
    source: 'CRO / Social Proof Placement',
  },
  {
    id: 'value_prop_uniqueness',
    category: 'value_proposition',
    rule: 'The value proposition must be unique to your product — if a competitor could say the same thing, it is not differentiated. "Fast and easy" is generic. Your specific mechanism or outcome is not.',
    good_example: '"Vestigio cross-references your billing, SSO, and usage data to find subscriptions your team forgot about." (unique mechanism)',
    bad_example: '"We help businesses save money with our innovative solution." (any company could say this)',
    page_types: ['homepage', 'landing_page', 'product'],
    funnel_stages: ['awareness', 'consideration'],
    cro_dimension: 'value_prop_clarity',
    source: 'Copywriting / Unique Value Prop',
  },
];

// ─── Routing Functions ──────────────────────────

/**
 * Returns only the guidelines relevant to a given page type.
 * Includes guidelines tagged with the specific type plus 'all_commercial'.
 */
export function getGuidelinesForPageType(pageType: PageType): CopyGuideline[] {
  return COPY_GUIDELINES.filter(
    (g) => g.page_types.includes(pageType) || g.page_types.includes('all_commercial'),
  );
}

/**
 * Returns guidelines filtered by CRO dimension, sorted by dimension rank.
 */
export function getGuidelinesForDimension(dimension: CroDimension): CopyGuideline[] {
  return COPY_GUIDELINES.filter((g) => g.cro_dimension === dimension);
}

/**
 * Returns guidelines filtered by funnel stage.
 */
export function getGuidelinesForFunnelStage(stage: FunnelStage): CopyGuideline[] {
  return COPY_GUIDELINES.filter((g) => g.funnel_stages.includes(stage));
}

/**
 * Serializes a list of guidelines into a compact string suitable for
 * inclusion in a Haiku system prompt.
 *
 * Format per guideline:
 *   - [id] (category): rule. Good: example. Bad: example.
 *
 * Target: ~500-800 tokens for 15-20 guidelines.
 */
export function serializeGuidelinesForPrompt(guidelines: CopyGuideline[]): string {
  return guidelines
    .map(
      (g) =>
        `- [${g.id}] (${g.category}): ${g.rule} Good: ${g.good_example} Bad: ${g.bad_example}`,
    )
    .join('\n');
}

/**
 * CRO dimension metadata — used for scoring and prioritization.
 * Lower rank = higher impact on conversion.
 */
export const CRO_DIMENSION_RANKS: Record<CroDimension, { rank: number; label: string }> = {
  value_prop_clarity: { rank: 1, label: 'Value Proposition Clarity' },
  headline_effectiveness: { rank: 2, label: 'Headline Effectiveness' },
  cta_hierarchy: { rank: 3, label: 'CTA Hierarchy & Placement' },
  visual_hierarchy: { rank: 4, label: 'Visual Hierarchy & Scannability' },
  trust_signals: { rank: 5, label: 'Trust Signals & Social Proof' },
  objection_handling: { rank: 6, label: 'Objection Handling' },
  friction_reduction: { rank: 7, label: 'Friction Reduction' },
};
