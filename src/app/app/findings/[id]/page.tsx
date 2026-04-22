"use client";

import { use } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMcpData } from "@/components/app/McpDataProvider";
import { loadFindings } from "@/lib/console-data";
import FindingDetailPanel from "@/components/console/FindingDetailPanel";

// ──────────────────────────────────────────────
// /app/findings/[id] — Canonical Finding Detail Page (3.20)
//
// Full-page view of a single finding with expanded layout.
// Shareable URL — no drawer constraint, all sections visible.
// Reached via "Open full page" button in FindingDetailPanel.
// ──────────────────────────────────────────────

export default function FindingPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = use(params);
	const decodedId = decodeURIComponent(id);
	const t = useTranslations("console.finding_drawer");
	const tc = useTranslations("console.common");

	// Load findings from MCP singleton (same as Analysis page)
	const mcpData = useMcpData();
	const dataState =
		mcpData.findings.status !== "not_ready"
			? mcpData.findings
			: loadFindings();

	if (dataState.status !== "ready") {
		return (
			<div className="flex flex-col items-center justify-center py-24 text-center">
				<div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
				<p className="mt-3 text-sm text-content-muted">
					{tc("loading") || "Loading..."}
				</p>
			</div>
		);
	}

	const finding = dataState.data.find(
		(f) => f.id === decodedId || f.inference_key === decodedId,
	);

	if (!finding) {
		return (
			<div className="flex flex-col items-center justify-center py-24 text-center">
				<div className="mb-3 text-4xl text-zinc-300 dark:text-zinc-700">
					&empty;
				</div>
				<h2 className="text-lg font-semibold text-zinc-300">
					{t("not_found") || "Finding not found"}
				</h2>
				<p className="mt-1 text-sm text-content-muted">
					{decodedId}
				</p>
				<Link
					href="/app/analysis"
					className="mt-4 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
				>
					&larr; {tc("back") || "Back to Findings"}
				</Link>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-3xl p-6">
			{/* Breadcrumb */}
			<nav className="mb-6 flex items-center gap-2 text-xs text-content-muted">
				<Link
					href="/app/analysis"
					className="transition-colors hover:text-content"
				>
					{tc("findings") || "Findings"}
				</Link>
				<span>/</span>
				<span className="truncate text-content-secondary">
					{finding.title}
				</span>
			</nav>

			{/* Full-page finding detail */}
			<FindingDetailPanel
				finding={finding}
				variant="full"
				hideFullPageLink
			/>
		</div>
	);
}
