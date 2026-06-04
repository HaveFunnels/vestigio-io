"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
	ArrowRightIcon as ArrowRight,
	StackIcon as Stack,
} from "@phosphor-icons/react/dist/ssr";
import {
	registerWidget,
	type WidgetProps,
} from "@/lib/dashboard/widget-registry";
import { fmtCurrencyCents } from "@/lib/format-currency";
import type { ActionQueueItem } from "@/lib/dashboard/types";

// ──────────────────────────────────────────────
// ActionQueueHero — Wave-22.6 review fix UC2
//
// The landing literally promises "Não é um dashboard. É uma fila de
// decisões." Pre-fix, the dashboard top widget was Cross-Signal Hero
// (a chains visualization) and the action queue lived one click away
// at /app/actions. This widget delivers the landing promise INSIDE
// the dashboard: top 5 prioritized open actions, each with severity
// chip + impact midpoint + effort + assignee + "Abrir →" deep link.
//
// Defaults to the FIRST widget in the layout (w=12, h=4) so the
// landing visual is reproduced one inch from where the user opens
// the app post-purchase.
// ──────────────────────────────────────────────

const SEVERITY_CONFIG: Record<
	string,
	{ chip: string; dot: string; labelKey: string }
> = {
	critical: {
		chip: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
		dot: "bg-red-500",
		labelKey: "severity_critical",
	},
	high: {
		chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
		dot: "bg-amber-500",
		labelKey: "severity_high",
	},
	medium: {
		chip: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20",
		dot: "bg-zinc-500",
		labelKey: "severity_medium",
	},
	low: {
		chip: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20",
		dot: "bg-zinc-500",
		labelKey: "severity_low",
	},
	none: {
		chip: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20",
		dot: "bg-zinc-500",
		labelKey: "severity_low",
	},
};

const EFFORT_LABELS: Record<string, string> = {
	trivial: "trivial",
	low: "baixo",
	medium: "médio",
	high: "alto",
};

function ActionQueueHeroComponent({ data }: WidgetProps) {
	const t = useTranslations("console.actions");
	const tsev = useTranslations("console.common.severity");
	const { items, totalOpen, totalImpactCents, currency, caption } =
		data.actionQueue;

	const empty = items.length === 0;

	return (
		<div className="relative flex h-full flex-col p-5">
			{/* Header — eyebrow + total exposure */}
			<div className="relative flex items-start justify-between gap-3">
				<div>
					<div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">
						<Stack size={11} weight="bold" className="text-accent-text" />
						<span>Fila de decisões</span>
					</div>
					<div className="mt-1 text-[12px] text-content-secondary">
						{empty
							? "Sem ações abertas — comece pelos Findings."
							: caption || `${totalOpen} ações abertas`}
					</div>
				</div>
				{!empty && totalImpactCents > 0 && (
					<div className="text-right">
						<div className="text-[10px] uppercase tracking-wider text-content-faint">
							em foco
						</div>
						<div className="font-mono text-[18px] font-semibold tabular-nums text-content">
							{fmtCurrencyCents(totalImpactCents, currency)}
							<span className="ml-1 text-[10px] text-content-muted">/mês</span>
						</div>
					</div>
				)}
			</div>

			{/* List */}
			<div className="relative mt-4 flex flex-1 flex-col gap-1.5">
				{empty ? (
					<div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-edge bg-surface-subtle px-4 py-6 text-center">
						<div className="text-[13px] text-content-muted">
							Você ainda não tem ações na fila.
						</div>
						<div className="text-[11px] text-content-faint">
							Abra um finding crítico, clique em "Verificar" e a ação aparece
							aqui priorizada.
						</div>
						<Link
							href="/app/findings?view=on_fire"
							className="mt-1 rounded-md border border-edge bg-surface-card px-3 py-1.5 text-[12px] text-content transition-colors hover:bg-surface-card-hover"
						>
							Ver findings críticos →
						</Link>
					</div>
				) : (
					items.map((item: ActionQueueItem, idx: number) => {
						const sev = SEVERITY_CONFIG[item.severity] ?? SEVERITY_CONFIG.none;
						return (
							<Link
								key={item.id}
								href={`/app/actions?id=${item.id}`}
								className="group flex items-center gap-3 rounded-md border border-edge bg-surface-card px-3 py-2 transition-colors hover:border-edge-focus hover:bg-surface-card-hover"
							>
								<span className="font-mono text-[10px] text-content-faint">
									{idx + 1}
								</span>
								<span
									className={`inline-flex h-1.5 w-1.5 shrink-0 rounded-full ${sev.dot}`}
								/>
								<div className="min-w-0 flex-1">
									<div className="truncate text-[13px] text-content group-hover:text-content">
										{item.title}
									</div>
									<div className="mt-0.5 flex items-center gap-2 text-[11px] text-content-faint">
										<span
											className={`inline-flex items-center rounded border px-1.5 py-px text-[10px] font-medium ${sev.chip}`}
										>
											{tsev(sev.labelKey)}
										</span>
										{item.effortHint && (
											<span>esforço {EFFORT_LABELS[item.effortHint] ?? item.effortHint}</span>
										)}
										{item.assigneeName && (
											<span>· {item.assigneeName}</span>
										)}
										{item.status === "in_progress" && (
											<span className="text-amber-500">· em progresso</span>
										)}
									</div>
								</div>
								{item.impactMidpointCents != null && (
									<div className="shrink-0 text-right">
										<div className="font-mono text-[12px] tabular-nums text-content">
											{fmtCurrencyCents(item.impactMidpointCents, currency)}
										</div>
										<div className="text-[9px] uppercase tracking-wider text-content-faint">
											/mês
										</div>
									</div>
								)}
								<ArrowRight
									size={14}
									className="shrink-0 text-content-faint transition-colors group-hover:text-content"
								/>
							</Link>
						);
					})
				)}
			</div>

			{/* Footer link — full queue */}
			{!empty && (
				<div className="relative mt-3 flex items-center justify-between border-t border-edge pt-2 text-[11px]">
					<span className="text-content-faint">
						Top {items.length} de {totalOpen}
					</span>
					<Link
						href="/app/actions"
						className="font-medium text-accent-text hover:underline"
					>
						Ver fila completa →
					</Link>
				</div>
			)}
		</div>
	);
}

registerWidget({
	id: "action_queue_hero",
	version: 1,
	nameKey: "console.dashboard.widgets.action_queue_hero.name",
	descriptionKey: "console.dashboard.widgets.action_queue_hero.description",
	category: "kpi",
	icon: "stack",
	defaultSize: { w: 12, h: 4 },
	minSize: { w: 6, h: 3 },
	maxSize: { w: 12, h: 5 },
	resizable: true,
	// Locked — this is the new hero anchor (Wave-22.6 review fix UC2).
	// Removing it puts the dashboard back into "bento, not queue" mode
	// that the landing explicitly disclaims.
	removable: false,
	inCatalog: false,
	dataKeys: ["actionQueue"],
	Component: ActionQueueHeroComponent,
});
