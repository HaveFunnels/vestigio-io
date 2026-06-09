// Read-only diagnostic: what of the audit pipeline ran for havefunnels?
// Run with: node --env-file=.env.local scripts/_havefunnels-pipeline-audit.mjs
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

function header(label) {
	console.log(`\n========== ${label} ==========`);
}

try {
	header("ORG + ENV LOOKUP");
	const orgs = await p.organization.findMany({
		where: {
			environments: { some: { domain: { contains: "havefunnels" } } },
		},
		select: { id: true, name: true, plan: true, status: true, orgType: true, createdAt: true },
	});
	console.log("Matching orgs:", orgs);

	if (orgs.length === 0) {
		console.log("⚠️  No org found");
		await p.$disconnect();
		process.exit(0);
	}

	const orgId = orgs[0].id;
	const envs = await p.environment.findMany({
		where: { organizationId: orgId },
		select: { id: true, domain: true, landingUrl: true, isProduction: true, createdAt: true },
	});
	console.log("Envs:", envs);
	const envId = envs[0].id;

	header("LAST 10 AUDIT CYCLES");
	const cycles = await p.auditCycle.findMany({
		where: { organizationId: orgId },
		orderBy: { createdAt: "desc" },
		take: 10,
		select: {
			id: true,
			cycleType: true,
			status: true,
			createdAt: true,
			completedAt: true,
			retryCount: true,
			lastError: true,
			currentPhase: true,
		},
	});
	console.table(
		cycles.map((c) => ({
			id: c.id.slice(0, 12),
			type: c.cycleType,
			status: c.status,
			ageHours: Math.round(((Date.now() - c.createdAt.getTime()) / 3_600_000) * 10) / 10,
			durationS: c.completedAt
				? Math.round((c.completedAt.getTime() - c.createdAt.getTime()) / 1000)
				: null,
			retries: c.retryCount,
			phase: c.currentPhase ?? "",
			err: c.lastError ? c.lastError.slice(0, 50) : "",
		})),
	);

	header("LATEST COMPLETE CYCLE DEEP-DIVE");
	const latest = cycles.find((c) => c.status === "complete");
	if (!latest) {
		console.log("⚠️  No complete cycle in last 10");
		await p.$disconnect();
		process.exit(0);
	}
	console.log(`cycleId=${latest.id} type=${latest.cycleType}`);
	const cycleRef = `audit_cycle:${latest.id}`;

	header("EVIDENCE BY TYPE (latest complete cycle)");
	const evidenceRows = await p.evidence.groupBy({
		by: ["evidenceType"],
		where: { cycleRef },
		_count: { _all: true },
		orderBy: { _count: { id: "desc" } },
	});
	console.table(evidenceRows.map((r) => ({ type: r.evidenceType, count: r._count._all })));
	const totalEv = evidenceRows.reduce((a, b) => a + b._count._all, 0);
	console.log(`Total evidence rows in cycle: ${totalEv}`);

	header("INDICATOR EVIDENCE TYPES (across last 10 cycles)");
	const indicators = [
		"NucleiMatch",
		"KatanaDiscovery",
		"BrowserNavigationTrace",
		"BrowserCheckoutConfirmation",
		"BrowserFailureEvent",
		"SerpResults",
		"SubdomainDiscovery",
		"CompetitorPageSnapshot",
		"CustomerVoiceSnapshot",
		"SurfaceInventory",
		"BehavioralSession",
		"BehavioralCohort",
		"PlaywrightRender",
		"NetworkAnalysis",
		"MobileVerificationResult",
		"ClassifiedRuntimeErrors",
		"SurfaceVitality",
		"AuthenticatedSessionAttempt",
		"AuthenticationBlockedEvent",
		"PrerequisiteMissingEvent",
		"IntegrationSnapshot",
		"BehavioralEvent",
	];
	const allCycleRefs = cycles.map((c) => `audit_cycle:${c.id}`);
	const indicatorCounts = await p.evidence.groupBy({
		by: ["evidenceType"],
		where: {
			cycleRef: { in: allCycleRefs },
			evidenceType: { in: indicators },
		},
		_count: { _all: true },
	});
	const found = new Map(indicatorCounts.map((r) => [r.evidenceType, r._count._all]));
	console.table(
		indicators.map((t) => ({
			type: t,
			count_last10: found.get(t) ?? 0,
			status: found.has(t) ? "✓ fired" : "✗ silent",
		})),
	);

	header("PAGE INVENTORY (env-wide)");
	const pageCount = await p.pageInventoryItem.count({ where: { environmentRef: envId } });
	const classifiedCount = await p.pageInventoryItem.count({
		where: { environmentRef: envId, classifiedPageType: { not: null } },
	});
	console.log(`Total pages: ${pageCount}, classified: ${classifiedCount}`);

	header("CYCLE TYPE DISTRIBUTION — LAST 90 DAYS");
	const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000);
	const cycleTypeDist = await p.auditCycle.groupBy({
		by: ["cycleType", "status"],
		where: { organizationId: orgId, createdAt: { gte: ninetyDaysAgo } },
		_count: { _all: true },
	});
	console.table(
		cycleTypeDist.map((r) => ({ cycleType: r.cycleType, status: r.status, count: r._count._all })),
	);

	header("LAST FULL / COLD CYCLE — EVER?");
	const lastFull = await p.auditCycle.findFirst({
		where: { organizationId: orgId, cycleType: { in: ["full", "cold"] } },
		orderBy: { createdAt: "desc" },
		select: { id: true, cycleType: true, status: true, createdAt: true, completedAt: true, lastError: true },
	});
	if (!lastFull) {
		console.log("❌ NO FULL OR COLD CYCLE EVER FOUND for this org.");
	} else {
		const ageDays = Math.round((Date.now() - lastFull.createdAt.getTime()) / 86_400_000);
		console.log(`Last full/cold: ${lastFull.cycleType} ${lastFull.status} ${ageDays}d ago (cycleId=${lastFull.id})`);
		if (lastFull.lastError) console.log(`  lastError: ${lastFull.lastError.slice(0, 200)}`);
	}

	header("FINDINGS — LATEST CYCLE");
	const findingsByPack = await p.finding.groupBy({
		by: ["pack", "severity"],
		where: { cycleId: latest.id },
		_count: { _all: true },
	});
	console.table(
		findingsByPack.map((f) => ({
			pack: f.pack,
			severity: f.severity,
			count: f._count._all,
		})),
	);
	const totalFindings = await p.finding.count({ where: { cycleId: latest.id } });
	console.log(`Total findings (latest cycle): ${totalFindings}`);

	header("FINDINGS BY changeClass (latest cycle)");
	const byChange = await p.finding.groupBy({
		by: ["changeClass"],
		where: { cycleId: latest.id },
		_count: { _all: true },
	});
	console.table(
		byChange.map((c) => ({ changeClass: c.changeClass ?? "(null)", count: c._count._all })),
	);

	header("SUPPRESSION RULES (Wire 0)");
	const supCount = await p.suppressionRule.count({
		where: {
			OR: [
				{ scopeRef: `workspace:${orgId}` },
				{ scopeRef: { in: envs.map((e) => `environment:${e.id}`) } },
			],
		},
	});
	console.log(`Active rules: ${supCount}`);

	header("INTEGRATIONS");
	const integrations = await p.integrationConnection.findMany({
		where: { environmentId: envId },
		select: { provider: true, status: true, lastSyncedAt: true },
	});
	console.table(integrations);

	const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
	header("LATEST FULL CYCLE — EVIDENCE & ENRICHMENT FIRING");
	const latestFull = await p.auditCycle.findFirst({
		where: { organizationId: orgId, cycleType: { in: ["full", "cold"] }, status: "complete" },
		orderBy: { createdAt: "desc" },
		select: { id: true, cycleType: true, createdAt: true, completedAt: true },
	});
	if (latestFull) {
		console.log(`Latest complete full/cold: ${latestFull.id} (${latestFull.cycleType}, ${Math.round((Date.now() - latestFull.createdAt.getTime()) / 3_600_000)}h ago)`);
		const fullRef = `audit_cycle:${latestFull.id}`;
		const fullEvidence = await p.evidence.groupBy({
			by: ["evidenceType"],
			where: { cycleRef: fullRef },
			_count: { _all: true },
			orderBy: { _count: { id: "desc" } },
		});
		console.table(fullEvidence.map((r) => ({ type: r.evidenceType, count: r._count._all })));

		// Phase history: shows which enrichment passes were attempted
		const fullCycleDetail = await p.auditCycle.findUnique({
			where: { id: latestFull.id },
			select: { phaseHistory: true },
		});
		if (fullCycleDetail?.phaseHistory) {
			console.log("\nPhase history:");
			const ph = fullCycleDetail.phaseHistory;
			if (Array.isArray(ph)) {
				console.table(ph.slice(0, 30).map((e) => ({
					phase: e.phase ?? e.name ?? JSON.stringify(e).slice(0, 60),
					timestamp: e.timestamp ?? e.at ?? "",
					durationMs: e.durationMs ?? e.duration_ms ?? "",
				})));
			} else {
				console.log(JSON.stringify(ph, null, 2).slice(0, 2000));
			}
		} else {
			console.log("No phaseHistory recorded for this cycle.");
		}
	}

	header("RECENT FAILED CYCLES — TOP ERROR REASONS");
	const recentFailed = await p.auditCycle.findMany({
		where: {
			organizationId: orgId,
			status: { in: ["failed", "stuck"] },
			createdAt: { gte: thirtyDaysAgo },
		},
		select: { cycleType: true, lastError: true, currentPhase: true },
		orderBy: { createdAt: "desc" },
		take: 30,
	});
	const errorBuckets = new Map();
	for (const f of recentFailed) {
		const key = `${f.cycleType}/${f.currentPhase ?? "(none)"}/${(f.lastError ?? "(no error msg)").slice(0, 100)}`;
		errorBuckets.set(key, (errorBuckets.get(key) ?? 0) + 1);
	}
	const errorArr = [...errorBuckets.entries()].sort((a, b) => b[1] - a[1]);
	console.table(errorArr.slice(0, 12).map(([key, count]) => ({ count, signature: key })));

	header("FAIL / STUCK CYCLES — LAST 30 DAYS");
	const total30 = await p.auditCycle.count({
		where: { organizationId: orgId, createdAt: { gte: thirtyDaysAgo } },
	});
	const failed30 = await p.auditCycle.count({
		where: {
			organizationId: orgId,
			createdAt: { gte: thirtyDaysAgo },
			status: { in: ["failed", "stuck"] },
		},
	});
	console.log(`Failed/stuck: ${failed30} of ${total30} cycles in last 30d`);

	header("DONE");
} catch (e) {
	console.error("❌ Script error:", e.message ?? e);
	process.exitCode = 1;
} finally {
	await p.$disconnect();
}
