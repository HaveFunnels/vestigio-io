// ──────────────────────────────────────────────
// The adaptive plan: four parts, proportional to what was found.
//
// Replaces a fixed 19-section document, six of whose sections came
// back empty in 100% of plans, with four parts that answer the only
// four questions a shopkeeper has:
//
//   A. What deserves attention?
//   B. Why, and how sure are we?
//   C. What do I do?
//   D. What changed since last time?
//
// Assembly, not analysis. Every field here already exists on the
// Finding projection — title, cause, effect, reasoning, root_cause,
// confidence_tier, change_class, cycles_seen. Nothing is recomputed
// and no new pipeline is introduced.
//
// Two rules carry the honesty, and they are the reason this is worth
// doing at all:
//
//   MONEY IS LABELLED BY PROVENANCE. Estimated money stays — that is
//   a product decision — but it is only ever attached to findings
//   whose basis is an inference, and always named as an estimate. A
//   behavioural finding shows NO number: its impact is 0 meaning "not
//   modelled", and printing "R$ 0" would read as "this costs nothing".
//
//   AN EMPTY MONTH IS A VALID PLAN. If nothing qualifies, the plan
//   says so. Inventing a priority to justify a subscription is the
//   failure mode a 19-section template made inevitable.
// ──────────────────────────────────────────────

/** How sure we are, and on what basis. Drives permitted language. */
export type ClaimClass = "defect" | "anomaly" | "behavioral" | "inference";

/** Narrowed from the Finding row + its parsed projection. */
export interface PlanFinding {
	inferenceKey: string;
	surface: string;
	severity: string;
	confidence: number;
	status: string;
	cyclesSeen: number;
	changeClass: string | null;
	origin: string | null;
	claimType: string | null;
	impactMidpoint: number;
	impactMin: number;
	impactMax: number;
	/** Parsed projection fields, all optional: older rows lack some. */
	title?: string | null;
	cause?: string | null;
	effect?: string | null;
	reasoning?: string | null;
	rootCause?: string | null;
	sourceUrl?: string | null;
	basisType?: string | null;
	confidenceTier?: string | null;
	evidence?: unknown[];
}

export interface Priority {
	rank: number;
	claim: ClaimClass;
	/** Exactly what the reader is told, already in their language. */
	headline: string;
	surface: string;
	sourceUrl: string | null;
	why: string | null;
	confidence: number;
	confidenceTier: string;
	severity: string;
	/** Null for anything that is not a modelled estimate. */
	estimatedMonthlyLossBrl: { min: number; mid: number; max: number } | null;
	/** Present when the claim rests on counted behaviour. */
	measured: unknown[] | null;
	/** new | persistent | returned */
	lifecycle: "new" | "persistent" | "returned";
	cyclesSeen: number;
}

export interface AdaptivePlan {
	/** A. */
	executive: {
		priorityCount: number;
		measuredCount: number;
		inferredCount: number;
		/** Total estimated monthly loss across INFERRED priorities only. */
		estimatedExposureBrl: number | null;
		/** One sentence, honest when there is nothing. */
		summary: string;
	};
	/** B. */
	priorities: Priority[];
	/** C. — one entry per priority, same order. */
	actions: { rank: number; what: string; howToVerify: string }[];
	/** D. */
	evolution: {
		newCount: number;
		persistentCount: number;
		resolvedCount: number;
		inconclusiveCount: number;
		resolved: { headline: string; surface: string }[];
	};
}

const MAX_PRIORITIES = 5;

/**
 * Most priorities allowed from one page.
 *
 * Without this the ranking starved every heuristic: Casa Montelle's
 * checkout carries five measured frictions, all high severity, so
 * "measured first" filled the entire list with one URL and the reader
 * got nothing about the other 14 findings. Caught by the dry run
 * against real data.
 *
 * Two is enough to say "this page has more than one problem" without
 * letting one page become the document.
 */
const MAX_PER_SURFACE = 2;

/**
 * Classify a finding's claim.
 *
 * Nothing is promoted to 'defect' automatically. Every crawler
 * finding in production today carries basis_type='heuristic' with
 * confidence 41-60, which is an inference and must be called one. A
 * detector firing is not a reproducible defect, and this function is
 * where that distinction is enforced rather than assumed.
 */
export function classifyClaim(f: PlanFinding): ClaimClass {
	if (f.claimType === "defect" || f.claimType === "anomaly") return f.claimType;
	if (f.claimType === "behavioral" || f.origin === "pixel") return "behavioral";
	// heuristic, or anything that did not declare itself.
	return "inference";
}

