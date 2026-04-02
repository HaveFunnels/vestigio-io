import { PlanKey } from '../../packages/plans';

// ─────��────────────────────────────────────────
// Playbook Prompts — Expert Analysis Templates
//
// Pre-built prompts that unlock cross-finding
// correlational insights users wouldn't see in
// the Analysis table alone.
//
// Design principles:
//   - Each prompt is a mini-strategy-session
//   - Prompts cross-reference findings across packs
//   - Output should be actionable with $ impact
//   - Categories map to real business concerns
//   - Prompt text is hidden until user clicks "Use"
//
// Categories:
//   revenue_leaks    — Money leaving the funnel
//   conversion       — Friction, abandonment, activation
//   chargeback       — Dispute risk, policy gaps
//   onboarding       — First-time user experience
//   trust            — Credibility signals, social proof
//   landing_vs_app   — Promise-reality mismatch
//   measurement      — Tracking, attribution, analytics
//   competitive      — Market positioning, differentiation
// ─��────────────────────────────────────────────

export interface PlaybookPrompt {
  id: string;
  title: string;
  description: string;
  prompt: string;
  category: PlaybookCategory;
  min_plan: PlanKey;
  tags: string[];
  estimated_queries: number; // for budget awareness
}

export type PlaybookCategory =
  | 'revenue_leaks'
  | 'conversion'
  | 'chargeback'
  | 'onboarding'
  | 'trust'
  | 'landing_vs_app'
  | 'measurement'
  | 'competitive';

export const PLAYBOOK_CATEGORY_META: Record<PlaybookCategory, { label: string; icon: string; color: string }> = {
  revenue_leaks:  { label: 'Revenue Leaks',     icon: 'dollar',     color: 'red' },
  conversion:     { label: 'Conversion',         icon: 'funnel',     color: 'emerald' },
  chargeback:     { label: 'Chargeback',         icon: 'shield',     color: 'amber' },
  onboarding:     { label: 'Onboarding',         icon: 'rocket',     color: 'blue' },
  trust:          { label: 'Trust & Proof',       icon: 'badge',      color: 'violet' },
  landing_vs_app: { label: 'Landing vs App',     icon: 'compare',    color: 'orange' },
  measurement:    { label: 'Measurement',        icon: 'chart',      color: 'cyan' },
  competitive:    { label: 'Competitive Edge',   icon: 'trophy',     color: 'rose' },
};

// ──────────────────────────────────────────────
// Playbook Prompt Definitions
// ───��──────────────────────���───────────────────

