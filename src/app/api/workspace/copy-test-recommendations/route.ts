import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";
import { isLlmEnabled, callModel } from "../../../../../apps/mcp/llm/client";

// ──────────────────────────────────────────────
// Copy Test Recommendations — Wave 11.5c
//
// Given the user's copy-related findings (Wave 3.10 Copy Alignment
// pack), asks Haiku for 3 concrete A/B test specs grounded in those
// findings. Result cached per cycle so the LLM cost is paid once.
// ──────────────────────────────────────────────

interface TestSpec {
	id: string;
	page_hint: string;
	hypothesis: string;
	variant: string;
	expected_lift: string;
	priority: "high" | "medium" | "low";
}

interface CacheEntry {
	tests: TestSpec[];
	source_finding_count: number;
}

const cache = new Map<string, CacheEntry>();
const MAX_CACHE = 200;

function setCached(key: string, value: CacheEntry) {
	cache.set(key, value);
	if (cache.size > MAX_CACHE) {
		const first = cache.keys().next().value;
		if (first) cache.delete(first);
	}
}

function buildPrompt(findings: Array<{ title: string; rootCause: string | null; severity: string }>, locale: string): string {
	const lang =
		locale === "pt-BR"
			? "Brazilian Portuguese"
			: locale === "es"
				? "Spanish"
				: locale === "de"
					? "German"
					: "English";
	const findingLines = findings
		.slice(0, 12)
		.map((f, i) => `${i + 1}. [${f.severity}] ${f.title}${f.rootCause ? ` (root cause: ${f.rootCause})` : ""}`)
		.join("\n");
	return [
		"You generate concrete A/B test specs from a list of copy/conversion findings.",
		"",
		"FINDINGS:",
		findingLines,
		"",
		`Respond in ${lang}. Output ONLY valid JSON matching this exact schema:`,
		"",
		"{",
		'  "tests": [',
		"    {",
		'      "id": "<slug-id>",',
		'      "page_hint": "<which page/section to test, short>",',
		'      "hypothesis": "<one sentence — what we believe>",',
		'      "variant": "<concrete copy or change to test>",',
		'      "expected_lift": "<numeric range, e.g. \\"8-15%\\">",',
		'      "priority": "high" | "medium" | "low"',
		"    }",
		"  ]",
		"}",
		"",
		"RULES:",
		"- Exactly 3 tests, sorted by priority desc.",
		"- Hypothesis must reference a specific finding above by number.",
		"- Variant must be concrete copy or UI change — not strategy advice.",
		"- Expected lift must be a numeric range backed by similar test patterns.",
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
		const locale = url.searchParams.get("locale") || "pt-BR";

		const membership = await prisma.membership.findFirst({
			where: { userId },
			include: { organization: { include: { environments: { take: 1 } } } },
			orderBy: { createdAt: "desc" },
		});
		const env = membership?.organization?.environments?.[0];
		if (!env) return NextResponse.json({ tests: [], fallback: true });

		const latestCycle = await prisma.auditCycle.findFirst({
			where: { environmentId: env.id, status: "complete" },
			orderBy: { completedAt: "desc" },
			select: { id: true },
		});
		if (!latestCycle) return NextResponse.json({ tests: [], fallback: true });

		const cacheKey = `${env.id}_${latestCycle.id}_${locale}`;
		const cached = cache.get(cacheKey);
		if (cached) return NextResponse.json({ tests: cached.tests });

		if (!isLlmEnabled()) {
			return NextResponse.json({ tests: [], fallback: true });
		}

		// Pull negative copy-related findings from the latest cycle.
		const rows = await prisma.finding.findMany({
			where: {
				environmentId: env.id,
				cycleId: latestCycle.id,
				pack: { in: ["copy_alignment", "scale_readiness", "revenue_integrity"] },
				polarity: "negative",
			},
			orderBy: { impactMidpoint: "desc" },
			take: 12,
			select: { projection: true, rootCause: true, severity: true },
		});

		if (rows.length === 0) return NextResponse.json({ tests: [], fallback: true });

		const findings = rows.map((r) => {
			let proj: { title?: string } = {};
			try {
				if (r.projection) proj = JSON.parse(r.projection) as typeof proj;
			} catch {
				// fall through
			}
			return {
				title: proj.title || "Untitled finding",
				rootCause: r.rootCause,
				severity: r.severity || "medium",
			};
		});

		try {
			const result = await callModel(
				"haiku_4_5",
				[{ role: "user", content: buildPrompt(findings, locale) }],
				{
					max_tokens: 800,
					temperature: 0.5,
					system: "You output only valid JSON matching the requested schema. No markdown, no preamble.",
				},
			);
			const textBlock = result.content.find((b) => b.type === "text");
			const raw = textBlock && "text" in textBlock ? textBlock.text.trim() : "";
			let parsed: { tests?: TestSpec[] } = {};
			try {
				const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
				parsed = JSON.parse(cleaned);
			} catch {
				return NextResponse.json({ tests: [], fallback: true });
			}
			if (!parsed.tests || !Array.isArray(parsed.tests)) {
				return NextResponse.json({ tests: [], fallback: true });
			}
			const tests: TestSpec[] = parsed.tests
				.filter((t) => t && typeof t === "object")
				.slice(0, 3)
				.map((t, i) => ({
					id: typeof t.id === "string" ? t.id : `test-${i}`,
					page_hint: typeof t.page_hint === "string" ? t.page_hint : "",
					hypothesis: typeof t.hypothesis === "string" ? t.hypothesis : "",
					variant: typeof t.variant === "string" ? t.variant : "",
					expected_lift: typeof t.expected_lift === "string" ? t.expected_lift : "",
					priority:
						t.priority === "high" || t.priority === "low" ? t.priority : "medium",
				}));
			setCached(cacheKey, { tests, source_finding_count: findings.length });
			return NextResponse.json({ tests });
		} catch {
			return NextResponse.json({ tests: [], fallback: true });
		}
	},
	{ endpoint: "/api/workspace/copy-test-recommendations", method: "GET" },
);
