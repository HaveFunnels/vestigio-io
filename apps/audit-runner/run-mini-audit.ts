import { prisma } from "@/libs/prismaDb";
import { runStagedPipeline, type PipelineEvent } from "../../workers/ingestion/staged-pipeline";
import { parsePage } from "../../workers/ingestion/parser";
import { httpFetch } from "../../workers/ingestion/http-client";
import { extractLandingPreview } from "../../workers/ingestion/landing-preview";
import { deriveMiniAuditFindings } from "../../workers/ingestion/mini-audit-findings";
import { hashDomain, normalizeDomain } from "@/libs/lead-validation";
import { summarizeMiniImpact, formatBRL } from "../../packages/impact/mini-impact";

// ──────────────────────────────────────────────
// Mini-Audit Worker (anonymous /lp/audit funnel)
//
// Sister to apps/audit-runner/run-cycle.ts, but for the unauthenticated
// lead-capture path. Differences from the full audit-runner:
//
//   - Runs the staged pipeline in mode='shallow' (1 fetch, 5s budget)
//   - Persists to MiniAuditResult, NOT to PageInventoryItem/Evidence
//   - Cached by sha256(normalized_domain) for 14 days — second visitor
//     for the same domain reuses the existing result
//   - No org / environment / website rows — the lead is anonymous and
//     gets promoted to those only on checkout completion (Sprint 3.10)
//
// Called fire-and-forget from POST /api/lead/[id]/run-audit. The lead
// row's status flips draft → auditing → audit_complete (or back to
// draft on failure so the user can retry).
// ──────────────────────────────────────────────

const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

/** Fire-and-forget email to the lead's email with findings summary. */
async function sendCompletionEmail(
	leadId: string,
	email: string | null,
	domain: string,
	miniAuditResult: { visibleFindings: string; blurredFindings: string },
): Promise<void> {
	if (!email) return;
	try {
		const { sendMiniAuditEmail } = await import("@/libs/notification-triggers");
		const visible = JSON.parse(miniAuditResult.visibleFindings) as Array<{
			title: string;
			severity: string;
			impact?: { min_brl_cents: number; max_brl_cents: number } | null;
		}>;
		const blurred = JSON.parse(miniAuditResult.blurredFindings) as unknown[];
		const negative = visible.filter((f) => f.severity !== "positive");
		const impacts = negative.map((f) => f.impact).filter(Boolean);
		const totalMin = impacts.reduce((sum, i) => sum + (i?.min_brl_cents || 0), 0);
		const totalMax = impacts.reduce((sum, i) => sum + (i?.max_brl_cents || 0), 0);

		await sendMiniAuditEmail({
			email,
			domain,
			leadId,
			findings: negative,
			hiddenCount: blurred.length,
			totalImpactMin: totalMin,
			totalImpactMax: totalMax,
		});
		console.log(`[mini-audit ${leadId}] completion email sent to ${email.slice(0, 3)}***`);
	} catch (err) {
		console.error(`[mini-audit ${leadId}] email send failed:`, err);
	}
}

export interface RunMiniAuditResult {
	leadId: string;
	miniAuditId: string | null;
	cached: boolean;
	durationMs: number;
	error?: string;
}

