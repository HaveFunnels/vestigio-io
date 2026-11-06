import { describe, it, expect } from "vitest";
import {
	buildTrafficStatement,
	splitCampaignRef,
	MIN_SESSIONS_PER_CAMPAIGN,
	SAW_SOMETHING_MILESTONE,
} from "./traffic-statement";

function session(over: Record<string, unknown> = {}, eventCount = 5) {
	return {
		eventCount,
		aggregate: {
			max_scroll_depth: 0,
			session_duration_ms: 5_000,
			checkout_reached: false,
			reached_thank_you: false,
			attribution: {
				first_touch: {
					source: "FB",
					campaign: "Campanha A|120253133140740114",
					landing_url: "https://loja.com/products/x",
				},
			},
			...over,
		},
	};
}

function many(n: number, over: Record<string, unknown> = {}, eventCount = 5) {
	return Array.from({ length: n }, () => session(over, eventCount));
}

const WIN = { windowStart: "2026-10-06", windowEnd: "2026-11-05" };

describe("splitCampaignRef", () => {
	it("splits on the LAST pipe, because names contain pipes", () => {
		// Real campaign name from the instrumented account. Splitting on
		// the first pipe truncates it to "(1-3-X".
		const raw = "(1-3-X | H1-H4/C1 | POTE) aberto adv+ (21/09)|52602394623344";
		const { name, platformId } = splitCampaignRef(raw);
		expect(name).toBe("(1-3-X | H1-H4/C1 | POTE) aberto adv+ (21/09)");
		expect(platformId).toBe("52602394623344");
	});

	it("treats a non-numeric tail as part of the name", () => {
		expect(splitCampaignRef("Promo | Black Friday").platformId).toBeNull();
		expect(splitCampaignRef("Promo | Black Friday").name).toBe("Promo | Black Friday");
	});

	it("handles a name with no pipe", () => {
		expect(splitCampaignRef("Simples")).toEqual({ name: "Simples", platformId: null });
	});
});

describe("bot gate", () => {
	it("drops sessions with fewer than three events", () => {
		// Same floor the friction measurement already uses, so the two
		// surfaces cannot disagree about what counts as a visit.
		const st = buildTrafficStatement([...many(400, {}, 2)], WIN);
		expect(st.measuredSessions).toBe(0);
		expect(st.campaigns).toHaveLength(0);
	});

	it("reports attribution coverage against measured, not raw", () => {
		const st = buildTrafficStatement(
			[
				...many(300),
				...many(100, { attribution: { first_touch: { source: "direct" } } }),
			],
			WIN,
		);
		expect(st.measuredSessions).toBe(400);
		expect(st.attributedSessions).toBe(300);
		expect(st.attributionCoveragePct).toBe(75);
	});
});

describe("ranking", () => {
	it("ranks by EXCESS waste, so a huge normal campaign does not lead", () => {
		// Both mistakes encoded as one test. Rate alone fires on the small
		// bad channel and ignores the big one; raw volume puts the biggest
		// campaign on top even when it performs at the account median,
		// which is what I shipped first and caught on the real account:
		// the four top rows came back "entregando".
		const huge = many(3_000, {
			max_scroll_depth: 0,
			attribution: { first_touch: { source: "FB", campaign: "Grande|111111111111" } },
		}).concat(
			many(1_000, {
				max_scroll_depth: 50,
				attribution: { first_touch: { source: "FB", campaign: "Grande|111111111111" } },
			}),
		);
		const normal = many(700, {
			max_scroll_depth: 0,
			attribution: { first_touch: { source: "FB", campaign: "Normal|222222222222" } },
		}).concat(
			many(300, {
				max_scroll_depth: 50,
				attribution: { first_touch: { source: "FB", campaign: "Normal|222222222222" } },
			}),
		);
		const outlier = many(812, {
			max_scroll_depth: 0,
			attribution: { first_touch: { source: "FB", campaign: "Fora|333333333333" } },
		});

		const st = buildTrafficStatement([...huge, ...normal, ...outlier], WIN);
		const first = st.campaigns[0];

		// "Grande" wastes 3,000 arrivals, more than anyone. "Fora" wastes
		// 812. Excess puts "Fora" first because its rate is far above the
		// account's own normal.
		expect(first.name).toBe("Fora");
		expect(first.verdict).toBe("desperdicio");

		const grande = st.campaigns.find((c) => c.name === "Grande")!;
		expect(grande.arrivedBlind).toBeGreaterThan(first.arrivedBlind);
		expect(grande.excessBlind).toBeLessThan(first.excessBlind);
	});

	it("gives a campaign at or below the median zero excess", () => {
		const a = many(1_000, {
			max_scroll_depth: 0,
			attribution: { first_touch: { source: "FB", campaign: "A|111111111111" } },
		});
		const b = many(1_000, {
			max_scroll_depth: 0,
			attribution: { first_touch: { source: "FB", campaign: "B|222222222222" } },
		});
		const st = buildTrafficStatement([...a, ...b], WIN);
		// Both at 100%, so both ARE the median. Neither is an outlier,
		// however bad the absolute number looks.
		for (const c of st.campaigns) {
			expect(c.excessBlind).toBe(0);
			expect(c.verdict).toBe("entregando");
		}
		// And the account-level truth is still stated.
		expect(st.totals.arrivedBlind).toBe(2_000);
	});
});

