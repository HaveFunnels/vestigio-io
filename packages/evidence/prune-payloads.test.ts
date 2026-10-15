import { describe, it, expect } from "vitest";
import {
	PRUNED_PAYLOAD,
	PAYLOAD_PRUNE_DAYS,
	KEEP_RECENT_CYCLES,
} from "./prune-payloads";

// The prune itself is one SQL statement and is proven against real
// data by scripts/validate-evidence-payload-prune.ts. What is worth
// pinning here is the sentinel's contract, because the obvious
// "simplification" of it is the one that breaks production silently.

describe("pruned payload sentinel", () => {
	it("survives the JSON.parse every reader does", () => {
		// packages/evidence/prisma-store.ts does
		// `typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload`.
		// An empty string throws there, so blanking the column, the
		// intuitive way to free the space, would turn a pruned row into
		// a crash on read.
		expect(() => JSON.parse(PRUNED_PAYLOAD)).not.toThrow();
		expect(() => JSON.parse("")).toThrow();
	});

	it("parses to an object a reader can test, not to a plausible payload", () => {
		const parsed = JSON.parse(PRUNED_PAYLOAD);
		expect(parsed).toEqual({ _pruned: true });
		// "{}" would also parse, but reads as "this evidence had no
		// fields" rather than "this payload was dropped", which is the
		// difference between an empty finding and a known gap.
		expect(PRUNED_PAYLOAD).not.toBe("{}");
	});

	it("stays small enough that pruning is not self-defeating", () => {
		// 538k rows carry this; at a kilobyte it would cost more than
		// some of what it replaced.
		expect(PRUNED_PAYLOAD.length).toBeLessThan(64);
	});

	it("keeps enough cycles for carry-forward to have a source", () => {
		// carryEvidenceForward reads the cycle before the running one.
		// A running cycle is itself the most recent, so the source is
		// the second. Anything below 2 would let the prune eat it.
		expect(KEEP_RECENT_CYCLES).toBeGreaterThanOrEqual(2);
		expect(PAYLOAD_PRUNE_DAYS).toBeGreaterThan(0);
	});
});
