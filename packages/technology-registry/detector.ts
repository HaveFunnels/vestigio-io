import { TECHNOLOGY_REGISTRY } from './registry';
import { TechnologyDefinition, DetectedTechnology, TechnologyStackProjection, TechnologyCategory } from './types';

// ──────────────────────────────────────────────
// Technology Detector
//
// Runs all registered technology patterns against
// collected page data. Produces DetectedTechnology[]
// and a TechnologyStackProjection for frontend.
// ──────────────────────────────────────────────

export interface DetectionInput {
  /** External script src URLs collected from the site */
  script_srcs: string[];
  /** External iframe src URLs collected from the site */
  iframe_srcs: string[];
  /** Raw HTML body content (for html_content patterns) */
  html_bodies: string[];
  /** Inline script content (for inline_script patterns) */
  inline_scripts: string[];
  /** Page URLs where each source was found */
  page_urls: string[];
}

/**
 * Detect all recognized technologies from collected evidence.
 */
export function detectTechnologies(input: DetectionInput): DetectedTechnology[] {
  const results = new Map<string, DetectedTechnology>();

  for (const tech of TECHNOLOGY_REGISTRY) {
    const detection = matchTechnology(tech, input);
    if (detection) {
      const existing = results.get(tech.key);
      if (existing) {
        existing.confidence = Math.max(existing.confidence, detection.confidence);
        for (const url of detection.detected_on) {
          if (!existing.detected_on.includes(url)) {
            existing.detected_on.push(url);
          }
        }
      } else {
        results.set(tech.key, detection);
      }
    }
  }

  return Array.from(results.values());
}

/**
 * Build a frontend-ready technology stack projection.
 */
export function buildTechnologyStackProjection(
  technologies: DetectedTechnology[],
): TechnologyStackProjection {
  const byCategory: Record<TechnologyCategory, DetectedTechnology[]> = {
    platform: [],
    payment_provider: [],
    analytics: [],
    tag_manager: [],
    support_widget: [],
    consent_manager: [],
    error_tracking: [],
    ab_testing: [],
    cdn: [],
    email_marketing: [],
    other: [],
  };

  for (const tech of technologies) {
    const cat = byCategory[tech.category];
    if (cat) cat.push(tech);
    else byCategory.other.push(tech);
  }

  return {
    technologies,
    by_category: byCategory,
    total_detected: technologies.length,
    summary: {
      has_analytics: byCategory.analytics.length > 0,
      has_tag_manager: byCategory.tag_manager.length > 0,
      has_support_widget: byCategory.support_widget.length > 0,
      has_consent_manager: byCategory.consent_manager.length > 0,
      has_error_tracking: byCategory.error_tracking.length > 0,
      payment_providers: byCategory.payment_provider.map(t => t.display_name),
      platforms: byCategory.platform.map(t => t.display_name),
    },
  };
}

/**
 * Lookup a technology by normalized key.
 */
export function lookupTechnology(key: string): TechnologyDefinition | undefined {
  return TECHNOLOGY_REGISTRY.find(t => t.key === key);
}

// ── Internal ────────────────────────────────────

function matchTechnology(
  tech: TechnologyDefinition,
  input: DetectionInput,
): DetectedTechnology | null {
  let bestConfidence = 0;
  let detectionSource = '';
  const detectedOn: string[] = [];

  for (const pattern of tech.detection) {
    let matched = false;

    switch (pattern.source) {
      case 'script_src':
        for (let i = 0; i < input.script_srcs.length; i++) {
          if (pattern.pattern.test(input.script_srcs[i])) {
            matched = true;
            if (input.page_urls[i] && !detectedOn.includes(input.page_urls[i])) {
              detectedOn.push(input.page_urls[i]);
            }
          }
        }
        break;

      case 'iframe_src':
        for (let i = 0; i < input.iframe_srcs.length; i++) {
          if (pattern.pattern.test(input.iframe_srcs[i])) {
            matched = true;
          }
        }
        break;

      case 'html_content':
        for (const body of input.html_bodies) {
          if (pattern.pattern.test(body)) {
            matched = true;
            break;
          }
        }
        break;

      case 'inline_script':
        for (const script of input.inline_scripts) {
          if (pattern.pattern.test(script)) {
            matched = true;
            break;
          }
        }
        break;
    }

    if (matched && pattern.confidence > bestConfidence) {
      bestConfidence = pattern.confidence;
      detectionSource = pattern.source;
    }
  }

  if (bestConfidence === 0) return null;

  return {
    key: tech.key,
    display_name: tech.display_name,
    category: tech.category,
    confidence: bestConfidence,
    detection_source: detectionSource,
    logo_key: tech.logo_key,
    detected_on: detectedOn.length > 0 ? detectedOn : input.page_urls.slice(0, 1),
  };
}
