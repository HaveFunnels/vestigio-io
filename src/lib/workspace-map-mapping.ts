// ──────────────────────────────────────────────
// Workspace → Maps mapping — Wave-22.6 review fix P2.1
//
// Surfaces relevant maps INSIDE each workspace so a power user
// investigating one problem area doesn't have to mentally bridge
// "I'm reading findings about checkout → I need to also open the
// revenue leakage map somewhere else." Maps stay primarily in
// Library (no new sidebar entry per product decision) but every
// workspace's detail page now shows a "Mapas relacionados" strip
// at the top with deep-links into the maps that visualize the
// same data the workspace is showing.
//
// New maps land here by adding to the mapping. Pre-built engine
// maps today: revenue_leakage, chargeback_risk, root_cause,
// user_journey (see packages/maps/engine.ts).
// ──────────────────────────────────────────────

export interface RelatedMapHint {
	/** Canonical engine map id (matches packages/maps/engine.ts). */
	mapId: string;
	/** Why this map matters for this workspace — surfaces as a
	 *  one-liner under the chip. Locale-aware pair. */
	rationale_pt: string;
	rationale_en: string;
}

const REVENUE_LEAKAGE_FOR_REVENUE: RelatedMapHint = {
	mapId: "revenue_leakage",
	rationale_pt: "Visualize a cadeia causa→efeito dos pontos onde sua receita está vazando.",
	rationale_en: "Visualize the cause→effect chain of where your revenue leaks.",
};

const USER_JOURNEY_FOR_FLOW: RelatedMapHint = {
	mapId: "user_journey",
	rationale_pt: "Veja a jornada do comprador estágio por estágio com as fricções localizadas.",
	rationale_en: "See the buyer journey stage by stage with friction localized.",
};

const ROOT_CAUSE_FOR_DEEP: RelatedMapHint = {
	mapId: "root_cause",
	rationale_pt: "Identifique as causas raiz que conectam findings aparentemente diferentes.",
	rationale_en: "Identify the root causes connecting findings that look unrelated.",
};

const CHARGEBACK_FOR_DISPUTES: RelatedMapHint = {
	mapId: "chargeback_risk",
	rationale_pt: "Mapeie como lacunas viram contestações pós-compra.",
	rationale_en: "Map how gaps turn into post-purchase disputes.",
};

/**
 * Maps relevant per workspace type. Keys are
 * WorkspaceProjectionType values (packages/projections/types.ts).
 * A workspace without an entry shows no "Mapas relacionados" strip
 * — that's intentional, not every workspace has a canonical map yet.
 */
export const WORKSPACE_RELATED_MAPS: Record<string, RelatedMapHint[]> = {
	revenue: [REVENUE_LEAKAGE_FOR_REVENUE, USER_JOURNEY_FOR_FLOW, ROOT_CAUSE_FOR_DEEP],
	chargeback: [CHARGEBACK_FOR_DISPUTES, ROOT_CAUSE_FOR_DEEP],
	security_posture: [ROOT_CAUSE_FOR_DEEP],
	copy_alignment: [USER_JOURNEY_FOR_FLOW, ROOT_CAUSE_FOR_DEEP],
	channel_integrity: [REVENUE_LEAKAGE_FOR_REVENUE, USER_JOURNEY_FOR_FLOW],
	discoverability: [ROOT_CAUSE_FOR_DEEP],
	brand_integrity: [ROOT_CAUSE_FOR_DEEP],
	funnel_journey: [USER_JOURNEY_FOR_FLOW, REVENUE_LEAKAGE_FOR_REVENUE],
	first_impression: [USER_JOURNEY_FOR_FLOW],
	friction_tax: [USER_JOURNEY_FOR_FLOW, ROOT_CAUSE_FOR_DEEP],
	trust_gap: [ROOT_CAUSE_FOR_DEEP, REVENUE_LEAKAGE_FOR_REVENUE],
	path_efficiency: [USER_JOURNEY_FOR_FLOW],
	acquisition_integrity: [REVENUE_LEAKAGE_FOR_REVENUE],
	mobile_revenue: [USER_JOURNEY_FOR_FLOW, REVENUE_LEAKAGE_FOR_REVENUE],
	competitive_lens: [], // No canonical map yet — Wave 28 candidate.
};

export function getRelatedMaps(workspaceType: string): RelatedMapHint[] {
	return WORKSPACE_RELATED_MAPS[workspaceType] ?? [];
}
