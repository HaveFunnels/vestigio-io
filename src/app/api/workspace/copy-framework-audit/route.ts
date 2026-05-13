import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";
import { isLlmEnabled, callModel } from "../../../../../apps/mcp/llm/client";
import { getFramework, pickText } from "@/lib/copy-frameworks";

// ──────────────────────────────────────────────
// Copy Framework Audit — Wave 11.5g
//
// Evaluates a single page's copy (title + h1 + meta description)
// against ALL criteria of a single framework in one Haiku call.
// Returns per-criterion verdict (pass | warn | fail) + evidence
// quote + concrete fix suggestion. Cached per (env, cycle, framework,
// pageUrl, locale).
//
// Client orchestrates 10 parallel calls (one per framework) to
// populate the dropdown score badges on mount.
// ──────────────────────────────────────────────

type Status = "pass" | "warn" | "fail";

interface CriterionVerdict {
	id: string;
	status: Status;
	evidence: string;
	fix: string | null;
}

interface AuditResult {
	criteria: CriterionVerdict[];
	score_pct: number;
}

const cache = new Map<string, AuditResult>();
const MAX_CACHE = 500;

function setCached(key: string, value: AuditResult) {
	cache.set(key, value);
	if (cache.size > MAX_CACHE) {
		const first = cache.keys().next().value;
		if (first) cache.delete(first);
	}
}

function buildPrompt(
	framework: ReturnType<typeof getFramework>,
	pageCopy: { url: string; title: string; h1: string; meta: string },
	locale: string,
): string {
	if (!framework) return "";
	const fwLocale = locale === "pt-BR" || locale === "pt" ? "pt" : "en";
	const lang =
		locale === "pt-BR"
			? "Brazilian Portuguese"
			: locale === "es"
				? "Spanish"
				: locale === "de"
					? "German"
					: "English";

	const criteriaSpec = framework.criteria
		.map((c, i) => {
			return `  ${i + 1}. id="${c.id}" — ${pickText(c.label, fwLocale)}\n     What good looks like: ${pickText(c.hint, fwLocale)}`;
		})
		.join("\n");

	return [
		`Evaluate the page copy below against each criterion of the "${pickText(framework.name, fwLocale)}" framework.`,
		"",
		`PAGE URL: ${pageCopy.url}`,
		`TITLE: ${pageCopy.title || "(none)"}`,
		`H1: ${pageCopy.h1 || "(none)"}`,
		`META DESCRIPTION: ${pageCopy.meta || "(none)"}`,
		"",
		"FRAMEWORK CRITERIA:",
		criteriaSpec,
		"",
		`Respond in ${lang}. Output ONLY valid JSON matching this schema:`,
		"",
		"{",
		'  "criteria": [',
		"    {",
		'      "id": "<criterion id from list above>",',
		'      "status": "pass" | "warn" | "fail",',
		'      "evidence": "<one short sentence quoting or describing what the current copy does>",',
		'      "fix": "<one concrete rewrite suggestion if status != pass, else null>"',
		"    }",
		"  ]",
		"}",
		"",
		"RULES:",
		"- Return one verdict per criterion. Use the exact ids from the list.",
		"- 'pass' = clearly satisfies the criterion.",
		"- 'warn' = partially satisfies, signal is weak or ambiguous.",
		"- 'fail' = criterion is absent or violated.",
		"- 'fix' must be concrete copy or a specific change — not vague advice. Null when status=pass.",
		"- Evidence must reference the actual current copy, not abstract praise.",
	].join("\n");
}

