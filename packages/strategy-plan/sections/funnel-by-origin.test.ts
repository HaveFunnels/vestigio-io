import { describe, it, expect } from "vitest";
import { computeMeasuredFunnel, type FunnelSession } from "./behavioral-measurement";

// ──────────────────────────────────────────────
// The funnel was pooled, and that is why it could not be used.
//
// computeMeasuredFunnel was called once over every session: paid,
// organic, direct, and the control group the traffic statement uses as
// its baseline, all in one ladder. So the only place in the product
// with named funnel stages did not separate traffic, while the only
// place that separates traffic had no stages. Two halves of the same
// feature in two files that never spoke.
//
// These tests assert the property that makes the split worth having:
// pooling two populations with different shapes produces a ladder that
// describes neither.
// ──────────────────────────────────────────────

/** A session that got as far as `stage` and stopped. */
function at(stage: "arrived" | "product" | "cart" | "checkout" | "paid"): FunnelSession {
	const reached = ["arrived", "product", "cart", "checkout", "paid"];
	const i = reached.indexOf(stage);
	return {
		surfaces: i >= 3 ? ["/produto", "/checkout"] : i >= 1 ? ["/produto"] : ["/"],
		highestMilestone: null,
		checkoutReached: i >= 3,
		cartAddCount: i >= 2 ? 1 : 0,
		shippingStepReached: i >= 3,
		paymentStepReached: i >= 3,
		confirmationSeen: i >= 4,
		startedAt: new Date("2026-11-01T12:00:00.000Z"),
	};
}

function many(n: number, stage: Parameters<typeof at>[0]) {
	return Array.from({ length: n }, () => at(stage));
}

describe("pooling two populations describes neither", () => {
	// Paid traffic: mostly bounces. Organic: mostly converts. The
	// pooled ladder sits between the two and matches no real visitor.
	const paid = [...many(800, "arrived"), ...many(150, "product"), ...many(50, "cart")];
	const organic = [...many(100, "arrived"), ...many(300, "cart"), ...many(600, "checkout")];

	it("gives a different first-step drop for each population", () => {
		const fPaid = computeMeasuredFunnel(paid, "pt-BR");
		const fOrg = computeMeasuredFunnel(organic, "pt-BR");
		expect(fPaid).not.toBe(null);
		expect(fOrg).not.toBe(null);
		// The two ladders must not be interchangeable, which is the
		// entire reason for splitting them.
		expect(JSON.stringify(fPaid)).not.toBe(JSON.stringify(fOrg));
	});

	it("produces a pooled ladder that matches neither input", () => {
		const fPaid = JSON.stringify(computeMeasuredFunnel(paid, "pt-BR"));
		const fOrg = JSON.stringify(computeMeasuredFunnel(organic, "pt-BR"));
		const fAll = JSON.stringify(computeMeasuredFunnel([...paid, ...organic], "pt-BR"));
		expect(fAll).not.toBe(fPaid);
		expect(fAll).not.toBe(fOrg);
	});

	it("keeps refusing to draw a ladder below the session floor", () => {
		// The floor still applies per population, which is the honest
		// consequence of splitting: a small account may now get a paid
		// funnel and no control funnel, and that is better than one
		// ladder describing both.
		expect(computeMeasuredFunnel(many(5, "arrived"), "pt-BR")).toBe(null);
	});
});
