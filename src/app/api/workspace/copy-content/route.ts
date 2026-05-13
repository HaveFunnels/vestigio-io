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
					pages.push({
						url: typeof p.url === "string" ? p.url : row.subjectRef,
						title: typeof p.title === "string" ? p.title : null,
						h1: typeof p.h1 === "string" ? p.h1 : null,
						meta_description:
							typeof p.meta_description === "string" ? p.meta_description : null,
						lang: typeof p.lang === "string" ? p.lang : null,
						word_count:
							typeof p.body_word_count === "number" ? p.body_word_count : 0,
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
