import { describe, it, expect } from "vitest";
import {
	computeMeasuredFunnel,
	type FunnelSession,
} from "./behavioral-measurement";

// ONDA 2.1 — the measured e-commerce funnel: counted sessions, stage by
// stage, never fabricated. These pin the gates and the stage semantics.

function session(over: Partial<FunnelSession>): FunnelSession {
	return {
		surfaces: ["/"],
		highestMilestone: "awareness_seen",
		checkoutReached: false,
		cartAddCount: 0,
		shippingStepReached: false,
		paymentStepReached: false,
		confirmationSeen: false,
		...over,
	};
}

function build(
	counts: { bounce: number; product: number; cart: number; checkout: number; payment: number; paid: number },
): FunnelSession[] {
	const out: FunnelSession[] = [];
	for (let i = 0; i < counts.bounce; i++) out.push(session({}));
	for (let i = 0; i < counts.product; i++)
		out.push(session({ surfaces: ["/", "/products/x"] }));
	for (let i = 0; i < counts.cart; i++)
		out.push(session({ surfaces: ["/", "/products/x", "/cart"], cartAddCount: 1 }));
	for (let i = 0; i < counts.checkout; i++)
		out.push(
			session({ surfaces: ["/", "/products/x", "/cart"], cartAddCount: 1, checkoutReached: true }),
		);
	for (let i = 0; i < counts.payment; i++)
		out.push(
			session({
				surfaces: ["/", "/products/x", "/cart"],
				cartAddCount: 1,
				checkoutReached: true,
				paymentStepReached: true,
			}),
		);
	for (let i = 0; i < counts.paid; i++)
		out.push(
			session({
				surfaces: ["/", "/products/x", "/cart"],
				cartAddCount: 1,
				checkoutReached: true,
				paymentStepReached: true,
				confirmationSeen: true,
			}),
		);
	return out;
}

describe("computeMeasuredFunnel", () => {
	it("computes monotonic stages with pct of arrived", () => {
		const f = computeMeasuredFunnel(
			build({ bounce: 400, product: 300, cart: 150, checkout: 90, payment: 40, paid: 20 }),
			"pt-BR",
		)!;
		expect(f).not.toBeNull();
		const byKey = Object.fromEntries(f.stages.map((s) => [s.key, s]));
		expect(byKey.arrived.sessions).toBe(1000);
		expect(byKey.product.sessions).toBe(600); // everyone from product onward
		expect(byKey.cart.sessions).toBe(300);
		expect(byKey.checkout.sessions).toBe(150);
		expect(byKey.payment.sessions).toBe(60);
		expect(byKey.paid.sessions).toBe(20);
		expect(byKey.paid.pctOfArrived).toBe(2);
	});

	it("names the biggest drop by absolute lost sessions", () => {
		const f = computeMeasuredFunnel(
			build({ bounce: 400, product: 300, cart: 150, checkout: 90, payment: 40, paid: 20 }),
			"pt-BR",
		)!;
		// arrived 1000 → product 600 loses 400 — the biggest.
		expect(f.biggestDrop?.fromLabel).toBe("Chegou no site");
		expect(f.biggestDrop?.lostSessions).toBe(400);
	});

	it("gates below the minimum session count", () => {
		expect(
			computeMeasuredFunnel(build({ bounce: 10, product: 5, cart: 3, checkout: 2, payment: 1, paid: 1 }), "pt-BR"),
		).toBeNull();
	});

	it("never fabricates a commerce funnel for a site with no commerce signal", () => {
		const sessions = Array.from({ length: 300 }, () =>
			session({ surfaces: ["/", "/blog/post"] }),
		);
		expect(computeMeasuredFunnel(sessions, "pt-BR")).toBeNull();
	});

	it("paid counts only confirmation_seen — never inferred from reaching payment", () => {
		const sessions = build({ bounce: 200, product: 100, cart: 50, checkout: 30, payment: 20, paid: 0 });
		const f = computeMeasuredFunnel(sessions, "pt-BR")!;
		const paid = f.stages.find((s) => s.key === "paid")!;
		expect(paid.sessions).toBe(0);
	});

	it("localizes labels", () => {
		const f = computeMeasuredFunnel(
			build({ bounce: 400, product: 300, cart: 150, checkout: 90, payment: 40, paid: 20 }),
			"en",
		)!;
		expect(f.stages[0].label).toBe("Arrived");
	});
});
