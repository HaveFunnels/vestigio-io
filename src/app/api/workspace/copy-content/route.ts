import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";

// ──────────────────────────────────────────────
// Copy Content — GET /api/workspace/copy-content
//
// Returns the user-visible copy per crawled page (h1, title,
// meta_description) for the latest complete cycle. The full body
// HTML is intentionally not stored on PageContent payloads — these
// three fields ARE the most-visible copy (they show up in search
// engine results + browser tabs + above-the-fold) so they're the
// right scope for Wave 11.5 widgets:
//
//   - 11.5e Reading level per page
//   - 11.5d Persona-rewrite preview
//   - 11.5f Tone consistency timeline
//
// PageContentPayload shape lives in packages/domain/evidence.ts.
// ──────────────────────────────────────────────

interface CopyPage {
	url: string;
	title: string | null;
	h1: string | null;
	meta_description: string | null;
	lang: string | null;
	word_count: number;
	// Wave 18a — visible body copy + heading hierarchy. body_text_snippet is
	// the first ~2000 chars of extracted body text (or the Playwright-rendered
	// DOM for SPA pages). Framework Lens, persona-rewrite, and tone-consistency
	// widgets all read this to score copy quality, not just the title/h1.
	body_text_snippet: string | null;
	headings: Array<{ level: 1 | 2 | 3; text: string }>;
}

export const GET = withErrorTracking(
	async function GET() {
		const session = await getServerSession(authOptions);
		if (!session?.user) {
			return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
		}
		const userId = (session.user as { id?: string }).id;
		if (!userId) {
			return NextResponse.json({ message: "Invalid session" }, { status: 401 });
		}

		const membership = await prisma.membership.findFirst({
			where: { userId },
			include: { organization: { include: { environments: { take: 1 } } } },
			orderBy: { createdAt: "desc" },
		});
		const env = membership?.organization?.environments?.[0];
		if (!env) return NextResponse.json({ pages: [], cycleRef: null });

		const latestCycle = await prisma.auditCycle.findFirst({
			where: { environmentId: env.id, status: "complete" },
			orderBy: { completedAt: "desc" },
			select: { id: true },
		});
		if (!latestCycle) {
			return NextResponse.json({ pages: [], cycleRef: null });
		}

		const cycleRef = `audit_cycle:${latestCycle.id}`;
		const rows = await prisma.evidence.findMany({
			where: {
				environmentRef: env.id,
				evidenceType: "page_content",
				cycleRef,
			},
			select: { payload: true, subjectRef: true },
			// Cap so the workspace pages stay snappy. 100 pages is more
			// than enough for the Wave 11.5 widgets which all scan a
			// representative sample, not the full corpus.
			take: 100,
		});

		const pages: CopyPage[] = [];
		for (const row of rows) {
			try {
				const p = JSON.parse(row.payload);
				if (p && p.type === "page_content") {
					const rawHeadings = Array.isArray(p.headings) ? p.headings : [];
					const headings: Array<{ level: 1 | 2 | 3; text: string }> = [];
					for (const h of rawHeadings) {
						if (
							h &&
							(h.level === 1 || h.level === 2 || h.level === 3) &&
							typeof h.text === "string" &&
							h.text.length > 0
						) {
							headings.push({ level: h.level, text: h.text });
						}
					}
					pages.push({
						url: typeof p.url === "string" ? p.url : row.subjectRef,
						title: typeof p.title === "string" ? p.title : null,
						h1: typeof p.h1 === "string" ? p.h1 : null,
						meta_description:
							typeof p.meta_description === "string" ? p.meta_description : null,
						lang: typeof p.lang === "string" ? p.lang : null,
						word_count:
							typeof p.body_word_count === "number" ? p.body_word_count : 0,
						body_text_snippet:
							typeof p.body_text_snippet === "string" ? p.body_text_snippet : null,
						headings,
					});
				}
			} catch {
				// Skip malformed rows — never crash the workspace for a bad payload.
			}
		}

		return NextResponse.json({ pages, cycleRef });
	},
	{ endpoint: "/api/workspace/copy-content", method: "GET" },
);
