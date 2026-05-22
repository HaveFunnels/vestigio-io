// ──────────────────────────────────────────────
// Shared types for the pack-decomposed inference engine.
//
// Wave 20.6 — replaces the implicit "every inference function takes
// the same 6 args" convention from the pre-split monolith with a
// single PackInput interface. Each pack file exports `computePack`
// (or a more specific name) taking PackInput and returning Inference[].
//
// The orchestrator (engine.ts:computeInferences) constructs PackInput
// once per cycle and passes it to every pack.
// ──────────────────────────────────────────────

import type { Signal, Scoping, IdGenerator } from "../../domain";

export interface PackInput {
  /** Full signal array (in evaluation order). Most rules use `byKey` /
   *  `byAttribute` / `first` indexed accessors below; raw `signals`
   *  is here for the few rules that scan all signals (e.g., "any of
   *  these N signal_keys fired"). */
  signals: Signal[];
  /** Signals grouped by `attribute` field. Some attributes have many
   *  signals (e.g., per-page issues) so this is `Signal[]`, not single. */
  byAttribute: Map<string, Signal[]>;
  /** Signals indexed by stable `signal_key`. Most rules use this as
   *  the primary lookup. */
  byKey: Map<string, Signal>;
  /** Convenience: returns the first signal with the given attribute
   *  (the common case — most attributes have a single signal). */
  first: (attr: string) => Signal | undefined;
  scoping: Scoping;
  cycle_ref: string;
  /** Scoped IdGenerator. Each pack should NOT create its own
   *  IdGenerator — the orchestrator passes a shared one so all
   *  inference IDs within a cycle share the same `inf_*` prefix and
   *  monotonic counter. Pack-scoped IdGenerators were considered but
   *  rejected — would break deterministic ID ordering across cycles. */
  ids: IdGenerator;
}
