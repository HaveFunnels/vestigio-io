// ──────────────────────────────────────────────
// Copy Framework Lens — cold-cycle pre-population (Wave 19a Phase 2).
//
// Runs the Framework Lens audit set once per COLD cycle per env, for
// the org's chosen locale. Result rows land in CopyFrameworkAudit so
// the /app/workspaces/<copy>/ page renders instantly on first visit —
// no Haiku call from the browser, no 10-second loading state.
//
// Warm and hot cycles intentionally skip this step. The customer's
// pricing/H1/etc. don't change between hot sweeps, so re-running the
// LLM 40+ times per warm cycle would burn $$ for no perceived value.
// Cold cycle is the weekly baseline reset — running once a week is
// the right cadence.
//
// Failure mode: best-effort. If Haiku is down, rate-limited, or
// returns malformed JSON, we log and skip. The on-demand path in
// /api/workspace/copy-framework-audit still fills gaps the next time
// a user opens the lens.
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import {
	COPY_FRAMEWORKS,
	buildAuditPrompt,
	parseAuditResponse,
	pickLensPagesByslot,
	detectPageSlot,
	AUDIT_SYSTEM_PROMPT,
	type LensPageCopy,
} from "../../packages/copy-analysis";
import { callModel, isLlmEnabled } from "../mcp/llm/client";

/**
 * Pull page_content evidence for the cycle and return the 4 lens
 * pages (home/pricing/features/about) the audit pre-populator should
 * cover. Mirrors /api/workspace/copy-content but server-side so we
 * don't HTTP-self-call.
 */
async function loadLensPagesForCycle(
	prisma: PrismaClient,
	envId: string,
	cycleId: string,
): Promise<LensPageCopy[]> {
	const envRef = `environment:${envId}`;
	const cycleRef = `audit_cycle:${cycleId}`;
	const rows = await prisma.evidence.findMany({
		where: {
			environmentRef: envRef,
			evidenceType: "page_content",
			cycleRef,
		},
		select: { payload: true, subjectRef: true },
		take: 100,
	});
	const pages: LensPageCopy[] = [];
	for (const row of rows) {
		try {
			const p = JSON.parse(row.payload);
			if (!p || p.type !== "page_content") continue;
			const url = typeof p.url === "string" ? p.url : row.subjectRef;
			const rawHeadings = Array.isArray(p.headings) ? p.headings : [];
			const headings: Array<{ level: 1 | 2 | 3; text: string }> = [];
			for (const h of rawHeadings) {
				if (h && (h.level === 1 || h.level === 2 || h.level === 3) && typeof h.text === "string" && h.text.length > 0) {
					headings.push({ level: h.level, text: h.text });
				}
			}
			pages.push({
				url,
				title: typeof p.title === "string" ? p.title : "",
				h1: typeof p.h1 === "string" ? p.h1 : "",
				meta: typeof p.meta_description === "string" ? p.meta_description : "",
				body: typeof p.body_text_snippet === "string" ? p.body_text_snippet : "",
				headings,
			});
		} catch {
			// skip malformed payloads
		}
	}
	return pages;
}

/**
 * Run one (framework × page) audit through Haiku, then upsert the
 * result into CopyFrameworkAudit. Returns true on persistence write
 * success, false on any failure (parse, LLM, DB).
 */
