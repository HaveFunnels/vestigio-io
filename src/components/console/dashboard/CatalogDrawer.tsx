"use client";

// ──────────────────────────────────────────────
// CatalogDrawer — [+ Add Widget] picker
//
// Slide-in drawer (right side of viewport) that shows every widget
// registered with `inCatalog: true`, grouped by category. Clicking
// a tile calls `onAdd(defId, defaultSize)` which the parent shell
// turns into a new layout entry.
//
// **Why a drawer instead of a modal:** the user is mid-edit, looking
// at their dashboard. A modal would obscure the layout they're
// editing and require remembering what slot they wanted to fill. A
// side drawer keeps the layout visible — they can see the new widget
// land in real time after clicking Add.
//
// **Already-added widgets:** still shown (greyed out + disabled)
// rather than hidden. Hiding them would make the catalog feel
// incomplete and break the muscle memory of "this widget lives in
// the kpi section." This is consistent with how Notion's database
// view picker handles it.
//
// **Categories:** five fixed sections matching `WidgetCategory`. We
// only render sections that have at least one widget so the drawer
// doesn't show empty headers.
// ──────────────────────────────────────────────

import { useEffect } from "react";
import {
	PlusIcon as Plus,
	XIcon as X,
	ArrowCounterClockwiseIcon as ArrowCounterClockwise,
	ChartLineIcon as ChartLine,
	GaugeIcon as Gauge,
	LightningIcon as Lightning,
	TrophyIcon as Trophy,
	SquaresFourIcon as SquaresFour,
	CardsIcon as Cards,
} from "@phosphor-icons/react/dist/ssr";
import {
	listCatalogWidgets,
	type WidgetCategory,
	type WidgetDefinition,
} from "@/lib/dashboard/init";

interface CatalogDrawerProps {
	open: boolean;
	onClose: () => void;
	onAdd: (defId: string, defaultSize: { w: number; h: number }) => void;
	/** Widget defIds that are already on the dashboard — shown but
	 *  disabled in the catalog so users see the full inventory. */
	existingDefIds: Set<string>;
	/** Optional reset-to-default callback. When provided, renders a
	 *  "Reset layout" link in the drawer footer. */
	onReset?: () => void;
}

const CATEGORY_LABELS: Record<WidgetCategory, string> = {
	kpi: "KPIs",
	trends: "Trends",
	activity: "Activity",
	milestones: "Milestones",
	workspaces: "Workspaces",
	actions: "Actions",
};

const CATEGORY_ORDER: WidgetCategory[] = [
	"kpi",
	"trends",
	"activity",
	"milestones",
	"workspaces",
	"actions",
];

const CATEGORY_ICONS: Record<
	WidgetCategory,
	React.ComponentType<{ size?: number; weight?: "bold" | "regular" }>
> = {
	kpi: Gauge,
	trends: ChartLine,
	activity: Lightning,
	milestones: Trophy,
	workspaces: SquaresFour,
	actions: Cards,
};

