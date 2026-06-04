import type { WorkspaceProjection } from "../../packages/projections";

// ──────────────────────────────────────────────
// workspace-surface-filter — Wave-22.6 review fix P3.2
//
// Returns a workspace list where each ws.findings is reduced to only
// those findings whose `surface` field includes the target surface
// (surface is a comma-separated string at the FindingProjection
// layer). Workspaces with zero matching findings are dropped.
//
// Critically, we re-derive ws.summary.issue_count and
// ws.summary.total_loss_mid from the filtered findings so all
// downstream widgets (perspective cards, revenue map, delta, bragging
// rights) re-aggregate naturally without needing to know about the
// filter.
// ──────────────────────────────────────────────

function findingTouchesSurface(findingSurface: string | undefined, target: string): boolean {
	if (!findingSurface) return false;
	for (const s of findingSurface.split(",")) {
		if (s.trim() === target) return true;
	}
	return false;
}

export function filterWorkspacesBySurface(
	workspaces: WorkspaceProjection[],
	surface: string | null,
): WorkspaceProjection[] {
	if (!surface) return workspaces;
	const out: WorkspaceProjection[] = [];
	for (const ws of workspaces) {
		const filteredFindings = ws.findings.filter((f) =>
			findingTouchesSurface(f.surface, surface),
		);
		if (filteredFindings.length === 0) continue;
		const totalLossMid = filteredFindings.reduce(
			(sum, f) => sum + (f.impact?.midpoint ?? 0),
			0,
		);
		out.push({
			...ws,
			findings: filteredFindings,
			summary: {
				...ws.summary,
				issue_count: filteredFindings.length,
				total_loss_mid: totalLossMid,
			},
		});
	}
	return out;
}
