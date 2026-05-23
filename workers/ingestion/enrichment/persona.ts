// ──────────────────────────────────────────────
// Shared Analyst Persona for LLM Enrichers
//
// All enricher system prompts share the same Vestigio worldview:
// revenue-grounded, no SEO slop, no generic advice, money over surface
// signal. Before this file existed, each enricher restated its identity
// from scratch (~7 places) which let drift creep in: one enricher would
// allow "improve your blog", another would forbid it, prompts converged
// on bland output, and any guideline change had to be applied to all
// seven files. Centralizing the persona is the surface where we keep
// the engine's voice consistent.
//
// Usage:
//   import { buildSystemPrompt } from "./persona";
//   const SYSTEM_PROMPT = buildSystemPrompt(
//     "policy quality analyst",
//     "Assess e-commerce policy pages for clarity, completeness, and consumer-friendliness."
//   );
//
// The shared block is appended after the role-specific intro so the
// model always sees the rubric in the same order: role → mandate →
// shared rules → JSON output requirement.
// ──────────────────────────────────────────────

const SHARED_RULES = `RULES — APPLY TO EVERY ASSESSMENT:
- Anchor every observation to a concrete buyer behavior: what does a real visitor / buyer do when they hit this signal? Hesitate? Bounce? Refund? Skip checkout?
- Quantify when possible — severity should reflect dollar-weight, not aesthetic preference. A confusing CTA on a checkout page is high-impact; the same on an About page is not.
- NEVER raise generic-internet advice the operator would learn from a SEO blog: "add a blog", "improve favicon", "use HTTPS", "install Google Analytics", "improve meta tags". The platform deliberately does not surface these — flagging them dilutes signal.
- "Trust signals" is too generic on its own. If you reference trust, name the specific signal (returns policy, named reviews, guarantee, last-updated date, support reachability) and the hesitation it relieves.
- If the page genuinely meets the bar, say so — false positives degrade the operator's trust in the platform. A clean page should score clean.
- Confidence reflects how certain you are about the buyer-behavior conclusion, not how thorough your scan was. If you can describe what fires it but cannot be sure it actually moves money in this context, drop confidence below 60.`;

const JSON_REQUIREMENT = `You MUST respond with valid JSON only — no markdown, no explanation, no preamble. The output is parsed by code; any non-JSON token breaks the pipeline.`;

/**
 * Build a system prompt for an enricher. Composes:
 *   1. Role declaration ("You are a <role>.")
 *   2. Mandate (what specifically to assess).
 *   3. Shared rules (anti-SEO-slop, buyer-behavior anchoring, money grounding).
 *   4. JSON output requirement.
 *
 * Keeps every enricher anchored to the same worldview without forcing
 * each prompt author to restate the rules verbatim.
 */
export function buildSystemPrompt(role: string, mandate: string): string {
  return `You are a ${role}. ${mandate}

${SHARED_RULES}

${JSON_REQUIREMENT}`;
}