export const GET = withErrorTracking(
	async function GET(req: Request) {
		const session = await getServerSession(authOptions);
		if (!session?.user) {
			return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
		}
		const userId = (session.user as { id?: string }).id;
		if (!userId) {
			return NextResponse.json({ message: "Invalid session" }, { status: 401 });
		}

		const url = new URL(req.url);
		const frameworkId = url.searchParams.get("framework") || "";
		const pageUrl = url.searchParams.get("pageUrl") || "";
		const locale = url.searchParams.get("locale") || "pt-BR";

		const framework = getFramework(frameworkId);
		if (!framework) {
			return NextResponse.json({ message: "Unknown framework" }, { status: 400 });
		}

		const membership = await prisma.membership.findFirst({
			where: { userId },
			include: { organization: { include: { environments: { take: 1 } } } },
			orderBy: { createdAt: "desc" },
		});
		const env = membership?.organization?.environments?.[0];
		if (!env) return NextResponse.json({ criteria: [], score_pct: 0, fallback: true });

		const latestCycle = await prisma.auditCycle.findFirst({
			where: { environmentId: env.id, status: "complete" },
			orderBy: { completedAt: "desc" },
			select: { id: true },
		});
		if (!latestCycle) {
			return NextResponse.json({ criteria: [], score_pct: 0, fallback: true });
		}

		const cacheKey = `${env.id}_${latestCycle.id}_${frameworkId}_${pageUrl}_${locale}`;
		const cached = cache.get(cacheKey);
		if (cached) return NextResponse.json(cached);

		if (!isLlmEnabled()) {
			return NextResponse.json({ criteria: [], score_pct: 0, fallback: true });
		}

		// Find the PageContent row matching pageUrl exactly, with a
		// fallback to the homepage (shortest path) when pageUrl=home.
		const cycleRef = `audit_cycle:${latestCycle.id}`;
		const rows = await prisma.evidence.findMany({
			where: {
				environmentRef: env.id,
				evidenceType: "page_content",
				cycleRef,
			},
			select: { payload: true, subjectRef: true },
			take: 100,
		});

		let pageCopy: { url: string; title: string; h1: string; meta: string } | null = null;
		let bestPathLength = Infinity;
		for (const r of rows) {
			try {
				const p = JSON.parse(r.payload);
				if (!p || p.type !== "page_content") continue;
				const url = typeof p.url === "string" ? p.url : r.subjectRef;
				// Exact match wins
				if (url === pageUrl) {
					pageCopy = {
						url,
						title: typeof p.title === "string" ? p.title : "",
						h1: typeof p.h1 === "string" ? p.h1 : "",
						meta: typeof p.meta_description === "string" ? p.meta_description : "",
					};
					break;
				}
				// Else track homepage candidate (shortest path) for "home" fallback
				if (pageUrl === "home") {
					try {
						const path = new URL(url).pathname;
						if (path.length < bestPathLength) {
							bestPathLength = path.length;
							pageCopy = {
								url,
								title: typeof p.title === "string" ? p.title : "",
								h1: typeof p.h1 === "string" ? p.h1 : "",
								meta: typeof p.meta_description === "string" ? p.meta_description : "",
							};
						}
					} catch {
						// skip bad URL
					}
				}
			} catch {
				// skip malformed payload
			}
		}

		if (!pageCopy || (!pageCopy.title && !pageCopy.h1 && !pageCopy.meta)) {
			return NextResponse.json({ criteria: [], score_pct: 0, fallback: true });
		}

		try {
			const result = await callModel(
				"haiku_4_5",
				[{ role: "user", content: buildPrompt(framework, pageCopy, locale) }],
				{
					max_tokens: 1200,
					temperature: 0.3,
					system: "You output only valid JSON matching the requested schema. No markdown, no preamble.",
				},
			);
			const textBlock = result.content.find((b) => b.type === "text");
			const raw = textBlock && "text" in textBlock ? textBlock.text.trim() : "";
			let parsed: { criteria?: CriterionVerdict[] } = {};
			try {
				const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
				parsed = JSON.parse(cleaned);
			} catch {
				return NextResponse.json({ criteria: [], score_pct: 0, fallback: true });
			}
			if (!parsed.criteria || !Array.isArray(parsed.criteria)) {
				return NextResponse.json({ criteria: [], score_pct: 0, fallback: true });
			}
			const validIds = new Set(framework.criteria.map((c) => c.id));
			const criteria: CriterionVerdict[] = parsed.criteria
				.filter((c) => c && typeof c.id === "string" && validIds.has(c.id))
				.map((c) => ({
					id: c.id,
					status:
						c.status === "pass" || c.status === "warn" || c.status === "fail"
							? c.status
							: "warn",
					evidence: typeof c.evidence === "string" ? c.evidence : "",
					fix: typeof c.fix === "string" && c.fix.trim().length > 0 ? c.fix : null,
				}));

			// Score: pass=1, warn=0.5, fail=0 → percent of max.
			const totalScore = criteria.reduce((s, c) => {
				return s + (c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0);
			}, 0);
			const score_pct = Math.round((totalScore / Math.max(1, framework.criteria.length)) * 100);

			const out: AuditResult = { criteria, score_pct };
			setCached(cacheKey, out);
			return NextResponse.json(out);
		} catch {
			return NextResponse.json({ criteria: [], score_pct: 0, fallback: true });
		}
	},
	{ endpoint: "/api/workspace/copy-framework-audit", method: "GET" },
);
