// ──────────────────────────────────────────────
// Funnel Gap Inference — Detects missing/weak connections between funnel stages
//
// Uses the classified page inventory + surface relations to identify:
//   1. Missing stages — business model expects a stage that has no pages
//   2. Broken paths — stage X exists but has no CTA-weight link to stage X+1
//   3. Weak connections — link exists but is nav/footer only (weight < 0.3)
//   4. Dead-end commercial pages — commercial page with no outbound CTA to next stage
//
// These findings are high-value because they identify structural revenue leaks:
// "Your pricing page exists but has no link to your signup page."
// ──────────────────────────────────────────────

import type { Inference, Signal, Evidence, Scoping } from '../domain';
import type { FunnelStageDefinition } from '../classification/funnel-resolver';

// ── Types ──

export interface FunnelGapInput {
  /** Classified pages with their types and URLs */
  pages: Array<{
    url: string;
    path: string;
    classifiedPageType: string;
    title: string | null;
  }>;
  /** Surface relations with edge score metadata */
  relations: Array<{
    sourceUrl: string;
    targetUrl: string;
    linkWeight: number;
    linkIntent: string;
  }>;
  /** Resolved funnel model stages */
  stages: FunnelStageDefinition[];
  /** Business model type */
  modelType: string;
  /** Evidence for signal construction */
  scoping: Scoping;
  cycleRef: string;
}

// ── Core Logic ──

