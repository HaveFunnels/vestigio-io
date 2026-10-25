import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// The exposure aggregate is the plan's headline money and the count
// shown beside it. Those two must describe the same set of findings.
//
// Behavioural findings carry impactMidpoint = 0, meaning "not
// modelled". They matched the exposure query on polarity and status,
// so the plan would have said "exposure of R$ 58,752 across 14
// findings" while five of the fourteen contributed nothing to the
// number. Found by enabling them in production and reading the
// resulting hero metrics.

const SRC = fs.readFileSync(
	path.join(__dirname, "honest-aggregates.ts"),
	"utf8",
);

describe("open-loss exposure", () => {
	it("excludes findings that contribute no modelled money", () => {
		expect(SRC).toMatch(/impactMidpoint:\s*\{\s*gt:\s*0\s*\}/);
	});

	it("still restricts to active, non-positive findings", () => {
		// The filter must narrow the set, not replace its existing
		// semantics: positive-polarity findings are the "retained"
		// aggregate and resolved ones are history.
		expect(SRC).toContain('polarity: { in: ["negative", "neutral"] }');
		expect(SRC).toContain('status: { in: ["created", "confirmed", "regressed"] }');
		// The money filter must sit in the same query as those two.
		const q = SRC.slice(SRC.indexOf("const raw = cycleId"));
		const firstSelect = q.indexOf("select:");
		expect(q.slice(0, firstSelect)).toMatch(/impactMidpoint:\s*\{\s*gt:\s*0\s*\}/);
	});
});
