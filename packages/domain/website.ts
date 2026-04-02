import { PageTier, PageType } from './enums';
import { Freshness, Timestamped } from './common';

// ──────────────────────────────────────────────
// Website — monitored technical subject
// ──────────────────────────────────────────────

export interface Website extends Timestamped {
  id: string;
  environment_ref: string;
  domain: string;
  root_url: string;
  is_primary: boolean;
}

// ──────────────────────────────────────────────
// Page Inventory Item — classified known page
// ──────────────────────────────────────────────

export interface PageInventoryItem extends Timestamped {
  id: string;
  website_ref: string;
  environment_ref: string;
  normalized_url: string;
  path: string;
  path_scope: string | null;
  page_type: PageType;
  tier: PageTier;
  priority: number;
  criticality: number;
  title: string | null;
  status_code: number | null;
  freshness: Freshness;
}

// ──────────────────────────────────────────────
// Surface Relation — structural edge between surfaces
// ──────────────────────────────────────────────

export interface SurfaceRelation extends Timestamped {
  id: string;
  website_ref: string;
  source_url: string;
  target_url: string;
  relation_type: RelationType;
  source_host: string;
  target_host: string;
  is_same_domain: boolean;
  confidence: number;
  cycle_ref: string;
  metadata: Record<string, unknown>;
}

export type RelationType =
  | 'anchor'
  | 'form_action'
  | 'iframe_src'
  | 'script_src'
  | 'stylesheet_src'
  | 'redirect'
  | 'canonical_external'
  | 'intent_target'
  | 'runtime_navigation'
  | 'runtime_request'
  | 'runtime_checkout_handoff';