describe("verdict", () => {
	it("compares against this account's own median, not an absolute", () => {
		// Measured reality: across 35 campaigns the no-scroll rate runs
		// 66% to 100% with a median of 77%. An absolute threshold would
		// condemn the entire account or nothing in it.
		const normalA = many(1_000, {
			max_scroll_depth: 0,
			attribution: { first_touch: { source: "FB", campaign: "A|111111111111" } },
		}).concat(
			many(300, {
				max_scroll_depth: 50,
				attribution: { first_touch: { source: "FB", campaign: "A|111111111111" } },
			}),
		);
		const normalB = many(700, {
			max_scroll_depth: 0,
			attribution: { first_touch: { source: "FB", campaign: "B|222222222222" } },
		}).concat(
			many(300, {
				max_scroll_depth: 50,
				attribution: { first_touch: { source: "FB", campaign: "B|222222222222" } },
			}),
		);
		const outlier = many(500, {
			max_scroll_depth: 0,
			attribution: { first_touch: { source: "FB", campaign: "C|333333333333" } },
		});

		const st = buildTrafficStatement([...normalA, ...normalB, ...outlier], WIN);
		// A is 77%, B is 70%, C is 100%. Median of the three is 77%.
		expect(st.accountMedianBlindPct).toBeCloseTo(76.9, 0);

		const byName = new Map(st.campaigns.map((c) => [c.name, c]));
		expect(byName.get("C")!.verdict).toBe("desperdicio");
		expect(byName.get("A")!.verdict).toBe("entregando");
		expect(byName.get("C")!.pointsAboveAccount).toBeGreaterThan(10);
	});

	it("says nothing about a campaign below the session floor", () => {
		const st = buildTrafficStatement(many(MIN_SESSIONS_PER_CAMPAIGN - 1), WIN);
		expect(st.campaigns).toHaveLength(0);
		expect(st.belowFloor.campaigns).toBe(1);
		expect(st.belowFloor.sessions).toBe(MIN_SESSIONS_PER_CAMPAIGN - 1);
	});
});

describe("the action that matters", () => {
	it("judges a store on reaching checkout", () => {
		const st = buildTrafficStatement(many(400, { checkout_reached: true }), {
			...WIN,
			conversionModel: "checkout",
		});
		expect(st.campaigns[0].reachedActionPct).toBe(100);
	});

	it("judges a service business on starting the form, not on checkout", () => {
		// A lawyer has no checkout. Judging him on one would score his
		// best campaign at zero.
		const rows = many(400, { form_started: true, checkout_reached: false });
		const asStore = buildTrafficStatement(rows, { ...WIN, conversionModel: "checkout" });
		const asService = buildTrafficStatement(rows, { ...WIN, conversionModel: "form" });
		expect(asStore.campaigns[0].reachedAction).toBe(0);
		expect(asService.campaigns[0].reachedAction).toBe(400);
	});

	it("judges a WhatsApp business on the handoff", () => {
		const st = buildTrafficStatement(many(400, { support_opened: true }), {
			...WIN,
			conversionModel: "whatsapp",
		});
		expect(st.campaigns[0].reachedAction).toBe(400);
	});
});

