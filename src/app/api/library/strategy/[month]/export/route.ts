import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";
import { mintExportToken } from "@/libs/strategy-export-token";

// ──────────────────────────────────────────────
// POST /api/library/strategy/[month]/export?envId=...
//
// Generates a single-page-long PDF of the Monthly Strategy Plan.
//
// Flow:
//   1. Validate session + owner-or-member access (same as GET).
//   2. Locate the plan; refuse if status='generating' or already
//      exporting (exportLockedUntil in the future → 423).
//   3. Set exportLockedUntil = now + ~35s as a soft mutex.
//   4. Mint an HMAC export token bound to the planId.
//   5. Use withBrowserContext to spin up a chromium page. Navigate
//      to /app/library/strategy/[month]?print=true&export_token=...
//      on localhost so the cookie-less chromium can authenticate via
//      the token.
//   6. Wait for networkidle, measure document.body.scrollHeight,
//      generate page.pdf({ width: 210mm, height: <scrollHeight>px,
//      printBackground: true }).
//   7. Clear the lock + return the PDF blob as a download.
//
// Export lock: prevents two concurrent export attempts from racing
// the same chromium instance + double-charging the customer for
// pool time. Self-heals if the worker crashes (timestamp-based).
// ──────────────────────────────────────────────

const EXPORT_LOCK_MS = 35_000;

interface RouteParams {
	params: Promise<{ month: string }>;
}

function resolveBaseUrl(_request: Request): string {
	// In prod the chromium runs in the same container as Next.js, so
	// 127.0.0.1 + the actual port is the cheapest route (skips DNS +
	// TLS + public-ingress hops, keeps the export token off the wire
	// entirely). INTERNAL_BASE_URL overrides for any deploy topology
	// where chromium runs in a different network.
	const internal = process.env.INTERNAL_BASE_URL;
	if (internal) return internal.replace(/\/$/, "");
	const port = process.env.PORT ?? "3000";
	return `http://127.0.0.1:${port}`;
}

