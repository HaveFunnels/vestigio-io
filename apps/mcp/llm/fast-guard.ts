// ──────────────────────────────────────────────
// Fast Guard — Deterministic Input Classifier
//
// Scoring-based classifier that handles ~80% of inputs
// with zero LLM cost. Only ambiguous cases escalate to Haiku.
//
// Architecture:
//   Score = vestigio_signals + question_signals + personal_penalty + dirty_signals
//   If score > CLEAN_THRESHOLD  → immediately return clean
//   If score < DIRTY_THRESHOLD  → immediately return blocked
//   Otherwise                   → escalate to Haiku
//
// Key insight: single commerce keywords ("trust", "conversion")
// appear in many non-business contexts. The guard requires
// COMPOUND Vestigio-specific phrases ("trust signals",
// "conversion funnel") or analytical context ("analyze my",
// "show me findings") to score high.
// ──────────────────────────────────────────────

import type { InputGuardResult, InputGuardCategory } from './types';

// ── Thresholds ──────────────────────────────

/** Score above this = definitely clean, skip Haiku */
const CLEAN_THRESHOLD = 5;
/** Score below this = definitely dirty, skip Haiku */
const DIRTY_THRESHOLD = -3;

// ── Tier 1: Vestigio-Specific Compound Phrases ──
// These phrases are very unlikely in non-business contexts.
// High weight — a single match is strong evidence.

const VESTIGIO_PHRASES: Array<{ pattern: RegExp; weight: number }> = [
  // Revenue analysis phrases
  { pattern: /\b(?:revenue\s+leak|revenue\s+loss|revenue\s+impact|losing\s+(?:money|revenue))\b/i, weight: 4 },
  { pattern: /\b(?:conversion\s+(?:funnel|rate|path|flow|bottleneck|friction))\b/i, weight: 4 },
  { pattern: /\b(?:chargeback\s+(?:risk|rate|exposure|prevention|resilience))\b/i, weight: 4 },
  { pattern: /\b(?:trust\s+(?:signal|badge|indicator|score|gap|audit))\b/i, weight: 4 },
  { pattern: /\b(?:checkout\s+(?:friction|flow|redirect|abandon|conversion|page|process))\b/i, weight: 4 },
  { pattern: /\b(?:onboarding\s+(?:friction|flow|experience|funnel))\b/i, weight: 4 },
  { pattern: /\b(?:scale\s+(?:readiness|traffic|safely)|safely\s+scale)\b/i, weight: 4 },
  { pattern: /\b(?:landing\s+(?:page|vs|promise))\b/i, weight: 3 },
  // Impact in financial context
  { pattern: /\$[\d,.]+\s*\/?\s*(?:mo|month|year|day|week)\b/i, weight: 4 },
  { pattern: /\b(?:monthly|annual|daily)\s+(?:loss|revenue|impact|cost)\b/i, weight: 3 },
  // Vestigio-specific entities
  { pattern: /\b(?:finding|findings|root\s+cause|action\s+(?:item|plan)|decision\s+pack)\b/i, weight: 3 },
  { pattern: /\b(?:workspace|preflight|severity\s+(?:badge|level)|impact\s+range)\b/i, weight: 3 },
  // Analytical request patterns
  { pattern: /\b(?:analyze|audit|assess|evaluate|review)\s+(?:my|the|our)\s+(?:site|store|shop|checkout|findings|data|metrics)\b/i, weight: 4 },
  { pattern: /\b(?:show|list|get|compare)\s+(?:my|the|all)\s+(?:findings|actions|root\s+causes|risks|issues)\b/i, weight: 4 },
  { pattern: /\b(?:what|where|how)\s+(?:am\s+I|are\s+we|is\s+my)\s+(?:losing|leaking|wasting|risking)\b/i, weight: 4 },
  { pattern: /\b(?:fix\s+first|prioritize|priority\s+(?:score|order|list))\b/i, weight: 3 },
  // E-commerce infrastructure
  { pattern: /\b(?:ssl|https|payment\s+(?:gateway|provider|method)|stripe|paypal|shopify)\b/i, weight: 3 },
  { pattern: /\b(?:social\s+proof|testimonial|customer\s+review|money.back\s+guarantee)\b/i, weight: 3 },
  // Pricing / billing analysis
  { pattern: /\b(?:pricing\s+(?:page|friction|transparency|confusion)|hidden\s+fees|billing\s+(?:frequency|descriptor))\b/i, weight: 3 },
  { pattern: /\b(?:free\s+trial|upgrade|downgrade|paywall|pricing\s+tier)\b/i, weight: 3 },
  // CTA / UX analysis
  { pattern: /\b(?:cta|call.to.action|drop.off|bait\s+and\s+switch|value\s+prop)\b/i, weight: 3 },
  { pattern: /\b(?:post.click|click.through|above.the.fold|user\s+experience)\b/i, weight: 3 },
  // "Based on my findings" / "my audit" — strong Vestigio context
  { pattern: /\b(?:based\s+on\s+(?:my|the)\s+(?:findings|audit|data|analysis))\b/i, weight: 4 },
  { pattern: /\b(?:my\s+(?:site|store|shop|app|website|checkout|pricing|conversion|traffic|findings|audit))\b/i, weight: 3 },
  // Dollar amounts
  { pattern: /\$[\d,.]+/i, weight: 2 },
  // Percentage with context
  { pattern: /\b\d+\s*%\s*(?:confidence|conversion|bounce|churn|rate)\b/i, weight: 3 },
];

