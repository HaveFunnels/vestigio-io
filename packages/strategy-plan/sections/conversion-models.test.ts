import { describe, it, expect } from "vitest";
import { buildTrafficStatement, sawNothing } from "./traffic-statement";

// ──────────────────────────────────────────────
// The same bug, three times, and the test that should stop the fourth.
//
// Three separate defects shipped with one shape: a definition written
// for a store, applied to a business that does not work like a store,
// inverting the sign on its best traffic.
//
//   1. The scroll proxy. A lawyer's best visitor converts above the
//      fold and never scrolls 25%, so "saw nothing" condemned exactly
//      the person who converted.
//   2. The action. Service models read handoff_started, which is false
//      on every session ever recorded, so their conversion counted
//      zero.
//   3. The cost of pausing. Priced in purchases, which means a
//      thank-you page that no service business has, so "pausar não
//      custa nada" was permanently true and the verdict permanently
//      "cortar".
//
// Each was found by a reviewer, from outside, after shipping. The
// lesson is not about any of the three definitions: it is that
// "checkout" is still the default everything gets written against, and
// nothing in the suite was exercising the other three models.
//
// So this file does. For every conversion model, the visitor who
// represents that model's BEST outcome must survive all three gates.
// A new model-sensitive definition that forgets a model fails here
// instead of reaching a customer.
// ──────────────────────────────────────────────

/** What a converting visit looks like in each business. */
const BEST_VISIT: Record<string, Record<string, unknown>> = {
	// A store: reached the checkout.
	checkout: { max_scroll_depth: 60, checkout_reached: true, reached_thank_you: true },
	purchase: { max_scroll_depth: 60, checkout_reached: true, reached_thank_you: true },
	// A lawyer or an accountant: read the first screen and opened
	// WhatsApp without ever scrolling.
	form: {
		max_scroll_depth: 0,
		surface_progression: ["a"],
		contact_channels: ["whatsapp"],
		contact_started: true,
	},
	// An esthetician: the whole business is the message.
	whatsapp: {
		max_scroll_depth: 0,
		surface_progression: ["a"],
		contact_channels: ["whatsapp"],
		contact_started: true,
	},
	// A parts distributor: the mechanic confirms stock and phones.
	external: {
		max_scroll_depth: 0,
		surface_progression: ["a"],
		contact_channels: ["phone"],
		contact_started: true,
	},
};

const MODELS = Object.keys(BEST_VISIT);

function sessions(n: number, over: Record<string, unknown>, id = "111111111111") {
	return Array.from({ length: n }, () => ({
		aggregate: {
			attribution: { first_touch: { source: "FB", campaign: `C|${id}` } },
			...over,
		},
		eventCount: 5,
		userAgent: null,
	}));
}

const WIN = { windowStart: "2026-10-09", windowEnd: "2026-11-08" };

describe.each(MODELS)("conversion model: %s", (model) => {
	const best = BEST_VISIT[model];

	it("never counts the converting visit as having done nothing", () => {
		expect(sawNothing(best)).toBe(false);
	});

	it("counts the converting visit as having reached the action", () => {
		const st = buildTrafficStatement(sessions(200, best), {
			...WIN,
			conversionModel: model,
		});
		expect(st.campaigns[0].reachedAction).toBe(200);
	});

	it("makes pausing cost something when the campaign converts", () => {
		// The third bug. If this is zero, the verdict will say cut and
		// claim it is free, which is how a service business gets told to
		// kill the campaign bringing its leads.
		const st = buildTrafficStatement(sessions(200, best), {
			...WIN,
			conversionModel: model,
		});
		const row = st.campaigns[0];
		expect(row.pauseCost).toBeGreaterThan(0);
		expect(row.pauseCostUnit).toBe(
			model === "checkout" || model === "purchase" ? "compras" : "contatos",
		);
	});

	it("never recommends cutting a campaign that is converting", () => {
		// Even when that campaign also wastes a lot of traffic, which is
		// the realistic case: a campaign can be 70% mute and still be
		// the one paying the rent.
		const mute = {
			max_scroll_depth: 0,
			surface_progression: ["a"],
		};
		const rows = [
			...sessions(420, mute, "111111111111"),
			...sessions(180, best, "111111111111"),
			...sessions(120, mute, "222222222222"),
			...sessions(480, { max_scroll_depth: 80 }, "222222222222"),
			...sessions(110, mute, "333333333333"),
			...sessions(490, { max_scroll_depth: 80 }, "333333333333"),
		];
		const st = buildTrafficStatement(rows, { ...WIN, conversionModel: model });
		const worst = st.campaigns.find((c) => c.platformId === "111111111111")!;
		expect(worst.arrivedBlindPct).toBe(70);
		expect(worst.pauseCost).toBeGreaterThan(0);
		expect(worst.verdict).not.toBe("cortar");
	});
});

describe("the default is still checkout, and that is the risk", () => {
	it("falls back to checkout when no model is declared", () => {
		// Documented rather than fixed: most accounts are stores and the
		// fallback is right for them. What was wrong was that nothing
		// exercised the other three, which is what the suite above now
		// does.
		const st = buildTrafficStatement(sessions(200, BEST_VISIT.checkout), WIN);
		expect(st.campaigns[0].reachedAction).toBe(200);
		expect(st.campaigns[0].pauseCostUnit).toBe("compras");
	});

	it("covers every model the statement branches on", () => {
		// If a new model is added to reachedAction and not here, this
		// is the line that should start looking wrong.
		expect(MODELS.sort()).toEqual(
			["checkout", "external", "form", "purchase", "whatsapp"].sort(),
		);
	});
});
