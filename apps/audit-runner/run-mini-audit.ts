import { prisma } from "@/libs/prismaDb";
import { runStagedPipeline, type PipelineEvent } from "../../workers/ingestion/staged-pipeline";
import { parsePage } from "../../workers/ingestion/parser";
import { httpFetch, type HttpResponse } from "../../workers/ingestion/http-client";
import { extractLandingPreview } from "../../workers/ingestion/landing-preview";
import { deriveMiniAuditFindings, inferBusinessType } from "../../workers/ingestion/mini-audit-findings";
import { hashDomain, normalizeDomain } from "@/libs/lead-validation";
import { summarizeMiniImpact, formatBRL } from "../../packages/impact/mini-impact";
import type { CrawlProgress } from "@/types/crawl-progress";

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

// Wave-23 — pull the cached homepage HTML from AnonymousLead.crawlProgress
// if the early-crawl already produced it. Returns null when:
//   - early-crawl never ran (visitor was super fast or hit a bug)
//   - early-crawl errored
//   - crawl is still in flight after 3×500ms wait
//
// Wait budget is tight on purpose — if the early-crawl is taking more
// than 1.5s extra here, it's faster to just re-fetch ourselves than
// keep blocking. The early-crawl's own timeout is the upper bound.
async function waitForCachedHtml(leadId: string): Promise<HttpResponse | null> {
	for (let attempt = 0; attempt < 3; attempt++) {
		const lead = await prisma.anonymousLead.findUnique({
			where: { id: leadId },
			select: { crawlProgress: true },
		});
		const cp = (lead?.crawlProgress as unknown as CrawlProgress | null) ?? null;
		if (cp?.status === "ready" && cp.cachedHtmlB64 && cp.cachedFinalUrl) {
			const body = Buffer.from(cp.cachedHtmlB64, "base64").toString("utf-8");
			// Synthesize a minimal HttpResponse — downstream code only
			// uses .body and .final_url + .status_code/.redirect_chain.
			// The redirect_chain is unknown from the cache (we'd have
			// had to persist it too); empty array is fine for findings
			// that check it via length.
			const synthesized: HttpResponse = {
				url: cp.cachedFinalUrl,
				final_url: cp.cachedFinalUrl,
				status_code: 200,
				headers: {},
				body,
				response_time_ms: 0,
				redirect_chain: [],
				content_type: null,
				content_length: body.length,
			};
			// Null the cached HTML — single-use; keeps the jsonb row lean.
			await prisma.anonymousLead
				.update({
					where: { id: leadId },
					data: {
						crawlProgress: {
							...cp,
							cachedHtmlB64: null,
							cachedFinalUrl: null,
						} as unknown as object,
					},
				})
				.catch(() => {});
			return synthesized;
		}
		if (cp?.status === "error" || !cp || cp.status === "idle") {
			return null; // not coming — re-fetch ourselves
		}
		// status === "fetching" — wait briefly and re-check
		if (attempt < 2) await new Promise((r) => setTimeout(r, 500));
	}
	return null;
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
	// Cache key now also includes the visitor's self-declared
	// businessModel (Wave-22.7) so two visitors at the same domain
	// who picked different verticals don't share results — they need
	// different vertical-specific findings to fire. Falls back to
	// "default" when missing so legacy leads still hit a stable key.
	const businessModelKey = lead.businessModel || "default";
	const domainHash = hashDomain(`${lead.domain}|${businessModelKey}`);

	// 1. Cache lookup — if we already audited this (domain, vertical)
	//    pair in the last 14 days, reuse the result. Spam-mitigation
	//    survives intact (the heaviest cost is still the HTTP fetch,
	//    and the per-(domain, vertical) cache rarely exceeds 7 entries).
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
		//
		// Wave-23 value-on-fill: if the early-crawl already fetched the
		// homepage and stashed the HTML, reuse it. Saves 1-4s. If the
		// early-crawl is still in flight ("fetching"), wait up to 3×500ms
		// before falling back to a fresh fetch — covers the rare case of
		// a power-user filling the whole form in ~5s.
		const rootUrl = normalized.startsWith("http") ? normalized : `https://${normalized}`;
		const cached = await waitForCachedHtml(leadId);
		let response: HttpResponse;
		if (cached) {
			response = cached;
			console.log(`[mini-audit ${leadId}] cache hit on cachedHtml — skipped httpFetch`);
		} else {
			response = await httpFetch(rootUrl);
		}
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
			// Wave-22.7 — vertical hints. Used by services-specific
			// detectors to gate themselves. Tolerates null cleanly for
			// legacy leads.
			business_model: lead.businessModel ?? null,
			service_category: (lead as { serviceCategory?: string | null }).serviceCategory ?? null,
			app_platform: (lead as { appPlatform?: string | null }).appPlatform ?? null,
			enterprise_segment: (lead as { enterpriseSegment?: string | null }).enterpriseSegment ?? null,
		};
		const findings = deriveMiniAuditFindings({
			parsed,
			response,
			rawHtml: response.body,
			business,
			probes,
			domain: normalized,
		});

		// 6b. Infer business type from crawl signals.
		//
		// Only fires when the visitor DIDN'T pick a vertical themselves
		// (legacy leads + leads where the form short-circuited). The
		// inferer scores against ecommerce/lead_gen/saas only — it has
		// no signal for services/app_conversion/enterprise. If we let
		// it overwrite a user-declared services/app/enterprise pick,
		// we silently corrupt the lead's businessModel to one of the
		// three legacy types, breaking every downstream personalization
		// (CTA copy, funnel resolver, page-priority etc.). Treat the
		// user's pick as authoritative when it exists.
		const userDeclaredBusinessModel = !!lead.businessModel;
		const inference = inferBusinessType(parsed, response.body);
		if (inference.confidence >= 0.3 && !userDeclaredBusinessModel) {
			await prisma.anonymousLead.update({
				where: { id: leadId },
				data: {
					businessModel: inference.type,
					...(inference.type === "ecommerce" ? { conversionModel: "checkout" } :
						inference.type === "lead_gen" ? { conversionModel: "form" } :
						{ conversionModel: "checkout" }),
				},
			});
			console.log(
				`[mini-audit ${leadId}] inferred business type: ${inference.type} (confidence: ${inference.confidence.toFixed(2)}, signals: ${inference.signals.join(", ")})`,
			);
		} else if (inference.confidence >= 0.3) {
			// User-declared model takes precedence; log the inference
			// for telemetry but don't overwrite.
			console.log(
				`[mini-audit ${leadId}] inference would have written "${inference.type}" (confidence ${inference.confidence.toFixed(2)}), but visitor declared "${lead.businessModel}" — keeping user pick.`,
			);
		}

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
