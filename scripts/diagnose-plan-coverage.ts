#!/usr/bin/env tsx
/**
 * diagnose-plan-coverage — is what we shipped actually landing on a real Plano?
 *
 * Prints, for one environment (by domain), the overlap between:
 *   (a) findings referenced in the latest MonthlyStrategyPlan's nextSteps
 *   (b) our shipped Plano-drawer wow features:
 *         - Screenshot per finding (exact source_url match)
 *         - Screenshot fallback to homepage
 *         - Peer-contrast line (packages/signals/peer-line whitelist)
 *
 * Answers "is the work dormant on our one paying customer?" without
 * guessing. Read-only — no writes.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/diagnose-plan-coverage.ts <domain>
 *
 * Example:
 *   DATABASE_URL=... npx tsx scripts/diagnose-plan-coverage.ts havefunnels.com
 */

import { PrismaClient } from "@prisma/client";
import { PEER_LINE_INFERENCE_KEYS, getPeerLine } from "../packages/signals/peer-line";

const prisma = new PrismaClient();

function normPath(input: string): string {
	const raw = String(input || "").trim();
	if (!raw) return "/";
	let path: string;
	try {
		path = new URL(raw, "https://x").pathname;
	} catch {
		path = raw.startsWith("/") ? raw : `/${raw}`;
	}
	return path.length > 1 ? path.replace(/\/+$/, "") : "/";
}

async function main() {
	const domain = process.argv[2];
	if (!domain) {
		console.error("usage: diagnose-plan-coverage <domain>");
		process.exit(2);
	}

	const env = await prisma.environment.findFirst({
		where: { domain },
		select: {
			id: true,
			domain: true,
			organization: {
				select: { businessProfile: { select: { businessModel: true } } },
			},
		},
	});
	if (!env) {
		console.error(`no environment found for domain=${domain}`);
		process.exit(1);
	}
	const businessModel = env.organization?.businessProfile?.businessModel ?? null;
	console.log(`env ${env.id} · domain=${env.domain} · businessModel=${businessModel}`);

	const plan = await prisma.monthlyStrategyPlan.findFirst({
		where: { environmentId: env.id, status: { in: ["ready", "editing"] } },
		orderBy: { generatedAt: "desc" },
		include: { nextSteps: { select: { linkedFindingRefsJson: true } } },
	});
	if (!plan) {
		console.error("no ready Plano found for this env");
		process.exit(1);
	}
	console.log(`plan month=${plan.month} · locale=${plan.locale} · generatedAt=${plan.generatedAt.toISOString()}`);

	// Collect the finding refs the plan actually renders.
	const refs = new Set<string>();
	for (const s of plan.nextSteps) {
		const arr = (s.linkedFindingRefsJson as string[]) ?? [];
		for (const r of arr) refs.add(r);
	}
	console.log(`plan references ${refs.size} unique finding ids/keys via nextSteps.`);

	// Load the current cycle's findings so we can inspect inference_key + source_url.
	// Match by id OR inference_key (plan generator stores either).
	const findings = await prisma.finding.findMany({
		where: {
			OR: [
				{ id: { in: Array.from(refs) } },
				{ inferenceKey: { in: Array.from(refs) } },
			],
		},
		select: {
			id: true,
			inferenceKey: true,
			projection: true,
			pack: true,
			severity: true,
		},
	});
	console.log(`resolved ${findings.length} finding rows.\n`);

	// Load screenshot paths captured for this env (all cycles — latest wins per path).
	const shots = await prisma.surfaceScreenshot.findMany({
		where: { environmentId: env.id },
		orderBy: { capturedAt: "desc" },
		select: { path: true },
	});
	const capturedPaths = new Set<string>();
	for (const s of shots) capturedPaths.add(normPath(s.path));
	console.log(`env has ${capturedPaths.size} captured surface paths: ${Array.from(capturedPaths).slice(0, 8).join(", ")}${capturedPaths.size > 8 ? "…" : ""}\n`);

	// Per-feature coverage on the finding set.
	let peerLineHits = 0;
	const peerLineKeysSeen = new Set<string>();
	let screenshotExact = 0;
	let screenshotHomeFallback = 0;
	let screenshotNone = 0;
	const findingsWithoutSourceUrl: string[] = [];

	const whitelistSet = new Set(PEER_LINE_INFERENCE_KEYS);

	for (const f of findings) {
		const proj = f.projection as { source_url?: string | null } | null;
		const sourceUrl = proj?.source_url ?? null;

		// Peer-line eligibility
		if (whitelistSet.has(f.inferenceKey)) {
			const line = getPeerLine(f.inferenceKey, businessModel, plan.locale);
			if (line) {
				peerLineHits += 1;
				peerLineKeysSeen.add(f.inferenceKey);
			}
		}

		// Screenshot eligibility
		if (!sourceUrl) {
			findingsWithoutSourceUrl.push(f.inferenceKey);
			if (capturedPaths.has("/")) screenshotHomeFallback += 1;
			else screenshotNone += 1;
			continue;
		}
		const path = normPath(sourceUrl);
		if (capturedPaths.has(path)) screenshotExact += 1;
		else if (capturedPaths.has("/")) screenshotHomeFallback += 1;
		else screenshotNone += 1;
	}

	const total = findings.length;
	const pct = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);

	console.log("── VISUAL PROOF (screenshot in FindingCard drawer) ──");
	console.log(`  exact-page match:    ${screenshotExact}/${total}  (${pct(screenshotExact)}%)`);
	console.log(`  home fallback:       ${screenshotHomeFallback}/${total}  (${pct(screenshotHomeFallback)}%)`);
	console.log(`  no screenshot:       ${screenshotNone}/${total}  (${pct(screenshotNone)}%)`);
	console.log(`  findings w/o source: ${findingsWithoutSourceUrl.length}`);
	if (findingsWithoutSourceUrl.length > 0 && findingsWithoutSourceUrl.length <= 12) {
		console.log(`    keys: ${findingsWithoutSourceUrl.join(", ")}`);
	}

	console.log("\n── PEER CONTRAST (Vestigio Index cohort line) ──");
	console.log(`  findings with a peer line: ${peerLineHits}/${total}  (${pct(peerLineHits)}%)`);
	if (peerLineKeysSeen.size > 0) {
		console.log(`  keys that hit: ${Array.from(peerLineKeysSeen).join(", ")}`);
	} else {
		console.log(`  keys that hit: (none — feature is dormant on this plan)`);
	}
	console.log(`  whitelist size: ${PEER_LINE_INFERENCE_KEYS.length}`);
	console.log(`  whitelist keys: ${PEER_LINE_INFERENCE_KEYS.join(", ")}`);

	console.log("\n── TL;DR ──");
	const anyScreenshot = screenshotExact + screenshotHomeFallback;
	console.log(`  ${pct(anyScreenshot)}% of Plano findings render a screenshot.`);
	console.log(`  ${pct(peerLineHits)}% of Plano findings render a peer line.`);
	if (peerLineHits === 0) {
		console.log("  → peer-line whitelist expansion is currently invisible to this customer.");
	}

	await prisma.$disconnect();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
