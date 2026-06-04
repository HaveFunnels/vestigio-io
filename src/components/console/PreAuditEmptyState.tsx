"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
	ArrowRightIcon,
	MagnifyingGlassIcon,
	MapTrifoldIcon,
	BookOpenIcon,
	StackIcon,
	ListChecksIcon,
	FolderIcon,
} from "@phosphor-icons/react/dist/ssr";

// ──────────────────────────────────────────────
// PreAuditEmptyState — replaces dead-end "no data yet" empties
//
// When a low-awareness buyer who just paid opens Maps/Library/etc
// BEFORE the first audit cycle finishes, they were landing on a
// generic ∅ + "no_data_yet". This:
//   1. Tells them concretely what will appear here once the audit
//      runs (per-surface copy)
//   2. Shows an inline "running…" pip when we detect the first
//      audit is still in flight, so they understand it's coming
//   3. Drops them back at the Pulse with a single CTA — the place
//      where progress + activation live
//
// Source of truth = /api/onboarding/progress (audit_complete flag).
// Falls back to generic empty when we can't detect state.
// ──────────────────────────────────────────────

export type Surface =
	| "library"
	| "maps"
	| "workspaces"
	| "findings"
	| "actions"
	| "inventory";

interface Props {
	surface: Surface;
}

const ICON: Record<Surface, React.ComponentType<{ size?: number; weight?: any }>> = {
	library: BookOpenIcon,
	maps: MapTrifoldIcon,
	workspaces: StackIcon,
	findings: MagnifyingGlassIcon,
	actions: ListChecksIcon,
	inventory: FolderIcon,
};

interface ProgressResponse {
	items: { id: string; completed: boolean }[];
}

export default function PreAuditEmptyState({ surface }: Props) {
	const t = useTranslations("console.pre_audit_empty");
	const locale = useLocale();
	const isPt = locale.startsWith("pt");
	const [auditComplete, setAuditComplete] = useState<boolean | null>(null);
	const Icon = ICON[surface];

	useEffect(() => {
		(async () => {
			try {
				const res = await fetch("/api/onboarding/progress", { cache: "no-store" });
				if (!res.ok) return;
				const json = (await res.json()) as ProgressResponse;
				const item = json.items.find((i) => i.id === "audit_complete");
				setAuditComplete(item?.completed ?? false);
			} catch {
				/* ignore — fall through to neutral copy */
			}
		})();
	}, []);

	const isPreFirstAudit = auditComplete === false;

	return (
		<div className="flex flex-col items-center justify-center px-6 py-24 text-center">
			<div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
				<Icon size={24} weight="duotone" />
			</div>
			<h2 className="font-[family-name:var(--font-fraunces)] text-[22px] font-medium leading-snug text-content">
				{t(`${surface}.title`)}
			</h2>
			<p className="mt-2 max-w-md text-[13px] leading-relaxed text-content-muted">
				{isPreFirstAudit ? t(`${surface}.pre_audit_body`) : t(`${surface}.empty_body`)}
			</p>

			{isPreFirstAudit && (
				<div className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-medium text-emerald-300">
					<span className="relative flex h-1.5 w-1.5">
						<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
						<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
					</span>
					{isPt ? "Auditoria em andamento" : "Audit in progress"}
				</div>
			)}

			<Link
				href="/app/pulse"
				className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg shadow-emerald-500/20 transition-colors hover:bg-emerald-600"
			>
				{t("cta_back_to_pulse")}
				<ArrowRightIcon size={12} weight="bold" />
			</Link>
		</div>
	);
}