export function computeFunnelGapInferences(input: FunnelGapInput): { signals: Signal[]; inferences: Inference[] } {
  const signals: Signal[] = [];
  const inferences: Inference[] = [];

  if (input.stages.length < 2 || input.pages.length === 0) {
    return { signals, inferences };
  }

  // Build lookup: which pages exist per stage
  const pagesByStage = new Map<string, typeof input.pages>();
  for (const page of input.pages) {
    for (const stage of input.stages) {
      if (stage.pageTypes.includes(page.classifiedPageType as any)) {
        let list = pagesByStage.get(stage.key);
        if (!list) { list = []; pagesByStage.set(stage.key, list); }
        list.push(page);
        break; // page belongs to first matching stage
      }
    }
  }

  // Build lookup: high-weight links between pages (weight >= 0.3)
  const ctaLinks = new Map<string, Set<string>>(); // sourceUrl → Set<targetUrl>
  for (const rel of input.relations) {
    if (rel.linkWeight >= 0.3) {
      let targets = ctaLinks.get(rel.sourceUrl);
      if (!targets) { targets = new Set(); ctaLinks.set(rel.sourceUrl, targets); }
      targets.add(rel.targetUrl);
    }
  }

  const sortedStages = [...input.stages].sort((a, b) => a.order - b.order);

  // 1. Missing stage detection
  for (const stage of sortedStages) {
    const pages = pagesByStage.get(stage.key);
    if (!pages || pages.length === 0) {
      // Stage has no pages — this is a gap
      signals.push({
        id: `funnel_gap_missing_stage_${stage.key}`,
        signal_type: 'funnel_gap',
        source: 'classification',
        payload: { gapType: 'missing_stage', stageKey: stage.key, stageLabel: stage.label, modelType: input.modelType },
        scoping: input.scoping,
        cycle_ref: input.cycleRef,
        confidence: 75,
      } as any);

      inferences.push({
        id: `inf_funnel_gap_missing_stage_${stage.key}`,
        inference_key: `funnel_missing_stage_${stage.key}`,
        category: 'funnel_integrity',
        scoping: input.scoping,
        cycle_ref: input.cycleRef,
        freshness: { state: 'fresh', age_seconds: 0 },
        conclusion: 'funnel_stage_missing',
        conclusion_value: 'true',
        severity_hint: 'high',
        confidence: 75,
        signal_refs: [`signal:funnel_gap_missing_stage_${stage.key}`],
        reasoning: `The ${input.modelType} funnel expects a "${stage.label}" stage, but no pages were classified as ${stage.pageTypes.join('/')}. Visitors cannot progress through this stage.`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any);
    }
  }

  // 2. Broken/weak path detection (between consecutive stages)
  for (let i = 0; i < sortedStages.length - 1; i++) {
    const currentStage = sortedStages[i];
    const nextStage = sortedStages[i + 1];
    const currentPages = pagesByStage.get(currentStage.key) || [];
    const nextPages = pagesByStage.get(nextStage.key) || [];

    if (currentPages.length === 0 || nextPages.length === 0) continue; // already caught by missing stage

    // Check if ANY page in current stage links to ANY page in next stage with CTA weight
    const nextUrls = new Set(nextPages.map(p => p.url));
    const nextPaths = new Set(nextPages.map(p => p.path));
    let hasCtaConnection = false;
    let hasAnyConnection = false;

    for (const page of currentPages) {
      const targets = ctaLinks.get(page.url);
      if (targets) {
        for (const target of targets) {
          if (nextUrls.has(target) || nextPaths.has(target)) {
            hasCtaConnection = true;
            break;
          }
          // Try pathname match
          try {
            const pathname = new URL(target).pathname;
            if (nextPaths.has(pathname)) { hasCtaConnection = true; break; }
          } catch {}
        }
      }
      if (hasCtaConnection) break;
    }

    // Check for any link at all (even nav/footer)
    if (!hasCtaConnection) {
      const allLinks = new Map<string, Set<string>>();
      for (const rel of input.relations) {
        let targets = allLinks.get(rel.sourceUrl);
        if (!targets) { targets = new Set(); allLinks.set(rel.sourceUrl, targets); }
        targets.add(rel.targetUrl);
      }

      for (const page of currentPages) {
        const targets = allLinks.get(page.url);
        if (targets) {
          for (const target of targets) {
            if (nextUrls.has(target) || nextPaths.has(target)) {
              hasAnyConnection = true;
              break;
            }
            try {
              const pathname = new URL(target).pathname;
              if (nextPaths.has(pathname)) { hasAnyConnection = true; break; }
            } catch {}
          }
        }
        if (hasAnyConnection) break;
      }
    }

    if (!hasCtaConnection) {
      const severity = hasAnyConnection ? 'medium' : 'critical';
      const gapType = hasAnyConnection ? 'weak_connection' : 'broken_path';
      const reasoning = hasAnyConnection
        ? `The "${currentStage.label}" stage links to "${nextStage.label}" only via navigation/footer links (no CTA). Visitors must actively search for the next step instead of being guided there.`
        : `The "${currentStage.label}" stage has NO link to the "${nextStage.label}" stage. Visitors cannot progress from ${currentStage.label} to ${nextStage.label} without manually navigating.`;

      signals.push({
        id: `funnel_gap_${gapType}_${currentStage.key}_to_${nextStage.key}`,
        signal_type: 'funnel_gap',
        source: 'classification',
        payload: {
          gapType,
          fromStage: currentStage.key,
          toStage: nextStage.key,
          fromLabel: currentStage.label,
          toLabel: nextStage.label,
          modelType: input.modelType,
        },
        scoping: input.scoping,
        cycle_ref: input.cycleRef,
        confidence: 80,
      } as any);

      inferences.push({
        id: `inf_funnel_gap_${gapType}_${currentStage.key}_to_${nextStage.key}`,
        inference_key: `funnel_${gapType}_${currentStage.key}_to_${nextStage.key}`,
        category: 'funnel_integrity',
        scoping: input.scoping,
        cycle_ref: input.cycleRef,
        freshness: { state: 'fresh', age_seconds: 0 },
        conclusion: `funnel_path_${gapType}`,
        conclusion_value: 'true',
        severity_hint: severity,
        confidence: 80,
        signal_refs: [`signal:funnel_gap_${gapType}_${currentStage.key}_to_${nextStage.key}`],
        reasoning,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any);
    }
  }

  // 3. Dead-end commercial pages (pages with no outbound CTA to any later stage)
  for (let i = 0; i < sortedStages.length - 1; i++) {
    const stage = sortedStages[i];
    const laterStages = sortedStages.slice(i + 1);
    const laterUrls = new Set<string>();
    const laterPaths = new Set<string>();
    for (const ls of laterStages) {
      const lsPages = pagesByStage.get(ls.key) || [];
      for (const p of lsPages) {
        laterUrls.add(p.url);
        laterPaths.add(p.path);
      }
    }

    if (laterUrls.size === 0) continue;

    const stagePages = pagesByStage.get(stage.key) || [];
    for (const page of stagePages) {
      const targets = ctaLinks.get(page.url);
      let linksToLater = false;
      if (targets) {
        for (const target of targets) {
          if (laterUrls.has(target) || laterPaths.has(target)) {
            linksToLater = true;
            break;
          }
          try {
            if (laterPaths.has(new URL(target).pathname)) { linksToLater = true; break; }
          } catch {}
        }
      }

      if (!linksToLater) {
        signals.push({
          id: `funnel_gap_dead_end_${page.path}`,
          signal_type: 'funnel_gap',
          source: 'classification',
          payload: { gapType: 'dead_end', pageUrl: page.url, pagePath: page.path, stageKey: stage.key, pageTitle: page.title },
          scoping: { ...input.scoping, path_scope: page.path },
          cycle_ref: input.cycleRef,
          confidence: 70,
        } as any);

        inferences.push({
          id: `inf_funnel_gap_dead_end_${page.path.replace(/\//g, '_')}`,
          inference_key: 'funnel_dead_end_page',
          category: 'funnel_integrity',
          scoping: { ...input.scoping, path_scope: page.path },
          cycle_ref: input.cycleRef,
          freshness: { state: 'fresh', age_seconds: 0 },
          conclusion: 'funnel_dead_end',
          conclusion_value: 'true',
          severity_hint: 'medium',
          confidence: 70,
          signal_refs: [`signal:funnel_gap_dead_end_${page.path}`],
          reasoning: `"${page.title || page.path}" (${stage.label} stage) has no CTA linking to any later funnel stage. Visitors who land here have no guided path toward conversion.`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any);
      }
    }
  }

  return { signals, inferences };
}
