import { describe, it, expect } from "vitest";
import {
	buildTrafficStatement,
	shortCampaignName,
	ABSOLUTE_BLIND_FLOOR,
	PAGE_POINTS_ABOVE_POOL,
	PAGE_MIN_WASTE_SHARE,
	PAGE_COMMON_FACTOR_SHARE,
	MIN_CAMPAIGNS_FOR_PAGE_VERDICT,
} from "./traffic-statement";

// ──────────────────────────────────────────────
// The page verdict, and the fourth time the same defect was caught.
//
// Three times this file shipped a threshold written for one unit and
// applied to another: the scroll proxy, the service-business action,
// and the cost of pausing. The page verdict was the fourth, and it was
// caught before shipping only because it was run against the live
// account.
//
// The bug: judging a page against ABSOLUTE_BLIND_FLOOR. A page pools
// every campaign that lands on it, good and bad, so its rate is
// dragged toward the account mean by construction. The worst page on
// the instrumented account holds 71,6% of all the waste in the account
// and reads 36,3%, which never clears 45. Reusing the campaign floor
// did not make the verdict strict. It made the verdict never fire.
//
// The first test below is that bug, frozen.
// ──────────────────────────────────────────────

function sess(n: number, over: Record<string, unknown>, campaign: string, landing: string) {
	return Array.from({ length: n }, () => ({
		aggregate: {
			attribution: {
				first_touch: {
					source: "FB",
					campaign,
					landing_url: `https://loja.com${landing}`,
				},
			},
			...over,
		},
		eventCount: 5,
		userAgent: null,
	}));
}

/** A visit that did nothing at all. */
const MUTE = { max_scroll_depth: 0, surface_progression: ["a"] };
/** A visit that reached the checkout. */
const LIVE = { max_scroll_depth: 70, checkout_reached: true, reached_thank_you: true };

const WIN = { windowStart: "2026-10-09", windowEnd: "2026-11-08", conversionModel: "checkout" };

/**
 * Builds an account shaped like the real one: one page that holds most
 * of the waste while sitting well under the campaign floor, plus clean
 * pages that pull the account rate down.
 */
function accountLikeTheRealOne() {
	const rows = [];
	// The bad page: 12 campaigns around 36% mute, spread rather than
	// identical. Identical rates make every campaign sit exactly on
	// whatever median is computed, which is a fixture artefact and not
	// a thing real accounts do.
	for (let i = 0; i < 12; i++) {
		const c = `BAD${i}|90000000000${i}`;
		const mute = 320 + i * 8;
		rows.push(...sess(mute, MUTE, c, "/produto-ruim"));
		rows.push(...sess(1000 - mute, LIVE, c, "/produto-ruim"));
	}
	// Clean pages: 6 campaigns at 8% mute, which is what drags the
	// pooled account rate well below the bad page.
	for (let i = 0; i < 6; i++) {
		const c = `OK${i}|80000000000${i}`;
		rows.push(...sess(80, MUTE, c, "/produto-bom"));
		rows.push(...sess(920, LIVE, c, "/produto-bom"));
	}
	return buildTrafficStatement(rows, { ...WIN, minSessions: 100 });
}

describe("a page is not judged by the campaign floor", () => {
	const st = accountLikeTheRealOne();
	const bad = st.landingPages.find((p) => p.path === "/produto-ruim")!;
	const good = st.landingPages.find((p) => p.path === "/produto-bom")!;

	it("reproduces the shape that broke it: bad page sits under the campaign floor", () => {
		// If this ever stops being true the test below stops testing
		// anything, so the premise is asserted rather than assumed.
		expect(bad.arrivedBlindPct).toBeLessThan(ABSOLUTE_BLIND_FLOOR);
		expect(bad.blindPctLow).toBeLessThan(ABSOLUTE_BLIND_FLOOR);
	});

	it("still condemns it, because it holds most of the waste", () => {
		expect(bad.verdict).toBe("corrigir");
		expect(bad.wasteShare).toBeGreaterThan(PAGE_MIN_WASTE_SHARE);
	});

	it("leaves the clean page alone", () => {
		expect(good.verdict).toBe("entregando");
	});

	it("never offers to cut a page, because there is nothing to pause", () => {
		// The fourth variation of the same defect would be a page told
		// to pause. There is no such verdict and this is the line that
		// keeps it that way.
		for (const p of st.landingPages) {
			expect(p.verdict).not.toBe("cortar");
		}
	});
});

