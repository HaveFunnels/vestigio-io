/* eslint-disable */
// Diagnoses why the 5 reported empty cards are empty for havefunnels.com.
//
// Cards (in order of UI surface):
//   1. /app/dashboard "O que mudou desde o último ciclo"  → reads Finding.changeClass
//   2. /app/dashboard "Nenhum padrão de tendência acionável"  → reads multi-cycle trend
//   3. /app/workspaces "Delta do Ciclo"  → reads change_report from projectionsCache
//   4. /app/actions "Vitórias Rápidas"  → reads ActionProjection.priority_score
//   5. /app/inventory "Com Descobertas"  → reads PageInventoryItem.findingCount

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient({ log: [] });

async function main() {
	// Find the env id for havefunnels
	const env = await prisma.environment.findFirst({
		where: { domain: { contains: "havefunnels", mode: "insensitive" } },
		select: { id: true, domain: true, organizationId: true, isProduction: true },
		orderBy: { createdAt: "asc" },
	});
	if (!env) {
		console.log("No havefunnels environment found.");
		process.exit(1);
	}
	console.log("env:", env);
	const envId = env.id;

	// ── 1. Cycle history ──
	const cycles = await prisma.auditCycle.findMany({
		where: { environmentId: envId },
		orderBy: { createdAt: "desc" },
		take: 30,
		select: {
			id: true,
			cycleType: true,
			status: true,
			createdAt: true,
			completedAt: true,
		},
	});
	console.log(`\n── Cycle history (${cycles.length}) ──`);
	const byStatus: Record<string, number> = {};
	const byType: Record<string, number> = {};
	for (const c of cycles) {
		byStatus[c.status] = (byStatus[c.status] || 0) + 1;
		byType[c.cycleType] = (byType[c.cycleType] || 0) + 1;
	}
	console.log("by status:", byStatus);
	console.log("by type:", byType);
	console.log("oldest 5:", cycles.slice(-5).map(c => ({ id: c.id.slice(-8), type: c.cycleType, status: c.status, at: c.createdAt.toISOString().slice(0, 19) })));
	console.log("newest 5:", cycles.slice(0, 5).map(c => ({ id: c.id.slice(-8), type: c.cycleType, status: c.status, at: c.createdAt.toISOString().slice(0, 19) })));

	// ── 2. Finding.changeClass distribution per recent cycle ──
	const recentComplete = cycles.filter(c => c.status === "complete").slice(0, 5);
	console.log(`\n── Finding.changeClass per recent complete cycle (5) ──`);
	for (const c of recentComplete) {
		const grouped = await prisma.finding.groupBy({
			by: ["changeClass"],
			where: { cycleId: c.id },
			_count: true,
		});
		const total = grouped.reduce((s, g) => s + g._count, 0);
		console.log(`  cycle ${c.id.slice(-8)} (${c.cycleType}) — total=${total}`,
			Object.fromEntries(grouped.map(g => [String(g.changeClass), g._count])));
	}

	// ── 3. CycleSnapshot history ──
	const snaps = await prisma.cycleSnapshot.findMany({
		where: {
			workspaceRef: { contains: env.organizationId },
			environmentRef: { contains: envId },
		},
		orderBy: { createdAt: "desc" },
		take: 10,
		select: {
			id: true,
			cycleId: true,
			auditMode: true,
			decisionCount: true,
			signalCount: true,
			isBaseline: true,
			createdAt: true,
		},
	});
	console.log(`\n── CycleSnapshot history (${snaps.length}) ──`);
	for (const s of snaps) {
		console.log(`  ${s.id.slice(-12)} cycle=${s.cycleId?.slice(-8) ?? '—'} mode=${s.auditMode} decisions=${s.decisionCount} signals=${s.signalCount} baseline=${s.isBaseline} at=${s.createdAt.toISOString().slice(0,19)}`);
	}

	// ── 4. projectionsCache.change_report inspection (latest cycle) ──
	const latest = recentComplete[0];
	if (latest) {
		const latestFull = await prisma.auditCycle.findUnique({
			where: { id: latest.id },
			select: { projectionsCache: true },
		});
		const cache: any = latestFull?.projectionsCache;
		console.log(`\n── projectionsCache.change_report (latest cycle ${latest.id.slice(-8)}) ──`);
		if (!cache) {
			console.log("  projectionsCache is null!");
		} else {
			const cr = cache.change_report;
			if (!cr) {
				console.log("  cache.change_report is null");
			} else {
				console.log("  headline:", cr.headline);
				console.log("  overall_trend:", cr.overall_trend);
				console.log("  counts:", {
					regression: cr.regression_count,
					improvement: cr.improvement_count,
					new_issue: cr.new_issue_count,
					resolved: cr.resolved_count,
					stable_risk: cr.stable_risk_count,
				});
				console.log("  previous_cycle_ref:", cr.previous_cycle_ref);
			}
			console.log("  findings count in cache:", Array.isArray(cache.findings) ? cache.findings.length : "absent");
			console.log("  actions count in cache:", Array.isArray(cache.actions) ? cache.actions.length : "absent");
			console.log("  workspaces count in cache:", Array.isArray(cache.workspaces) ? cache.workspaces.length : "absent");
			// Sample change_class distribution from cached findings
			if (Array.isArray(cache.findings)) {
				const cc: Record<string, number> = {};
				for (const f of cache.findings) {
					const k = String(f.change_class);
					cc[k] = (cc[k] || 0) + 1;
				}
				console.log("  cached findings change_class dist:", cc);
			}
		}
	}

	// ── 5. Actions priority_score distribution (for Quick Wins card) ──
	if (latest) {
		const latestFull = await prisma.auditCycle.findUnique({
			where: { id: latest.id },
			select: { projectionsCache: true },
		});
		const cache: any = latestFull?.projectionsCache;
		console.log(`\n── Actions in latest cache ──`);
		if (Array.isArray(cache?.actions)) {
			console.log(`  total actions: ${cache.actions.length}`);
			const buckets = { hasImpact: 0, hasPriorityScore: 0, hasEffortHint: 0, hasRemediationSteps: 0 };
			for (const a of cache.actions) {
				if (a.impact?.midpoint != null) buckets.hasImpact++;
				if (typeof a.priority_score === "number" && a.priority_score > 0) buckets.hasPriorityScore++;
				if (a.effort_hint) buckets.hasEffortHint++;
				if (Array.isArray(a.remediation_steps) && a.remediation_steps.length > 0) buckets.hasRemediationSteps++;
			}
			console.log("  field coverage:", buckets);
			// Sample top 3 by priority_score
			const top = cache.actions
				.slice()
				.sort((a: any, b: any) => (b.priority_score ?? 0) - (a.priority_score ?? 0))
				.slice(0, 3);
			console.log("  top 3 by priority_score:", top.map((a: any) => ({
				title: a.title?.slice(0, 60),
				priority_score: a.priority_score,
				effort_hint: a.effort_hint,
				impact_midpoint: a.impact?.midpoint,
			})));
		} else {
			console.log("  no actions array in cache");
		}
	}

	// ── 6. PageInventoryItem.findingCount distribution ──
	console.log(`\n── PageInventoryItem.findingCount distribution ──`);
	const inv = await prisma.pageInventoryItem.findMany({
		where: { environmentRef: envId },
		select: { id: true, normalizedUrl: true, findingCount: true },
		orderBy: { findingCount: "desc" },
		take: 10,
	});
	const invTotal = await prisma.pageInventoryItem.count({ where: { environmentRef: envId } });
	const invWithFindings = await prisma.pageInventoryItem.count({
		where: { environmentRef: envId, findingCount: { gt: 0 } },
	});
	console.log(`  total inventory rows: ${invTotal}`);
	console.log(`  rows with findingCount > 0: ${invWithFindings}`);
	console.log(`  top 10 by findingCount:`);
	for (const r of inv) {
		console.log(`    ${r.findingCount}  ${r.normalizedUrl}`);
	}

	// ── 7. Findings → URLs mapping (raw) ──
	if (latest) {
		const findingTotal = await prisma.finding.count({
			where: { cycleId: latest.id },
		});
		console.log(`\n── Finding rows in latest cycle ${latest.id.slice(-8)}: ${findingTotal} ──`);
	}

	await prisma.$disconnect();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
