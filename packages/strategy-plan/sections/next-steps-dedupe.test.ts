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
});
