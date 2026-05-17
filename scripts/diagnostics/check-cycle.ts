/* eslint-disable */
import { PrismaClient } from "@prisma/client";

const cycleId = process.argv[2];
if (!cycleId) {
	console.error("usage: tsx check-cycle.ts <cycleId>");
	process.exit(1);
}

const prisma = new PrismaClient({ log: [] });

(async () => {
	const cycle = await prisma.auditCycle.findUnique({
		where: { id: cycleId },
		select: {
			id: true,
			status: true,
			cycleType: true,
			createdAt: true,
			completedAt: true,
			lastError: true,
			projectionsCache: true,
			environmentId: true,
		},
	});
	if (!cycle) {
		console.error("not found");
		process.exit(1);
	}
	console.log({
		id: cycle.id,
		status: cycle.status,
		cycleType: cycle.cycleType,
		duration_s: cycle.completedAt
			? Math.round((cycle.completedAt.getTime() - cycle.createdAt.getTime()) / 1000)
			: null,
		hasCache: !!cycle.projectionsCache,
	});

	const cycleRef = `audit_cycle:${cycle.id}`;
	const evidenceTypes = await prisma.evidence.groupBy({
		by: ["evidenceType"],
		where: { cycleRef },
		_count: { evidenceType: true },
	});
	console.log("\nevidence by type:");
	for (const e of evidenceTypes.sort((a, b) => b._count.evidenceType - a._count.evidenceType)) {
		console.log(`  ${e._count.evidenceType.toString().padStart(5)} × ${e.evidenceType}`);
	}

	// Body coverage on page_content
	const pages = await prisma.evidence.findMany({
		where: { cycleRef, evidenceType: "page_content" },
		select: { payload: true, subjectRef: true },
	});
	let pcWithBody = 0;
	let pcWithHeadings = 0;
	const samples: any[] = [];
	for (const r of pages) {
		try {
			const p = JSON.parse(r.payload);
			if (p.type !== "page_content") continue;
			const bl = typeof p.body_text_snippet === "string" ? p.body_text_snippet.length : 0;
			const hc = Array.isArray(p.headings) ? p.headings.length : 0;
			if (bl > 0) pcWithBody++;
			if (hc > 0) pcWithHeadings++;
			if (samples.length < 8) samples.push({
				url: p.url ?? r.subjectRef,
				body_len: bl,
				h: hc,
			});
		} catch {}
	}
	console.log(`\npage_content: ${pages.length} rows  with_body=${pcWithBody}  with_headings=${pcWithHeadings}`);
	for (const s of samples) console.log(`  body=${s.body_len.toString().padStart(5)}  h=${s.h.toString().padStart(2)}  ${s.url}`);

	// copy_elements
	const ce = await prisma.evidence.findMany({
		where: { cycleRef, evidenceType: "copy_elements" },
		select: { payload: true, subjectRef: true },
	});
	console.log(`\ncopy_elements: ${ce.length} rows`);
	const ptCounts = new Map<string, number>();
	const ceSamples: any[] = [];
	for (const r of ce) {
		try {
			const p = JSON.parse(r.payload);
			if (p.type !== "copy_elements") continue;
			ptCounts.set(p.page_type, (ptCounts.get(p.page_type) ?? 0) + 1);
			if (ceSamples.length < 6) ceSamples.push({
				url: p.url ?? r.subjectRef,
				pt: p.page_type,
				fs: p.funnel_stage,
				h1: p.h1,
				ctas: Array.isArray(p.cta_texts) ? p.cta_texts.length : 0,
				body_len: typeof p.body_text === "string" ? p.body_text.length : 0,
			});
		} catch {}
	}
	console.log("  page_types:", Object.fromEntries(ptCounts));
	for (const s of ceSamples) console.log(`    ${s.pt?.padEnd(14)} ${s.fs?.padEnd(13)} ctas=${s.ctas.toString().padStart(2)} body=${s.body_len.toString().padStart(4)} h1=${(s.h1 ?? "(none)").slice(0, 60)}`);

	// findings
	const findings = await prisma.finding.findMany({
		where: { cycleId: cycle.id },
		select: { pack: true, inferenceKey: true },
	});
	const byPack = new Map<string, number>();
	for (const f of findings) byPack.set(f.pack, (byPack.get(f.pack) ?? 0) + 1);
	console.log(`\nfindings: ${findings.length} total across ${byPack.size} packs`);
	for (const [pack, n] of [...byPack.entries()].sort((a, b) => b[1] - a[1])) {
		console.log(`  ${n.toString().padStart(2)}  ${pack}`);
	}
	const copyAlignment = findings.filter((f) => f.pack === "copy_alignment");
	if (copyAlignment.length > 0) {
		console.log("\ncopy_alignment inferenceKeys:");
		for (const f of copyAlignment) console.log(`  - ${f.inferenceKey}`);
	}

	await prisma.$disconnect();
})().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
