// ──────────────────────────────────────────────
// Surface screenshot capture (PV.9b)
//
// After a cycle's findings persist, capture viewport screenshots of the real
// crawled surfaces where the findings live, upload to R2, and upsert
// SurfaceScreenshot rows. The Plano then shows the customer THEIR page next to
// the top findings ("here's your checkout, the problem is here") instead of a
// text-only description — the #1 thing that separates a world-class audit from
// a generic one.
//
// Surface selection is by real crawled URL (PageInventoryItem.normalizedUrl),
// NOT Finding.surface (which is a static label, often multi-valued). The Plano
// matches a finding to a screenshot by path at render time.
//
// Degrade-safe + best-effort: no-ops without R2; a bad URL, a nav timeout, or an
// upload error is swallowed per-surface and never aborts the cycle.
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
import { withBrowserContext } from "./chromium-pool";
import { r2Configured, uploadScreenshot, screenshotKey } from "../../src/libs/r2-screenshots";

const MAX_SURFACES = 8; // was 5 — room for finding-cited pages (EXAME A8)
const VIEWPORT = { width: 1280, height: 800 };
const NAV_TIMEOUT_MS = 15_000;
const PAINT_SETTLE_MS = 1_200;
const MAX_CAPTURE_HEIGHT = 6_000; // px — cap for endless-scroll pages

export function hashUrl(url: string): string {
	return createHash("sha1").update(url).digest("hex").slice(0, 16);
}

/** Capture one above-the-fold viewport screenshot as a JPEG buffer. null on any failure.
 *  Exported so the free-audit path (apps/audit-runner/run-mini-audit.ts) can reuse
 *  the same chromium-pool + timing tuned for the paid path — no divergent capture logic. */
export async function captureViewport(url: string): Promise<Buffer | null> {
	try {
		return await withBrowserContext({ viewport: VIEWPORT }, async (context) => {
			const page = await context.newPage();
			try {
				await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
				await page.waitForTimeout(PAINT_SETTLE_MS); // let paint settle
				// FULL PAGE, capped (validação Casa Montelle): the old
				// above-the-fold-only shot turned EVERY Shopify page into
				// its hero banner — a finding about the guarantee hidden at
				// the decision point showed a promo banner and proved
				// nothing. Full page (height-capped so a 15.000px endless
				// scroll doesn't produce megabyte figures) lets the plan
				// actually point at below-the-fold evidence; the UI shows
				// a top crop expandable to the whole page.
				const scrollHeight = await page
					.evaluate(() => document.body?.scrollHeight ?? 0)
					.catch(() => 0);
				const captureHeight = Math.min(
					Math.max(scrollHeight, VIEWPORT.height),
					MAX_CAPTURE_HEIGHT,
				);
				const buf = await page.screenshot({
					type: "jpeg",
					quality: 65,
					clip: { x: 0, y: 0, width: VIEWPORT.width, height: captureHeight },
					fullPage: true,
				});
				return Buffer.from(buf);
			} finally {
				await page.close().catch(() => {});
			}
		});
	} catch {
		return null;
	}
}

interface SurfaceTarget {
	normalizedUrl: string;
	path: string;
}

/** The surfaces worth showing: the pages the plan will actually TALK
 *  about. Homepage first, then every surface an OPEN finding cites
 *  (EXAME A8 — the plan's figures exist to prove findings, so the
 *  capture set must chase the findings, not just generic top pages),
 *  then top inventory pages by finding density. */
async function selectSurfaces(prisma: PrismaClient, environmentId: string): Promise<SurfaceTarget[]> {
	const items = await prisma.pageInventoryItem.findMany({
		where: {
			environmentRef: environmentId,
			removedAt: null,
			OR: [{ statusCode: 200 }, { statusCode: null }],
			tier: { in: ["primary", "secondary"] },
		},
		orderBy: [{ findingCount: "desc" }, { criticality: "desc" }, { priority: "desc" }],
		take: 24,
		select: { normalizedUrl: true, path: true },
	});
	const normPath = (p: string) => {
		const x = String(p || "").trim();
		return x.length > 1 ? x.replace(/\/+$/, "") : x || "/";
	};
	const itemByPath = new Map<string, { normalizedUrl: string; path: string }>();
	for (const it of items) {
		if (it.normalizedUrl && !itemByPath.has(normPath(it.path))) {
			itemByPath.set(normPath(it.path), { normalizedUrl: it.normalizedUrl, path: it.path });
		}
	}

	// Paths cited by open findings — split multi-surface strings
	// ("/checkout, /cart") into tokens, keep real inventory pages only.
	const findingPaths: string[] = [];
	try {
		const open = await prisma.finding.findMany({
			where: {
				environmentId,
				status: { in: ["created", "confirmed", "regressed"] },
			},
			select: { surface: true },
			take: 100,
		});
		for (const f of open) {
			for (const tok of String(f.surface ?? "").split(/[,\s]+/)) {
				if (tok.startsWith("/")) findingPaths.push(normPath(tok));
			}
		}
	} catch {
		// Findings unavailable — generic top pages still ship.
	}

	const seen = new Set<string>();
	const out: SurfaceTarget[] = [];
	const push = (t: { normalizedUrl: string; path: string } | undefined) => {
		if (!t?.normalizedUrl || seen.has(t.normalizedUrl) || out.length >= MAX_SURFACES) return;
		seen.add(t.normalizedUrl);
		out.push({ normalizedUrl: t.normalizedUrl, path: t.path });
	};
	// Homepage first — the universal "your storefront as buyers see it" shot.
	push(items.find((i) => i.path === "/" || i.path === ""));
	// Then the pages findings actually cite (skip "/", already in).
	for (const p of findingPaths) {
		if (p !== "/") push(itemByPath.get(p));
	}
	// Then generic top pages by finding density.
	for (const it of items) push(it);
	return out;
}

/**
 * Capture + persist screenshots for the top crawled surfaces of a cycle.
 * Best-effort: returns the count captured; never throws.
 */
export async function captureTopSurfaceScreenshots(
	prisma: PrismaClient,
	environmentId: string,
	cycleRef: string,
): Promise<{ captured: number }> {
	if (!r2Configured()) return { captured: 0 };

	let targets: SurfaceTarget[] = [];
	try {
		targets = await selectSurfaces(prisma, environmentId);
	} catch {
		return { captured: 0 };
	}

	let captured = 0;
	for (const t of targets) {
		try {
			const buf = await captureViewport(t.normalizedUrl);
			if (!buf) continue;
			const key = screenshotKey(environmentId, cycleRef, hashUrl(t.normalizedUrl));
			await uploadScreenshot(key, buf);
			await prisma.surfaceScreenshot.upsert({
				where: {
					environmentId_cycleRef_normalizedUrl: {
						environmentId,
						cycleRef,
						normalizedUrl: t.normalizedUrl,
					},
				},
				create: {
					environmentId,
					cycleRef,
					normalizedUrl: t.normalizedUrl,
					path: t.path,
					r2Key: key,
					width: VIEWPORT.width,
					height: VIEWPORT.height,
				},
				update: { r2Key: key, path: t.path },
			});
			captured++;
		} catch {
			// best-effort per surface — a single failure never aborts the rest
		}
	}
	return { captured };
}