function lifecycleOf(f: PlanFinding): Priority["lifecycle"] {
	if (f.status === "regressed" || f.changeClass === "regression") return "returned";
	if (f.cyclesSeen > 1 || f.status === "confirmed") return "persistent";
	return "new";
}

const SEVERITY_RANK: Record<string, number> = {
	critical: 4,
	high: 3,
	medium: 2,
	low: 1,
	none: 0,
};

/**
 * Which findings earn a place in the document.
 *
 * Deliberately narrow. The old plan surfaced whatever it had; this
 * requires either real severity or counted behaviour, and caps the
 * list at five so the reader is not handed a backlog.
 */
export function selectPriorities(findings: PlanFinding[]): PlanFinding[] {
	return findings
		.filter((f) => f.status !== "resolved")
		.filter((f) => f.severity !== "none")
		.filter(
			(f) =>
				f.severity === "critical" ||
				f.severity === "high" ||
				classifyClaim(f) === "behavioral",
		)
		.sort((a, b) => {
			// Counted behaviour outranks a heuristic of equal severity:
			// one is an observation, the other a guess, and the reader
			// should meet the observation first.
			const aMeasured = classifyClaim(a) === "behavioral" ? 1 : 0;
			const bMeasured = classifyClaim(b) === "behavioral" ? 1 : 0;
			if (aMeasured !== bMeasured) return bMeasured - aMeasured;
			const sev = (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0);
			if (sev !== 0) return sev;
			return b.confidence - a.confidence;
		})
		// Then thin by page, preserving rank order. A page that keeps
		// its first two entries still leads; it just stops being the
		// whole document.
		.reduce<PlanFinding[]>((kept, f) => {
			if (kept.length >= MAX_PRIORITIES) return kept;
			const onSurface = kept.filter((k) => k.surface === f.surface).length;
			if (onSurface >= MAX_PER_SURFACE) return kept;
			kept.push(f);
			return kept;
		}, []);
}

function tierOf(f: PlanFinding): string {
	if (f.confidenceTier) return f.confidenceTier;
	if (f.confidence >= 75) return "high";
	if (f.confidence >= 50) return "medium";
	return "low";
}

export interface BuildInput {
	findings: PlanFinding[];
	/** Findings whose status is 'resolved' this period. */
	resolved: PlanFinding[];
	locale?: string;
}

export function buildAdaptivePlan(input: BuildInput): AdaptivePlan {
	const pt = (input.locale ?? "pt-BR") === "pt-BR";
	const selected = selectPriorities(input.findings);

	const priorities: Priority[] = selected.map((f, i) => {
		const claim = classifyClaim(f);
		// Money only where it is a modelled estimate, and never on a
		// counted observation.
		const money =
			claim === "inference" && f.impactMidpoint > 0
				? {
						min: Math.round(f.impactMin),
						mid: Math.round(f.impactMidpoint),
						max: Math.round(f.impactMax),
					}
				: null;
		return {
			rank: i + 1,
			claim,
			headline: f.title?.trim() || f.cause?.trim() || f.inferenceKey,
			surface: f.surface,
			sourceUrl: f.sourceUrl ?? null,
			why: f.reasoning?.trim() || f.effect?.trim() || null,
			confidence: f.confidence,
			confidenceTier: tierOf(f),
			severity: f.severity,
			estimatedMonthlyLossBrl: money,
			measured: claim === "behavioral" ? (f.evidence ?? []) : null,
			lifecycle: lifecycleOf(f),
			cyclesSeen: f.cyclesSeen,
		};
	});

	const measuredCount = priorities.filter((p) => p.claim === "behavioral").length;
	const inferredCount = priorities.length - measuredCount;
	const exposure = priorities.reduce(
		(sum, p) => sum + (p.estimatedMonthlyLossBrl?.mid ?? 0),
		0,
	);

	const summary = (() => {
		if (priorities.length === 0) {
			// An empty month is a valid plan. Saying so is the point.
			return pt
				? "Nada de severidade alta apareceu neste período. Os itens em observação seguem na seção de evolução."
				: "Nothing of high severity appeared this period. Items under observation are in the evolution section.";
		}
		const parts: string[] = [];
		if (measuredCount > 0) {
			parts.push(
				pt
					? `${measuredCount} ${measuredCount === 1 ? "observação medida" : "observações medidas"} nas sessões reais da sua loja`
					: `${measuredCount} measured ${measuredCount === 1 ? "observation" : "observations"} from your store's real sessions`,
			);
		}
		if (inferredCount > 0) {
			parts.push(
				pt
					? `${inferredCount} ${inferredCount === 1 ? "indício" : "indícios"} com perda estimada`
					: `${inferredCount} ${inferredCount === 1 ? "indication" : "indications"} with estimated loss`,
			);
		}
		return pt
			? `${priorities.length} ${priorities.length === 1 ? "prioridade" : "prioridades"} neste período: ${parts.join(" e ")}.`
			: `${priorities.length} ${priorities.length === 1 ? "priority" : "priorities"} this period: ${parts.join(" and ")}.`;
	})();

	const actions = priorities.map((p) => ({
		rank: p.rank,
		what:
			selected[p.rank - 1].rootCause?.trim() ||
			(pt
				? `Revisar ${p.surface} a partir da evidência acima.`
				: `Review ${p.surface} against the evidence above.`),
		howToVerify:
			p.claim === "behavioral"
				? pt
					? `O pixel confere no próximo plano: a mesma contagem em ${p.surface}.`
					: `The pixel re-checks next plan: the same count on ${p.surface}.`
				: pt
					? `Confirmar na própria página: ${p.sourceUrl ?? p.surface}.`
					: `Confirm on the page itself: ${p.sourceUrl ?? p.surface}.`,
	}));

	return {
		executive: {
			priorityCount: priorities.length,
			measuredCount,
			inferredCount,
			// Null rather than 0 when nothing is modelled: zero would
			// read as "nothing at stake".
			estimatedExposureBrl: exposure > 0 ? exposure : null,
			summary,
		},
		priorities,
		actions,
		evolution: {
			newCount: priorities.filter((p) => p.lifecycle === "new").length,
			persistentCount: priorities.filter((p) => p.lifecycle === "persistent").length,
			resolvedCount: input.resolved.length,
			inconclusiveCount: input.findings.filter((f) => f.status === "stale").length,
			resolved: input.resolved.slice(0, 10).map((f) => ({
				headline: f.title?.trim() || f.inferenceKey,
				surface: f.surface,
			})),
		},
	};
}

