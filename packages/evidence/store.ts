import { Evidence, EvidenceType, Ref } from '../domain';

// ──────────────────────────────────────────────
// Evidence Store — typed evidence persistence
// ──────────────────────────────────────────────

export interface EvidenceQuery {
  cycle_ref?: string;
  environment_ref?: string;
  subject_ref?: string;
  evidence_type?: EvidenceType;
  workspace_ref?: string;
}

export class EvidenceStore {
  private evidence: Map<string, Evidence> = new Map();

  add(evidence: Evidence): void {
    this.evidence.set(evidence.id, evidence);
  }

  addMany(items: Evidence[]): void {
    for (const e of items) {
      this.evidence.set(e.id, e);
    }
  }

  get(id: string): Evidence | undefined {
    return this.evidence.get(id);
  }

  getByRef(ref: Ref): Evidence | undefined {
    const id = ref.startsWith('evidence:') ? ref.slice(9) : ref;
    return this.evidence.get(id);
  }

  query(q: EvidenceQuery): Evidence[] {
    let results = Array.from(this.evidence.values());

    if (q.cycle_ref) {
      results = results.filter((e) => e.cycle_ref === q.cycle_ref);
    }
    if (q.environment_ref) {
      results = results.filter(
        (e) => e.scoping.environment_ref === q.environment_ref,
      );
    }
    if (q.subject_ref) {
      results = results.filter(
        (e) => e.scoping.subject_ref === q.subject_ref,
      );
    }
    if (q.evidence_type) {
      results = results.filter((e) => e.evidence_type === q.evidence_type);
    }
    if (q.workspace_ref) {
      results = results.filter(
        (e) => e.scoping.workspace_ref === q.workspace_ref,
      );
    }

    return results;
  }

  getByCycle(cycle_ref: string): Evidence[] {
    return this.query({ cycle_ref });
  }

  getByType(cycle_ref: string, type: EvidenceType): Evidence[] {
    return this.query({ cycle_ref, evidence_type: type });
  }

  count(): number {
    return this.evidence.size;
  }

  clear(): void {
    this.evidence.clear();
  }
}
