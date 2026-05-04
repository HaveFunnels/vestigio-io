"use client";

// ──────────────────────────────────────────────
// FixWithAiSection — Shared "Fix with AI" vibecoding bridge
//
// Used in:
//   - actions/page.tsx drawer (full ActionProjection)
//   - FindingDetailPanel (resolved from action_refs via McpData)
//
// Generates a tool-specific remediation prompt the user can
// copy into any AI coding tool (Cursor, Claude Code, Codex, etc).
// ──────────────────────────────────────────────

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useTrack } from "@/hooks/useProductTrack";
import CustomSelect from "@/components/console/CustomSelect";
import type { ActionProjection } from "../../../../packages/projections/types";

const AI_TOOLS = [
	{ id: "cursor", label: "Cursor" },
	{ id: "claude", label: "Claude Code" },
	{ id: "windsurf", label: "Windsurf" },
	{ id: "codex", label: "Codex" },
	{ id: "lovable", label: "Lovable" },
	{ id: "other", label: "Other" },
] as const;

export default function FixWithAiSection({
	action,
}: {
	action: ActionProjection;
}) {
	const t = useTranslations("console.actions.fix_with_ai");
	const [selectedTool, setSelectedTool] = useState("cursor");
	const [prompt, setPrompt] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [copied, setCopied] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const { track } = useTrack();

	async function handleGenerate() {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/actions/remediation-prompt", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action, tool: selectedTool }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setError(data.message || t("error_generate"));
				return;
			}
			const data = await res.json();
			setPrompt(data.prompt);
			track("generate_remediation_prompt", {
				actionId: action.id,
				tool: selectedTool,
				severity: action.severity,
			});
		} catch {
			setError(t("error_network"));
		} finally {
			setLoading(false);
		}
	}

	function handleCopy() {
		if (!prompt) return;
		navigator.clipboard.writeText(prompt);
		setCopied(true);
		track("copy_remediation_prompt", {
			actionId: action.id,
			tool: selectedTool,
			severity: action.severity,
		});
		setTimeout(() => setCopied(false), 2000);
	}

	return (
		<div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
			<div className="flex items-center gap-2 mb-2">
				<svg
					className="h-4 w-4 text-emerald-400"
					fill="none"
					viewBox="0 0 24 24"
					strokeWidth={1.5}
					stroke="currentColor"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
					/>
				</svg>
				<span className="text-xs font-semibold text-emerald-400">
					{t("title")}
				</span>
				<span className="text-[10px] text-content-faint">{t("cost")}</span>
			</div>

			{/* Tool selector + generate */}
			{!prompt ? (
				<>
					<p className="text-[11px] text-content-muted mb-2.5">
						{t("description")}
					</p>
					<div className="flex items-center gap-2">
						<CustomSelect
							size="sm"
							value={selectedTool}
							onChange={setSelectedTool}
							options={AI_TOOLS.map((tool) => ({
								value: tool.id,
								label: tool.label,
							}))}
							className="flex-1"
						/>
						<button
							onClick={handleGenerate}
							disabled={loading}
							className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
						>
							{loading ? (
								<>
									<svg
										className="h-3 w-3 animate-spin"
										viewBox="0 0 16 16"
										fill="none"
									>
										<circle
											cx="8"
											cy="8"
											r="6"
											stroke="currentColor"
											strokeWidth="1.5"
											strokeDasharray="28"
											strokeDashoffset="8"
										/>
									</svg>
									{t("generating")}
								</>
							) : (
								t("generate")
							)}
						</button>
					</div>
					{error && (
						<p className="mt-1.5 text-[11px] text-red-400">{error}</p>
					)}
				</>
			) : (
				/* Prompt generated -- show preview + copy */
				<>
					<div className="flex items-center justify-between mb-2">
						<span className="text-[11px] text-content-muted">
							{t("prompt_for", {
								tool:
									AI_TOOLS.find((tl) => tl.id === selectedTool)
										?.label || selectedTool,
							})}
						</span>
						<div className="flex items-center gap-1.5">
							<button
								onClick={() => setPrompt(null)}
								className="rounded px-2 py-0.5 text-[10px] text-content-faint hover:text-content-muted transition-colors"
							>
								{t("change_tool")}
							</button>
							<button
								onClick={handleCopy}
								className="flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-emerald-500"
							>
								{copied ? (
									<>
										<svg
											className="h-3 w-3"
											viewBox="0 0 16 16"
											fill="none"
										>
											<path
												d="M13.25 4.75L6 12 2.75 8.75"
												stroke="currentColor"
												strokeWidth="1.5"
												strokeLinecap="round"
												strokeLinejoin="round"
											/>
										</svg>
										{t("copied")}
									</>
								) : (
									<>
										<svg
											className="h-3 w-3"
											viewBox="0 0 16 16"
											fill="none"
										>
											<rect
												x="5"
												y="5"
												width="9"
												height="9"
												rx="1"
												stroke="currentColor"
												strokeWidth="1.25"
											/>
											<path
												d="M11 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v7a1 1 0 001 1h2"
												stroke="currentColor"
												strokeWidth="1.25"
											/>
										</svg>
										{t("copy")}
									</>
								)}
							</button>
						</div>
					</div>
					<pre className="max-h-48 overflow-y-auto rounded-md bg-surface-card p-3 text-[11px] leading-relaxed text-content-muted whitespace-pre-wrap">
						{prompt}
					</pre>
				</>
			)}
		</div>
	);
}