async function auditOneCell(
	prisma: PrismaClient,
	organizationId: string,
	envId: string,
	cycleId: string,
	locale: string,
	frameworkId: string,
	page: LensPageCopy,
): Promise<boolean> {
	const framework = COPY_FRAMEWORKS.find((f) => f.id === frameworkId);
	if (!framework) return false;

	if (!page.title && !page.h1 && !page.meta && !page.body) {
		// No copy to analyse — skip rather than emitting an empty audit.
		return false;
	}

	let raw: string | null = null;
	try {
		const result = await callModel(
			"haiku_4_5",
			[{ role: "user", content: buildAuditPrompt(framework, page, locale) }],
			{ max_tokens: 1200, temperature: 0.3, system: AUDIT_SYSTEM_PROMPT },
			{
				purpose: "framework_lens.cold_cycle",
				organizationId,
				environmentId: envId,
				cycleId,
			},
		);
		const textBlock = result.content.find((b) => b.type === "text");
		raw = textBlock && "text" in textBlock ? textBlock.text.trim() : "";
	} catch (err) {
		console.warn(
			`[run-framework-lens] Haiku call failed for ${frameworkId} on ${page.url}:`,
			err instanceof Error ? err.message : err,
		);
		return false;
	}

	const parsed = parseAuditResponse(raw, framework);
	if (!parsed) {
		console.warn(`[run-framework-lens] could not parse Haiku response for ${frameworkId} on ${page.url}`);
		return false;
	}

	try {
		await prisma.copyFrameworkAudit.upsert({
			where: {
				environmentId_cycleId_frameworkId_pageUrl_locale: {
					environmentId: envId,
					cycleId,
					frameworkId,
					pageUrl: page.url,
					locale,
				},
			},
			create: {
				environmentId: envId,
				cycleId,
				frameworkId,
				pageUrl: page.url,
				pageSlot: detectPageSlot(page.url),
				locale,
				criteria: parsed.criteria as unknown as object,
				scorePct: parsed.score_pct,
				modelId: "haiku_4_5",
			},
			update: {
				criteria: parsed.criteria as unknown as object,
				scorePct: parsed.score_pct,
				modelId: "haiku_4_5",
			},
		});
		return true;
	} catch (err) {
		console.warn(
			`[run-framework-lens] persistence write failed for ${frameworkId} on ${page.url}:`,
			err instanceof Error ? err.message : err,
		);
		return false;
	}
}

interface RunFrameworkLensInput {
	prisma: PrismaClient;
	organizationId: string;
	envId: string;
	cycleId: string;
	cycleMode: "hot" | "warm" | "cold";
	locale: string;
}

/**
 * Entry point called from run-cycle.ts after cold cycle completion.
 * Safe to invoke on hot/warm cycles too — it just returns early.
 *
 * Concurrency: 4 simultaneous Haiku calls. Anthropic rate-limits free
 * tier at 50 req/min and Tier-1 at 1000 req/min for Haiku — we're at
 * ~40 calls per cold cycle per customer, plenty of headroom even with
 * cycles running back-to-back.
 *
 * No throw: all errors land in console.warn. The caller wraps this in
 * a try/catch as a belt-and-suspenders so a framework-lens hiccup
 * never reverts the cycle's `status=complete` write.
 */
export async function runFrameworkLensForCycle(input: RunFrameworkLensInput): Promise<{
	skipped: boolean;
	reason?: string;
	written: number;
	attempted: number;
}> {
	const { prisma, organizationId, envId, cycleId, cycleMode, locale } = input;

	if (cycleMode !== "cold") {
		return { skipped: true, reason: `cycle-mode=${cycleMode}`, written: 0, attempted: 0 };
	}
	if (!isLlmEnabled()) {
		return { skipped: true, reason: "llm-disabled", written: 0, attempted: 0 };
	}

	const pages = await loadLensPagesForCycle(prisma, envId, cycleId);
	if (pages.length === 0) {
		return { skipped: true, reason: "no-page-content-evidence", written: 0, attempted: 0 };
	}

	// Pick the 4 lens-relevant pages (home/pricing/features/about). For
	// sites where some slots are missing, we just skip those — better
	// to leave a slot empty than to audit /blog as if it were /pricing.
	const slotted = pickLensPagesByslot(pages);
	const targetPages = Object.values(slotted).filter((p): p is LensPageCopy => !!p);
	if (targetPages.length === 0) {
		return { skipped: true, reason: "no-slotted-pages", written: 0, attempted: 0 };
	}

	// Build the work list: every (framework × page) combo.
	const work: Array<{ frameworkId: string; page: LensPageCopy }> = [];
	for (const fw of COPY_FRAMEWORKS) {
		for (const page of targetPages) {
			work.push({ frameworkId: fw.id, page });
		}
	}

	// Concurrency-bounded execution. Each task runs auditOneCell which
	// already swallows its own errors — Promise.allSettled is overkill
	// here, a simple for-loop with a 4-wide worker pool is enough.
	const POOL_SIZE = 4;
	let written = 0;
	let attempted = 0;
	const queue = [...work];
	async function worker() {
		while (queue.length > 0) {
			const next = queue.shift();
			if (!next) break;
			attempted++;
			const ok = await auditOneCell(prisma, organizationId, envId, cycleId, locale, next.frameworkId, next.page);
			if (ok) written++;
		}
	}
	await Promise.all(Array.from({ length: POOL_SIZE }, () => worker()));

	return { skipped: false, written, attempted };
}