export const PLAYBOOK_PROMPTS: PlaybookPrompt[] = [

  // ═══════════════════════════════════════════
  // REVENUE LEAKS
  // ═════════════════════��═════════════════════

  {
    id: 'revenue_leak_full_audit',
    title: 'Full Revenue Leak Audit',
    description: 'Complete analysis of where money exits your funnel, ranked by dollar impact.',
    prompt: 'Run a complete revenue leak analysis. Show me every finding that causes revenue loss, ranked by monthly dollar impact from highest to lowest. For the top 5, explain the root cause and what fixing each one would recover. Then show the total combined monthly loss and the estimated recovery if I fix the top 3.',
    category: 'revenue_leaks',
    min_plan: 'vestigio',
    tags: ['revenue', 'leakage', 'money', 'loss', 'funnel'],
    estimated_queries: 2,
  },
  {
    id: 'revenue_compound_leaks',
    title: 'Compound Revenue Leaks',
    description: 'Find findings that amplify each other — two small leaks creating a big one.',
    prompt: 'Analyze my findings for compound effects. Which findings share the same root cause or affect the same part of the user journey? Show me cases where fixing one issue would also improve another (stacking impact). I want to find the highest-leverage fixes — the ones where a single change addresses multiple revenue leaks simultaneously.',
    category: 'revenue_leaks',
    min_plan: 'vestigio',
    tags: ['compound', 'correlation', 'leverage', 'root-cause'],
    estimated_queries: 3,
  },
  {
    id: 'revenue_quick_wins',
    title: 'Quick Wins Under $500/Fix',
    description: 'Low-effort, high-impact fixes you could ship this week.',
    prompt: 'Show me findings where the fix is simple (configuration change, copy update, adding a badge/element) but the monthly revenue impact is over $200. Rank by impact-to-effort ratio. For each, tell me exactly what to change and the expected recovery. I want a list of things I could fix in a single afternoon.',
    category: 'revenue_leaks',
    min_plan: 'vestigio',
    tags: ['quick-wins', 'low-effort', 'high-impact'],
    estimated_queries: 2,
  },
  {
    id: 'revenue_hidden_costs',
    title: 'Hidden Cost Multipliers',
    description: 'Issues that don\'t look expensive alone but compound across your traffic.',
    prompt: 'Which findings have a seemingly low per-visitor impact but are significant because they affect every visitor or a large segment? Calculate the monthly cost by multiplying per-visitor impact by estimated traffic volume. Show me the "death by a thousand cuts" — issues that individually look minor but collectively cost thousands.',
    category: 'revenue_leaks',
    min_plan: 'pro',
    tags: ['hidden', 'multiplier', 'per-visitor', 'volume'],
    estimated_queries: 2,
  },

  // ══���════════════════════════════════════════
  // CONVERSION
  // ═════════════���═════════════════════════════

  {
    id: 'conversion_bottleneck',
    title: 'Conversion Bottleneck Map',
    description: 'Identify where in the journey visitors drop off and why.',
    prompt: 'Map my conversion funnel from landing to purchase/signup. At each stage, show which findings create friction. Where is the biggest single drop-off? What\'s the root cause of that drop-off? If I could only fix one thing to improve conversion, what should it be and how much would it move the needle?',
    category: 'conversion',
    min_plan: 'vestigio',
    tags: ['bottleneck', 'funnel', 'drop-off', 'friction'],
    estimated_queries: 3,
  },
  {
    id: 'conversion_checkout_deep',
    title: 'Checkout Friction Deep Dive',
    description: 'Every issue between "Add to Cart" and "Payment Complete".',
    prompt: 'Focus specifically on the checkout flow. List every finding that affects the path from cart to completed payment. Group them by: trust issues (SSL, badges, policies), UX friction (redirects, form length, loading), payment issues (options, errors, security), and post-checkout (confirmation, emails). For each group, what\'s the combined monthly impact?',
    category: 'conversion',
    min_plan: 'vestigio',
    tags: ['checkout', 'cart', 'payment', 'friction'],
    estimated_queries: 2,
  },
  {
    id: 'conversion_mobile_gap',
    title: 'Mobile vs Desktop Gap',
    description: 'Find issues that disproportionately hurt mobile users.',
    prompt: 'Which findings are likely to have a bigger impact on mobile users than desktop? Think about: touch targets, loading speed, responsive layout, mobile payment options, form usability on small screens. If 60%+ of my traffic is mobile, which findings should I prioritize differently? Show the adjusted impact.',
    category: 'conversion',
    min_plan: 'pro',
    tags: ['mobile', 'responsive', 'device', 'gap'],
    estimated_queries: 2,
  },
  {
    id: 'conversion_ab_test_candidates',
    title: 'A/B Test Candidates',
    description: 'Issues worth testing rather than just fixing — highest uncertainty, highest upside.',
    prompt: 'Which findings have high potential impact but lower confidence? These are the best A/B test candidates — changes where we\'re not 100% sure of the outcome but the upside is significant. Rank by (impact × uncertainty). For each, suggest what the A/B test would look like and what metric to track.',
    category: 'conversion',
    min_plan: 'pro',
    tags: ['ab-test', 'experiment', 'uncertainty', 'upside'],
    estimated_queries: 2,
  },

  // ══════��═══════════════════��════════════════
  // CHARGEBACK
  // ═══════��════════════════════��══════════════

  {
    id: 'chargeback_risk_matrix',
    title: 'Chargeback Risk Matrix',
    description: 'Map every finding that increases dispute probability, weighted by severity.',
    prompt: 'Build a chargeback risk matrix. Which findings directly or indirectly increase the likelihood of chargebacks? Group by: pre-purchase trust gaps (unclear policies, missing contact info), purchase confusion (unexpected charges, unclear billing descriptor), post-purchase friction (hard to cancel, no refund process, missing support). For each, estimate the chargeback probability increase and the dollar exposure.',
    category: 'chargeback',
    min_plan: 'pro',
    tags: ['chargeback', 'risk', 'matrix', 'dispute'],
    estimated_queries: 3,
  },
  {
    id: 'chargeback_policy_gaps',
    title: 'Policy Gap Audit',
    description: 'Missing or weak policies that leave you exposed to disputes.',
    prompt: 'Review my findings for policy-related issues. Are there missing or inadequate return policies, terms of service, privacy policies, shipping policies, or cancellation procedures? For each gap, explain how it increases chargeback risk and what a best-practice policy should include. Estimate the monthly chargeback cost reduction from fixing each.',
    category: 'chargeback',
    min_plan: 'pro',
    tags: ['policy', 'terms', 'returns', 'legal'],
    estimated_queries: 2,
  },
  {
    id: 'chargeback_prevention_plan',
    title: 'Chargeback Prevention Roadmap',
    description: 'Priority-ordered plan to reduce chargebacks by 50%+.',
    prompt: 'Create a 30-day chargeback prevention roadmap. Based on my findings, what are the top actions I should take in week 1, week 2, week 3, and week 4 to maximize dispute reduction? Estimate the cumulative chargeback reduction percentage after each week. What should my chargeback rate target be after implementing everything?',
    category: 'chargeback',
    min_plan: 'pro',
    tags: ['prevention', 'roadmap', 'plan', '30-day'],
    estimated_queries: 3,
  },

  // ═══════════════════════════════════════════
  // ONBOARDING
  // ═══════════════���═══════════════════════════

  {
    id: 'onboarding_friction_map',
    title: 'Onboarding Friction Map',
    description: 'Every barrier between "first visit" and "first value moment".',
    prompt: 'Map the entire onboarding experience from first visit to first value moment (purchase, signup, or key action). At each step, which findings create friction? Where do new users most likely give up? What\'s the estimated cost of onboarding friction in terms of lost activations per month? Rank fixes by activation impact.',
    category: 'onboarding',
    min_plan: 'vestigio',
    tags: ['onboarding', 'friction', 'activation', 'first-time'],
    estimated_queries: 3,
  },
  {
    id: 'onboarding_trust_barrier',
    title: 'First-Visit Trust Barriers',
    description: 'What makes a new visitor leave within 10 seconds.',
    prompt: 'A brand new visitor lands on my site for the first time. Based on my findings, what are the top 5 things that would make them leave immediately? Think about: first impressions, trust signals above the fold, loading speed, clarity of value proposition, professional appearance. For each barrier, what\'s the fix and expected impact on bounce rate?',
    category: 'onboarding',
    min_plan: 'vestigio',
    tags: ['trust', 'bounce', 'first-impression', 'above-fold'],
    estimated_queries: 2,
  },
  {
    id: 'onboarding_signup_flow',
    title: 'Signup Flow Optimization',
    description: 'Reduce friction in account creation and trial activation.',
    prompt: 'Analyze my findings for anything that affects the signup or account creation process. Include: form complexity, required fields, social login options, email verification flow, initial setup experience. What\'s the estimated signup completion rate impact? Which single change would move the needle most?',
    category: 'onboarding',
    min_plan: 'vestigio',
    tags: ['signup', 'registration', 'account', 'trial'],
    estimated_queries: 2,
  },

  // ══════════════════════��════════════════════
  // TRUST & SOCIAL PROOF
  // ═══════════════════════════════════════════

  {
    id: 'trust_signal_audit',
    title: 'Trust Signal Completeness Audit',
    description: 'Score your site\'s trustworthiness across all dimensions.',
    prompt: 'Score my site\'s trust signals across these dimensions: SSL & security badges, reviews & testimonials, company information (about, team, address), contact options (phone, chat, email), policies (returns, privacy, terms), payment trust (logos, guarantees), social proof (customer count, media mentions). For each dimension, rate 1-10 and explain what\'s missing. What\'s my overall trust score and what would improve it fastest?',
    category: 'trust',
    min_plan: 'vestigio',
    tags: ['trust', 'signals', 'credibility', 'social-proof'],
    estimated_queries: 2,
  },
  {
    id: 'trust_vs_competitors',
    title: 'Trust Gap Analysis',
    description: 'Which trust signals are you missing that competitors likely have?',
    prompt: 'Based on my findings and industry best practices, what trust elements am I likely missing that my competitors probably have? Focus on: money-back guarantees, free trial confidence, security certifications, customer logos, case studies, live chat, phone support, transparent pricing. For each missing element, estimate the conversion impact of adding it.',
    category: 'trust',
    min_plan: 'pro',
    tags: ['competitor', 'gap', 'benchmark', 'missing'],
    estimated_queries: 2,
  },
  {
    id: 'trust_checkout_confidence',
    title: 'Checkout Confidence Score',
    description: 'How confident is a buyer at the moment of payment?',
    prompt: 'At the exact moment a user is about to enter their credit card, what does my audit data say about their confidence level? Check for: visible security badges, clear total breakdown, return policy link, support contact visible, recognizable payment logos, SSL indicator. What\'s the "checkout confidence score" and which finding would boost it most?',
    category: 'trust',
    min_plan: 'vestigio',
    tags: ['checkout', 'confidence', 'payment', 'security'],
    estimated_queries: 2,
  },

  // ═══════════════════════════════════════════
  // LANDING VS APP
  // ══════════════════════���════════════════════

  {
    id: 'landing_promise_gap',
    title: 'Promise-Reality Gap',
    description: 'What your landing page promises vs what users actually experience.',
    prompt: 'Compare what my landing page communicates (value proposition, features, ease of use, pricing clarity) with what the audit reveals about the actual user experience. Where are the biggest gaps between promise and reality? Each gap is a trust-breaking moment. Rank by severity and estimated revenue impact of closing each gap.',
    category: 'landing_vs_app',
    min_plan: 'pro',
    tags: ['promise', 'reality', 'gap', 'mismatch'],
    estimated_queries: 3,
  },
  {
    id: 'landing_cta_analysis',
    title: 'CTA & Value Prop Analysis',
    description: 'Is your call-to-action aligned with what users actually get?',
    prompt: 'Analyze the relationship between my CTAs (calls to action) and the actual experience that follows. Based on the audit findings: Are CTAs clear about what happens next? Does the post-click experience match expectations? Are there any "bait and switch" moments (free → paywall, simple → complex)? What specific CTA or messaging changes would reduce drop-off?',
    category: 'landing_vs_app',
    min_plan: 'pro',
    tags: ['cta', 'value-prop', 'messaging', 'alignment'],
    estimated_queries: 2,
  },
  {
    id: 'landing_pricing_transparency',
    title: 'Pricing Transparency Check',
    description: 'Hidden fees, unclear tiers, and pricing confusion that kills deals.',
    prompt: 'Based on my findings, how transparent is my pricing? Check for: hidden fees, unclear tier differences, surprise charges at checkout, missing free trial terms, unclear billing frequency, confusing upgrade/downgrade paths. Each pricing confusion point is a conversion killer. What\'s the estimated monthly loss from pricing friction and what should I clarify first?',
    category: 'landing_vs_app',
    min_plan: 'vestigio',
    tags: ['pricing', 'transparency', 'fees', 'billing'],
    estimated_queries: 2,
  },

  // ════��═══════════════════════════���══════════
  // MEASUREMENT
  // ════���═══════════════════════════════════���══

  {
    id: 'measurement_blind_spots',
    title: 'Analytics Blind Spots',
    description: 'What you can\'t see is costing you — gaps in tracking and attribution.',
    prompt: 'Based on my audit findings, what important user behaviors am I likely NOT tracking? Think about: micro-conversions, error events, rage clicks, form abandonment, scroll depth, time-to-interactive, exit intent. For each blind spot, explain what insight I\'m missing and how it connects to revenue. Which tracking addition would give me the highest-value insight?',
    category: 'measurement',
    min_plan: 'pro',
    tags: ['analytics', 'tracking', 'blind-spot', 'attribution'],
    estimated_queries: 2,
  },
  {
    id: 'measurement_roi_model',
    title: 'Fix ROI Calculator',
    description: 'Calculate the return on investment for fixing each finding.',
    prompt: 'For each of my top 10 findings by impact, calculate the ROI of fixing it. Estimate: implementation cost (developer hours × $100/hr), monthly revenue recovered, payback period in days, and 12-month net ROI. Rank by payback period (fastest first). Which fixes pay for themselves within 1 week?',
    category: 'measurement',
    min_plan: 'vestigio',
    tags: ['roi', 'calculator', 'payback', 'investment'],
    estimated_queries: 2,
  },
  {
    id: 'measurement_confidence_review',
    title: 'Low-Confidence Finding Review',
    description: 'Which findings need verification before acting on them?',
    prompt: 'Show me all findings with confidence below 70%. For each, explain why confidence is low and what would increase it. Should I request a verification for any of these? Group them into: "act now despite low confidence" (high impact, low risk fix), "verify first" (high impact, significant effort), and "monitor" (low impact, can wait). Prioritize which to verify.',
    category: 'measurement',
    min_plan: 'vestigio',
    tags: ['confidence', 'verification', 'uncertainty', 'validation'],
    estimated_queries: 2,
  },

  // ══════════════════════════════���════════════
  // COMPETITIVE EDGE
  // ═══════════════���═══════════════════════════

  {
    id: 'competitive_weakness_map',
    title: 'Competitive Weakness Map',
    description: 'Vulnerabilities your competitors could exploit right now.',
    prompt: 'Based on my findings, which weaknesses would a competitor most easily exploit? Think about: if a competitor has better checkout UX, stronger trust signals, clearer pricing, faster loading, or better mobile experience — where would I lose customers to them? Rank vulnerabilities by how easy they are for a competitor to capitalize on and the revenue at risk.',
    category: 'competitive',
    min_plan: 'pro',
    tags: ['competitor', 'weakness', 'vulnerability', 'risk'],
    estimated_queries: 2,
  },
  {
    id: 'competitive_differentiation',
    title: 'Differentiation Opportunities',
    description: 'Turn your worst findings into competitive advantages.',
    prompt: 'Which of my current weaknesses, if fixed exceptionally well, could become competitive differentiators? For example: if everyone has bad checkout → making yours excellent stands out. Identify 3-5 findings where going from "below average" to "best in class" would create meaningful competitive advantage. What would "best in class" look like for each?',
    category: 'competitive',
    min_plan: 'pro',
    tags: ['differentiation', 'advantage', 'best-in-class'],
    estimated_queries: 2,
  },
  {
    id: 'competitive_scale_readiness',
    title: 'Scale Readiness Assessment',
    description: 'Can you handle 10x traffic without bleeding revenue?',
    prompt: 'If my traffic increased 10x tomorrow (viral moment, big ad campaign, press coverage), which findings would become critical? Analyze: Would my checkout handle the load? Would trust issues get amplified by negative reviews? Would chargeback risk scale linearly? Create a "scale readiness score" and a priority list of what to fix BEFORE scaling.',
    category: 'competitive',
    min_plan: 'vestigio',
    tags: ['scale', 'readiness', 'growth', 'traffic'],
    estimated_queries: 3,
  },

  // ═══════════════════════════════════════════
  // CROSS-CATEGORY (bonus high-value prompts)
  // ══════════��═══════════════════════════════���

  {
    id: 'cross_pack_correlation',
    title: 'Cross-Pack Correlation Analysis',
    description: 'Find hidden connections between findings from different analysis packs.',
    prompt: 'Analyze findings across ALL packs (revenue integrity, scale readiness, chargeback resilience). Find correlations: Which findings from different packs share the same root cause? Where does fixing a revenue issue also reduce chargeback risk? Where does improving trust also help conversion? Build a correlation map showing connected findings across packs with combined impact.',
    category: 'revenue_leaks',
    min_plan: 'vestigio',
    tags: ['cross-pack', 'correlation', 'connection', 'root-cause'],
    estimated_queries: 3,
  },
  {
    id: 'executive_summary',
    title: 'Executive Summary',
    description: 'Board-ready overview: total risk, top priorities, and 90-day roadmap.',
    prompt: 'Create an executive summary suitable for a board meeting. Include: total monthly revenue at risk (sum of all findings), top 3 critical issues with dollar impact, 90-day priority roadmap (week 1-2: quick wins, month 1: critical fixes, month 2-3: strategic improvements), expected ROI of the full remediation plan, and a single "health score" from 0-100 for the business.',
    category: 'revenue_leaks',
    min_plan: 'vestigio',
    tags: ['executive', 'summary', 'board', 'roadmap'],
    estimated_queries: 3,
  },
  {
    id: 'regression_watchlist',
    title: 'Regression Watchlist',
    description: 'Issues most likely to regress after fixing — what to monitor.',
    prompt: 'After I fix my top findings, which ones are most likely to regress? Think about: configuration that could be overwritten by deploys, third-party dependencies that could change, seasonal patterns, CMS-managed content that teams might edit. For each regression risk, suggest what automated monitoring I should set up and how often to re-verify.',
    category: 'measurement',
    min_plan: 'pro',
    tags: ['regression', 'monitoring', 'watchlist', 'maintenance'],
    estimated_queries: 2,
  },
  {
    id: 'revenue_seasonal_risk',
    title: 'Seasonal Revenue Risk',
    description: 'Which findings get worse during peak traffic — Black Friday, holidays, campaigns.',
    prompt: 'Analyze my findings through a seasonal lens. If I run a major promotion (Black Friday, holiday sale, product launch) that brings 5-10x normal traffic, which findings would cause the most damage under high volume? Think about: checkout failures under load, trust signals that don\'t scale, payment issues that multiply, support bottlenecks. Rank findings by "peak traffic damage multiplier" and create a pre-launch checklist of what to fix before any major campaign.',
    category: 'revenue_leaks',
    min_plan: 'vestigio',
    tags: ['seasonal', 'peak', 'campaign', 'black-friday', 'traffic'],
    estimated_queries: 2,
  },
];

// ──────────────────────────────────────────────
// Access Control
// ──────────────────────���───────────────────────

const PLAN_RANK: Record<PlanKey, number> = { vestigio: 0, pro: 1, max: 2 };

export function getAvailablePlaybookPrompts(plan: PlanKey): PlaybookPrompt[] {
  const rank = PLAN_RANK[plan];
  return PLAYBOOK_PROMPTS.filter(p => PLAN_RANK[p.min_plan] <= rank);
}

export function getPlaybookPromptsByCategory(plan: PlanKey): Record<PlaybookCategory, PlaybookPrompt[]> {
  const available = getAvailablePlaybookPrompts(plan);
  const result = {} as Record<PlaybookCategory, PlaybookPrompt[]>;

  for (const cat of Object.keys(PLAYBOOK_CATEGORY_META) as PlaybookCategory[]) {
    result[cat] = available.filter(p => p.category === cat);
  }

  return result;
}

export function getPlaybookPrompt(id: string): PlaybookPrompt | null {
  return PLAYBOOK_PROMPTS.find(p => p.id === id) || null;
}

export function getAllCategories(): PlaybookCategory[] {
  return Object.keys(PLAYBOOK_CATEGORY_META) as PlaybookCategory[];
}
