"use client";

// ──────────────────────────────────────────────
// CopilotQuickActions — Contextual quick action badges (3.14)
//
// Renders page-aware quick actions. Each sends a predefined prompt.
// Shown in empty state (prominent) and during conversation (compact strip).
// Labels and prompts pulled from translations (console.copilot).
// ──────────────────────────────────────────────

import { useTranslations } from "next-intl";
import type { PageContextType } from "./CopilotProvider";

interface QuickActionDef {
	labelKey: string;
	promptKey: string;
	color: string;
}

const ACTIONS_BY_PAGE: Record<string, QuickActionDef[]> = {
	workspaces: [
		{ labelKey: "what_changed", promptKey: "what_changed_workspaces", color: "text-amber-500" },
		{ labelKey: "revenue_audit", promptKey: "revenue_audit", color: "text-red-500" },
		{ labelKey: "explain_workspace", promptKey: "explain_workspace_workspaces", color: "text-sky-500" },
	],
	perspective: [
		{ labelKey: "what_changed", promptKey: "what_changed_perspective", color: "text-amber-500" },
		{ labelKey: "deep_dive", promptKey: "deep_dive", color: "text-violet-500" },
	],
	workspace: [
		{ labelKey: "explain_workspace", promptKey: "explain_workspace", color: "text-sky-500" },
		{ labelKey: "fix_first", promptKey: "fix_first_workspace", color: "text-emerald-500" },
	],
	actions: [
		{ labelKey: "fix_first", promptKey: "fix_first_actions", color: "text-emerald-500" },
		{ labelKey: "explain_action", promptKey: "explain_action", color: "text-sky-500" },
		{ labelKey: "verify", promptKey: "verify", color: "text-blue-500" },
	],
	analysis: [
		{ labelKey: "summarize", promptKey: "summarize", color: "text-sky-500" },
		{ labelKey: "cross_signal", promptKey: "cross_signal", color: "text-violet-500" },
		{ labelKey: "high_impact", promptKey: "high_impact", color: "text-red-500" },
	],
	inventory: [
		{ labelKey: "audit_page", promptKey: "audit_page", color: "text-amber-500" },
		{ labelKey: "down_pages", promptKey: "down_pages", color: "text-red-500" },
	],
	dashboard: [
		{ labelKey: "executive_summary", promptKey: "executive_summary", color: "text-amber-500" },
		{ labelKey: "losing_money", promptKey: "losing_money", color: "text-red-500" },
		{ labelKey: "improvements", promptKey: "improvements", color: "text-emerald-500" },
	],
	other: [
		{ labelKey: "whats_up", promptKey: "whats_up", color: "text-sky-500" },
		{ labelKey: "revenue_audit", promptKey: "revenue_audit_other", color: "text-red-500" },
		{ labelKey: "trust_check", promptKey: "trust_check", color: "text-violet-500" },
	],
};

export default function CopilotQuickActions({
	pageContext,
	onAction,
	compact = false,
}: {
	pageContext: PageContextType;
	onAction: (prompt: string) => void;
	compact?: boolean;
}) {
	const t = useTranslations("console.copilot");
	const actions = ACTIONS_BY_PAGE[pageContext.type] || ACTIONS_BY_PAGE.other;

	return (
		<div className={`flex flex-wrap justify-center ${compact ? "gap-1.5" : "gap-2"}`}>
			{actions.map((action) => (
				<button
					key={action.labelKey}
					onClick={() => onAction(t(`quick_prompts.${action.promptKey}`))}
					className={`
						inline-flex items-center gap-1.5 rounded-md border border-edge
						bg-surface-card transition-colors hover:border-accent/40 hover:bg-surface-card-hover
						${compact ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs"}
						font-medium text-content-secondary
					`}
				>
					<span className={`h-1.5 w-1.5 rounded-full ${action.color.replace("text-", "bg-")}`} />
					{t(`quick_actions.${action.labelKey}`)}
				</button>
			))}
		</div>
	);
}