describe("blaming the page or blaming the ads", () => {
	it("blames the ads when the page converts for most campaigns", () => {
		// One terrible campaign on an otherwise fine page. The page
		// clears the waste gates, but the other campaigns prove it
		// converts, so the defendant is upstream.
		const rows = [];
		// One big campaign dumping almost pure mute traffic onto the
		// page. Big enough that the page as a whole clears both waste
		// gates, which is the precondition for the verdict to have to
		// choose between the page and the ads at all.
		rows.push(...sess(4250, MUTE, "RUIM|700000000001", "/pagina"));
		rows.push(...sess(750, LIVE, "RUIM|700000000001", "/pagina"));
		// Eight campaigns that convert on that SAME page, and convert
		// BETTER than the typical campaign landing elsewhere. That gap
		// is the evidence the page works, and it has to point this way
		// round: if they merely matched the rest of the site, half of
		// them would read as degrading simply because half of anything
		// sits above a median.
		for (let i = 0; i < 8; i++) {
			const c = `BOA${i}|60000000000${i}`;
			rows.push(...sess(42 + i * 2, MUTE, c, "/pagina"));
			rows.push(...sess(958 - i * 2, LIVE, c, "/pagina"));
		}
		// A second page, so the account pool can sit below the page
		// under test. With a single page the two are the same number by
		// construction and no page can ever be worse than its own
		// account.
		for (let i = 0; i < 5; i++) {
			const c = `OUT${i}|65000000000${i}`;
			rows.push(...sess(110 + i * 6, MUTE, c, "/outra"));
			rows.push(...sess(890 - i * 6, LIVE, c, "/outra"));
		}
		// Note the direction: the other page runs WORSE than the good
		// campaigns on the page under test. That is what makes this
		// "anuncio_errado" rather than "corrigir", and it is the honest
		// shape of the case. A page only deserves acquittal when the
		// traffic landing on it does better there than it does
		// elsewhere on the same site.
		const st = buildTrafficStatement(rows, { ...WIN, minSessions: 100 });
		const pg = st.landingPages.find((p) => p.path === "/pagina")!;
		// Asserted on the number that drives the verdict, which is the
		// comparison against campaigns landing elsewhere, not against
		// the account median.
		expect(pg.campaignsDegrading / pg.campaignsJudged).toBeLessThan(
			PAGE_COMMON_FACTOR_SHARE,
		);
		expect(pg.elsewhereMedianPct).not.toBe(null);
		expect(pg.verdict).toBe("anuncio_errado");
	});

	it("refuses to name a culprit on too few campaigns", () => {
		// Two campaigns, both bad. 2 of 2 is 100% and means nothing.
		//
		// The page comes out "entregando" and that is correct rather
		// than lenient: with one page, the page rate IS the account
		// rate, so the page is not what distinguishes anything. The two
		// campaigns are both well past the campaign floor and the
		// campaign verdict is what catches them. The page verdict's job
		// is to find concentration, and there is no concentration in an
		// account that is uniformly bad.
		const rows = [];
		for (let i = 0; i < 2; i++) {
			const c = `SO${i}|50000000000${i}`;
			rows.push(...sess(500, MUTE, c, "/poucas"));
			rows.push(...sess(500, LIVE, c, "/poucas"));
		}
		const st = buildTrafficStatement(rows, { ...WIN, minSessions: 100 });
		const pg = st.landingPages.find((p) => p.path === "/poucas")!;
		expect(pg.campaignsJudged).toBeLessThan(MIN_CAMPAIGNS_FOR_PAGE_VERDICT);
		expect(pg.verdict).not.toBe("corrigir");
		expect(pg.verdict).not.toBe("anuncio_errado");
		// And a real limitation, asserted rather than hidden: in a
		// uniformly bad account NOTHING is flagged, on either
		// dimension. Both rules are relative. Each campaign sits at the
		// median it is compared to, so none is unusual; the page is the
		// account, so it is not worse than the account.
		//
		// This is the exact price of the property the second council's
		// statistician approved us for. Zero false positives in twelve
		// shuffles comes from judging relative to the account, and an
		// account that is bad everywhere has no relative signal left to
		// read. The absolute rate is still printed at the top of the
		// screen, which is what has to carry that case.
		expect(
			st.campaigns.filter((c) => c.verdict === "cortar" || c.verdict === "corrigir").length,
		).toBe(0);
		expect(st.accountBlindPct).toBeGreaterThanOrEqual(45);
	});
});

