import { FreshnessState, SubjectType } from './enums';

// ──────────────────────────────────────────────
// Cross-cutting contracts
// ──────────────────────────────────────────────

export interface Freshness {
  observed_at: Date;
  fresh_until: Date;
  freshness_state: FreshnessState;
  staleness_reason: string | null;
}

export interface Scoping {
  workspace_ref: string;
  environment_ref: string;
  subject_ref: string;
  path_scope: string | null;
}

export interface SubjectRef {
  type: SubjectType;
  id: string;
  label?: string;
}

export type Ref = string; // format: "entity_type:id"

export function makeRef(type: string, id: string): Ref {
  return `${type}:${id}`;
}

export function parseRef(ref: Ref): { type: string; id: string } {
  const idx = ref.indexOf(':');
  if (idx === -1) throw new Error(`Invalid ref: ${ref}`);
  return { type: ref.slice(0, idx), id: ref.slice(idx + 1) };
}

export interface Range {
  low: number | null;
  mid: number | null;
  high: number | null;
}

export interface Timestamped {
  created_at: Date;
  updated_at: Date;
}
