import { isAuthorized } from "@/libs/isAuthorized";
import { prisma } from "@/libs/prismaDb";
import { NextResponse } from "next/server";
import {
	VENDOR_ADVISORIES,
	getVendorAdvisory,
} from "@/lib/vendor-advisories";
import { VENDOR_STATUS_PAGES } from "@/lib/vendor-status-pages";

// ──────────────────────────────────────────────
// GET /api/library/strategy/[month]/ecosystem?envId=<id>
//
// Bundle B — Ecosystem awareness. Retorna 3 vetores:
//
//   1. critical_surfaces_down: páginas críticas (checkout, cart, login,
//      tier=primary) retornando 4xx/5xx OU com freshnessState=expired.
//      Customer feedback: "é muito interessante pro cliente saber
//      quando algo cai e ja temos informaçoes sobre a saude de suas
//      superficies".
//
//   2. detected_stack: vendors detectados via TechnologyDetected
//      evidence (já produzido pelo ingestion pipeline). Agrupado por
//      categoria (payment / analytics / platform / etc.).
//
//   3. vendor_status_links: pra cada vendor detectado que tem status
//      page pública (Stripe, Pagar.me, Shopify, etc.), retorna o
//      link direto. UI vira "🔗 Pagar.me status" sem o cliente ter
//      que buscar onde fica.
//
//   4. vendor_advisories: notable advisories curados (CVEs públicos)
//      pros vendors detectados. Pulled de src/lib/vendor-advisories.ts.
// ──────────────────────────────────────────────

interface RouteParams {
	params: Promise<{ month: string }>;
}

const CRITICAL_PAGE_TYPES = ["checkout", "cart", "login", "account"];

export async function GET(request: Request, { params }: RouteParams) {
	const { month } = await params;
	if (!/^\d{4}-\d{2}$/.test(month)) {
		return NextResponse.json({ message: "month must be YYYY-MM" }, { status: 400 });
	}
	const url = new URL(request.url);
	const envId = url.searchParams.get("envId");
	if (!envId) {
		return NextResponse.json({ message: "envId is required" }, { status: 400 });
	}

	const user = await isAuthorized();
	if (!user) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	// Mesma proteção IDOR do parent route — sem isso, qualquer user
	// autenticado consegue ler ecosystem de qualquer env enumerando ids.
	const env = await prisma.environment.findUnique({
		where: { id: envId },
		select: {
			id: true,
			organizationId: true,
			domain: true,
			organization: {
				select: {
					ownerId: true,
					memberships: { select: { userId: true } },
				},
			},
		},
	});
	if (!env) {
		return NextResponse.json({ message: "Environment not found" }, { status: 404 });
	}
	const userId = (user as { id?: string }).id;
	const isOwner = !!userId && env.organization?.ownerId === userId;
	const isMember = !!userId && !!env.organization?.memberships?.some((m) => m.userId === userId);
	const isSiteAdmin = (user as { role?: string }).role === "ADMIN";
	if (!isOwner && !isMember && !isSiteAdmin) {
		return NextResponse.json({ message: "Forbidden" }, { status: 403 });
	}

	// ── 1. Critical surfaces down ────────────
	// Páginas críticas com problemas. Status >= 400 OR freshness=expired.
	// Tier=primary OR pageType crítico (checkout, cart, login, account).
	const criticalSurfacesRaw = await prisma.pageInventoryItem.findMany({
		where: {
			environmentRef: envId,
			removedAt: null,
			OR: [
				{ statusCode: { gte: 400 } },
				{ freshnessState: "expired" },
			],
			AND: {
				OR: [
					{ tier: "primary" },
					{ pageType: { in: CRITICAL_PAGE_TYPES } },
				],
			},
		},
		select: {
			id: true,
			normalizedUrl: true,
			path: true,
			pageType: true,
			tier: true,
			statusCode: true,
			freshnessState: true,
			freshnessAge: true,
			title: true,
		},
		orderBy: [{ tier: "asc" }, { criticality: "desc" }],
		take: 15,
	});

	// ── 2. Detected stack (último ciclo completo) ────────────
	const latestCycle = await prisma.auditCycle.findFirst({
		where: { environmentId: envId, status: "complete" },
		orderBy: { completedAt: "desc" },
		select: { id: true },
	});

	let detectedStack: Array<{
		technology_key: string;
		display_name: string;
		category: string;
	}> = [];

	if (latestCycle) {
		const cycleRef = `audit_cycle:${latestCycle.id}`;
		const envRef = `environment:${envId}`;
		const techRows = await prisma.evidence.findMany({
			where: {
				environmentRef: envRef,
				evidenceType: "technology_detected",
				cycleRef,
			},
			select: { payload: true },
			take: 200,
		});

		// Dedup por technology_key + escolha o primeiro display_name +
		// category. Evidence.payload é stored como string (db.Text JSON)
		// — precisa JSON.parse com try/catch (mirror tech-stack route).
		const byKey = new Map<
			string,
			{ technology_key: string; display_name: string; category: string }
		>();
		for (const row of techRows) {
			try {
				const p = JSON.parse(row.payload as unknown as string) as Record<string, unknown>;
				const key = String(p.technology_key ?? "");
				if (!key || byKey.has(key)) continue;
				byKey.set(key, {
					technology_key: key,
					display_name: String(p.display_name ?? key),
					category: String(p.category ?? "other"),
				});
			} catch {
				// Skip malformed row — never crash the ecosystem read
				// because one evidence payload is corrupt.
			}
		}
		detectedStack = Array.from(byKey.values()).sort((a, b) =>
			a.display_name.localeCompare(b.display_name),
		);
	}

	// ── 3. Vendor status links pros vendors detectados ────────
	const vendorStatusLinks = detectedStack
		.map((t) => {
			const status = VENDOR_STATUS_PAGES[t.technology_key];
			if (!status) return null;
			return {
				technology_key: t.technology_key,
				display_name: t.display_name,
				category: t.category,
				status_page_url: status.url,
				status_page_label: status.label,
			};
		})
		.filter(
			(x): x is {
				technology_key: string;
				display_name: string;
				category: string;
				status_page_url: string;
				status_page_label: string;
			} => x !== null,
		);

	// ── 4. Vendor advisories curated ──────────────────────────
	const vendorAdvisories = detectedStack
		.map((t) => {
			const advisory = getVendorAdvisory(t.technology_key);
			if (!advisory) return null;
			return {
				technology_key: t.technology_key,
				display_name: t.display_name,
				category: t.category,
				advisory_url: advisory.advisoryUrl,
				notable: advisory.notable,
			};
		})
		.filter(
			(x): x is {
				technology_key: string;
				display_name: string;
				category: string;
				advisory_url: string;
				notable: typeof VENDOR_ADVISORIES[number]["notable"];
			} => x !== null,
		);

	return NextResponse.json({
		critical_surfaces_down: criticalSurfacesRaw.map((p) => ({
			id: p.id,
			url: p.normalizedUrl,
			path: p.path,
			page_type: p.pageType,
			tier: p.tier,
			status_code: p.statusCode,
			freshness_state: p.freshnessState,
			freshness_age_seconds: p.freshnessAge,
			title: p.title,
		})),
		detected_stack: detectedStack,
		vendor_status_links: vendorStatusLinks,
		vendor_advisories: vendorAdvisories,
	});
}
