// ──────────────────────────────────────────────
// Ad ledger — spend × measured behavior × platform-attributed revenue
// (ONDA 2.2, EXAME §2.1)
//
// The exam's sharpest finding: Meta/Google Ads are polled every cycle
// (spend, creatives, attributed revenue) and the plan read the
// integration as a BOOLEAN. The behavioral alert literally said "se há
// verba nessa origem…" while the exact spend sat unread in
// syncMetadata. This section closes that loop:
//
//   R$ X gastos (plataforma) → N sessões medidas (pixel) →
//   permanência mediana → R$ Y atribuído (plataforma)
//
// Honesty contract:
//   - Spend and attributed revenue are PLATFORM-REPORTED (labeled so —
//     "a plataforma reporta", never "medido").
//   - Sessions/permanence are MEASURED by the pixel.
//   - The join is by source identity (facebook/facebook_ads/instagram →
//     meta_ads; google_ads → google_ads), declared in the note. First-
//     touch attribution on our side; the platforms use their own models
//     — the two never sum, and the section says so.
//   - Gated on a connected ad integration with spend > 0. No
//     integration → section absent (never a fabricated ledger).
// ──────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import type { GenerateContext } from "../types";
import type { BehavioralMeasurementOutput } from "./behavioral-measurement";
import { sourceIdentity } from "../../behavioral/source-identity";

export interface AdLedgerRow {
	platform: "meta_ads" | "google_ads";
	platformLabel: string;
	/** Platform-reported spend, trailing 30 days. */
	spend30d: number;
	currency: string;
	/** Platform-reported attributed revenue; null when the poller
	 *  predates the field or the platform returned none. */
	attributedRevenue30d: number | null;
	/** Pixel-measured sessions whose first touch maps to this platform. */
	measuredSessions: number;
	medianDurationS: number | null;
	pctNoScroll: number | null;
	/** spend / measured sessions — what one arriving session cost. */
	costPerSession: number | null;
	syncedAt: string | null;
}

export interface AdLedgerOutput {
	basis: "platform_plus_pixel";
	rows: AdLedgerRow[];
	/** The join + attribution caveat, pre-written for direct rendering. */
	note: string;
}

/** Which measured source-identity keys roll up to each ad platform. */
const PLATFORM_SOURCE_KEYS: Record<"meta_ads" | "google_ads", string[]> = {
	meta_ads: ["facebook", "facebook_ads", "instagram"],
	google_ads: ["google_ads"],
};

const PLATFORM_LABEL: Record<"meta_ads" | "google_ads", string> = {
	meta_ads: "Meta (Facebook + Instagram)",
	google_ads: "Google Ads",
};

interface SyncMeta {
	ad_spend_30d?: number;
	attributed_revenue_30d?: number | null;
	currency?: string;
	synced_at?: string;
}

/** Pure cross of platform metadata with measured source stats — tested. */
export function buildAdLedger(
	connections: Array<{ provider: string; syncMetadata: string | null }>,
	behavioral: Pick<BehavioralMeasurementOutput, "sources"> | null,
	locale: string,
): AdLedgerOutput | null {
	const rows: AdLedgerRow[] = [];
	for (const provider of ["meta_ads", "google_ads"] as const) {
		const conn = connections.find((c) => c.provider === provider);
		if (!conn?.syncMetadata) continue;
		let meta: SyncMeta;
		try {
			meta = JSON.parse(conn.syncMetadata) as SyncMeta;
		} catch {
			continue;
		}
		const spend = meta.ad_spend_30d ?? 0;
		if (spend <= 0) continue; // connected but idle — nothing to ledger

		const keys = new Set(PLATFORM_SOURCE_KEYS[provider]);
		const matched = (behavioral?.sources ?? []).filter((s) => keys.has(s.source));
		const sessions = matched.reduce((a, s) => a + s.sessions, 0);
		// Weighted medians across matched sources (weights = sessions).
		const weighted = (pick: (s: (typeof matched)[number]) => number): number | null => {
			if (sessions === 0) return null;
			return Math.round(
				matched.reduce((a, s) => a + pick(s) * s.sessions, 0) / sessions,
			);
		};

		rows.push({
			platform: provider,
			platformLabel: PLATFORM_LABEL[provider],
			spend30d: spend,
			currency: meta.currency ?? "BRL",
			attributedRevenue30d:
				typeof meta.attributed_revenue_30d === "number" ? meta.attributed_revenue_30d : null,
			measuredSessions: sessions,
			medianDurationS: weighted((s) => s.medianDurationS),
			pctNoScroll: weighted((s) => s.pctNoScroll),
			costPerSession: sessions > 0 ? Math.round((spend / sessions) * 100) / 100 : null,
			syncedAt: meta.synced_at ?? null,
		});
	}

	if (rows.length === 0) return null;

	const pt = locale === "pt-BR";
	const note = pt
		? "Gasto e receita atribuída são reportados pela plataforma de anúncio (modelo de atribuição dela); sessões e permanência são medidas pelo pixel por primeira origem (" +
			"Meta = facebook/instagram, Google = tráfego pago). Os dois lados usam modelos diferentes e não devem ser somados entre si."
		: "Spend and attributed revenue are platform-reported (their attribution model); sessions and dwell are pixel-measured by first touch (" +
			"Meta = facebook/instagram, Google = paid traffic). The two sides use different models and must not be summed together.";

	return { basis: "platform_plus_pixel", rows, note };
}

export async function generateAdLedger(
	prisma: PrismaClient,
	ctx: GenerateContext,
	behavioral: BehavioralMeasurementOutput | null,
): Promise<AdLedgerOutput | null> {
	let connections: Array<{ provider: string; syncMetadata: string | null }> = [];
	try {
		connections = await prisma.integrationConnection.findMany({
			where: {
				environmentId: ctx.environmentId,
				provider: { in: ["meta_ads", "google_ads"] },
				status: { in: ["connected", "error"] }, // error still carries the last good sync
			},
			select: { provider: true, syncMetadata: true },
		});
	} catch {
		return null;
	}
	if (connections.length === 0) return null;
	return buildAdLedger(connections, behavioral, ctx.locale ?? "pt-BR");
}

// Re-export for UI parity checks.
export { sourceIdentity };
