import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { resolveOrgContext } from "@/libs/resolve-org";
import {
	sawNothing,
	campaignKeyOf,
} from "../../../../../packages/strategy-plan/sections/traffic-statement";

// ──────────────────────────────────────────────
// The sessions behind one number.
//
// Counting only beats a generated paragraph if the count can be
// opened. Three reviewers reached that independently and the dentist
// put it hardest: "a palavra contagem não me protege, a auditoria
// protege. Se eu não consigo abrir a conta, contar e escrever com IA
// são o mesmo salto de fé com vocabulário diferente, e o seu
// vocabulário é mais arrogante."
//
// He is right, and the replicability auditor measured the same gap
// from the other side: our method is auditable and our case is blind,
// while Clarity is the exact inverse, unauditable method and fully
// auditable case because you can watch three sessions. For most buyers
// the second trade is the better one, and it is free.
//
// So a row opens. Each session comes back with every signal the
// predicate looks at, counted by the same function the statement
// counted with, so the list and the number cannot disagree.
// ──────────────────────────────────────────────

/** Enough to audit, not enough to be a data export. */
const MAX_ROWS = 200;

export async function GET(request: Request) {
	const session = await getServerSession(authOptions);
	if (!session?.user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}
	const orgCtx = await resolveOrgContext();
	if (!orgCtx.orgId || !orgCtx.envId) {
		return NextResponse.json({ sessions: [], reason: "no-environment" });
	}

	const url = new URL(request.url);
	const dimension = url.searchParams.get("dimension") ?? "campaign";
	const key = url.searchParams.get("key");
	const days = Math.min(90, Math.max(7, Number(url.searchParams.get("days")) || 30));
	/** Which half of the number: the mute sessions, or all of them. */
	const only = url.searchParams.get("only") ?? "mute";
	if (!key) {
		return NextResponse.json({ message: "key is required" }, { status: 400 });
	}

	try {
		const { prisma } = await import("@/libs/prismaDb");
		const end = new Date();
		const start = new Date(end.getTime() - days * 86400000);

		const rows = await prisma.behavioralSessionAggregate.findMany({
			where: { envId: orgCtx.envId, startedAt: { gte: start, lt: end } },
			select: { aggregate: true, eventCount: true, startedAt: true },
			orderBy: { startedAt: "desc" },
			take: 120_000,
		});

		interface Row {
			at: string;
			mute: boolean;
			events: number;
			scroll: number;
			sawCta: boolean;
			clicked: boolean;
			paused: boolean;
			form: boolean;
			checkout: boolean;
			contact: string[];
			pages: number;
			durationS: number;
		}
		const out: Row[] = [];
		let matched = 0;

		for (const r of rows) {
			let a: Record<string, unknown>;
			try {
				a = JSON.parse(r.aggregate) as Record<string, unknown>;
			} catch {
				continue;
			}
			const ft = (a.attribution as { first_touch?: Record<string, unknown> } | undefined)
				?.first_touch;
			const campaignRaw = typeof ft?.campaign === "string" ? ft.campaign : null;
			if (!campaignRaw) continue;

			// The same identity the statement groups by, so a row the
			// table counted is a row this list can find.
			if (dimension === "campaign") {
				// Same identity the statement groups by, including the
				// utm_id fallback, or a row the table counted would not
				// be findable here.
				const ident = campaignKeyOf(
					campaignRaw,
					typeof ft?.utm_id === "string" ? ft.utm_id : null,
				);
				if (ident.key !== key) continue;
			} else if (dimension === "page") {
				const landing = typeof ft?.landing_url === "string" ? ft.landing_url : null;
				if (!landing) continue;
				let path = landing;
				try {
					path = new URL(landing).pathname;
				} catch {
					// A malformed URL is still a label, same as the statement.
				}
				if (path !== key) continue;
			}

			const mute = sawNothing(a);
			if (only === "mute" && !mute) continue;
			matched++;
			if (out.length >= MAX_ROWS) continue;

			const prog = Array.isArray(a.surface_progression) ? a.surface_progression.length : 0;
			out.push({
				at: r.startedAt.toISOString(),
				mute,
				events: r.eventCount,
				// Every signal the predicate looks at, so the reader can
				// check the verdict on this session instead of trusting it.
				scroll: typeof a.max_scroll_depth === "number" ? a.max_scroll_depth : 0,
				sawCta: Number(a.cta_viewed_count ?? 0) > 0,
				clicked: Number(a.dead_click_count ?? 0) > 0,
				paused: Number(a.hesitation_pause_count ?? 0) > 0,
				form: Boolean(a.form_started),
				checkout: Boolean(a.checkout_reached),
				contact: Array.isArray(a.contact_channels) ? (a.contact_channels as string[]) : [],
				pages: prog,
				durationS: Math.round(Number(a.session_duration_ms ?? 0) / 1000),
			});
		}

		// The total is the number the table printed; the list is a
		// sample of it. Saying so is the difference between a sample and
		// a quietly truncated answer.
		return NextResponse.json({ sessions: out, matched, shown: out.length });
	} catch (err) {
		console.error("[traffic-sessions]", err);
		return NextResponse.json({ message: "Failed to list sessions" }, { status: 500 });
	}
}
