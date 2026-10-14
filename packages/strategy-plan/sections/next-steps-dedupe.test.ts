import { describe, it, expect } from "vitest";
import { dedupeByRootProblem } from "./next-steps";

// Regression fence for EXAME P15: the September plan sold the missing
// refund policy as three separate steps (R$ 15.375 + R$ 16.650 +
// R$ 10.000 — R$ 42k of triple-counted money) and session-cookie flags
// as two. One root problem = one step.

const row = (id: string, keys: string[]) => ({ id, inferenceKeys: keys });

describe("dedupeByRootProblem", () => {
	it("keeps only the highest-ranked step per shared inference key", () => {
		const ranked = [
			row("refund-1", ["refund_policy_gap", "policy_gap"]),
			row("cookies-1", ["buyer_session_theft_risk"]),
			row("refund-2", ["refund_policy_gap"]), // same root as refund-1
			row("cta", ["cta_clarity_weak_on_commercial"]),
			row("cookies-2", ["buyer_session_theft_risk"]), // same root as cookies-1
			row("depth", ["page_depth_before_conversion"]),
		];
		const out = dedupeByRootProblem(ranked, 5);
		expect(out.map((r) => r.id)).toEqual(["refund-1", "cookies-1", "cta", "depth"]);
	});

	it("partial overlap counts as the same root", () => {
		const ranked = [
			row("a", ["policy_gap", "refund_policy_gap"]),
			row("b", ["refund_policy_gap", "checkout_trust_gap"]),
		];
		expect(dedupeByRootProblem(ranked, 5).map((r) => r.id)).toEqual(["a"]);
	});

	it("prefers fewer distinct steps over padding to the limit", () => {
		const ranked = [
			row("a", ["k1"]),
			row("b", ["k1"]),
			row("c", ["k1"]),
		];
		expect(dedupeByRootProblem(ranked, 5)).toHaveLength(1);
	});

	it("keeps actions with no linked keys (they cannot collide)", () => {
		const ranked = [row("a", ["k1"]), row("b", []), row("c", [])];
		expect(dedupeByRootProblem(ranked, 5)).toHaveLength(3);
	});

	it("respects the limit", () => {
		const ranked = Array.from({ length: 10 }, (_, i) => row(`r${i}`, [`k${i}`]));
		expect(dedupeByRootProblem(ranked, 5)).toHaveLength(5);
	});

	// The P15 fence above only fires when two actions share a literal
	// key. October slipped past it: Casa Montelle shipped "Loja sem
	// política de troca visível" (R$ 15.375, ['refund_policy_gap']) as
	// step 1 and "Políticas de proteção ao consumidor ausentes"
	// (R$ 10.000, ['policy_gap']) as step 3 — disjoint keys, same
	// missing page, billed twice, with two artifacts that contradicted
	// each other on who pays return shipping.
	it("collapses different names for the same root problem", () => {
		const ranked = [
			row("refund", ["refund_policy_gap"]),
			row("policy", ["policy_gap"]),
		];
		expect(dedupeByRootProblem(ranked, 5).map((r) => r.id)).toEqual(["refund"]);
	});

	it("collapses the cta-clarity family", () => {
		const ranked = [
			row("clarity", ["cta_clarity_weak_on_commercial"]),
			row("competing", ["cta_competing_or_unclear"]),
			row("weak", ["weak_cta_on_commercial"]),
		];
		expect(dedupeByRootProblem(ranked, 5).map((r) => r.id)).toEqual(["clarity"]);
	});

	// Over-merging would hide real findings, so keys that merely sound
	// related must survive as separate steps when the work differs.
	it("does NOT merge keys whose remediation is different work", () => {
		const ranked = [
			// write the missing policy page
			row("missing", ["refund_policy_gap"]),
			// move an existing guarantee next to the buy button
			row("placement", ["guarantee_invisible_at_decision"]),
			// a business metric, not a page
			row("rate", ["high_refund_rate_eroding_revenue"]),
			// a rendering/timing problem, not CTA hierarchy
			row("timing", ["primary_cta_delayed"]),
			row("hierarchy", ["cta_clarity_weak_on_commercial"]),
		];
		expect(dedupeByRootProblem(ranked, 5)).toHaveLength(5);
	});
});
