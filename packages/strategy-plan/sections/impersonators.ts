// ──────────────────────────────────────────────
// Wave 22.8.3 — Brand Impersonators section generator
//
// Sources:
//   1. Evidence rows of type `brand_impersonation_match` for the env
//      across history (per-domain BrandImpersonationMatchPayload).
//      The most recent cycleRef wins as the "this cycle" snapshot.
//   2. Finding rows from the brand_integrity pack with inferenceKey IN
//      the canonical set below (peer-set-wide rollups).
//
// Self-hide rule: if the env has never accumulated a single
// brand_impersonation_match Evidence row, the brand scan was never
// configured/enabled — return null and the UI hides. Otherwise the
// section always renders, even when zero matches in the latest cycle:
// monitoring-on is itself a signal worth surfacing.
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import type {
	GenerateContext,
	ImpersonatorsSectionOutput,
	ImpersonatorMatchEntryOutput,
	ImpersonatorsPeerSignalOutput,
	ImpersonatorThreatType,
} from "../types";

const BRAND_INFERENCE_KEYS = [
	"lookalike_domain_competing_for_traffic",
	"external_sites_mimicking_brand",
	"brand_traffic_exposed_to_deceptive_surfaces",
	"suspicious_domains_capturing_purchase_intent",
	"customers_exposed_to_phishing_surfaces",
];

// Short, customer-facing PT-BR labels for each peer-set finding key.
const INFERENCE_LABEL_PT_BR: Record<string, string> = {
	lookalike_domain_competing_for_traffic: "Domínios disputando tráfego da marca",
	external_sites_mimicking_brand: "Sites externos imitando a marca",
	brand_traffic_exposed_to_deceptive_surfaces: "Tráfego direto exposto a typosquats",
	suspicious_domains_capturing_purchase_intent: "Domínios capturando intenção de compra",
	customers_exposed_to_phishing_surfaces: "Clientes expostos a phishing",
};

type Severity = "low" | "medium" | "high";

function normaliseSeverity(raw: string | null | undefined): Severity {
	const s = (raw ?? "").toLowerCase();
	if (s === "high" || s === "critical") return "high";
	if (s === "medium") return "medium";
	return "low";
}

function bandFromScore(score: number): Severity {
	if (score >= 70) return "high";
	if (score >= 40) return "medium";
	return "low";
}

function trimSummary(text: string | null | undefined, max = 280): string {
	if (!text) return "";
	const clean = text.replace(/\s+/g, " ").trim();
	if (clean.length <= max) return clean;
	return `${clean.slice(0, max - 1).trimEnd()}…`;
}

interface RawMatchPayload {
	type: "brand_impersonation_match";
	lookalike_domain: string;
	threat_type: ImpersonatorThreatType;
	is_active: boolean;
	domain_similarity: number;
	has_brand_tokens: boolean;
	title_similarity: number | null;
	has_commerce_signals: boolean;
	confidence_score: number;
	commercial_interpretation: string;
	brand_keyword_density?: number;
	has_sensitive_path?: boolean;
	has_credential_capture?: boolean;
	has_payment_capture?: boolean;
	favicon_similarity_score?: number | null;
	// Wave 23 P1.1 — match exato dos bytes do favicon. UI usa pra
	// destacar "cópia visual de favicon" (sinal mais forte de clone).
	favicon_bytes_match?: boolean | null;
}