describe("the statement as a whole", () => {
	it("carries no money, deliberately", () => {
		const st = buildTrafficStatement(many(400), WIN);
		const asText = JSON.stringify(st);
		// The money model computes every R$ from a constant, and twenty
		// reviewers scored confidence in the numbers at 3.6. Counting is
		// not contestable. Spend belongs here when it is real.
		expect(asText).not.toMatch(/brl|revenue|R\$/i);
	});

	it("names where the traffic landed, for the ad-or-page question", () => {
		const st = buildTrafficStatement(many(400), WIN);
		expect(st.campaigns[0].topLandingPath).toBe("/products/x");
	});

	it("uses the first scroll milestone as the 'saw something' line", () => {
		expect(SAW_SOMETHING_MILESTONE).toBe(25);
		const sighted = buildTrafficStatement(many(400, { max_scroll_depth: 25 }), WIN);
		expect(sighted.campaigns[0].arrivedBlind).toBe(0);
	});
});

describe("the cost of pausing", () => {
	it("states what each waste campaign still produces", () => {
		// The statement's only suggested action is to pause, and it used
		// to not price that action. On the live account the six waste
		// campaigns carry 4% of purchases against 13% of sessions: a good
		// trade, but only verifiable because the numbers are shown.
		const bad = many(500, {
			max_scroll_depth: 0,
			checkout_reached: false,
			attribution: { first_touch: { source: "FB", campaign: "Ruim|111111111111" } },
		}).concat(
			many(10, {
				max_scroll_depth: 50,
				checkout_reached: true,
				reached_thank_you: true,
				attribution: { first_touch: { source: "FB", campaign: "Ruim|111111111111" } },
			}),
		);
		const good = many(300, {
			max_scroll_depth: 50,
			checkout_reached: true,
			attribution: { first_touch: { source: "FB", campaign: "Bom|222222222222" } },
		});
		const st = buildTrafficStatement([...bad, ...good], WIN);
		const ruim = st.campaigns.find((c) => c.name === "Ruim")!;
		expect(ruim.verdict).toBe("desperdicio");
		// Pausing it costs the ten that converted, and that has to be
		// visible next to the recommendation.
		expect(ruim.pauseCostActions).toBe(10);
		expect(ruim.pauseCostPurchases).toBe(10);
	});

	it("is zero for a campaign that produced nothing", () => {
		const st = buildTrafficStatement(many(400, { max_scroll_depth: 0 }), WIN);
		expect(st.campaigns[0].pauseCostActions).toBe(0);
		expect(st.campaigns[0].pauseCostPurchases).toBe(0);
	});
});

describe("the internal control group", () => {
	it("measures non-paid sessions on the same pages in the same window", () => {
		// Answers what the account median cannot: whether the rate is
		// bad or is simply what paid traffic does. Same site, same
		// period, so the gap cannot be blamed on the pages.
		const paid = many(1_000, {
			max_scroll_depth: 0,
			attribution: { first_touch: { source: "FB", campaign: "C|111111111111" } },
		});
		const direct = many(400, {
			max_scroll_depth: 50,
			attribution: { first_touch: { source: "direct" } },
		});
		const st = buildTrafficStatement([...paid, ...direct], WIN);
		expect(st.control).not.toBeNull();
		expect(st.control!.sessions).toBe(400);
		expect(st.control!.blindPct).toBe(0);
		// And the paid side is unaffected by it.
		expect(st.campaigns[0].arrivedBlindPct).toBe(100);
	});

	it("is null when there is too little non-paid traffic to say anything", () => {
		const st = buildTrafficStatement(
			[
				...many(400, { attribution: { first_touch: { source: "FB", campaign: "C|111111111111" } } }),
				...many(50, { attribution: { first_touch: { source: "direct" } } }),
			],
			WIN,
		);
		// A noisy control is worse than none, so it says nothing.
		expect(st.control).toBeNull();
	});

	it("counts a session with no campaign as control, not as waste", () => {
		const st = buildTrafficStatement(many(400, { attribution: { first_touch: {} } }), WIN);
		expect(st.campaigns).toHaveLength(0);
		expect(st.control?.sessions).toBe(400);
		expect(st.attributedSessions).toBe(0);
	});
});
