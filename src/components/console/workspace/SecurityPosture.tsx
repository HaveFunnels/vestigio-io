"use client";

/**
 * SecurityPosture — Domain-specific primary view for the security_posture
 * workspace. Groups the 12 cybersecurity findings into 3 pillars.
 */

import { useTranslations } from "next-intl";
import type { FindingProjection } from "../../../../packages/projections/types";
import ResilienceChecklist, { type ChecklistPillar } from "./ResilienceChecklist";
import TrustScoreCard from "./TrustScoreCard";

const SECURITY_PILLAR_DEFS = [
	{
		id: "transport",
		labelKey: "pillars.transport" as const,
		inferenceKeys: [
			"https_everywhere",
			"hsts_configured",
			"mixed_content_detected",
			"tls_version_outdated",
		],
	},
	{
		id: "response",
		labelKey: "pillars.response" as const,
		inferenceKeys: [
			"security_headers_missing",
			"csp_missing",
			"clickjack_protection",
			"cors_misconfigured",
			"x_frame_options_missing",
		],
	},
	{
		id: "application",
		labelKey: "pillars.application" as const,
		inferenceKeys: [
			"sri_missing",
			"sensitive_endpoint_exposed",
			"cookie_security_gap",
			"rate_limiting_absent",
			"predictable_urls",
			"error_info_disclosure",
		],
	},
];

interface Props {
	findings: FindingProjection[];
}

export default function SecurityPosture({ findings }: Props) {
	const t = useTranslations("console.workspaces.detail.enrichment");

	const hasSecurityData = findings.some((f) => f.pack === "security_posture" || f.pack === "scale_readiness");
	if (!hasSecurityData) return null;

	const pillars: ChecklistPillar[] = SECURITY_PILLAR_DEFS.map((d) => ({
		id: d.id,
		label: t(d.labelKey),
		inferenceKeys: d.inferenceKeys,
	}));

	return (
		<div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
			{/* Left: Security Checklist (60%) */}
			<div className="lg:col-span-3">
				<h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-content-faint">
					{t("security_checklist")}
				</h3>
				<ResilienceChecklist
					findings={findings}
					pillars={pillars}
				/>
			</div>

			{/* Right: Trust Score (40%) */}
			<div className="lg:col-span-2">
				<h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-content-faint">
					{t("security_score")}
				</h3>
				<TrustScoreCard
					findings={findings}
					filterPacks={["security_posture", "scale_readiness"]}
				/>
			</div>
		</div>
	);
}
