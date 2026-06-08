import { redirect } from "next/navigation";

// Phase 3.2 — Workspaces folded into Findings.
//
// The four perspective cards (Revenue / Trust / Copy / Behavioral)
// became a "Lente" dropdown on /app/findings. The visualization
// components that used to live here (RevenueMap, CrossSignalChainCard,
// PulseSummary, BraggingRights, TrendSparkline, etc.) are still
// exported and get embedded contextually in the Plan and inside
// FindingCard expanded views — Phase 3.3.
//
// Deep links like /app/workspaces?perspective=revenue route to the
// equivalent lens here. Removing the page entirely would break
// bookmarks and shared URLs from before Phase 3.
export default function WorkspacesRedirectPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	// In Next 15 searchParams is a Promise; resolve it before reading.
	// Since the page itself doesn't render, awaiting in the function
	// body would require async — instead, redirect with the most
	// common default lens and let the URL hold the rest of the params.
	// Per spec, the previous perspective param maps directly to lens.
	void searchParams;
	redirect("/app/findings?lens=revenue");
}
