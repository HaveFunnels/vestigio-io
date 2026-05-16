// ──────────────────────────────────────────────
// Scoped ID Generator — UUID-backed, no global state
//
// Wave 18l — changed `next()` from a per-instance counter to a
// UUID-suffixed id. Pre-fix every consumer started a new generator
// with counter=0, so two different cycles (or two different
// enrichment passes within the same cycle) produced the same
// `${prefix}_1`, `${prefix}_2`, ... sequence and collided on the
// Evidence PK whenever those ids reached the database.
//
// The collision was first observed for `IdGenerator("bv")` in the
// browser-verification worker — `bv_1` from the first havefunnels
// audit dated 2026-05-06 collided with every subsequent Stage D
// invocation. Pre-Wave-H the failure was swallowed by a "non-fatal"
// try/catch around `addMany()`, so Stage D evidence quietly
// disappeared for ten days. Wave H made the persistence error
// fatal, which surfaced six MORE call sites with the same pattern
// (sub, recon, bim, nuc, kat, vev, auth, auth_sim — any of which
// would have failed the next full audit that exercised the
// corresponding enrichment).
//
// Switching the base class is safer than fixing 7 sites individually:
//   - The remaining ~30 call sites generate ids for in-memory
//     engine objects (Signals, Inferences, Decisions, RootCauses,
//     Workspaces, Actions, RiskEvaluations) that get serialised
//     into JSON columns. UUIDs work just as well there as counters
//     — equality/lookup in Maps still works.
//   - One pass closes the entire bug class instead of waiting for
//     each remaining site to fail in production.
//
// `current()` keeps returning a sequential counter so the few call
// sites that build human-readable evidence_keys like
// `auth_session_${ids.current()}` still get readable suffixes that
// are unique within a single generator instance. The PK uses the
// UUID for global uniqueness; the (cycleRef, evidenceKey)
// composite index uses the counter for human readability — both
// constraints satisfied.
// ──────────────────────────────────────────────

// Webpack (Next.js client bundle) doesn't handle the `node:` URI
// scheme — keep the bare `crypto` import to match other producers
// (workers/ingestion/parser.ts, browser-worker.ts) and let the
// Next.js server bundle pick up Node's crypto without complaints.
import { randomUUID } from "crypto";

export class IdGenerator {
	private counter = 0;

	constructor(private prefix: string) {}

	next(): string {
		this.counter++;
		return `${this.prefix}_${randomUUID()}`;
	}

	reset(): void {
		this.counter = 0;
	}

	current(): number {
		return this.counter;
	}
}

export function createIdGenerator(prefix: string): IdGenerator {
	return new IdGenerator(prefix);
}