// ── Tier 2: Single Commerce Keywords ────────
// These appear in non-business contexts too.
// Low weight — need multiple to reach threshold.

const COMMERCE_KEYWORDS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /\b(?:ecommerce|e-commerce|saas)\b/i, weight: 2 },
  { pattern: /\b(?:revenue|chargeback|checkout|funnel|cart|billing|invoice|subscription|churn)\b/i, weight: 1 },
  { pattern: /\b(?:arpu|ltv|mrr|arr|ctr|roi|kpi|aov)\b/i, weight: 2 }, // acronyms are unambiguous
  { pattern: /\b(?:analytics|dashboard|metric)\b/i, weight: 1 },
  // Generic question words (very low weight)
  { pattern: /\b(?:where|what|how|why|show|explain|compare|list)\b/i, weight: 0 }, // 0 = no contribution alone
];

// ── Tier 3: Personal/Emotional Context Signals ──
// When detected, these REDUCE the clean score because
// they indicate commerce words are used metaphorically.

const PERSONAL_CONTEXT: Array<{ pattern: RegExp; penalty: number }> = [
  // Relationships
  { pattern: /\b(?:girlfriend|boyfriend|wife|husband|partner|spouse|marriage|married|dating|relationship|friend|friendship)\b/i, penalty: -4 },
  { pattern: /\b(?:namorad[oa]|esposa|marido|casamento|amig[oa]|relacionamento|noiv[oa])\b/i, penalty: -4 }, // Portuguese
  { pattern: /\b(?:novia|novio|esposa|esposo|matrimonio|amig[oa]|relación)\b/i, penalty: -4 }, // Spanish
  // Emotions
  { pattern: /\b(?:devastated|heartbroken|depressed|anxious|lonely|sad|happy|emotional|feeling|cry|crying)\b/i, penalty: -3 },
  { pattern: /\b(?:triste|feliz|deprimid[oa]|ansios[oa]|solidão|chorar|emocion)\b/i, penalty: -3 }, // Portuguese
  // Personal activities
  { pattern: /\b(?:birthday|party|wedding|vacation|holiday|beach|gym|cooking|recipe|dinner)\b/i, penalty: -3 },
  { pattern: /\b(?:aniversário|festa|casamento|férias|praia|academia|receita|jantar)\b/i, penalty: -3 }, // Portuguese
  { pattern: /\b(?:cumpleaños|fiesta|boda|vacaciones|playa|receta)\b/i, penalty: -3 }, // Spanish
  // Religion
  { pattern: /\b(?:religion|religious|church|temple|god|pray|buddhis|christian|muslim|faith|spiritual)\b/i, penalty: -3 },
  { pattern: /\b(?:religião|religios[oa]|igreja|templo|deus|rezar|espiritual|conversão\s+(?:para|ao|à))\b/i, penalty: -3 }, // Portuguese
  // Medical/accident
  { pattern: /\b(?:doctor|hospital|medical|accident|injury|health|diagnosis|surgery|therapy|therapist)\b/i, penalty: -3 },
  { pattern: /\b(?:médico|hospital|acidente|saúde|cirurgia|terapia)\b/i, penalty: -3 }, // Portuguese
  // Education/homework
  { pattern: /\b(?:homework|school|university|class|teacher|professor|exam|grade|dever\s+de\s+casa|escola|universidade)\b/i, penalty: -3 },
  // General non-business phrases
  { pattern: /\b(?:my\s+(?:life|love|family|kids|children|parents|brother|sister|dog|cat))\b/i, penalty: -3 },
  { pattern: /\b(?:minha\s+(?:vida|família|filh[oa]s?|pais|irmã[oa]?))\b/i, penalty: -3 }, // Portuguese
  // Employment context (not e-commerce analysis)
  { pattern: /\b(?:my\s+boss|performance\s+review|coworker|colleague|office|cubicle|HR|human\s+resources)\b/i, penalty: -3 },
  // Stock market / personal finance
  { pattern: /\b(?:stock\s+market|bolsa\s+de\s+valores|investir|invest\s+my\s+money|savings\s+account|401k|cryptocurrency|bitcoin|crypto)\b/i, penalty: -3 },
  // General trivia / knowledge
  { pattern: /\b(?:capital\s+(?:of|da|de|del)|quem\s+(?:é|foi|era)|what\s+year|when\s+was|who\s+(?:is|was))\b/i, penalty: -3 },
  // Creative requests (PT/ES)
  { pattern: /\b(?:escreva|conte|diga|escriba|cuéntame)\s+(?:um|uma|me|un|una)/i, penalty: -3 },
  { pattern: /\b(?:piada|poema|história|chiste|poesía|cuento)\b/i, penalty: -3 },
];

