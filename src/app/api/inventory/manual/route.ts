import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";
import { withErrorTracking } from "@/libs/error-tracker";
import { isUrlSafeForFetch } from "../../../../../packages/url-normalize/ssrf";

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

	// SSRF guard — block private/loopback/link-local/IMDS before the URL
	// can land in the audit pipeline. Resolves DNS, rejects with a clean
	// reason. Domain match is re-validated below for defense-in-depth.
	const safety = await isUrlSafeForFetch(parsed.url);
	if (!safety.safe) {
		return NextResponse.json(
			{ message: `URL rejected: ${safety.reason}` },
			{ status: 400 },
		);
	}

	const { cookies } = await import("next/headers");
	const cookieStore = await cookies();
	const activeEnv = cookieStore.get("active_env")?.value ?? null;
	const { resolveEnvId } = await import("@/libs/resolve-env");
	const envId = await resolveEnvId({ userId: user.id, activeEnv });
	if (!envId) {
		return NextResponse.json({ message: "No environment" }, { status: 404 });
	}
	const environment = { id: envId };

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

	// Per-org cap on manual seeds. Default 200, configurable by
	// platform admin via Organization.manualSeedCap. We only count
	// rows that aren't soft-deleted (removedAt = null) since the
	// run-cycle only seeds those. Existing rows being re-added skip
	// the cap (upsert vs. create) so the user can resurrect a deleted
	// URL even when at the cap.
	const org = await prisma.organization.findUnique({
		where: { id: membership.organizationId },
		select: { manualSeedCap: true },
	});
	const cap = org?.manualSeedCap ?? 200;
	const existing = await prisma.pageInventoryItem.findUnique({
		where: {
			environmentRef_normalizedUrl: {
				environmentRef: environment.id,
				normalizedUrl: parsed.url,
			},
		},
		select: { id: true },
	});
	if (!existing) {
		const currentCount = await prisma.pageInventoryItem.count({
			where: {
				environmentRef: environment.id,
				discoverySource: "manual",
				removedAt: null,
			},
		});
		if (currentCount >= cap) {
			return NextResponse.json(
				{
					message: `Manual seed cap reached (${cap}). Contact support to raise the limit.`,
				},
				{ status: 429 },
			);
		}
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
