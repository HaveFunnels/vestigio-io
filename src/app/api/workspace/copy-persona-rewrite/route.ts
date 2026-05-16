import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";
import { isLlmEnabled, callModel } from "../../../../../apps/mcp/llm/client";

// ──────────────────────────────────────────────
// Persona Rewrite — Wave 11.5d
//
// Takes the homepage's h1 + meta_description (the most leverage-
// bearing user-visible copy) and asks Haiku to rewrite for 3 ICP
// personas derived from BusinessProfile + heuristics:
//
//   - Technical buyer (engineer / IT decision maker)
//   - Business buyer (founder / non-technical leader)
//   - End-user (the person actually using the product)
//
// When the org has supplied `icpDescription` we honor it as the
// primary persona, then synthesize two contrasting alternatives.
// ──────────────────────────────────────────────

interface PersonaVariant {
	persona: string;
	headline: string;
	subhead: string;
}

const cache = new Map<string, { variants: PersonaVariant[] }>();
const MAX_CACHE = 200;
function setCached(key: string, value: { variants: PersonaVariant[] }) {
	cache.set(key, value);
	if (cache.size > MAX_CACHE) {
		const first = cache.keys().next().value;
		if (first) cache.delete(first);
	}
}

function buildPrompt(
	currentH1: string,
	currentMeta: string,
	icpDescription: string | null,
	targetIndustry: string | null,
	buyerSophistication: string | null,
	locale: string,
): string {
	const lang =
		locale === "pt-BR"
			? "Brazilian Portuguese"
			: locale === "es"
				? "Spanish"
				: locale === "de"
					? "German"
					: "English";

	const icpHint = icpDescription
		? `Primary ICP per business profile: "${icpDescription}".`
		: "No primary ICP defined — generate three diverse contrasting personas.";
	const industryHint = targetIndustry ? `Industry: ${targetIndustry}.` : "";
	const soph = buyerSophistication ? `Buyer sophistication: ${buyerSophistication}.` : "";

	return [
		`Rewrite the homepage above-the-fold copy for 3 distinct ICP personas.`,
		"",
		`CURRENT H1: ${currentH1}`,
		`CURRENT META DESCRIPTION: ${currentMeta}`,
		"",
		icpHint,
		industryHint,
		soph,
		"",
		`Respond in ${lang}. Output ONLY valid JSON matching this schema:`,
		"",
		"{",
		'  "variants": [',
		"    {",
		'      "persona": "<short persona label, e.g. \\"Technical founder\\">",',
		'      "headline": "<rewritten H1 — keep under 80 chars>",',
		'      "subhead": "<rewritten meta description — keep under 160 chars>"',
		"    }",
		"  ]",
		"}",
		"",
		"RULES:",
		"- Exactly 3 variants. Personas must be CONCRETE (e.g. \"CMO at mid-market SaaS\"), not generic (e.g. \"decision-maker\").",
		"- Each variant must speak the language of its persona (what they care about, what they fear, what they measure).",
		"- Headlines must be benefit-led, not feature-led.",
		"- No marketing fluff. No exclamation points. Keep tone calm and competent.",
	].join("\n");
}

export const GET = withErrorTracking(
	async function GET(req: Request) {
		const session = await getServerSession(authOptions);
		if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
		const userId = (session.user as { id?: string }).id;
		if (!userId) return NextResponse.json({ message: "Invalid session" }, { status: 401 });

		const url = new URL(req.url);
		const locale = url.searchParams.get("locale") || "pt-BR";

		const membership = await prisma.membership.findFirst({
			where: { userId },
			include: {
				organization: {
					include: {
						environments: { take: 1 },
						businessProfile: true,
					},
				},
			},
			orderBy: { createdAt: "desc" },
		});
		const env = membership?.organization?.environments?.[0];
		if (!env) return NextResponse.json({ variants: [], fallback: true });

		const latestCycle = await prisma.auditCycle.findFirst({
			where: { environmentId: env.id, status: "complete" },
			orderBy: { completedAt: "desc" },
			select: { id: true },
		});
		if (!latestCycle) return NextResponse.json({ variants: [], fallback: true });

		const cacheKey = `${env.id}_${latestCycle.id}_${locale}`;
		const cached = cache.get(cacheKey);
		if (cached) return NextResponse.json({ variants: cached.variants });

		if (!isLlmEnabled()) {
			return NextResponse.json({ variants: [], fallback: true });
		}

		// Pull homepage PageContent — heuristic: pick the entry with the
		// shortest path (apex / homepage) for the latest cycle.
		// Wave 18g — Evidence.environmentRef has the "environment:" prefix.
		const cycleRef = `audit_cycle:${latestCycle.id}`;
		const envRef = `environment:${env.id}`;
		const pageRows = await prisma.evidence.findMany({
			where: {
				environmentRef: envRef,
				evidenceType: "page_content",
				cycleRef,
			},
			select: { payload: true, subjectRef: true },
			take: 50,
		});

		let bestH1 = "";
		let bestMeta = "";
		let bestPathLength = Infinity;
		for (const r of pageRows) {
			try {
				const p = JSON.parse(r.payload);
				if (!p || p.type !== "page_content") continue;
				const path = (() => {
					try {
						return new URL(p.url).pathname;
					} catch {
						return "/";
					}
				})();
				if (path.length < bestPathLength) {
					bestPathLength = path.length;
					bestH1 = typeof p.h1 === "string" ? p.h1 : "";
					bestMeta = typeof p.meta_description === "string" ? p.meta_description : "";
				}
			} catch {
				// skip
			}
		}

		if (!bestH1 && !bestMeta) {
			return NextResponse.json({ variants: [], fallback: true });
		}

		const profile = membership?.organization?.businessProfile;
		try {
			const result = await callModel(
				"haiku_4_5",
				[
					{
						role: "user",
						content: buildPrompt(
							bestH1,
							bestMeta,
							profile?.icpDescription ?? null,
							profile?.targetIndustry ?? null,
							profile?.buyerSophistication ?? null,
							locale,
						),
					},
				],
				{
					max_tokens: 700,
					temperature: 0.6,
					system: "You output only valid JSON matching the requested schema. No markdown, no preamble.",
				},
			);
			const textBlock = result.content.find((b) => b.type === "text");
			const raw = textBlock && "text" in textBlock ? textBlock.text.trim() : "";
			let parsed: { variants?: PersonaVariant[] } = {};
			try {
				const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
				parsed = JSON.parse(cleaned);
			} catch {
				return NextResponse.json({ variants: [], fallback: true });
			}
			if (!parsed.variants || !Array.isArray(parsed.variants)) {
				return NextResponse.json({ variants: [], fallback: true });
			}
			const variants = parsed.variants.slice(0, 3).map((v, i) => ({
				persona: typeof v.persona === "string" ? v.persona : `Persona ${i + 1}`,
				headline: typeof v.headline === "string" ? v.headline : "",
				subhead: typeof v.subhead === "string" ? v.subhead : "",
			}));
			setCached(cacheKey, { variants });
			return NextResponse.json({
				variants,
				source: { h1: bestH1, meta: bestMeta },
			});
		} catch {
			return NextResponse.json({ variants: [], fallback: true });
		}
	},
	{ endpoint: "/api/workspace/copy-persona-rewrite", method: "GET" },
);
