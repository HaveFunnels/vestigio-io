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

const MAX_SURFACES = 5;
const VIEWPORT = { width: 1280, height: 800 };
const NAV_TIMEOUT_MS = 15_000;
const PAINT_SETTLE_MS = 1_200;

function hashUrl(url: string): string {
	return createHash("sha1").update(url).digest("hex").slice(0, 16);
}

/** Capture one above-the-fold viewport screenshot as a JPEG buffer. null on any failure. */
async function captureViewport(url: string): Promise<Buffer | null> {
	try {
		return await withBrowserContext({ viewport: VIEWPORT }, async (context) => {
			const page = await context.newPage();
			try {
				await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
				await page.waitForTimeout(PAINT_SETTLE_MS); // let above-the-fold paint settle
				const buf = await page.screenshot({ type: "jpeg", quality: 70, fullPage: false });
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

/** The surfaces worth showing: real crawled pages where findings cluster
 *  (findingCount), then criticality/priority. Homepage always included. */
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

	const seen = new Set<string>();
	const out: SurfaceTarget[] = [];
	// Homepage first — it's the universal "your storefront as buyers see it" shot.
	const home = items.find((i) => i.path === "/" || i.path === "");
	if (home?.normalizedUrl) {
		out.push({ normalizedUrl: home.normalizedUrl, path: home.path });
		seen.add(home.normalizedUrl);
	}
	for (const it of items) {
		if (out.length >= MAX_SURFACES) break;
		if (!it.normalizedUrl || seen.has(it.normalizedUrl)) continue;
		seen.add(it.normalizedUrl);
		out.push({ normalizedUrl: it.normalizedUrl, path: it.path });
	}
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
