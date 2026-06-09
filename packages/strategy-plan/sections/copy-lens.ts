// ──────────────────────────────────────────────
// Wave 22.8 — Copy Lens Framework section generator
//
// Summarises the latest cycle's CopyFrameworkAudit rows for the Plan.
// Per framework (AIDA, PAS, 4Ps, BAB, etc.), pulls the audits for each
// page slot (home, pricing, features, about) and computes:
//   - Average score across pages
//   - Top gap criterion per page (lowest-rated criterion with evidence)
//   - Cross-framework ranking (weakest + strongest)
//
// Pure SQL + deterministic — no LLM call. UI renders a grid of
// frameworks with per-page scores and lets the customer click into the
// /app/workspaces drawer for the full audit.
//
// Self-hides on the UI when frameworks is empty (no audits this cycle).
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import type {
	GenerateContext,
	CopyLensSectionOutput,
	CopyLensFrameworkOutput,
} from "../types";

interface CopyFrameworkAuditRow {
	frameworkId: string;
	pageUrl: string;
	pageSlot: string;
	scorePct: number;
	criteria: unknown;
	cycleId: string;
}

interface CriterionVerdict {
	id: string;
	status: "pass" | "warn" | "fail" | "not_evaluated";
	evidence?: string | null;
	fix?: string | null;
}

// Inline label dictionary so we do not introduce a runtime dependency on
// the next.js src/lib path from inside the strategy-plan package. Kept
// in sync with src/lib/copy-frameworks.ts COPY_FRAMEWORKS array.
const FRAMEWORK_LABEL: Record<string, { en: string; pt: string }> = {
	aida: { en: "AIDA", pt: "AIDA" },
	pas: { en: "PAS", pt: "PAS" },
	"4ps": { en: "4Ps", pt: "4Ps" },
	bab: { en: "BAB", pt: "BAB" },
	spin: { en: "SPIN", pt: "SPIN" },
	fab: { en: "FAB", pt: "FAB" },
	dos: { en: "DOS", pt: "DOS" },
	pixar: { en: "Pixar", pt: "Pixar" },
	quest: { en: "QUEST", pt: "QUEST" },
	"4cs": { en: "4Cs", pt: "4Cs" },
};

// Criterion labels per framework — only the most common 4-5 per
// framework. We surface only the criterion that's currently the worst
// gap on the page, so most users see at most one criterion label per
// page row.
const CRITERION_LABEL_PT: Record<string, string> = {
	// AIDA
	attention: "Atenção",
	interest: "Interesse",
	desire: "Desejo",
	action: "Ação",
	// PAS
	problem: "Problema",
	agitation: "Agitação",
	solution: "Solução",
	// 4Ps
	picture: "Picture",
	promise: "Promessa",
	prove: "Prove",
	push: "Push",
	// BAB
	before: "Antes",
	after: "Depois",
	bridge: "Ponte",
	// FAB
	feature: "Feature",
	advantage: "Vantagem",
	benefit: "Benefício",
};

function frameworkLabel(id: string, locale: string): string {
	const entry = FRAMEWORK_LABEL[id];
	if (!entry) return id.toUpperCase();
	return locale === "pt-BR" ? entry.pt : entry.en;
}

function criterionLabel(id: string, locale: string): string {
	if (locale === "pt-BR" && CRITERION_LABEL_PT[id]) return CRITERION_LABEL_PT[id];
	// Fallback: humanise the snake_case id.
	return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function pickTopGap(
	verdicts: CriterionVerdict[],
	locale: string,
): { criterionId: string; criterionLabel: string; evidence: string | null } | null {
	// Priority: fail > warn. Within tier, the first one wins (deterministic
	// because the engine writes criteria in framework-declaration order).
	const fail = verdicts.find((v) => v.status === "fail");
	const warn = !fail ? verdicts.find((v) => v.status === "warn") : null;
	const pick = fail ?? warn;
	if (!pick) return null;
	return {
		criterionId: pick.id,
		criterionLabel: criterionLabel(pick.id, locale),
		evidence: pick.evidence ?? null,
	};
}

export async function generateCopyLens(
	prisma: PrismaClient,
	ctx: GenerateContext,
): Promise<CopyLensSectionOutput | null> {
	// Find the most recent cycleId that has CopyFrameworkAudit rows for
	// this env + locale. We do NOT scope to ctx.monthStart/monthEnd
	// because copy-framework audits are gated on Plan-Max envs and may
	// not run every cycle; falling back to "latest" keeps the section
	// non-empty when there's any audit history at all.
	const latest = await prisma.copyFrameworkAudit.findFirst({
		where: {
			environmentId: ctx.environmentId,
			locale: ctx.locale,
		},
		orderBy: { createdAt: "desc" },
		select: { cycleId: true },
	});
	if (!latest) {
		return null;
	}

	const rows: CopyFrameworkAuditRow[] = await prisma.copyFrameworkAudit.findMany({
		where: {
			environmentId: ctx.environmentId,
			cycleId: latest.cycleId,
			locale: ctx.locale,
		},
		select: {
			frameworkId: true,
			pageUrl: true,
			pageSlot: true,
			scorePct: true,
			criteria: true,
			cycleId: true,
		},
	});

	if (rows.length === 0) return null;

	// Group rows by framework.
	const byFramework = new Map<string, CopyFrameworkAuditRow[]>();
	for (const r of rows) {
		const arr = byFramework.get(r.frameworkId) ?? [];
		arr.push(r);
		byFramework.set(r.frameworkId, arr);
	}

	const frameworks: CopyLensFrameworkOutput[] = [];
	for (const [frameworkId, group] of byFramework) {
		const audits = group.map((r) => {
			const verdicts = Array.isArray(r.criteria)
				? (r.criteria as CriterionVerdict[])
				: [];
			return {
				pageSlot: r.pageSlot,
				pageUrl: r.pageUrl,
				scorePct: r.scorePct,
				topGap: pickTopGap(verdicts, ctx.locale),
			};
		});
		const avgScorePct = Math.round(
			audits.reduce((a, b) => a + b.scorePct, 0) / audits.length,
		);
		frameworks.push({
			frameworkId,
			frameworkLabel: frameworkLabel(frameworkId, ctx.locale),
			avgScorePct,
			audits: audits.sort((a, b) => a.scorePct - b.scorePct), // worst pages first
		});
	}

	// Cross-framework rank.
	frameworks.sort((a, b) => a.avgScorePct - b.avgScorePct);
	const weakest = frameworks[0]
		? {
			id: frameworks[0].frameworkId,
			label: frameworks[0].frameworkLabel,
			avgScorePct: frameworks[0].avgScorePct,
		}
		: null;
	const strongest = frameworks[frameworks.length - 1]
		? {
			id: frameworks[frameworks.length - 1].frameworkId,
			label: frameworks[frameworks.length - 1].frameworkLabel,
			avgScorePct: frameworks[frameworks.length - 1].avgScorePct,
		}
		: null;

	return {
		cycleId: latest.cycleId,
		frameworks,
		totalAudits: rows.length,
		weakestFramework: weakest,
		strongestFramework: strongest,
	};
}