describe("both gates have to hold", () => {
	it("does not condemn a bad page that holds almost none of the waste", () => {
		// This is the gate that keeps the card pointed at money. A page
		// can be genuinely worse than the account and still not be
		// where the operator's Monday belongs.
		const rows = [];
		// The small bad page: high rate, tiny volume.
		for (let i = 0; i < 4; i++) {
			const c = `PEQ${i}|40000000000${i}`;
			rows.push(...sess(70, MUTE, c, "/pequena"));
			rows.push(...sess(60, LIVE, c, "/pequena"));
		}
		// The big clean page that owns the account.
		for (let i = 0; i < 8; i++) {
			const c = `GDE${i}|30000000000${i}`;
			rows.push(...sess(400, MUTE, c, "/grande"));
			rows.push(...sess(4600, LIVE, c, "/grande"));
		}
		const st = buildTrafficStatement(rows, { ...WIN, minSessions: 100 });
		const small = st.landingPages.find((p) => p.path === "/pequena")!;
		expect(small.blindPctLow - st.accountBlindPct).toBeGreaterThan(PAGE_POINTS_ABOVE_POOL);
		expect(small.wasteShare).toBeLessThan(PAGE_MIN_WASTE_SHARE);
		expect(small.verdict).not.toBe("corrigir");
		expect(small.verdict).not.toBe("anuncio_errado");
	});

	it("does not watch a big page merely for being big", () => {
		// Holds 100% of the waste by being the only page. Condemning it,
		// or even flagging it to watch, would be condemning the account
		// for existing. Size is not a reason: an earlier draft had
		// `|| wasteShare >= PAGE_MIN_WASTE_SHARE` in the watch branch,
		// which made "observar" mean nothing except "big".
		const rows = [];
		for (let i = 0; i < 10; i++) {
			const c = `UNI${i}|20000000000${i}`;
			rows.push(...sess(250, MUTE, c, "/unica"));
			rows.push(...sess(750, LIVE, c, "/unica"));
		}
		const st = buildTrafficStatement(rows, { ...WIN, minSessions: 100 });
		const pg = st.landingPages.find((p) => p.path === "/unica")!;
		expect(pg.wasteShare).toBeGreaterThan(PAGE_MIN_WASTE_SHARE);
		expect(pg.blindPctLow - st.accountBlindPct).toBeLessThan(PAGE_POINTS_ABOVE_POOL);
		expect(pg.verdict).toBe("entregando");
	});

	it("cannot apportion blame when every campaign lands on one page", () => {
		// The case that broke the first implementation. With one page
		// there is no elsewhere to compare against, so the only honest
		// answers are watching or delivering, never a culprit.
		const rows = [];
		for (let i = 0; i < 10; i++) {
			const c = `SOL${i}|10000000000${i}`;
			rows.push(...sess(600 + i * 10, MUTE, c, "/so-uma"));
			rows.push(...sess(400 - i * 10, LIVE, c, "/so-uma"));
		}
		const st = buildTrafficStatement(rows, { ...WIN, minSessions: 100 });
		const pg = st.landingPages.find((p) => p.path === "/so-uma")!;
		expect(pg.elsewhereMedianPct).toBe(null);
		expect(pg.campaignsDegrading).toBe(0);
		expect(pg.verdict).not.toBe("corrigir");
		expect(pg.verdict).not.toBe("anuncio_errado");
	});
});

describe("the page's magnitude is counted, never projected", () => {
	it("reports waste as a share of the account, not as recovered purchases", () => {
		// The number every analytics product inflates. Multiplying mute
		// visits by the rate at which engaged visits convert asserts
		// that a visitor who did nothing would have bought like one who
		// did something, which is false by construction: the visit is
		// mute precisely because it did not engage.
		const st = accountLikeTheRealOne();
		const bad = st.landingPages.find((p) => p.path === "/produto-ruim")!;
		const totalBlind = st.landingPages.reduce((n, p) => n + p.arrivedBlind, 0);
		expect(bad.wasteShare).toBeCloseTo(
			Math.round((1000 * bad.arrivedBlind) / totalBlind) / 10,
			1,
		);
		// And the shares are shares: they cannot exceed the whole.
		const sum = st.landingPages.reduce((n, p) => n + p.wasteShare, 0);
		expect(sum).toBeLessThanOrEqual(100.5);
	});

	it("carries the margin, so a thin page cannot be condemned on a point estimate", () => {
		const st = accountLikeTheRealOne();
		for (const p of st.landingPages) {
			expect(p.marginPoints).toBeGreaterThanOrEqual(0);
			expect(p.blindPctLow).toBeLessThanOrEqual(p.arrivedBlindPct);
		}
	});
});

describe("shortening a campaign name", () => {
	it("cuts at a word boundary instead of mid-token", () => {
		// Read off the live account by the second council: "abe…v+"
		// made five rows indistinguishable.
		const out = shortCampaignName("(1-3-X | v1-v10/C1 | POTE) aberto adv+ 55+ (21/09)");
		expect(out).not.toContain("abe…");
		expect(out.length).toBeLessThanOrEqual(46);
	});

	it("keeps the tail, because the date is what distinguishes these names", () => {
		// The reason middle-truncation is correct and right-truncation
		// was the original bug.
		const a = shortCampaignName("(1-3-X | v1-v10/C1 | POTE) aberto adv+ 55+ (21/09)");
		const b = shortCampaignName("(1-3-X | v1-v10/C1 | POTE) aberto adv+ 55+ (29/08)");
		expect(a).not.toBe(b);
		expect(a).toContain("(21/09)");
		expect(b).toContain("(29/08)");
	});

	it("leaves a name that already fits completely alone", () => {
		const fits = "(CBO | H1-H4/C1 | POTE) aberto adv+ (29/08)";
		expect(shortCampaignName(fits)).toBe(fits);
	});

	it("degrades without crashing on a name with no spaces", () => {
		const out = shortCampaignName("a".repeat(80));
		expect(out).toContain("…");
		expect(out.length).toBeLessThan(80);
	});
});