export async function POST(request: Request, { params }: RouteParams) {
	const user = await isAuthorized();
	if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

	const { month } = await params;
	if (!/^\d{4}-\d{2}$/.test(month)) {
		return NextResponse.json({ message: "month must be YYYY-MM" }, { status: 400 });
	}

	const url = new URL(request.url);
	const envId = url.searchParams.get("envId");
	if (!envId) {
		return NextResponse.json({ message: "envId is required" }, { status: 400 });
	}

	const env = await prisma.environment.findUnique({
		where: { id: envId },
		select: {
			id: true,
			domain: true,
			organization: {
				select: {
					ownerId: true,
					memberships: { select: { userId: true } },
				},
			},
		},
	});
	if (!env) return NextResponse.json({ message: "Environment not found" }, { status: 404 });
	const isOwner = env.organization?.ownerId === user.id;
	const isMember = env.organization?.memberships?.some((m) => m.userId === user.id) ?? false;
	if (!isOwner && !isMember && (user as any).role !== "ADMIN") {
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}

	const plan = await prisma.monthlyStrategyPlan.findUnique({
		where: { environmentId_month: { environmentId: envId, month } },
		select: {
			id: true,
			status: true,
			exportLockedUntil: true,
			locale: true,
		},
	});
	if (!plan) return NextResponse.json({ message: "Plan not found" }, { status: 404 });
	if (plan.status === "generating") {
		return NextResponse.json(
			{ message: "Plan still generating; try again in a moment" },
			{ status: 423 },
		);
	}

	const now = new Date();
	if (plan.exportLockedUntil && plan.exportLockedUntil > now) {
		return NextResponse.json(
			{ message: "Export in progress — try again shortly" },
			{ status: 423 },
		);
	}

	// Atomically acquire the lock. If updateMany count=0, another
	// request beat us between the read above and the write — return
	// 423 so the client can retry.
	const lockUntil = new Date(now.getTime() + EXPORT_LOCK_MS);
	const acquired = await prisma.monthlyStrategyPlan.updateMany({
		where: {
			id: plan.id,
			OR: [
				{ exportLockedUntil: null },
				{ exportLockedUntil: { lt: now } },
			],
		},
		data: { exportLockedUntil: lockUntil },
	});
	if (acquired.count === 0) {
		return NextResponse.json(
			{ message: "Export lock contention — try again shortly" },
			{ status: 423 },
		);
	}

	const exportToken = mintExportToken(plan.id);
	const baseUrl = resolveBaseUrl(request);
	const printPath = `/app/library/strategy/${encodeURIComponent(month)}?print=true&env=${encodeURIComponent(envId)}&export_token=${encodeURIComponent(exportToken)}`;
	const printUrl = `${baseUrl}${printPath}`;

	// Wave 22.6 Step 10 review fix #5 — lock released in finally so a
	// throw between page.pdf() and NextResponse construction can't
	// leak the lock for the full 35s self-heal window.
	const releaseLock = () =>
		prisma.monthlyStrategyPlan
			.update({
				where: { id: plan.id },
				data: { exportLockedUntil: null },
			})
			.catch(() => {});

	// Wave-22.6 review fix — observability. Tracks pool wait time
	// (mostly chromium contention) separately from PDF render time
	// so we can tell "the pool was busy" from "the plan was huge".
	const tStart = Date.now();
	let tPoolAcquired = 0;
	try {
		const { withBrowserContext, getPoolStats } = await import(
			"../../../../../../../workers/verification/chromium-pool"
		);
		const poolStatsAtStart = getPoolStats();
		// Use a tall viewport so Framer Motion's whileInView
		// IntersectionObserver sees the entire document on first paint.
		// Without this, sections below the fold render with opacity:0
		// in the captured PDF (default headless viewport is ~720px).
		// PDF export navigates the browser to http://127.0.0.1:PORT/app/
		// library/strategy/... — that IS the internal render surface, so
		// the default SSRF filter on withBrowserContext (which rejects
		// loopback/private IPs by design) has to be bypassed for this
		// path. Every OTHER caller inherits the filter, so the audit-
		// runner still can't SSRF via Chromium.
		const pdf = await withBrowserContext(
			{ viewport: { width: 794, height: 20000 } },
			async (ctx: any) => {
			tPoolAcquired = Date.now();
			const page = await ctx.newPage();
			await page.goto(printUrl, {
				waitUntil: "networkidle",
				timeout: 30_000,
			});
			// Defense in depth: walk through the document scrolling +
			// pausing briefly so any lazy-mounted Framer Motion blocks
			// (e.g. nested staggered children) actually receive
			// IntersectionObserver entries before capture. The tall
			// viewport above usually makes this redundant, but a
			// long plan + nested motion children benefit from the
			// explicit pass.
			await page.evaluate(async () => {
				const total = document.body.scrollHeight;
				const step = Math.max(200, Math.floor(window.innerHeight / 2));
				for (let y = 0; y < total; y += step) {
					window.scrollTo(0, y);
					await new Promise((r) => setTimeout(r, 30));
				}
				window.scrollTo(0, 0);
			});
			// Final settle pause — covers the ~500ms Framer transitions
			// + 1 raf cycle for layout.
			await page.waitForTimeout(800);

			const scrollHeight: number = await page.evaluate(
				() => document.body.scrollHeight,
			);
			const height = Math.max(scrollHeight, 1200); // floor for empty-state pages

			const buffer = await page.pdf({
				width: "210mm",
				height: `${height}px`,
				printBackground: true,
				preferCSSPageSize: false,
				margin: { top: "0", bottom: "0", left: "0", right: "0" },
			});
			return buffer;
		}, { allowPrivateAddresses: true });

		// Locale-aware filename. Falls back to English "plan" when
		// the plan's locale is missing or unrecognized.
		const BASE_NAME_BY_LOCALE: Record<string, string> = {
			"pt-BR": "vestigio-plano",
			"en": "vestigio-plan",
			"es": "vestigio-plan",
			"de": "vestigio-plan",
		};
		const baseName = BASE_NAME_BY_LOCALE[plan.locale ?? ""] ?? "vestigio-plan";
		const filename = `${baseName}-${month}.pdf`;

		const tDone = Date.now();
		console.log(
			`[strategy/export] env=${env.id} month=${month} ` +
			`pool_wait_ms=${tPoolAcquired - tStart} ` +
			`render_ms=${tDone - tPoolAcquired} ` +
			`total_ms=${tDone - tStart} ` +
			`pool_busy_at_start=${poolStatsAtStart.inUse}/${poolStatsAtStart.capacity} ` +
			`bytes=${pdf.byteLength}`,
		);

		const response = new NextResponse(pdf, {
			status: 200,
			headers: {
				"Content-Type": "application/pdf",
				"Content-Disposition": `attachment; filename="${filename}"`,
				"Cache-Control": "private, no-store",
			},
		});
		await releaseLock();
		return response;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error(`[api/library/strategy/export] env=${env.id} month=${month} failed:`, msg);
		return NextResponse.json(
			{ ok: false, error: msg.slice(0, 500) },
			{ status: 500 },
		);
	} finally {
		// Defense in depth: if NextResponse construction itself throws
		// or anything between try and the success path leaks, finally
		// still releases the lock so the next export attempt succeeds
		// before the 35s self-heal expiry.
		await releaseLock();
	}
}
