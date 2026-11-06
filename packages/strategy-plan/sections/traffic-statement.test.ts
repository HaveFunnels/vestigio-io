import { describe, it, expect } from "vitest";
import {
	buildTrafficStatement,
	decodeCampaignName,
	sawNothing,
	shortCampaignName,
	deviceOf,
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
		// 812 of 950 is 85.5%: past the absolute floor and 10.5 points
		// above this account's median, without being the implausible
		// 100% that now reads as broken measurement rather than waste.
		const outlier = many(812, {
			max_scroll_depth: 0,
			surface_progression: ["a"],
			attribution: { first_touch: { source: "FB", campaign: "Fora|333333333333" } },
		}).concat(
			many(138, {
				max_scroll_depth: 50,
				attribution: { first_touch: { source: "FB", campaign: "Fora|333333333333" } },
			}),
		);

		const st = buildTrafficStatement([...huge, ...normal, ...outlier], WIN);
		const first = st.campaigns[0];

		// "Grande" wastes 3,000 arrivals, more than anyone. "Fora" wastes
		// 812. Excess puts "Fora" first because its rate is far above the
		// account's own normal.
		expect(first.name).toBe("Fora");
		// Nothing converted on it, so cutting is free and the page says
		// cut rather than fix.
		expect(first.verdict).toBe("cortar");

		const grande = st.campaigns.find((c) => c.name === "Grande")!;
		expect(grande.arrivedBlind).toBeGreaterThan(first.arrivedBlind);
		expect(grande.excessBlind).toBeLessThan(first.excessBlind);
	});

	it("gives a campaign at or below the median zero excess", () => {
		const half = (name: string, id: string) =>
			many(700, {
				max_scroll_depth: 0,
				surface_progression: ["a"],
				attribution: { first_touch: { source: "FB", campaign: `${name}|${id}` } },
			}).concat(
				many(300, {
					max_scroll_depth: 50,
					attribution: { first_touch: { source: "FB", campaign: `${name}|${id}` } },
				}),
			);
		const st = buildTrafficStatement(
			[...half("A", "111111111111"), ...half("B", "222222222222")],
			WIN,
		);
		// Both at 70%, so both ARE the median. Neither is an outlier,
		// however bad the absolute number looks, and the absolute floor
		// does not fire on its own.
		for (const c of st.campaigns) {
			expect(c.excessBlind).toBe(0);
			expect(c.verdict).toBe("entregando");
		}
		// And the account-level truth is still stated.
		expect(st.totals.arrivedBlind).toBe(1_400);
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
			surface_progression: ["a"],
			attribution: { first_touch: { source: "FB", campaign: "C|333333333333" } },
		}).concat(
			many(68, {
				max_scroll_depth: 50,
				attribution: { first_touch: { source: "FB", campaign: "C|333333333333" } },
			}),
		);

		const st = buildTrafficStatement([...normalA, ...normalB, ...outlier], WIN);
		// A is 77%, B is 70%, C is 88%. Median of the three is 77%.
		expect(st.accountMedianBlindPct).toBeCloseTo(76.9, 0);

		const byName = new Map(st.campaigns.map((c) => [c.name, c]));
		expect(byName.get("C")!.verdict).toBe("cortar");
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
	it("carries no revenue, ever, and no spend unless it is real", () => {
		const st = buildTrafficStatement(many(400), WIN);
		const asText = JSON.stringify(st);
		// Revenue is out permanently: the old money model derived every
		// R$ from a constant and scored 3.6 out of 10 on trust. Spend is
		// in, because it is a number the ad platform charged, but only
		// when an account is connected. With nothing connected the
		// statement is counts and nulls.
		expect(asText).not.toMatch(/revenue/i);
		expect(st.totals.spendBrl).toBeNull();
		expect(st.campaigns[0].spendBrl).toBeNull();
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
		// 300 of 510 blind is 58.8%: past the absolute floor without
		// being the implausible 100% that now reads as broken
		// measurement instead of waste.
		const bad = many(300, {
			max_scroll_depth: 0,
			surface_progression: ["a"],
			checkout_reached: false,
			attribution: { first_touch: { source: "FB", campaign: "Ruim|111111111111" } },
		})
			.concat(
				many(200, {
					max_scroll_depth: 50,
					attribution: { first_touch: { source: "FB", campaign: "Ruim|111111111111" } },
				}),
			)
			.concat(
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
		// It still sells, so it is told to be fixed rather than cut.
		expect(ruim.verdict).toBe("corrigir");
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

	it("keeps a paid click out of the control when its campaign tag broke", () => {
		// The objection that forced this, from a reviewer who checked
		// the arithmetic: "o seu grupo de controle e um residuo, nao uma
		// populacao medida". Correct. An ad click whose tag is stripped
		// by an in-app browser arrives with no campaign, and counting it
		// as organic contaminates the one comparison the page rests on.
		//
		// On the instrumented account 489 of 3.909 untagged sessions
		// still carried a paid marker, and they ran 65.0% no-scroll
		// against 19.6% for the rest. The residue was inflating the
		// control and understating the gap, so the fix widens the
		// finding rather than softening it.
		const clean = many(400, {
			max_scroll_depth: 80,
			attribution: { first_touch: { source: "direct" } },
		});
		const leaked = many(100, {
			max_scroll_depth: 0,
			attribution: { first_touch: { source: "direct", fbclid: "IwAR-abc" } },
		});
		const st = buildTrafficStatement([...clean, ...leaked], WIN);
		expect(st.control!.sessions).toBe(400);
		expect(st.control!.blindPct).toBe(0);
		expect(st.control!.excludedPaidMarker).toBe(100);
		// And it is not silently reclassified as a campaign either.
		expect(st.campaigns).toHaveLength(0);
	});

	it("reads the paid marker from the landing URL as well as the field", () => {
		const st = buildTrafficStatement(
			[
				...many(400, { attribution: { first_touch: { source: "direct" } } }),
				...many(60, {
					attribution: {
						first_touch: { source: "direct", landing_url: "https://x.com/p?gclid=Cj0KC" },
					},
				}),
				...many(40, {
					attribution: { first_touch: { source: "newsletter", medium: "cpc" } },
				}),
			],
			WIN,
		);
		expect(st.control!.sessions).toBe(400);
		expect(st.control!.excludedPaidMarker).toBe(100);
	});

	it("keeps genuine organic social in the control", () => {
		// A person arriving from an unpaid Instagram post is organic.
		// Only the bare platform name as source is treated as paid, so
		// a referral host is not swept up with it.
		const st = buildTrafficStatement(
			many(400, {
				max_scroll_depth: 80,
				attribution: { first_touch: { source: "instagram.com", medium: "referral" } },
			}),
			WIN,
		);
		expect(st.control!.sessions).toBe(400);
		expect(st.control!.excludedPaidMarker).toBe(0);
	});
});

describe("spend, when an ad account is connected", () => {
	const paid = (campaign: string, blind: number, sighted: number) =>
		many(blind, {
			max_scroll_depth: 0,
			attribution: { first_touch: { source: "FB", campaign } },
		}).concat(
			many(sighted, {
				max_scroll_depth: 50,
				attribution: { first_touch: { source: "FB", campaign } },
			}),
		);

	it("joins on the platform campaign id the pixel already records", () => {
		const st = buildTrafficStatement(paid("Campanha X|120253133140740114", 400, 100), {
			...WIN,
			spendByCampaignId: new Map([["120253133140740114", 1_000]]),
		});
		expect(st.campaigns[0].spendBrl).toBe(1_000);
		// 400 of 500 sessions saw nothing, so 80% of the spend bought
		// arrivals that saw nothing. Apportioned by sessions because the
		// platform charges per click, not per scroll.
		expect(st.campaigns[0].spendWastedBrl).toBe(800);
	});

	it("reports counts only when nothing is connected", () => {
		const st = buildTrafficStatement(paid("Campanha X|120253133140740114", 400, 100), WIN);
		expect(st.campaigns[0].spendBrl).toBeNull();
		expect(st.campaigns[0].spendWastedBrl).toBeNull();
		expect(st.totals.spendBrl).toBeNull();
	});

	it("leaves a campaign null when its id is not in the snapshot", () => {
		// A campaign created after the last sync, or one from another ad
		// account. Null is honest; zero would read as "cost nothing".
		const st = buildTrafficStatement(paid("Nova|999999999999", 400, 100), {
			...WIN,
			spendByCampaignId: new Map([["120253133140740114", 1_000]]),
		});
		expect(st.campaigns[0].spendBrl).toBeNull();
	});

	it("never calls spend revenue", () => {
		const st = buildTrafficStatement(paid("X|120253133140740114", 400, 100), {
			...WIN,
			spendByCampaignId: new Map([["120253133140740114", 1_000]]),
		});
		const keys = Object.keys(st.campaigns[0]);
		// A wasted arrival cost money that left the account. It did not
		// lose a sale that was never going to happen, and the earlier
		// money model conflated the two.
		expect(keys.filter((k) => /revenue/i.test(k))).toEqual([]);
		expect(keys).toContain("spendBrl");
	});
});

describe("device split", () => {
	function withUa(n: number, ua: string, blind: boolean, campaign: string) {
		return Array.from({ length: n }, () => ({
			eventCount: 5,
			userAgent: ua,
			aggregate: {
				max_scroll_depth: blind ? 0 : 50,
				session_duration_ms: 5_000,
				attribution: { first_touch: { source: "FB", campaign } },
			} as Record<string, unknown>,
		}));
	}

	it("classifies the coarse device, not the browser version", () => {
		expect(deviceOf("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe("mobile");
		expect(deviceOf("Mozilla/5.0 (Linux; Android 14)")).toBe("mobile");
		expect(deviceOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)")).toBe("desktop");
		expect(deviceOf(null)).toBe("unknown");
	});

	it("separates a campaign that only fails on one device", () => {
		// Measured on the live account: paid desktop runs 92.5% no-scroll
		// against 71.3% on mobile. Without the split that is one number
		// hiding two very different problems.
		const C = "X|111111111111";
		const st = buildTrafficStatement(
			[
				...withUa(300, "Android 14 Mobile", false, C),
				...withUa(100, "Macintosh Intel", true, C),
			],
			WIN,
		);
		const row = st.campaigns[0];
		expect(row.byDevice.mobile!.blindPct).toBe(0);
		expect(row.byDevice.desktop!.blindPct).toBe(100);
	});

	it("says nothing about a device below 50 sessions", () => {
		const C = "X|111111111111";
		const st = buildTrafficStatement(
			[...withUa(390, "Android Mobile", false, C), ...withUa(20, "Macintosh", true, C)],
			WIN,
		);
		// A noisy split invites a wrong conclusion about a whole device.
		expect(st.campaigns[0].byDevice.desktop).toBeNull();
		expect(st.campaigns[0].byDevice.mobile).not.toBeNull();
	});
});

describe("comparison with the previous window", () => {
	const run = (campaign: string, blind: number, sighted: number) =>
		many(blind, {
			max_scroll_depth: 0,
			attribution: { first_touch: { source: "FB", campaign } },
		}).concat(
			many(sighted, {
				max_scroll_depth: 50,
				attribution: { first_touch: { source: "FB", campaign } },
			}),
		);

	it("reports how many points worse a campaign got", () => {
		const C = "X|111111111111";
		const st = buildTrafficStatement(run(C, 400, 100), {
			...WIN,
			previous: run(C, 300, 200),
		});
		// 60% then, 80% now.
		expect(st.campaigns[0].previousBlindPct).toBe(60);
		expect(st.campaigns[0].deltaPoints).toBe(20);
	});

	it("reports improvement as a negative delta", () => {
		const C = "X|111111111111";
		const st = buildTrafficStatement(run(C, 200, 300), {
			...WIN,
			previous: run(C, 400, 100),
		});
		expect(st.campaigns[0].deltaPoints).toBe(-40);
	});

	it("leaves a new campaign null rather than calling it a change", () => {
		const st = buildTrafficStatement(run("Nova|222222222222", 400, 100), {
			...WIN,
			previous: run("Antiga|111111111111", 400, 100),
		});
		expect(st.campaigns[0].previousBlindPct).toBeNull();
		expect(st.campaigns[0].deltaPoints).toBeNull();
	});

	it("is null on a first run, with no previous window", () => {
		const st = buildTrafficStatement(run("X|111111111111", 400, 100), WIN);
		expect(st.campaigns[0].deltaPoints).toBeNull();
	});

	it("uses the same code path for both windows", () => {
		// Computed by recursing into buildTrafficStatement rather than a
		// parallel reducer, so the two windows cannot disagree about what
		// a blind session is. Identical input must give a zero delta.
		const C = "X|111111111111";
		const rows = run(C, 400, 100);
		const st = buildTrafficStatement(rows, { ...WIN, previous: rows });
		expect(st.campaigns[0].deltaPoints).toBe(0);
	});
});

describe("campaign names arrive percent-encoded", () => {
	it("decodes the name the operator typed in the ad platform", () => {
		// 85% of the campaigns on the instrumented account came through
		// encoded, because the pixel reads the campaign from the landing
		// URL's query string. Four of five reviewers flagged it, and one
		// named the cost: a product selling "contagem direta" cannot
		// hand over a name the operator will not find in their own ad
		// manager, because then they stop trusting the number next to it.
		const raw = "%281-1-X+%7C+H1-H4%2FC1+%7C+POTE%29+aberto+adv%2B+%2827%2F10%29|120252961272760114";
		const { name, platformId } = splitCampaignRef(raw);
		expect(name).toBe("(1-1-X | H1-H4/C1 | POTE) aberto adv+ (27/10)");
		expect(platformId).toBe("120252961272760114");
	});

	it("turns plus into space, which decodeURIComponent does not", () => {
		expect(decodeCampaignName("ABERTO+35%2B+FEM")).toBe("ABERTO 35+ FEM");
	});

	it("decodes accents, which is most of a Brazilian campaign name", () => {
		expect(decodeCampaignName("%E2%80%94+C%C3%B3pia")).toBe("— Cópia");
	});

	it("returns a stray percent sign untouched", () => {
		// "100%+off" has a '%' but no valid escape, so it is not encoded
		// text and the '+' is a literal the operator typed.
		expect(decodeCampaignName("100%+off")).toBe("100%+off");
	});

	it("leaves an already-clean name alone", () => {
		expect(decodeCampaignName("(1-3-X | H1-H6/C1 | RBO) ABERTO 35+")).toBe(
			"(1-3-X | H1-H6/C1 | RBO) ABERTO 35+",
		);
	});
});

describe("'saw nothing' means no interaction, not just no scroll", () => {
	// Six reviewers from service businesses raised this independently,
	// and the measurement vindicated all six. On 50.304 paid sessions,
	// scroll alone condemned 36.277 (72.1%); of those, 23.147 carried
	// positive evidence of engagement, 63.8% of everything the page
	// called waste. The honest figure is 26.1%.
	it("clears a session whose CTA entered the viewport without a scroll", () => {
		// The lawyer, the dentist and the esthetician all described the
		// same visitor: arrives, reads the headline, taps WhatsApp, never
		// scrolls. The old rule called that visitor waste.
		expect(sawNothing({ max_scroll_depth: 0, cta_viewed_count: 2 })).toBe(false);
	});

	it("clears a session that started a form", () => {
		expect(sawNothing({ max_scroll_depth: 0, form_started: true })).toBe(false);
	});

	it("clears a session that reached the checkout", () => {
		// 12 sessions on the live account reached checkout and were still
		// being counted as having seen nothing.
		expect(sawNothing({ max_scroll_depth: 0, checkout_reached: true })).toBe(false);
	});

	it("clears a session that opened support or handed off", () => {
		expect(sawNothing({ max_scroll_depth: 0, support_opened: true })).toBe(false);
		expect(sawNothing({ max_scroll_depth: 0, handoff_started: true })).toBe(false);
	});

	it("clears a session that clicked, even uselessly", () => {
		// A dead click is a click. The person was there.
		expect(sawNothing({ max_scroll_depth: 0, dead_click_count: 1 })).toBe(false);
		expect(sawNothing({ max_scroll_depth: 0, input_focus_abandon_count: 1 })).toBe(false);
		expect(sawNothing({ max_scroll_depth: 0, hesitation_pause_count: 1 })).toBe(false);
	});

	it("clears a session that opened a second page", () => {
		expect(
			sawNothing({ max_scroll_depth: 0, surface_progression: ["a", "b"] }),
		).toBe(false);
		// One page is not navigation.
		expect(sawNothing({ max_scroll_depth: 0, surface_progression: ["a"] })).toBe(true);
	});

	it("still counts a session that truly did nothing", () => {
		expect(
			sawNothing({
				max_scroll_depth: 0,
				cta_viewed_count: 0,
				dead_click_count: 0,
				surface_progression: ["a"],
			}),
		).toBe(true);
	});

	it("clears anything that passed the scroll milestone outright", () => {
		expect(sawNothing({ max_scroll_depth: 25 })).toBe(false);
		expect(sawNothing({ max_scroll_depth: 90 })).toBe(false);
	});

	it("applies the same rule to the control as to paid", () => {
		// The two windows and the two populations must never disagree
		// about what a blind session is, or the comparison is rigged.
		const paid = many(400, {
			max_scroll_depth: 0,
			cta_viewed_count: 1,
			attribution: { first_touch: { source: "FB", campaign: "C|111111111111" } },
		});
		const organic = many(400, {
			max_scroll_depth: 0,
			cta_viewed_count: 1,
			attribution: { first_touch: { source: "direct" } },
		});
		const st = buildTrafficStatement([...paid, ...organic], WIN);
		expect(st.campaigns[0].arrivedBlindPct).toBe(0);
		expect(st.control!.blindPct).toBe(0);
	});
});

describe("the verdict says what to do and never contradicts the row", () => {
	const campaignOf = (
		n_: number,
		blind: number,
		purchases: number,
		id = "111111111111",
	) => [
		...many(blind, {
			max_scroll_depth: 0,
			surface_progression: ["a"],
			attribution: { first_touch: { source: "FB", campaign: `C|${id}` } },
		}),
		...many(n_ - blind - purchases, {
			max_scroll_depth: 90,
			attribution: { first_touch: { source: "FB", campaign: `C|${id}` } },
		}),
		...many(purchases, {
			max_scroll_depth: 90,
			reached_thank_you: true,
			attribution: { first_touch: { source: "FB", campaign: `C|${id}` } },
		}),
	];

	it("never tells you to cut a campaign that still sells", () => {
		// The defect five reviewers found by reading line by line: one
		// row with 12 purchases marked desperdicio while another with
		// the same 12 was marked observar. "Ele acha esse par em 40
		// segundos e mata a ferramenta na frente de todo mundo."
		const st = buildTrafficStatement(
			[
				...campaignOf(1000, 600, 40, "111111111111"),
				...campaignOf(1000, 100, 40, "222222222222"),
				...campaignOf(1000, 150, 40, "333333333333"),
			],
			WIN,
		);
		const row = st.campaigns.find((c) => c.platformId === "111111111111")!;
		expect(row.arrivedBlindPct).toBeGreaterThanOrEqual(45);
		expect(row.pauseCostPurchases).toBe(40);
		expect(row.verdict).toBe("corrigir");
	});

	it("says cut only when cutting is free", () => {
		const st = buildTrafficStatement(
			[
				...campaignOf(1000, 600, 0, "111111111111"),
				...campaignOf(1000, 100, 40, "222222222222"),
				...campaignOf(1000, 150, 40, "333333333333"),
			],
			WIN,
		);
		const row = st.campaigns.find((c) => c.platformId === "111111111111")!;
		expect(row.pauseCostPurchases).toBe(0);
		expect(row.verdict).toBe("cortar");
	});

	it("leaves a healthy account with nothing to decide", () => {
		// The circularity objection: "sempre vai ter alguem acima da
		// propria media. Uma conta impecavel ainda vai gerar cinco
		// linhas de desperdicio aqui." With an absolute floor it does
		// not, and that is the correct behaviour.
		const st = buildTrafficStatement(
			[
				...campaignOf(1000, 50, 40, "111111111111"),
				...campaignOf(1000, 150, 40, "222222222222"),
				...campaignOf(1000, 250, 40, "333333333333"),
			],
			WIN,
		);
		expect(st.campaigns.every((c) => c.verdict !== "cortar")).toBe(true);
		expect(st.campaigns.every((c) => c.verdict !== "corrigir")).toBe(true);
	});

	it("calls an implausible rate suspect measurement, not waste", () => {
		// Four reviewers read 99.8% and 100% as broken instrumentation
		// rather than waste, and they were right.
		const st = buildTrafficStatement(
			[
				...campaignOf(1000, 1000, 0, "111111111111"),
				...campaignOf(1000, 100, 40, "222222222222"),
				...campaignOf(1000, 150, 40, "333333333333"),
			],
			WIN,
		);
		const row = st.campaigns.find((c) => c.platformId === "111111111111")!;
		expect(row.arrivedBlindPct).toBe(100);
		expect(row.verdict).toBe("medicao_suspeita");
	});
});

describe("the landing-page view, for accounts the campaign floor excludes", () => {
	it("aggregates campaigns too small to judge one by one", () => {
		// The lawyer, dentist, architect and esthetician each worked out
		// that no campaign of theirs clears 300 sessions, and the
		// dropshipper found the inverse: the campaigns he tests and
		// kills never clear it either. Thirty campaigns of 150 sessions
		// on one page are 4.500 sessions, which is not noise.
		const rows = [];
		for (let i = 0; i < 10; i++) {
			rows.push(
				...many(100, {
					max_scroll_depth: 0,
					surface_progression: ["a"],
					attribution: {
						first_touch: {
							source: "FB",
							campaign: `c${i}|${String(100000000000 + i)}`,
							landing_url: "https://x.com/lp/implante",
						},
					},
				}),
			);
		}
		const st = buildTrafficStatement(rows, WIN);
		// Not a single campaign qualifies.
		expect(st.campaigns).toHaveLength(0);
		expect(st.belowFloor.campaigns).toBe(10);
		// But the page does, and it carries the whole account.
		expect(st.landingPages).toHaveLength(1);
		expect(st.landingPages[0]).toMatchObject({
			path: "/lp/implante",
			sessions: 1000,
			arrivedBlind: 1000,
			arrivedBlindPct: 100,
			campaigns: 10,
		});
	});

	it("ranks pages by wasted arrivals, and counts purchases per page", () => {
		const page = (path: string, n_: number, blind: number, buys: number, id: string) => [
			...many(blind, {
				max_scroll_depth: 0,
				surface_progression: ["a"],
				attribution: { first_touch: { source: "FB", campaign: `c|${id}`, landing_url: `https://x.com${path}` } },
			}),
			...many(n_ - blind - buys, {
				max_scroll_depth: 90,
				attribution: { first_touch: { source: "FB", campaign: `c|${id}`, landing_url: `https://x.com${path}` } },
			}),
			...many(buys, {
				max_scroll_depth: 90,
				reached_thank_you: true,
				attribution: { first_touch: { source: "FB", campaign: `c|${id}`, landing_url: `https://x.com${path}` } },
			}),
		];
		const st = buildTrafficStatement(
			[...page("/a", 1000, 300, 20, "111111111111"), ...page("/b", 1000, 500, 10, "222222222222")],
			WIN,
		);
		expect(st.landingPages.map((p) => p.path)).toEqual(["/b", "/a"]);
		expect(st.landingPages[0].purchases).toBe(10);
		expect(st.landingPages[1].purchases).toBe(20);
	});

	it("keeps a page below the floor out, same as a campaign", () => {
		const st = buildTrafficStatement(
			many(100, {
				attribution: {
					first_touch: { source: "FB", campaign: "c|111111111111", landing_url: "https://x.com/tiny" },
				},
			}),
			WIN,
		);
		expect(st.landingPages).toHaveLength(0);
	});
});

describe("the campaign name the operator has to recognise", () => {
	it("folds a pile of copies into a count", () => {
		expect(
			shortCampaignName(
				"(1-1-X | H1-H4/C1 | POTE) aberto adv+ (21/09) — Cópia — Cópia — Cópia",
			),
		).toBe("(1-1-X | H1-H4/C1 | POTE) aberto adv+ (21/09) (cópia 3)");
	});

	it("leaves a name with no copies alone", () => {
		expect(shortCampaignName("(CBO | H1-H10 | PT) ABERTO 35+ FEM (21/09)")).toBe(
			"(CBO | H1-H10 | PT) ABERTO 35+ FEM (21/09)",
		);
	});

	it("truncates a long base but keeps the copy count visible", () => {
		const out = shortCampaignName(
			"(1-3-X | V1-V10/C1 | POTE) aberto adv+ 55+ all (11/09) — Cópia",
		);
		expect(out).toContain("(cópia 1)");
		expect(out).toContain("…");
	});
});

describe("the purchases denominator is stated, not implied", () => {
	it("totals purchases across every campaign above the floor", () => {
		// A reviewer summed the visible rows, got a different number
		// from the one in the trade paragraph, and asked for the bridge.
		const c = (id: string, buys: number) => [
			...many(400 - buys, {
				attribution: { first_touch: { source: "FB", campaign: `c|${id}` } },
			}),
			...many(buys, {
				reached_thank_you: true,
				attribution: { first_touch: { source: "FB", campaign: `c|${id}` } },
			}),
		];
		const st = buildTrafficStatement([...c("111111111111", 30), ...c("222222222222", 12)], WIN);
		expect(st.totals.purchases).toBe(42);
	});
});

describe("two campaigns with the same name must still be tellable apart", () => {
	it("appends the id tail when a label repeats", () => {
		// Not a hypothetical. Two rows on the instrumented account are
		// byte-identical, "(1-3-X | H1-H4/C1 | POTE) aberto adv+ (29/08)"
		// with Cópia six times, under two different campaign ids. The
		// first version of the shortener printed the same label twice.
		const of = (id: string) =>
			many(400, {
				max_scroll_depth: 0,
				surface_progression: ["a"],
				attribution: {
					first_touch: {
						source: "FB",
						campaign: `(1-3-X | H1-H4/C1 | POTE) aberto adv+ (29/08) — Cópia — Cópia|${id}`,
					},
				},
			});
		const st = buildTrafficStatement([...of("120252961272760114"), ...of("120253034545540114")], WIN);
		expect(st.campaigns).toHaveLength(2);
		const labels = st.campaigns.map((c) => c.displayName);
		expect(new Set(labels).size).toBe(2);
		expect(labels[0]).toContain("[id 760114]");
		expect(labels[1]).toContain("[id 540114]");
	});

	it("leaves a unique label clean", () => {
		const st = buildTrafficStatement(
			many(400, {
				attribution: { first_touch: { source: "FB", campaign: "Promo de maio|111111111111" } },
			}),
			WIN,
		);
		expect(st.campaigns[0].displayName).toBe("Promo de maio");
	});

	it("truncates the middle so the date at the end survives", () => {
		// Cutting from the right collapsed "(29/08)" and "(21/09)" into
		// the same label, which is the very thing that distinguishes two
		// otherwise identical campaigns.
		const a = shortCampaignName("(1-3-X | H1-H4/C1 | POTE) aberto adv+        (29/08)");
		const b = shortCampaignName("(1-3-X | H1-H4/C1 | POTE) aberto adv+        (21/09)");
		expect(a).not.toBe(b);
		expect(a).toContain("(29/08)");
		expect(b).toContain("(21/09)");
	});
});