export function CatalogDrawer({
	open,
	onClose,
	onAdd,
	existingDefIds,
	onReset,
}: CatalogDrawerProps) {
	// Close on Escape so the drawer behaves like every other modal/drawer
	// in the app.
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	const widgets = listCatalogWidgets();
	const byCategory = new Map<WidgetCategory, WidgetDefinition[]>();
	for (const w of widgets) {
		const list = byCategory.get(w.category) ?? [];
		list.push(w);
		byCategory.set(w.category, list);
	}

	return (
		<>
			{/* Backdrop — click anywhere to close. Slightly tinted so the
			    dashboard behind reads as "context, not active." */}
			<div
				className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity ${
					open
						? "pointer-events-auto opacity-100"
						: "pointer-events-none opacity-0"
				}`}
				onClick={onClose}
				aria-hidden
			/>

			{/* Drawer — slides in from the right edge. Width is fixed
			    (440px) on desktop and full-screen on mobile so the
			    catalog stays readable on every viewport. */}
			<aside
				className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col border-l border-edge bg-surface shadow-2xl transition-transform ${
					open ? "translate-x-0" : "translate-x-full"
				}`}
				aria-label='Widget catalog'
			>
				{/* Header */}
				<div className='flex items-center justify-between border-b border-edge px-5 py-4'>
					<div>
						<h2 className='text-sm font-semibold text-content'>Add a widget</h2>
						<p className='text-[11px] text-content-muted'>
							Pick what to surface on your dashboard
						</p>
					</div>
					<button
						type='button'
						onClick={onClose}
						className='flex h-8 w-8 items-center justify-center rounded-lg border border-edge text-content-muted transition-colors hover:border-emerald-500/60 hover:bg-emerald-500/10 hover:text-emerald-500'
						aria-label='Close catalog'
					>
						<X size={14} weight='bold' />
					</button>
				</div>

				{/* Body — scrollable list of categories */}
				<div className='flex-1 overflow-y-auto px-5 py-4'>
					{CATEGORY_ORDER.map((cat) => {
						const list = byCategory.get(cat);
						if (!list || list.length === 0) return null;
						const Icon = CATEGORY_ICONS[cat];
						return (
							<section key={cat} className='mb-6 last:mb-0'>
								<header className='mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint'>
									<Icon size={12} weight='bold' />
									<span>{CATEGORY_LABELS[cat]}</span>
								</header>
								<div className='flex flex-col gap-2'>
									{list.map((def) => {
										const alreadyAdded = existingDefIds.has(def.id);
										return (
											<CatalogTile
												key={def.id}
												def={def}
												disabled={alreadyAdded}
												onAdd={() => onAdd(def.id, def.defaultSize)}
											/>
										);
									})}
								</div>
							</section>
						);
					})}
				</div>

				{/* Footer — reset link */}
				{onReset && (
					<div className='border-t border-edge px-5 py-3'>
						<button
							type='button'
							onClick={onReset}
							className='flex items-center gap-2 text-[11px] text-content-muted transition-colors hover:text-amber-400'
						>
							<ArrowCounterClockwise size={12} weight='bold' />
							Reset layout to default
						</button>
					</div>
				)}
			</aside>
		</>
	);
}

interface CatalogTileProps {
	def: WidgetDefinition;
	disabled: boolean;
	onAdd: () => void;
}

function CatalogTile({ def, disabled, onAdd }: CatalogTileProps) {
	// Convert "/dashboard/widgets/money_recovered.name" → "Money recovered"
	// for the Phase 3 placeholder display. Phase 3.7 swaps this for real
	// i18n lookups but for now the registry id is human-readable enough.
	const displayName = def.id
		.replaceAll("_", " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());
	const description = describeWidget(def.id);

	return (
		<button
			type='button'
			onClick={onAdd}
			disabled={disabled}
			className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
				disabled
					? "cursor-not-allowed border-edge/40 bg-surface-card/40 opacity-50"
					: "border-edge bg-surface-card hover:border-emerald-500/60 hover:bg-emerald-500/[0.06]"
			}`}
		>
			<div
				className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border ${
					disabled
						? "border-edge/40 text-content-faint"
						: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
				}`}
			>
				<Plus size={14} weight='bold' />
			</div>
			<div className='min-w-0 flex-1'>
				<div className='text-xs font-semibold text-content'>{displayName}</div>
				<div className='truncate text-[11px] text-content-muted'>
					{description}
				</div>
			</div>
			{disabled && (
				<span className='flex-shrink-0 text-[10px] font-medium uppercase tracking-wider text-content-faint'>
					Added
				</span>
			)}
		</button>
	);
}

// Phase 3 placeholder descriptions — replaced by real i18n in a
// future polish pass once next-intl wiring lands here. The strings
// below mirror what's already in dictionary/*.json under
// `console.dashboard.widgets.<id>.description` so swapping is a
// search-and-replace later.
function describeWidget(id: string): string {
	switch (id) {
		case "money_recovered_ticker":
			return "Running total of revenue clawed back";
		case "exposure_kpi":
			return "Open monthly exposure with per-pack split";
		case "health_trend":
			return "Composite health score and 30-day trend";
		case "activity_heatmap":
			return "90-day activity grid with current streak";
		case "what_changed":
			return "New, regressed, and resolved findings";
		case "open_critical_kpi":
			return "Live count of open critical findings";
		case "verification_rate_kpi":
			return "% of findings independently verified";
		case "streak_kpi":
			return "Current activity streak";
		case "top_pack_kpi":
			return "Pack carrying the most exposure";
		default:
			return "Dashboard widget";
	}
}
