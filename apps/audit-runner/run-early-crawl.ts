import { prisma } from "@/libs/prismaDb";
import { fetchAndParseHomepage } from "../../workers/ingestion/fetch-and-parse";
import { deriveMiniAuditFindings } from "../../workers/ingestion/mini-audit-findings";
import { detectTechnologies } from "../../packages/technology-registry";
import { normalizeDomain } from "@/libs/lead-validation";
import type { CrawlProgress, CrawlTeaserFinding } from "@/types/crawl-progress";

// ──────────────────────────────────────────────
// Early-Crawl Worker
//
// Fire-and-forget after step 1 of the /audit form. Pre-warms the
// audit by fetching the homepage, detecting the tech stack, and
// extracting one finding-teaser to surface in the form's value-on-fill
// interstitial (step 5-6).
//
// Persists progress to AnonymousLead.crawlProgress (JSONB). The
// terminal run-mini-audit later consumes cachedHtmlB64 to skip the
// re-fetch — net saving 1-4s on the final audit.
//
// Constraints:
//   - cachedHtmlB64 capped at 200KB after stripping <script>/<style>
//     to keep the JSONB row lean.
//   - Idempotent: if crawlProgress.status is already "fetching" or
//     "ready", return early without re-running.
//   - Errors are absorbed into crawlProgress.status="error" + errorCode;
//     they never throw out of this fn (it's called fire-and-forget).
// ──────────────────────────────────────────────

const MAX_CACHED_HTML_BYTES = 200_000;

function stripHeavyTags(html: string): string {
	// Drop <script>...</script> and <style>...</style> bodies — they
	// bloat the cache and aren't needed for findings (the findings
	// already pre-extracted what they need from the live HTML).
	return html
		.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
		.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
}

function toBase64Capped(html: string): string | null {
	const stripped = stripHeavyTags(html);
	const buf = Buffer.from(stripped, "utf-8");
	if (buf.length === 0) return null;
	// Truncate at MAX_CACHED_HTML_BYTES of UTF-8 bytes BEFORE encoding so
	// the resulting base64 stays ~4/3 of that ceiling.
	const truncated = buf.length > MAX_CACHED_HTML_BYTES
		? buf.subarray(0, MAX_CACHED_HTML_BYTES)
		: buf;
	return truncated.toString("base64");
}

function buildTeaserFromFindings(
	findings: ReturnType<typeof deriveMiniAuditFindings>,
): CrawlTeaserFinding | null {
	// Pick the most severe negative finding to teaser. Critical > high >
	// medium. Skip positives (those are "you're doing well" findings).
	const negative = findings.visible.filter((f) => f.severity !== "positive");
	if (negative.length === 0) return null;
	const ordered = [...negative].sort((a, b) => {
		const rank = (s: string) => (s === "critical" ? 0 : s === "high" ? 1 : 2);
		return rank(a.severity) - rank(b.severity);
	});
	const top = ordered[0];
	if (!top.impact) return null;
	return {
		id: top.id,
		title: top.title,
		category: top.category,
		severity: top.severity as "critical" | "high" | "medium",
		rangeLowBrlCents: top.impact.min_brl_cents,
		rangeHighBrlCents: top.impact.max_brl_cents,
	};
}

async function writeProgress(leadId: string, progress: CrawlProgress): Promise<void> {
	await prisma.anonymousLead
		.update({
			where: { id: leadId },
			// Prisma typegen for Json fields expects InputJsonValue; the
			// shape is fully serializable so the cast is safe.
			data: { crawlProgress: progress as unknown as object },
		})
		.catch(() => {});
}

export async function runEarlyCrawl(leadId: string): Promise<void> {
	const lead = await prisma.anonymousLead.findUnique({ where: { id: leadId } });
	if (!lead || !lead.domain) return;

	const current = (lead.crawlProgress as unknown as CrawlProgress | null) ?? null;
	// Idempotency — never restart a fetch in flight or a completed run.
	if (current?.status === "fetching" || current?.status === "ready") return;

	const normalized = normalizeDomain(lead.domain);
	const startedAt = new Date().toISOString();

	await writeProgress(leadId, {
		status: "fetching",
		startedAt,
		pagesFound: 0,
		stack: [],
		teaserFinding: null,
		cachedHtmlB64: null,
		cachedFinalUrl: null,
	});

	try {
		const { response, parsed } = await fetchAndParseHomepage(normalized);

		// 1. Tech detection — <5ms, reuses existing registry.
		const detected = detectTechnologies({
			script_srcs: parsed.scripts.map((s) => s.src).filter(Boolean),
			iframe_srcs: parsed.iframes.map((i) => i.src).filter(Boolean),
			html_bodies: [response.body],
			inline_scripts: parsed.inline_scripts,
			page_urls: [response.final_url],
		});
		// Keep just the display names, deduped, ordered by confidence desc.
		const stack = Array.from(
			new Map(
				detected
					.sort((a, b) => b.confidence - a.confidence)
					.map((t) => [t.display_name, t.display_name] as const),
			).values(),
		);

		// 2. Derive ONE finding teaser. Reuses the same detector library
		//    the run-audit uses — same numbers, same categories.
		const findings = deriveMiniAuditFindings({
			parsed,
			response,
			rawHtml: response.body,
			business: {
				monthly_revenue: lead.monthlyRevenue ?? null,
				average_ticket: lead.averageTicket ?? null,
				business_model: lead.businessModel ?? null,
				service_category: (lead as { serviceCategory?: string | null }).serviceCategory ?? null,
				app_platform: (lead as { appPlatform?: string | null }).appPlatform ?? null,
				enterprise_segment: (lead as { enterpriseSegment?: string | null }).enterpriseSegment ?? null,
			},
			domain: normalized,
		});
		const teaserFinding = buildTeaserFromFindings(findings);

		// 3. Cache HTML for run-audit reuse.
		const cachedHtmlB64 = toBase64Capped(response.body);

		const finishedAt = new Date().toISOString();
		await writeProgress(leadId, {
			status: "ready",
			startedAt,
			finishedAt,
			pagesFound: 1,
			stack,
			teaserFinding,
			cachedHtmlB64,
			cachedFinalUrl: response.final_url,
		});
		console.log(
			`[early-crawl ${leadId}] done — ${normalized}, stack=[${stack.slice(0, 5).join(",")}], teaser=${teaserFinding?.id ?? "none"}`,
		);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		const code = /timeout/i.test(msg) ? "timeout" : /dns|enotfound|getaddrinfo/i.test(msg) ? "dns_fail" : "network_error";
		console.warn(`[early-crawl ${leadId}] failed (${code}):`, msg);
		await writeProgress(leadId, {
			status: "error",
			startedAt,
			finishedAt: new Date().toISOString(),
			pagesFound: 0,
			stack: [],
			teaserFinding: null,
			cachedHtmlB64: null,
			cachedFinalUrl: null,
			errorCode: code,
		});
	}
}
