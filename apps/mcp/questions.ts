import { McpSessionContext } from './types';
import { ProjectionResult, FindingProjection } from '../../packages/projections';
import { ImpactSummary } from '../../packages/impact';

// ──────────────────────────────────────────────
// Next-Best-Question Engine
//
// Generates contextual follow-up questions based on:
// - highest impact findings not yet explored
// - lowest confidence areas
// - packs/root causes not yet investigated
// - user's exploration history
//
// Returns 3-5 non-repetitive suggestions.
// ──────────────────────────────────────────────

const ALL_PACKS = ['scale_readiness', 'revenue_integrity', 'chargeback_resilience'];

const PACK_LABELS: Record<string, string> = {
  scale_readiness: 'scale readiness',
  revenue_integrity: 'revenue integrity',
  chargeback_resilience: 'chargeback resilience',
};

export function generateNextQuestions(
  session: McpSessionContext,
  projections: ProjectionResult,
  impactSummary: ImpactSummary,
): string[] {
  const candidates: { question: string; score: number }[] = [];
  const asked = new Set(session.exploration_state.asked_questions);

  // 1. High-impact unexplored findings
  const unexploredFindings = projections.findings.filter(
    f => !(session.selected_findings || []).includes(f.id),
  );
  if (unexploredFindings.length > 0) {
    const top = unexploredFindings[0]; // already sorted by impact
    const q = `What's driving the ${formatCurrency(top.impact.midpoint)}/mo loss from "${top.title}"?`;
    if (!asked.has(q)) candidates.push({ question: q, score: top.impact.midpoint });
  }

  // 2. Unexplored packs
  const unexploredPacks = ALL_PACKS.filter(
    p => !session.exploration_state.explored_packs.includes(p),
  );
  for (const pack of unexploredPacks) {
    const packFindings = projections.findings.filter(f => f.pack === pack);
    if (packFindings.length > 0) {
      const totalImpact = packFindings.reduce((s, f) => s + f.impact.midpoint, 0);
      const q = `Want to explore your ${PACK_LABELS[pack] || pack} issues? (${formatCurrency(totalImpact)}/mo at stake)`;
      if (!asked.has(q)) candidates.push({ question: q, score: totalImpact });
    }
  }

  // 3. Low confidence areas
  const lowConfFindings = projections.findings.filter(f => f.confidence < 50);
  if (lowConfFindings.length > 0) {
    const q = `${lowConfFindings.length} finding(s) have low confidence. Should we run verification to strengthen them?`;
    if (!asked.has(q)) candidates.push({ question: q, score: 5000 });
  }

  // 4. Unexplored root causes
  const exploredRCs = new Set(session.exploration_state.explored_root_causes);
  const allRootCauses = new Set(projections.findings.map(f => f.root_cause).filter(Boolean) as string[]);
  const unexploredRCs = [...allRootCauses].filter(rc => !exploredRCs.has(rc));
  if (unexploredRCs.length > 0) {
    const rcFindings = projections.findings.filter(f => f.root_cause === unexploredRCs[0]);
    const rcImpact = rcFindings.reduce((s, f) => s + f.impact.midpoint, 0);
    const q = `Should we investigate "${unexploredRCs[0]}" as a root cause? (${rcFindings.length} issues, ${formatCurrency(rcImpact)}/mo)`;
    if (!asked.has(q)) candidates.push({ question: q, score: rcImpact });
  }

  // 5. Maps not viewed
  const unexploredMaps = ['revenue_leakage', 'chargeback_risk', 'root_cause'].filter(
    m => !session.exploration_state.explored_maps.includes(m),
  );
  if (unexploredMaps.includes('revenue_leakage') && impactSummary.total_monthly_loss_mid > 0) {
    const q = `Want to see how revenue is leaking through the checkout flow?`;
    if (!asked.has(q)) candidates.push({ question: q, score: 3000 });
  }
  if (unexploredMaps.includes('root_cause')) {
    const q = `Want to see how all your issues connect in the root cause map?`;
    if (!asked.has(q)) candidates.push({ question: q, score: 2500 });
  }

  // 6. Verification suggestion
  if (impactSummary.total_monthly_loss_mid > 10000) {
    const q = `Do you want to validate the highest-impact issue with a live browser check?`;
    if (!asked.has(q)) candidates.push({ question: q, score: 4000 });
  }

  // 7. Cross-pack analysis
  const crossPackActions = projections.actions.filter(a => a.cross_pack);
  if (crossPackActions.length > 0 && !asked.has('cross_pack_analysis')) {
    const q = `${crossPackActions.length} action(s) fix issues across multiple areas. Want to see the cross-pack impact?`;
    if (!asked.has(q)) candidates.push({ question: q, score: 6000 });
  }

  // 8. Change report awareness — suggest if not yet explored
  if (projections.change_report) {
    const cr = projections.change_report;
    if (cr.regression_count > 0) {
      const q = `${cr.regression_count} regression(s) detected since last analysis. Want to see what got worse?`;
      if (!asked.has(q)) candidates.push({ question: q, score: 7000 });
    }
    if (cr.improvement_count > 0) {
      const q = `${cr.improvement_count} improvement(s) since last analysis. Want to see what got better?`;
      if (!asked.has(q)) candidates.push({ question: q, score: 3500 });
    }
    if (cr.resolved_count > 0) {
      const q = `${cr.resolved_count} issue(s) were resolved. Want a summary of what's fixed?`;
      if (!asked.has(q)) candidates.push({ question: q, score: 3000 });
    }
  }

  // Sort by score desc, take top 5
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 5).map(c => c.question);
}

// ──────────────────────────────────────────────
// Finding-specific prompt generation
// ──────────────────────────────────────────────

export function generateFindingPrompts(finding: FindingProjection): string[] {
  const prompts: string[] = [];

  // Always include "why" and "fix" prompts
  prompts.push(`Why is "${finding.title}" happening?`);
  prompts.push(`What's the fastest way to fix this?`);

  // Impact-specific
  if (finding.impact.midpoint >= 10000) {
    prompts.push(`How much is this costing me exactly?`);
  }

  // Root cause exploration
  if (finding.root_cause) {
    prompts.push(`What else is caused by "${finding.root_cause}"?`);
  }

  // Pack-specific
  if (finding.pack === 'chargeback_resilience') {
    prompts.push(`How does this affect my chargeback rate?`);
  } else if (finding.pack === 'scale_readiness') {
    prompts.push(`Will this get worse when I scale traffic?`);
  } else if (finding.pack === 'revenue_integrity') {
    prompts.push(`How much revenue am I losing from this?`);
  }

  // Verification prompt for low confidence
  if (finding.confidence < 60) {
    prompts.push(`Can we verify this with a live check?`);
  }

  return prompts.slice(0, 3);
}

// ──────────────────────────────────────────────
// Multi-finding prompt generation
// ──────────────────────────────────────────────

export function generateMultiFindingPrompts(
  findings: FindingProjection[],
  sharedRootCauses: string[],
): string[] {
  const prompts: string[] = [];

  prompts.push(`What should I fix first across these ${findings.length} issues?`);

  if (sharedRootCauses.length > 0) {
    prompts.push(`Are these caused by the same underlying issue?`);
    prompts.push(`Can one fix solve multiple problems here?`);
  } else {
    prompts.push(`Are any of these issues connected?`);
    prompts.push(`Which of these has the biggest compounding effect?`);
  }

  return prompts.slice(0, 3);
}

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}
