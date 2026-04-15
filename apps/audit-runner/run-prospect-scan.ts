import { prisma } from "@/libs/prismaDb";
import { runStagedPipeline, type PipelineEvent } from "../../workers/ingestion/staged-pipeline";
import { parsePage } from "../../workers/ingestion/parser";
import { httpFetch } from "../../workers/ingestion/http-client";
import { extractLandingPreview } from "../../workers/ingestion/landing-preview";
import { deriveMiniAuditFindings } from "../../workers/ingestion/mini-audit-findings";
import { normalizeDomain } from "@/libs/lead-validation";

// ──────────────────────────────────────────────
// Prospect Scan Worker (admin Growth funnel)
//
// Sister to apps/audit-runner/run-mini-audit.ts but for the
// admin-initiated outreach scans. Differences:
//
//   - Runs in mode='shallow_plus' (1 home + 5 critical pages, 15s)
//     instead of mode='shallow' (1 page only). The deeper crawl gives
//     sales/marketing more material to reference in cold outreach.
//   - Persists to ProspectScan (no AnonymousLead, no MiniAuditResult,
//     no cache). Each admin scan is a fresh crawl — admins are
//     trusted callers, no abuse mitigation needed
//   - No status promotion path — these scans never become real Orgs.
//     They're outreach assets that live forever (until manually deleted)
//
// Called fire-and-forget from POST /api/admin/surface-scans. Heal cron
// in instrumentation-node.ts auto-fails ProspectScans stuck in
// `running` for >10min (same pattern as the audit-runner).
// ──────────────────────────────────────────────

export interface RunProspectScanResult {
	scanId: string;
	status: "complete" | "failed";
	pagesScanned: number;
	durationMs: number;
	error?: string;
}

export async function runProspectScan(scanId: string): Promise<RunProspectScanResult> {
	const startedAt = Date.now();

	const scan = await prisma.prospectScan.findUnique({
		where: { id: scanId },
	});

	if (!scan) {
		throw new Error(`ProspectScan ${scanId} not found`);
	}

	// Idempotency — heal cron may double-fire
	if (scan.status === "running" || scan.status === "complete") {
		return {
			scanId,
			status: scan.status === "complete" ? "complete" : "failed",
			pagesScanned: scan.pagesScanned,
			durationMs: 0,
		};
	}

	// Mark running
	await prisma.prospectScan.update({
		where: { id: scanId },
		data: { status: "running" },
	});

	try {
		const normalized = normalizeDomain(scan.domain);
		const rootUrl = normalized.startsWith("http") ? normalized : `https://${normalized}`;

		// Direct fetch for the preview (we need raw HTML for favicon
		// extraction, which the pipeline doesn't expose).
		const response = await httpFetch(rootUrl);
		const parsed = parsePage(response.body, response.final_url);

		// Run shallow_plus pipeline for evidence side-effects + the
		// extra critical-page crawl. Errors are non-fatal — we still
		// have the homepage data from the direct fetch above.
		const noopEmit = (_event: PipelineEvent) => {};
		let pagesScanned = 1; // homepage always counts
		try {
			const result = await runStagedPipeline(
				{
					domain: normalized,
					workspace_ref: `prospect:${scanId}`,
					environment_ref: `prospect:${scanId}`,
					website_ref: `prospect:${scanId}`,
					cycle_ref: `prospect_scan:${scanId}`,
					mode: "shallow_plus",
				},
				noopEmit,
			);
			pagesScanned = result.coverage_entries.filter((e) => e.validated).length || 1;
		} catch (err) {
			console.warn(
				`[prospect-scan ${scanId}] shallow_plus pipeline error (non-fatal):`,
				err,
			);
		}

		const preview = extractLandingPreview({
			response,
			parsed,
			rawHtml: response.body,
		});

		// Prospect scans don't have lead-declared revenue/AOV — pass
		// empty business inputs so findings fall back to the heuristic
		// SMB Brazilian e-commerce baseline (still derives a BRL range,
		// just with wider uncertainty bounds). Admin outreach reviewers
		// read this to spot commercial hook, not to sell with the
		// numbers, so heuristic basis is fine.
		const findings = deriveMiniAuditFindings({
			parsed,
			response,
			rawHtml: response.body,
			business: { monthly_revenue: null, average_ticket: null },
			domain: normalized,
		});

		const durationMs = Date.now() - startedAt;

		await prisma.prospectScan.update({
			where: { id: scanId },
			data: {
				status: "complete",
				preview: JSON.stringify(preview),
				visibleFindings: JSON.stringify(findings.visible),
				blurredFindings: JSON.stringify(findings.blurred),
				pagesScanned,
				durationMs,
				completedAt: new Date(),
			},
		});

		console.log(
			`[prospect-scan ${scanId}] complete — ${normalized}, ${pagesScanned} pages, ${findings.visible.length} findings, ${durationMs}ms`,
		);

		return { scanId, status: "complete", pagesScanned, durationMs };
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		console.error(`[prospect-scan ${scanId}] failed:`, errorMsg);

		await prisma.prospectScan
			.update({
				where: { id: scanId },
				data: {
					status: "failed",
					errorMsg,
					completedAt: new Date(),
				},
			})
			.catch(() => {});

		return {
			scanId,
			status: "failed",
			pagesScanned: 0,
			durationMs: Date.now() - startedAt,
			error: errorMsg,
		};
	}
}

// ──────────────────────────────────────────────
// Heal helper — same pattern as audit-runner.healStuckCycles
// ──────────────────────────────────────────────

const STUCK_RUNNING_AFTER_MS = 10 * 60 * 1000;

export async function healStuckProspectScans(): Promise<number> {
	const cutoff = new Date(Date.now() - STUCK_RUNNING_AFTER_MS);
	const result = await prisma.prospectScan.updateMany({
		where: { status: "running", createdAt: { lt: cutoff } },
		data: {
			status: "failed",
			errorMsg: "Worker timed out (>10min)",
			completedAt: new Date(),
		},
	});
	if (result.count > 0) {
		console.warn(`[prospect-scan heal] auto-failed ${result.count} stuck scans`);
	}
	return result.count;
}