// ── Dirty Signal Patterns ───────────────────
// Each match adds negative score (input is suspicious)

const INJECTION_SIGNALS: Array<{ pattern: RegExp; weight: number; category: InputGuardCategory }> = [
  // Direct injection attempts
  { pattern: /(?:ignore|disregard|forget|dismiss)\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+(?:instructions|prompts|directions|rules|context)/i, weight: -8, category: 'prompt_injection' },
  { pattern: /(?:you|I)\s+(?:am|are)\s+now\s+(?:a|an|the|my)\b/i, weight: -6, category: 'prompt_injection' },
  { pattern: /(?:new|switch|override|change)\s+(?:mode|persona|identity|character|role)/i, weight: -6, category: 'prompt_injection' },
  { pattern: /\b(?:DAN|STAN|DUDE|GRANDMA|EVIL|HIDDEN|JAILBREAK)\b/, weight: -8, category: 'prompt_injection' },
  { pattern: /do\s+anything\s+now/i, weight: -7, category: 'prompt_injection' },
  { pattern: /(?:pretend|act|assume|roleplay|imagine)\s+(?:to\s+)?(?:be|you'?re|that)\b/i, weight: -5, category: 'prompt_injection' },
  { pattern: /system\s*prompt/i, weight: -6, category: 'prompt_injection' },
  { pattern: /what\s+(?:are|is|were)\s+your\s+(?:instructions|rules|system|initial|original)/i, weight: -5, category: 'prompt_injection' },
  { pattern: /repeat\s+(?:your|the)\s+(?:system|initial|original|first)\s+(?:prompt|message|instructions)/i, weight: -7, category: 'prompt_injection' },
  { pattern: /(?:bypass|exploit|hack|leak|extract)\s+(?:the|your|this)\b/i, weight: -5, category: 'prompt_injection' },
  { pattern: /(?:reveal|show|output|print|display)\s+(?:your|the|system)\s+(?:prompt|instructions|rules)/i, weight: -7, category: 'prompt_injection' },
  { pattern: /\[\s*(?:SYSTEM|INST|ASSISTANT)\s*\]/i, weight: -6, category: 'prompt_injection' },
  { pattern: /```\s*(?:system|instruction|prompt)/i, weight: -5, category: 'prompt_injection' },
  { pattern: /(?:sudo|root|admin)\s+(?:mode|access|override)/i, weight: -4, category: 'prompt_injection' },

  // PII patterns
  { pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, weight: -6, category: 'pii_detected' },
  { pattern: /\b\d{3}[\s-]\d{2}[\s-]\d{4}\b/, weight: -6, category: 'pii_detected' },
  { pattern: /\bpassword\s*[:=]\s*\S+/i, weight: -5, category: 'pii_detected' },

  // XSS patterns
  { pattern: /<\s*script/i, weight: -8, category: 'xss_detected' },
  { pattern: /javascript\s*:/i, weight: -7, category: 'xss_detected' },
  { pattern: /\bon\w+\s*=\s*["']/i, weight: -6, category: 'xss_detected' },
  { pattern: /<\s*(?:iframe|object|embed|applet|form|input)\b/i, weight: -6, category: 'xss_detected' },

  // Off-topic (creative/code/personal)
  { pattern: /\b(?:write|compose|create|generate|make)\s+(?:a\s+|me\s+(?:a\s+)?)?(?:poem|song|story|essay|letter|email|code|function|script|program|article|blog|tweet)\b/i, weight: -4, category: 'off_topic' },
  { pattern: /\b(?:translate|summarize)\s+(?:this|the\s+following)\s+(?:article|text|passage|document)\b/i, weight: -3, category: 'off_topic' },
  { pattern: /\b(?:recipe|weather|sports|politics|celebrity|movie|game|joke|riddle|trivia|homework|ocean|mountain|nature|poem)\b/i, weight: -3, category: 'off_topic' },
  { pattern: /\b(?:who\s+(?:is|was)|when\s+(?:was|did)|where\s+(?:is|was))\s+\w+\s+(?:born|invented|discovered|located|founded)\b/i, weight: -3, category: 'off_topic' },

  // Policy violations
  { pattern: /\b(?:kill|murder|bomb|weapon|illegal|drugs|terroris)/i, weight: -8, category: 'policy_violation' },
  { pattern: /\b(?:hate|racial|sexist|homophob|transphob)\b/i, weight: -5, category: 'policy_violation' },
];

// ── Scoring Engine ──────────────────────────

export interface FastGuardResult {
  /** Whether the fast guard could make a decision */
  decided: boolean;
  /** The result if decided, null if escalation needed */
  result: InputGuardResult | null;
  /** Raw score for debugging */
  score: number;
  /** Top matched category for dirty signals */
  topDirtyCategory: InputGuardCategory | null;
}

export function fastGuard(input: string): FastGuardResult {
  let score = 0;
  let topDirtyCategory: InputGuardCategory | null = null;
  let topDirtyWeight = 0;

  // 1. Accumulate Vestigio-specific phrase signals (high confidence)
  for (const { pattern, weight } of VESTIGIO_PHRASES) {
    if (pattern.test(input)) {
      score += weight;
    }
  }

  // 2. Accumulate generic commerce keyword signals (low confidence)
  for (const { pattern, weight } of COMMERCE_KEYWORDS) {
    if (pattern.test(input)) {
      score += weight;
    }
  }

  // 3. Apply personal/emotional context penalties
  //    These reduce clean score when commerce words are used metaphorically
  for (const { pattern, penalty } of PERSONAL_CONTEXT) {
    if (pattern.test(input)) {
      score += penalty; // penalty is negative
    }
  }

  // 4. Accumulate dirty signals (injection, XSS, off-topic, policy)
  for (const { pattern, weight, category } of INJECTION_SIGNALS) {
    if (pattern.test(input)) {
      score += weight; // weight is negative
      if (Math.abs(weight) > Math.abs(topDirtyWeight)) {
        topDirtyWeight = weight;
        topDirtyCategory = category;
      }
    }
  }

  // 5. Density check — long inputs with few signals are suspicious
  //    If input is >200 chars but clean score is marginal, escalate
  if (input.length > 200 && score > 0 && score <= CLEAN_THRESHOLD + 2) {
    // Reduce score for long inputs that barely pass
    // (sprinkled keywords in a wall of off-topic text)
    score = Math.min(score, CLEAN_THRESHOLD - 1);
  }

  // Very short inputs with no signals → escalate (could be anything)
  if (input.length < 10 && score === 0) {
    return { decided: false, result: null, score, topDirtyCategory };
  }

  // ── Decision ──────────────────────────────
  if (score >= CLEAN_THRESHOLD) {
    return {
      decided: true,
      result: { safe: true, category: 'clean', reason: `Fast guard: clean (score ${score})` },
      score,
      topDirtyCategory,
    };
  }

  if (score <= DIRTY_THRESHOLD) {
    const category = topDirtyCategory || 'off_topic';
    return {
      decided: true,
      result: { safe: false, category, reason: `Fast guard: blocked (score ${score}, ${category})` },
      score,
      topDirtyCategory,
    };
  }

  // Ambiguous — escalate to Haiku
  return { decided: false, result: null, score, topDirtyCategory };
}