/**
 * Load the findings for a period and map them onto PlanFinding.
 *
 * Thin by design: the selection and labelling rules live in the pure
 * functions above so they can be asserted without a database, and
 * this only parses rows.
 */
export async function loadPlanFindings(
	prisma: import("@prisma/client").PrismaClient,
	environmentId: string,
	cycleId: string,
): Promise<{ findings: PlanFinding[]; resolved: PlanFinding[] }> {
	const rows = await prisma.finding.findMany({
		where: { environmentId, cycleId },
		select: {
			inferenceKey: true,
			surface: true,
			severity: true,
			confidence: true,
			status: true,
			cyclesSeen: true,
			changeClass: true,
			origin: true,
			claimType: true,
			impactMidpoint: true,
			impactMin: true,
			impactMax: true,
			polarity: true,
			projection: true,
		},
	});

	const map = (r: (typeof rows)[number]): PlanFinding => {
		let p: Record<string, unknown> = {};
		try {
			p = (typeof r.projection === "string" ? JSON.parse(r.projection) : r.projection) ?? {};
		} catch {
			// A malformed projection must not drop the finding: the row's
			// own columns already carry severity, confidence and status.
		}
		return {
			inferenceKey: r.inferenceKey,
			surface: r.surface,
			severity: r.severity,
			confidence: r.confidence,
			status: r.status,
			cyclesSeen: r.cyclesSeen,
			changeClass: r.changeClass,
			origin: r.origin,
			claimType: r.claimType,
			impactMidpoint: r.impactMidpoint,
			impactMin: r.impactMin,
			impactMax: r.impactMax,
			title: (p.title as string) ?? null,
			cause: (p.cause as string) ?? null,
			effect: (p.effect as string) ?? null,
			reasoning: (p.reasoning as string) ?? null,
			rootCause: (p.root_cause as string) ?? null,
			sourceUrl: (p.source_url as string) ?? null,
			basisType: (p.basis_type as string) ?? null,
			confidenceTier: (p.confidence_tier as string) ?? null,
			evidence: Array.isArray(p.evidence) ? (p.evidence as unknown[]) : undefined,
		};
	};

	// Positive-polarity findings are the "retained" story, not a
	// priority, so they never enter the candidate set.
	const all = rows.filter((r) => r.polarity !== "positive").map(map);
	return {
		findings: all.filter((x) => x.status !== "resolved"),
		resolved: all.filter((x) => x.status === "resolved"),
	};
}
