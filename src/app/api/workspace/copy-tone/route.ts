import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";
import { isLlmEnabled, callModel } from "../../../../../apps/mcp/llm/client";

// ──────────────────────────────────────────────
// Tone Consistency — Wave 11.5f
//
// Classifies the tone of each crawled page (title + h1 + meta) into
// a small categorical taxonomy in a single Haiku batch call, then
// reports the distribution + the percent of pages on the dominant
// tone. Drops in tone consistency across the funnel are the main
// conversion signal — homepage casual but checkout corporate stiff,
// pricing playful but support page formal, etc.
//
// Cap to 25 pages (representative sample) to keep prompts bounded.
// ──────────────────────────────────────────────

type ToneTag =
	| "playful"
	| "casual"
	| "confident"
	| "professional"
	| "corporate"
	| "technical"
	| "urgent"
	| "salesy";

const VALID_TONES: ToneTag[] = [
	"playful",
	"casual",
	"confident",
	"professional",
	"corporate",
	"technical",
	"urgent",
	"salesy",
];

interface PageTone {
	url: string;
	tone: ToneTag;
}

const cache = new Map<string, { pages: PageTone[]; consistency: number; dominant: ToneTag | null }>();
const MAX_CACHE = 200;
function setCached(key: string, value: { pages: PageTone[]; consistency: number; dominant: ToneTag | null }) {
	cache.set(key, value);
	if (cache.size > MAX_CACHE) {
		const first = cache.keys().next().value;
		if (first) cache.delete(first);
	}
}

function buildPrompt(samples: Array<{ url: string; copy: string }>): string {
	const items = samples
		.map((s, i) => {
			let path = "/";
			try {
				path = new URL(s.url).pathname;
			} catch {}
			return `${i + 1}. ${path} — "${s.copy.slice(0, 200)}"`;
		})
		.join("\n");
	return [
		"Classify the tone of each page using EXACTLY ONE of these tags:",
		`  ${VALID_TONES.join(" | ")}`,
		"",
		"PAGES:",
		items,
		"",
		"Output ONLY valid JSON matching this schema:",
		'{ "pages": [ { "url": "<original url>", "tone": "<one of the tags>" } ] }',
		"",
		"Be precise — don't guess if signal is weak; use 'professional' as the neutral default.",
	].join("\n");
}

export const GET = withErrorTracking(
	async function GET() {
		const session = await getServerSession(authOptions);
		if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
		const userId = (session.user as { id?: string }).id;
		if (!userId) return NextResponse.json({ message: "Invalid session" }, { status: 401 });

		const membership = await prisma.membership.findFirst({
			where: { userId },
			include: { organization: { include: { environments: { take: 1 } } } },
			orderBy: { createdAt: "desc" },
		});
		const env = membership?.organization?.environments?.[0];
		if (!env) return NextResponse.json({ pages: [], fallback: true });

		const latestCycle = await prisma.auditCycle.findFirst({
			where: { environmentId: env.id, status: "complete" },
			orderBy: { completedAt: "desc" },
			select: { id: true },
		});
		if (!latestCycle) return NextResponse.json({ pages: [], fallback: true });

		const cacheKey = `${env.id}_${latestCycle.id}`;
		const cached = cache.get(cacheKey);
		if (cached) return NextResponse.json(cached);

		if (!isLlmEnabled()) {
			return NextResponse.json({ pages: [], fallback: true });
		}

		// Wave 18g — Evidence.environmentRef has the "environment:" prefix.
		const cycleRef = `audit_cycle:${latestCycle.id}`;
		const envRef = `environment:${env.id}`;
		const rows = await prisma.evidence.findMany({
			where: {
				environmentRef: envRef,
				evidenceType: "page_content",
				cycleRef,
			},
			select: { payload: true, subjectRef: true },
			take: 25,
		});

		const samples: Array<{ url: string; copy: string }> = [];
		for (const r of rows) {
			try {
				const p = JSON.parse(r.payload);
				if (!p || p.type !== "page_content") continue;
				const url = typeof p.url === "string" ? p.url : r.subjectRef;
				const parts = [p.title, p.h1, p.meta_description].filter(
					(x): x is string => typeof x === "string" && x.length > 0,
				);
				if (parts.length === 0) continue;
				samples.push({ url, copy: parts.join(" · ") });
			} catch {
				// skip
			}
		}

		if (samples.length < 3) {
			return NextResponse.json({ pages: [], fallback: true });
		}

		try {
			const result = await callModel(
				"haiku_4_5",
				[{ role: "user", content: buildPrompt(samples) }],
				{
					max_tokens: 900,
					temperature: 0.2,
					system: "You output only valid JSON matching the requested schema. No markdown, no preamble.",
				},
				{
					purpose: "copy_tone",
					organizationId: membership!.organization.id,
					userId,
					environmentId: env.id,
					cycleId: latestCycle.id,
				},
			);
			const textBlock = result.content.find((b) => b.type === "text");
			const raw = textBlock && "text" in textBlock ? textBlock.text.trim() : "";
			let parsed: { pages?: Array<{ url?: string; tone?: string }> } = {};
			try {
				const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
				parsed = JSON.parse(cleaned);
			} catch {
				return NextResponse.json({ pages: [], fallback: true });
			}
			if (!parsed.pages || !Array.isArray(parsed.pages)) {
				return NextResponse.json({ pages: [], fallback: true });
			}
			const pages: PageTone[] = parsed.pages
				.filter((p) => p && typeof p.url === "string" && typeof p.tone === "string")
				.filter((p) => VALID_TONES.includes(p.tone as ToneTag))
				.map((p) => ({ url: p.url!, tone: p.tone as ToneTag }));

			// Compute distribution + consistency (% on dominant tone).
			const counts = new Map<ToneTag, number>();
			for (const p of pages) counts.set(p.tone, (counts.get(p.tone) ?? 0) + 1);
			let dominant: ToneTag | null = null;
			let max = 0;
			for (const [tone, count] of counts.entries()) {
				if (count > max) {
					max = count;
					dominant = tone;
				}
			}
			const consistency = pages.length > 0 ? Math.round((max / pages.length) * 100) : 0;

			const out = { pages, consistency, dominant };
			setCached(cacheKey, out);
			return NextResponse.json(out);
		} catch {
			return NextResponse.json({ pages: [], fallback: true });
		}
	},
	{ endpoint: "/api/workspace/copy-tone", method: "GET" },
);
