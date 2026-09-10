/**
 * Shared inventory-row filters.
 *
 * THE rule that keeps Vestigio from reporting its own guesses as the
 * customer's problems: speculative critical-path probes (/checkout,
 * /carrinho, /payment, …) are tagged discoverySource = "critical_path"
 * at discovery time. When such a probe never got a 2xx/3xx back, the
 * page does not exist on the customer's site — WE invented it. Those
 * rows must never surface anywhere customer-facing: not the inventory,
 * not the console, and especially not the plan's "critical surfaces
 * down" banner (which once told a Shopify store its nonexistent
 * /carrinho was a broken primary checkout surface — docs/EXAME_DO_PLANO.md P1).
 *
 * Rows from every other discovery source (homepage_link, sitemap,
 * internal_link, behavioral_event, manual, …) keep surfacing even on
 * 404 — the URL came from the customer's own site data, so a 404 there
 * is a REAL signal (a link pointing at a dead page).
 *
 * This used to live as two hand-synced copies (inventory API route +
 * console-data) and a third consumer (plan ecosystem route) shipped
 * without it. One exported constant now; spread it into any
 * PageInventoryItem `where`.
 */

/** Prisma `where` fragment excluding speculative probes that never resolved. */
// Plain mutable shape (no `as const`) so it assigns into Prisma's
// generated WhereInput types when spread.
export const EXCLUDE_UNCONFIRMED_SPECULATIVE = {
	NOT: {
		AND: [
			{ discoverySource: "critical_path" },
			{
				OR: [
					{ statusCode: null },
					{ statusCode: 0 },
					{ statusCode: { gte: 400 } },
				],
			},
		],
	},
};
