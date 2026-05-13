import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/auth";
import { prisma } from "@/libs/prismaDb";
import { withErrorTracking } from "@/libs/error-tracker";
import { generateTypoVariants } from "@/lib/typo-squat";
import { promises as dns } from "node:dns";

// ──────────────────────────────────────────────
// Phishing Surface — GET /api/workspace/phishing-surface
//
// For the user's environment domain, generate up to 30 typo-squat /
// impersonation variants and DNS-resolve them in parallel. The
// variants that resolve get flagged as a potential phishing risk.
//
// We deliberately only do DNS A-record lookups here — fetching the
// HTML body would be expensive and would also trigger bot detection
// on hostile sites. DNS resolution + brand-similarity is enough to
// surface the risk; the user follows up with whois themselves.
//
// 1-hour in-memory cache keyed by apex domain.
//
// Wave 11.4d — Security workspace.
// ──────────────────────────────────────────────

interface VariantHit {
	domain: string;
	ipv4: string[];
	pattern: "typo" | "tld_swap" | "brand_appendage" | "visual_swap";
}

interface CacheEntry {
	apex: string;
	variantsChecked: number;
	hits: VariantHit[];
	expiresAt: number;
}

const CACHE_TTL_MS = 60 * 60_000;
const cache = new Map<string, CacheEntry>();

function classifyPattern(apex: string, variant: string): VariantHit["pattern"] {
	const aStem = apex.split(".")[0];
	const vStem = variant.split(".")[0];
	const aTld = apex.split(".").slice(1).join(".");
	const vTld = variant.split(".").slice(1).join(".");
	if (vStem === aStem && vTld !== aTld) return "tld_swap";
	if (vStem.length !== aStem.length) {
		// Length mismatch implies omission or appendage.
		if (vStem.includes(aStem) || aStem.includes(vStem)) return "brand_appendage";
	}
	// Same length, different chars → either visual or adjacent.
	if (vStem.length === aStem.length) {
		const hasDigit = /[0-9]/.test(vStem);
		if (hasDigit) return "visual_swap";
	}
	return "typo";
}

async function resolveIfExists(host: string): Promise<string[] | null> {
	try {
		const records = await dns.resolve4(host);
		return records.length > 0 ? records : null;
	} catch {
		return null;
	}
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
		if (!env?.domain) {
			return NextResponse.json({ apex: null, hits: [], variantsChecked: 0 });
		}

		const apex = env.domain.replace(/^www\./i, "").toLowerCase();

		const cached = cache.get(apex);
		if (cached && Date.now() < cached.expiresAt) {
			return NextResponse.json({
				apex: cached.apex,
				hits: cached.hits,
				variantsChecked: cached.variantsChecked,
			});
		}

		const variants = generateTypoVariants(apex, 30);
		const results = await Promise.allSettled(variants.map((v) => resolveIfExists(v)));

		const hits: VariantHit[] = [];
		for (let i = 0; i < variants.length; i++) {
			const r = results[i];
			if (r.status !== "fulfilled" || r.value == null) continue;
			hits.push({
				domain: variants[i],
				ipv4: r.value.slice(0, 3),
				pattern: classifyPattern(apex, variants[i]),
			});
		}

		// Sort: pattern (typo > visual > brand > tld_swap) then alphabetical
		const PATTERN_RANK: Record<VariantHit["pattern"], number> = {
			typo: 0,
			visual_swap: 1,
			brand_appendage: 2,
			tld_swap: 3,
		};
		hits.sort((a, b) => {
			const diff = PATTERN_RANK[a.pattern] - PATTERN_RANK[b.pattern];
			if (diff !== 0) return diff;
			return a.domain.localeCompare(b.domain);
		});

		const entry: CacheEntry = {
			apex,
			variantsChecked: variants.length,
			hits,
			expiresAt: Date.now() + CACHE_TTL_MS,
		};
		cache.set(apex, entry);

		return NextResponse.json({
			apex: entry.apex,
			hits: entry.hits,
			variantsChecked: entry.variantsChecked,
		});
	},
	{ endpoint: "/api/workspace/phishing-surface", method: "GET" },
);
