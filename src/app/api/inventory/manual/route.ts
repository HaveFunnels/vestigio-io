import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";
import { withErrorTracking } from "@/libs/error-tracker";

// ──────────────────────────────────────────────
// Inventory Manual Add — Wave-22.6 review fix P2.3
//
// Lets the customer surface a URL the crawler missed (or actively
// skipped) by POSTing it explicitly. Row lands in PageInventoryItem
// with discoverySource = "manual" so it survives normal upserts and
// the audit-runner picks it up on the next cycle.
//
// Body: { url: string }
// ──────────────────────────────────────────────

function normalizeUrl(input: string): { url: string; path: string; host: string } | null {
	try {
		const u = new URL(input.trim());
		if (u.protocol !== "http:" && u.protocol !== "https:") return null;
		u.hash = "";
		// strip default tracking params that the crawler normally strips
		const drop = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"];
		for (const p of drop) u.searchParams.delete(p);
		return {
			url: u.toString().replace(/\/$/, ""),
			path: u.pathname + (u.search || ""),
			host: u.hostname,
		};
	} catch {
		return null;
	}
}

export const POST = withErrorTracking(async function POST(request: Request) {
	const user = await isAuthorized();
	if (!user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const body = await request.json().catch(() => null);
	const rawUrl = typeof body?.url === "string" ? body.url : "";
	const parsed = normalizeUrl(rawUrl);
	if (!parsed) {
		return NextResponse.json({ message: "Invalid URL" }, { status: 400 });
	}

	const membership = await prisma.membership.findFirst({
		where: { userId: user.id },
		select: { organizationId: true },
	});
	if (!membership) {
		return NextResponse.json({ message: "No organization" }, { status: 404 });
	}

	const cookieStore = await import("next/headers").then((m) => m.cookies());
	const activeEnvId = cookieStore.get("active_env")?.value;
	const environment = activeEnvId
		? await prisma.environment.findFirst({
				where: { id: activeEnvId, organizationId: membership.organizationId },
				select: { id: true },
		  })
		: await prisma.environment.findFirst({
				where: { organizationId: membership.organizationId },
				orderBy: [{ isProduction: "desc" }, { createdAt: "asc" }],
				select: { id: true },
		  });
	if (!environment) {
		return NextResponse.json({ message: "No environment" }, { status: 404 });
	}

	const website = await prisma.website.findFirst({
		where: { environmentRef: environment.id },
		select: { id: true, rootUrl: true, domain: true },
	});
	if (!website) {
		return NextResponse.json({ message: "No website yet" }, { status: 404 });
	}

	let websiteHost = website.domain ?? "";
	try { websiteHost = new URL(website.rootUrl).hostname; } catch {}
	if (websiteHost && parsed.host !== websiteHost) {
		return NextResponse.json(
			{ message: `URL must be on ${websiteHost}` },
			{ status: 400 },
		);
	}

	// Upsert so re-adding an existing URL just clears removedAt/skipReason
	// rather than erroring. discoverySource set to manual so the row is
	// pinned across crawl-budget pressure.
	const item = await prisma.pageInventoryItem.upsert({
		where: {
			environmentRef_normalizedUrl: {
				environmentRef: environment.id,
				normalizedUrl: parsed.url,
			},
		},
		create: {
			websiteRef: website.id,
			environmentRef: environment.id,
			normalizedUrl: parsed.url,
			path: parsed.path,
			pageType: "other",
			discoverySource: "manual",
			freshnessState: "unknown",
		},
		update: {
			discoverySource: "manual",
			removedAt: null,
			skipReason: null,
		},
		select: { id: true, normalizedUrl: true },
	});

	return NextResponse.json({ ok: true, item });
}, { endpoint: "/api/inventory/manual", method: "POST" });