export async function generateImpersonators(
	prisma: PrismaClient,
	ctx: GenerateContext,
): Promise<ImpersonatorsSectionOutput | null> {
	// 1. Eligibility check: did the brand scan EVER run for this env?
	const totalScannedEver = await prisma.evidence.count({
		where: {
			environmentRef: ctx.environmentId,
			evidenceType: "brand_impersonation_match",
		},
	});
	if (totalScannedEver === 0) return null;

	// 2. Find the most recent cycleRef with matches. That becomes our
	//    "this cycle" snapshot. Going by observedAt desc + take 1 then
	//    re-querying is one round-trip cheaper than groupBy with an
	//    inner order.
	const latest = await prisma.evidence.findFirst({
		where: {
			environmentRef: ctx.environmentId,
			evidenceType: "brand_impersonation_match",
		},
		orderBy: { observedAt: "desc" },
		select: { cycleRef: true },
	});
	const cycleRef = latest?.cycleRef ?? null;

	// 3. Latest-cycle matches.
	const matchRows = cycleRef
		? await prisma.evidence.findMany({
				where: {
					environmentRef: ctx.environmentId,
					evidenceType: "brand_impersonation_match",
					cycleRef,
				},
				select: { payload: true },
			})
		: [];

	// Parse + dedupe by lookalike_domain (highest confidence per domain
	// wins; the engine sometimes emits the same domain via multiple
	// threat_type passes).
	const byDomain = new Map<string, RawMatchPayload>();
	for (const r of matchRows) {
		try {
			const p = JSON.parse(r.payload) as RawMatchPayload;
			if (!p?.lookalike_domain) continue;
			const key = p.lookalike_domain.toLowerCase();
			const existing = byDomain.get(key);
			if (!existing || p.confidence_score > existing.confidence_score) {
				byDomain.set(key, p);
			}
		} catch {
			// Malformed payload — skip.
		}
	}
	const matches = Array.from(byDomain.values());

	// 4. Aggregations.
	const activeCount = matches.filter((m) => m.is_active).length;
	const highConfidenceCount = matches.filter((m) => bandFromScore(m.confidence_score) === "high").length;
	const mediumConfidenceCount = matches.filter((m) => bandFromScore(m.confidence_score) === "medium").length;
	const lowConfidenceCount = matches.filter((m) => bandFromScore(m.confidence_score) === "low").length;
	const withCommerceCount = matches.filter((m) => m.has_commerce_signals).length;
	const withPaymentCount = matches.filter((m) => m.has_payment_capture).length;
	const withCredentialCount = matches.filter((m) => m.has_credential_capture).length;

	// 5. Top entries — active first, then by confidence_score desc.
	const topEntries: ImpersonatorMatchEntryOutput[] = matches
		.slice()
		.sort((a, b) => {
			if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
			return b.confidence_score - a.confidence_score;
		})
		.slice(0, 8)
		.map((m) => ({
			domain: m.lookalike_domain,
			threatType: m.threat_type,
			confidence: bandFromScore(m.confidence_score),
			confidenceScore: m.confidence_score,
			isActive: m.is_active,
			hasCommerceSignals: m.has_commerce_signals,
			hasPaymentCapture: !!m.has_payment_capture,
			hasCredentialCapture: !!m.has_credential_capture,
			hasSensitivePath: !!m.has_sensitive_path,
			commercialInterpretation: m.commercial_interpretation,
			// Wave 23 P1.1 — passa pra UI. Default false quando o
			// scanner não checou ou não bateu.
			hasFaviconBytesMatch: m.favicon_bytes_match === true,
		}));

	// 6. Peer-set Findings from the brand_integrity pack.
	const findingRows = await prisma.finding.findMany({
		where: {
			environmentId: ctx.environmentId,
			inferenceKey: { in: BRAND_INFERENCE_KEYS },
			status: { in: ["created", "confirmed"] },
			statusChangedAt: { lt: ctx.monthEnd },
		},
		select: {
			inferenceKey: true,
			severity: true,
			rootCause: true,
			createdAt: true,
		},
		orderBy: { createdAt: "desc" },
	});
	// Dedupe by inferenceKey: most recent wins.
	const findingsByKey = new Map<string, ImpersonatorsPeerSignalOutput>();
	for (const f of findingRows) {
		if (findingsByKey.has(f.inferenceKey)) continue;
		findingsByKey.set(f.inferenceKey, {
			inferenceKey: f.inferenceKey,
			label: INFERENCE_LABEL_PT_BR[f.inferenceKey] ?? f.inferenceKey,
			severity: normaliseSeverity(f.severity),
			summary: trimSummary(f.rootCause),
		});
	}
	const findings = Array.from(findingsByKey.values());

	return {
		cycleId: cycleRef,
		totalScannedEver,
		totalMatchesThisCycle: matches.length,
		activeCount,
		highConfidenceCount,
		mediumConfidenceCount,
		lowConfidenceCount,
		withCommerceCount,
		withPaymentCount,
		withCredentialCount,
		findings,
		topEntries,
	};
}