export async function runMiniAudit(leadId: string): Promise<RunMiniAuditResult> {
	const startedAt = Date.now();

	const lead = await prisma.anonymousLead.findUnique({
		where: { id: leadId },
	});

	if (!lead) {
		throw new Error(`AnonymousLead ${leadId} not found`);
	}

	if (!lead.domain) {
		throw new Error(`AnonymousLead ${leadId} has no domain set`);
	}

	// Don't double-fire if already running or done.
	if (lead.status === "auditing" || lead.status === "audit_complete") {
		return {
			leadId,
			miniAuditId: lead.miniAuditId,
			cached: false,
			durationMs: 0,
		};
	}

	const normalized = normalizeDomain(lead.domain);
	const domainHash = hashDomain(lead.domain);

	// 1. Cache lookup — if we already audited this domain in the last
	//    14 days, reuse the result. This is the spam-mitigation core.
	const cached = await prisma.miniAuditResult.findUnique({
		where: { domainHash },
	});

	if (cached && cached.expiresAt > new Date()) {
		await prisma.anonymousLead.update({
			where: { id: leadId },
			data: {
				status: "audit_complete",
				miniAuditId: cached.id,
			},
		});
		console.log(`[mini-audit ${leadId}] cache hit for ${normalized} → ${cached.id}`);

		// Fire-and-forget email
		sendCompletionEmail(leadId, lead.email, lead.domain!, cached);

		return {
			leadId,
			miniAuditId: cached.id,
			cached: true,
			durationMs: Date.now() - startedAt,
		};
	}

	// 2. Mark lead as auditing
	await prisma.anonymousLead.update({
		where: { id: leadId },
		data: { status: "auditing" },
	});

	try {
		// 3. Direct fetch + parse so we have the raw HTML for the preview
		//    extractor (which needs <link rel="icon"> regex matching).
		//    runStagedPipeline doesn't expose the raw response body to
		//    callers — easier to just fetch once outside it.
		const rootUrl = normalized.startsWith("http") ? normalized : `https://${normalized}`;
		const response = await httpFetch(rootUrl);
		const parsed = parsePage(response.body, response.final_url);

		// 4. Run the shallow staged pipeline for evidence side-effects
		//    (platform detection, indicators, etc). We don't actually
		//    persist the evidence — but the call exercises the same
		//    code path the full audit uses, so any future engine output
		//    we want to extract is one short hop away.
		//
		//    Note: shallow mode short-circuits after Stage A so this is
		//    cheap (~1-2s + the fetch above).
		const noopEmit = (_event: PipelineEvent) => {};
		await runStagedPipeline(
			{
				domain: normalized,
				workspace_ref: `lead:${leadId}`,
				environment_ref: `lead:${leadId}`,
				website_ref: `lead:${leadId}`,
				cycle_ref: `mini_audit:${leadId}`,
				mode: "shallow",
			},
			noopEmit,
		).catch((err) => {
			// Pipeline errors are non-fatal here — we already have the
			// fetch + parse from step 3, which is enough to derive
			// preview + findings.
			console.warn(`[mini-audit ${leadId}] shallow pipeline error (non-fatal):`, err);
		});

		// 5. Build preview
		const preview = extractLandingPreview({
			response,
			parsed,
			rawHtml: response.body,
		});

		// 5b. Optional checkout probe — only for leads that declared
		// their conversion happens in an on-path checkout. We do a
		// single HEAD-like GET (no redirect follow beyond what http-client
		// already does) to /checkout and /cart. This is the cheapest
		// possible "critical path broken" detector: if the rote commerce
		// URL returns 4xx/5xx, that's a finding. Skip for whatsapp/form/
		// external conversion models — probing /checkout on a lead-gen
		// site just yields a 404 we'd have to filter out.
		let probes: Parameters<typeof deriveMiniAuditFindings>[0]["probes"];
		if (lead.conversionModel === "checkout") {
			probes = {};
			const base = response.final_url.replace(/\/$/, "");
			for (const path of ["/checkout", "/cart"]) {
				try {
					// Cap timeout tight — any slow /checkout is its own signal
					// but we shouldn't hold the whole mini-audit for it.
					const probe = await httpFetch(`${base}${path}`);
					// Record the first one that either loads OR errors — we
					// care about "what does /checkout respond with?" and the
					// first hop is already meaningful.
					probes.checkout_status = probe.status_code;
					probes.checkout_final_url = probe.final_url;
					break;
				} catch {
					// Network/DNS error on probe — record as unreachable
					probes.checkout_status = 0;
					probes.checkout_final_url = null;
					break;
				}
			}
		}

		// 6. Derive findings
		const business = {
			monthly_revenue: lead.monthlyRevenue ?? null,
			average_ticket: lead.averageTicket ?? null,
		};
		const findings = deriveMiniAuditFindings({
			parsed,
			response,
			rawHtml: response.body,
			business,
			probes,
			domain: normalized,
		});

		// 7. Persist MiniAuditResult (upsert by domainHash so the same
		//    domain only ever has one current row). Update existing if
		//    expired, create new otherwise.
		const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
		const result = await prisma.miniAuditResult.upsert({
			where: { domainHash },
			create: {
				domainHash,
				domain: normalized,
				preview: JSON.stringify(preview),
				visibleFindings: JSON.stringify(findings.visible),
				blurredFindings: JSON.stringify(findings.blurred),
				durationMs: Date.now() - startedAt,
				expiresAt,
			},
			update: {
				preview: JSON.stringify(preview),
				visibleFindings: JSON.stringify(findings.visible),
				blurredFindings: JSON.stringify(findings.blurred),
				durationMs: Date.now() - startedAt,
				computedAt: new Date(),
				expiresAt,
			},
		});

		// 8. Link result to lead, mark complete
		await prisma.anonymousLead.update({
			where: { id: leadId },
			data: {
				status: "audit_complete",
				miniAuditId: result.id,
			},
		});

		console.log(
			`[mini-audit ${leadId}] complete — ${normalized}, ${findings.visible.length}+${findings.blurred.length} findings, ${Date.now() - startedAt}ms`,
		);

		// Fire-and-forget email
		sendCompletionEmail(leadId, lead.email, lead.domain!, {
			visibleFindings: JSON.stringify(findings.visible),
			blurredFindings: JSON.stringify(findings.blurred),
		});

		return {
			leadId,
			miniAuditId: result.id,
			cached: false,
			durationMs: Date.now() - startedAt,
		};
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		console.error(`[mini-audit ${leadId}] failed:`, errorMsg);

		// Roll status back so the user can retry from the result page.
		await prisma.anonymousLead
			.update({
				where: { id: leadId },
				data: { status: "draft" },
			})
			.catch(() => {});

		return {
			leadId,
			miniAuditId: null,
			cached: false,
			durationMs: Date.now() - startedAt,
			error: errorMsg,
		};
	}
}
