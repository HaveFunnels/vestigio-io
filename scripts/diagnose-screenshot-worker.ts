#!/usr/bin/env tsx
/**
 * diagnose-screenshot-worker — is captureTopSurfaceScreenshots landing?
 *
 * Answers the 3 root-cause questions for "0 captured surface paths"
 * on havefunnels' Plano:
 *
 *   1. Does the env have completed cycles that would trigger capture?
 *   2. Does the env have PageInventoryItem rows the worker needs
 *      as targets? (worker looks up top-N surfaces here)
 *   3. Does R2 work at all in prod? (any SurfaceScreenshot rows for
 *      ANY env means R2 is configured and the worker ran somewhere)
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/diagnose-screenshot-worker.ts <domain>
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
	const domain = process.argv[2];
	if (!domain) {
		console.error("usage: diagnose-screenshot-worker <domain>");
		process.exit(2);
	}

	const env = await prisma.environment.findFirst({
		where: { domain },
		select: { id: true, domain: true, createdAt: true },
	});
	if (!env) {
		console.error(`no env for domain=${domain}`);
		process.exit(1);
	}
	console.log(`env ${env.id} · createdAt=${env.createdAt.toISOString()}\n`);

	// 1. Cycles — is the paid audit even running?
	const cycles = await prisma.auditCycle.findMany({
		where: { environmentId: env.id },
		orderBy: { createdAt: "desc" },
		take: 5,
		select: { id: true, status: true, createdAt: true, completedAt: true },
	});
	console.log(`── CYCLES (last 5 of ${await prisma.auditCycle.count({ where: { environmentId: env.id } })} total) ──`);
	for (const c of cycles) {
		console.log(`  ${c.id.slice(0, 12)} · status=${c.status} · created=${c.createdAt.toISOString()} · completed=${c.completedAt?.toISOString() ?? "null"}`);
	}
	if (cycles.length === 0) {
		console.log("  (no cycles — paid audit hasn't run for this env)");
	}

	// 2. PageInventoryItem — the target set for captureTopSurfaceScreenshots
	const inv = await prisma.pageInventoryItem.count({
		where: {
			environmentRef: env.id,
			removedAt: null,
			OR: [{ statusCode: 200 }, { statusCode: null }],
			tier: { in: ["primary", "secondary"] },
		},
	});
	console.log(`\n── PAGE INVENTORY (worker target pool) ──`);
	console.log(`  ${inv} active primary/secondary PageInventoryItem rows`);
	if (inv === 0) {
		console.log("  ← ROOT CAUSE candidate: worker queries this table and returns zero targets when empty");
	}
	const invTop = await prisma.pageInventoryItem.findMany({
		where: { environmentRef: env.id, removedAt: null },
		orderBy: [{ findingCount: "desc" }, { criticality: "desc" }],
		take: 6,
		select: { path: true, tier: true, statusCode: true, findingCount: true, criticality: true },
	});
	for (const p of invTop) {
		console.log(`    ${p.path} · tier=${p.tier} · statusCode=${p.statusCode ?? "null"} · findings=${p.findingCount} · crit=${p.criticality}`);
	}

	// 3. SurfaceScreenshot — did R2 upload EVER succeed for this env?
	const shotsForEnv = await prisma.surfaceScreenshot.count({ where: { environmentId: env.id } });
	const shotsTotal = await prisma.surfaceScreenshot.count();
	console.log(`\n── SURFACE SCREENSHOTS ──`);
	console.log(`  this env:      ${shotsForEnv}`);
	console.log(`  prod total:    ${shotsTotal}`);
	if (shotsTotal === 0) {
		console.log("  ← ROOT CAUSE: NO env has any screenshots. R2 likely unconfigured in prod, OR worker crashed on every run.");
	} else if (shotsForEnv === 0) {
		console.log("  ← R2 works for OTHER envs but never captured here — cycles for this env may pre-date the worker, or worker fired but every target 404'd.");
		const others = await prisma.surfaceScreenshot.groupBy({
			by: ["environmentId"],
			_count: { _all: true },
			orderBy: { _count: { environmentId: "desc" } },
			take: 3,
		});
		console.log("  Top envs with screenshots:");
		for (const o of others) {
			console.log(`    envId=${o.environmentId}: ${o._count._all} shots`);
		}
	} else {
		const latest = await prisma.surfaceScreenshot.findFirst({
			where: { environmentId: env.id },
			orderBy: { capturedAt: "desc" },
			select: { path: true, capturedAt: true, cycleRef: true },
		});
		console.log(`  latest here: ${latest?.path} · captured=${latest?.capturedAt.toISOString()} · cycle=${latest?.cycleRef}`);
	}

	// 4. Findings — do THEIR projections carry source_url?
	// Answer the "why is source_url null" branch by sampling one raw projection.
	const sample = await prisma.finding.findFirst({
		where: { environment: { id: env.id } as any },
		orderBy: { createdAt: "desc" },
		select: { inferenceKey: true, projection: true, createdAt: true },
	});
	console.log(`\n── FINDING SAMPLE (latest) ──`);
	if (sample) {
		// projection is stored as a Text/JSON blob — sometimes serialized
		// as a JS object by Prisma (Json column), sometimes as a raw
		// stringified JSON. Handle both.
		const raw = sample.projection as unknown;
		const proj: { source_url?: string | null; surface?: string } | null =
			typeof raw === "string" ? (raw ? JSON.parse(raw) : null) : (raw as any);
		console.log(`  key=${sample.inferenceKey} · created=${sample.createdAt.toISOString()}`);
		console.log(`  projection.source_url=${JSON.stringify(proj?.source_url ?? null)}`);
		console.log(`  projection.surface=${JSON.stringify(proj?.surface ?? null)}`);
		console.log(`  projection top keys: ${proj ? Object.keys(proj).slice(0, 20).join(", ") : "(null)"}`);
	}

	await prisma.$disconnect();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
