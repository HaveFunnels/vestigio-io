// ──────────────────────────────────────────────
// Plan URL state — drawer + expansion encoding
//
// When a customer opens a side drawer in the plan and then clicks
// "Abrir ficha completa" to land on /app/findings/[id], the drawer's
// state is lost. This module encodes which drawer was open AND which
// finding card was expanded into the plan URL's hash so:
//   - The finding-detail page can build a back-link that returns
//     the customer to the EXACT prior state (drawer reopens with
//     the right card expanded).
//   - The hash is shareable: linking a colleague to a specific
//     finding-in-context becomes possible.
//
// Hash format: `#drawer=<ctx>&expand=<inferenceKey>`
// Where <ctx> is one of:
//   - segment.<buyerKind>            BuyerSegments drawer for a team
//   - step.<stepId>.findings         NextSteps findings drawer for a step
//   - step.<stepId>.actions          NextSteps actions drawer for a step
//   - single.<inferenceKey>          Single sample-finding click in BuyerSegments
// ──────────────────────────────────────────────

export type DrawerCtx =
	| { kind: "segment"; buyer: string }
	| { kind: "step"; stepId: string; mode: "findings" | "actions" }
	| { kind: "single"; inferenceKey: string };

export function serializeDrawerCtx(ctx: DrawerCtx): string {
	switch (ctx.kind) {
		case "segment":
			return `segment.${ctx.buyer}`;
		case "step":
			return `step.${ctx.stepId}.${ctx.mode}`;
		case "single":
			return `single.${ctx.inferenceKey}`;
	}
}

export function parseDrawerCtx(s: string | undefined | null): DrawerCtx | null {
	if (!s) return null;
	if (s.startsWith("segment.")) {
		const buyer = s.slice("segment.".length);
		if (buyer) return { kind: "segment", buyer };
		return null;
	}
	if (s.startsWith("step.")) {
		const parts = s.slice("step.".length).split(".");
		if (parts.length === 2 && (parts[1] === "findings" || parts[1] === "actions")) {
			return {
				kind: "step",
				stepId: parts[0],
				mode: parts[1] as "findings" | "actions",
			};
		}
		return null;
	}
	if (s.startsWith("single.")) {
		const inferenceKey = s.slice("single.".length);
		if (inferenceKey) return { kind: "single", inferenceKey };
	}
	return null;
}

export function buildPlanHash(ctx: DrawerCtx | null, expand?: string | null): string {
	if (!ctx) return "";
	let s = `drawer=${encodeURIComponent(serializeDrawerCtx(ctx))}`;
	if (expand && ctx.kind !== "single") {
		s += `&expand=${encodeURIComponent(expand)}`;
	}
	return `#${s}`;
}

export interface ParsedPlanHash {
	ctx: DrawerCtx | null;
	expand: string | null;
}

export function parsePlanHash(hash: string): ParsedPlanHash {
	if (!hash) return { ctx: null, expand: null };
	const clean = hash.startsWith("#") ? hash.slice(1) : hash;
	const params = new URLSearchParams(clean);
	const drawer = params.get("drawer");
	const expand = params.get("expand");
	return {
		ctx: parseDrawerCtx(drawer),
		expand,
	};
}

/**
 * Build the back URL we hand to /app/findings/[id]. Contains the plan
 * route + the encoded drawer hash, plus a human label rendered in the
 * breadcrumb ("Plano de Junho de 2026 · Problemas de Engenharia").
 */
export function buildFindingBackUrl(args: {
	month: string;
	ctx: DrawerCtx;
	expand: string;
}): string {
	return `/library/strategy/${args.month}${buildPlanHash(args.ctx, args.expand)}`;
}
