import { describe, it, expect } from "vitest";
import {
	contradictionFor,
	suppressContradictedPositives,
	FRICTION_REFUTES_PCT,
} from "./contradicted-positives";

// Both cases below are verbatim from the 2026-11 plan of a paying
// customer, which stated each compliment in the same document that
// carried its refutation.

describe("low_friction_checkout", () => {
	const c = { inferenceKey: "low_friction_checkout", surface: "/" };

	it("is refuted by the 37.7% friction actually measured on checkout", () => {
		const reason = contradictionFor(c, {
			frictionPages: [{ path: "/c/NX-34D2C1686479", frictionRatePct: 37.7 }],
		});
		expect(reason).toContain("37.7");
		expect(reason).toContain("/c/NX-34D2C1686479");
	});

	it("survives when the purchase path really is clean", () => {
		expect(
			contradictionFor(c, { frictionPages: [{ path: "/checkout", frictionRatePct: 3.9 }] }),
		).toBeNull();
	});

	it("ignores friction measured somewhere other than the purchase path", () => {
		// A noisy blog page says nothing about the checkout.
		expect(
			contradictionFor(c, { frictionPages: [{ path: "/blog/post", frictionRatePct: 60 }] }),
		).toBeNull();
	});

	it("recognises the Brazilian path spellings and the tokenised cart", () => {
		for (const path of ["/carrinho", "/pagamento", "/pedido/9", "/c/NX-1"]) {
			expect(
				contradictionFor(c, { frictionPages: [{ path, frictionRatePct: 40 }] }),
				`${path} should refute`,
			).toBeTruthy();
		}
	});

	it("uses a threshold visibly above the section's own 'low' band", () => {
		// behavioral-measurement treats 5% as too low to explain a drop,
		// so a claim of NO friction has to clear more than that.
		expect(FRICTION_REFUTES_PCT).toBeGreaterThan(5);
		expect(
			contradictionFor(c, {
				frictionPages: [{ path: "/checkout", frictionRatePct: FRICTION_REFUTES_PCT - 0.1 }],
			}),
		).toBeNull();
	});

	it("survives when nothing was measured at all", () => {
		expect(contradictionFor(c, {})).toBeNull();
		expect(contradictionFor(c, { frictionPages: null })).toBeNull();
	});
});

describe("trust_continuity_good", () => {
	const c = { inferenceKey: "trust_continuity_good", surface: "/" };

	it("is NOT refuted by the customer's own payment subdomain", () => {
		// Worth being exact, because I first filed this as a
		// contradiction and it is not one. The claim is that the buyer
		// is not handed to someone else's host. seguro.casamontelle.com
		// IS the customer's host: the buyer sees casamontelle.com in the
		// address bar and the brand is continuous. A PCI consultant is
		// right that the extra host changes SAQ and cookie scope, but
		// that is a scope observation, not a refutation of trust
		// continuity, and conflating the two would withhold a true
		// compliment.
		expect(
			contradictionFor(c, {
				rootDomain: "casamontelle.com",
				citedHosts: ["https://seguro.casamontelle.com/order/4bba96a3-305d-4bcb-823b-abefafdb48bd"],
			}),
		).toBeNull();
	});

	it("is refuted by a third-party payment host", () => {
		expect(
			contradictionFor(c, {
				rootDomain: "shop.com",
				citedHosts: ["https://pay.external.com/checkout"],
			}),
		).toContain("pay.external.com");
	});

	it("survives when no host was cited or no domain is known", () => {
		expect(contradictionFor(c, { rootDomain: "shop.com", citedHosts: [] })).toBeNull();
		expect(contradictionFor(c, { citedHosts: ["https://other.com/x"] })).toBeNull();
	});
});

describe("suppressContradictedPositives", () => {
	it("keeps the innocent and reports why each one was dropped", () => {
		const { kept, suppressed } = suppressContradictedPositives(
			[
				{ inferenceKey: "low_friction_checkout", surface: "/" },
				{ inferenceKey: "trust_continuity_good", surface: "/" },
				{ inferenceKey: "measurement_covered", surface: "/" },
			],
			{
				rootDomain: "casamontelle.com",
				citedHosts: ["https://seguro.casamontelle.com/order/1"],
				frictionPages: [{ path: "/c/NX-1", frictionRatePct: 37.7 }],
			},
		);
		// trust_continuity_good survives: the cited host is the
		// customer's own subdomain, so nothing refutes it.
		expect(kept.map((k) => k.inferenceKey)).toEqual([
			"trust_continuity_good",
			"measurement_covered",
		]);
		expect(suppressed).toHaveLength(1);
		for (const s of suppressed) expect(s.reason).toBeTruthy();
	});

	it("leaves an unknown positive check alone", () => {
		// The gate only knows how to refute what it has a rule for. It
		// must never withhold a compliment it cannot actually disprove.
		const { kept } = suppressContradictedPositives(
			[{ inferenceKey: "some_future_check", surface: "/" }],
			{ frictionPages: [{ path: "/checkout", frictionRatePct: 99 }] },
		);
		expect(kept).toHaveLength(1);
	});
});