describe("the account as the defendant", () => {
	// The limitation this fixes, found by reading the rules rather than
	// by a failing test: both verdicts are relative, so an account that
	// is bad everywhere has no relative signal left to read. Every
	// campaign sits at the median it is compared to and the page IS the
	// account. The product went silent exactly when the customer was
	// worst.

	/** Bad everywhere, with no internal spread worth naming. */
	function uniformlyBad() {
		const rows = [];
		for (let i = 0; i < 6; i++) {
			const c = `RUIM${i}|11000000000${i}`;
			const mute = 580 + i * 8;
			rows.push(...sess(mute, MUTE, c, i < 3 ? "/pagina-a" : "/pagina-b"));
			rows.push(...sess(1000 - mute, LIVE, c, i < 3 ? "/pagina-a" : "/pagina-b"));
		}
		// Non-paid traffic on the same site, behaving normally. This is
		// the reference internal spread cannot hide from.
		rows.push(
			...Array.from({ length: 400 }, () => ({
				aggregate: { max_scroll_depth: 70, checkout_reached: true },
				eventCount: 5,
				userAgent: null,
			})),
			...Array.from({ length: 30 }, () => ({
				aggregate: { max_scroll_depth: 0, surface_progression: ["a"] },
				eventCount: 5,
				userAgent: null,
			})),
		);
		return buildTrafficStatement(rows, { ...WIN, minSessions: 100 });
	}

	it("confirms the blind spot is real: no campaign and no page stands out", () => {
		const st = uniformlyBad();
		expect(
			st.campaigns.filter(
				(c) =>
					c.verdict === "cortar" ||
					c.verdict === "corrigir" ||
					c.verdict === "medicao_suspeita",
			).length,
		).toBe(0);
		expect(
			st.landingPages.filter(
				(g) => g.verdict === "corrigir" || g.verdict === "anuncio_errado",
			).length,
		).toBe(0);
	});

	it("names the account instead of going quiet", () => {
		const st = uniformlyBad();
		expect(st.accountVerdict).not.toBe(null);
		expect(st.accountVerdict!.blindPctLow).toBeGreaterThanOrEqual(ABSOLUTE_BLIND_FLOOR);
		expect(st.accountVerdict!.campaignsJudged).toBe(6);
	});

	it("carries the control gap as the evidence", () => {
		const st = uniformlyBad();
		// Non-paid on the same site is where the claim gets its force:
		// if the pages were simply bad, traffic arriving without an ad
		// would break on them too.
		expect(st.accountVerdict!.controlPct).not.toBe(null);
		expect(st.accountVerdict!.gapPoints!).toBeGreaterThan(40);
	});

	it("stays silent when a specific offender was already named", () => {
		// Never a second opinion competing with a specific one. The
		// account verdict exists for the case where nothing individual
		// can be named, and on an account with a real offender it must
		// not add a line.
		const st = accountLikeTheRealOne();
		expect(
			st.landingPages.filter((g) => g.verdict === "corrigir").length,
		).toBeGreaterThan(0);
		expect(st.accountVerdict).toBe(null);
	});

	it("does not fire on a merely cold account", () => {
		// A paid/organic gap alone would fire on nearly every account,
		// because paid traffic is colder by nature and the statement
		// already says so. The absolute component is what makes this a
		// finding rather than a description of advertising.
		const rows = [];
		for (let i = 0; i < 6; i++) {
			const c = `OK${i}|12000000000${i}`;
			rows.push(...sess(220 + i * 5, MUTE, c, "/loja"));
			rows.push(...sess(780 - i * 5, LIVE, c, "/loja"));
		}
		rows.push(
			...Array.from({ length: 500 }, () => ({
				aggregate: { max_scroll_depth: 70, checkout_reached: true },
				eventCount: 5,
				userAgent: null,
			})),
		);
		const st = buildTrafficStatement(rows, { ...WIN, minSessions: 100 });
		expect(st.accountBlindPct).toBeGreaterThan(20);
		expect(st.accountBlindPct).toBeLessThan(ABSOLUTE_BLIND_FLOOR);
		expect(st.accountVerdict).toBe(null);
	});
});
