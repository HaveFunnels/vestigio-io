"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
	FlameIcon,
	SealCheckIcon,
	SquaresFourIcon,
	ShieldCheckIcon,
	StarIcon,
	BookmarkIcon,
	FlagIcon,
	FunnelSimpleIcon,
	PlusIcon,
	UsersThreeIcon,
	PushPinIcon,
	ShareNetworkIcon,
	DotsThreeIcon,
	PencilSimpleIcon,
} from "@phosphor-icons/react/dist/ssr";
import toast from "react-hot-toast";
import CustomSelect from "./CustomSelect";

// ──────────────────────────────────────────────
// ViewSelector — horizontal tab bar for saved views
//
// Renders at the top of the Findings page. Each tab shows a
// Phosphor icon + translated name. Active tab has colored underline.
// Supports share toggle and pin-to-sidebar for custom views.
// ──────────────────────────────────────────────

export interface SavedViewData {
	id: string;
	name: string;
	icon: string | null;
	color: string | null;
	filters: Record<string, unknown>;
	groupBy: string | null;
	sortBy: string;
	layout: string;
	isDefault: boolean;
	isShared: boolean;
	isPinned: boolean;
	order: number;
	userId?: string;
}

export interface ViewEditData {
	severity: string[];
	polarity: string;
	pack: string[];
	impact: string;
	change: string[];
	groupBy: string;
}

const ICON_MAP: Record<string, React.ComponentType<any>> = {
	Flame: FlameIcon,
	SealCheck: SealCheckIcon,
	SquaresFour: SquaresFourIcon,
	ShieldCheck: ShieldCheckIcon,
	Star: StarIcon,
	Bookmark: BookmarkIcon,
	Flag: FlagIcon,
	FunnelSimple: FunnelSimpleIcon,
};

interface ViewSelectorProps {
	views: SavedViewData[];
	activeViewId: string | null;
	onViewChange: (view: SavedViewData) => void;
	onSaveView: () => void;
	onViewUpdated?: (view: SavedViewData) => void;
	onEditViewSave?: (viewId: string | null, data: { filters: Record<string, unknown>; groupBy: string | null }) => void;
	currentUserId?: string;
}

export default function ViewSelector({
	views,
	activeViewId,
	onViewChange,
	onSaveView,
	onViewUpdated,
	onEditViewSave,
	currentUserId,
}: ViewSelectorProps) {
	const t = useTranslations("console.findings.views");
	const tc = useTranslations("console.common");
	const [optionsViewId, setOptionsViewId] = useState<string | null>(null);
	const optionsRef = useRef<HTMLDivElement>(null);

	// Edit mode state
	const [editingViewId, setEditingViewId] = useState<string | null>(null);
	const [editMode, setEditMode] = useState(false);
	const [editSaving, setEditSaving] = useState(false);

	// Edit form state
	const [editSeverity, setEditSeverity] = useState<string[]>([]);
	const [editPolarity, setEditPolarity] = useState<string>("all");
	const [editPack, setEditPack] = useState<string[]>([]);
	const [editImpact, setEditImpact] = useState<string>("any");
	const [editChange, setEditChange] = useState<string[]>([]);
	const [editGroupBy, setEditGroupBy] = useState<string>("none");

	// Close options menu on outside click
	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (
				optionsRef.current &&
				!optionsRef.current.contains(e.target as Node)
			) {
				setOptionsViewId(null);
			}
		}
		if (optionsViewId) {
			document.addEventListener("mousedown", handleClickOutside);
			return () => document.removeEventListener("mousedown", handleClickOutside);
		}
	}, [optionsViewId]);

	// Default views are always shown as tabs; custom views go in the dropdown
	const defaultViews = views.filter((v) => v.isDefault);
	const customViews = views.filter((v) => !v.isDefault);

	function getViewLabel(name: string): string {
		try {
			return t(name);
		} catch {
			return name;
		}
	}

	function isOwner(view: SavedViewData): boolean {
		if (!currentUserId) return true; // fallback: allow if no userId info
		return view.userId === currentUserId;
	}

	// Open edit mode for a view (pre-populated)
	function handleOpenEdit(view: SavedViewData) {
		const f = view.filters as Record<string, any>;
		setEditingViewId(view.id);
		setEditSeverity(f.severity || []);
		setEditPolarity(f.polarity || "all");
		setEditPack(f.pack || []);
		setEditImpact(f.impact || "any");
		setEditChange(f.change || []);
		setEditGroupBy(view.groupBy || "none");
		setEditMode(true);
		setOptionsViewId(null);
	}

	// Open edit mode for a new view (blank)
	function handleOpenCreate() {
		setEditingViewId(null);
		setEditSeverity([]);
		setEditPolarity("all");
		setEditPack([]);
		setEditImpact("any");
		setEditChange([]);
		setEditGroupBy("none");
		setEditMode(true);
	}

	function handleCloseEdit() {
		setEditMode(false);
		setEditingViewId(null);
	}

	async function handleSaveEdit() {
		setEditSaving(true);
		const filters: Record<string, unknown> = {};
		if (editSeverity.length > 0) filters.severity = editSeverity;
		if (editPolarity !== "all") filters.polarity = editPolarity;
		if (editPack.length > 0) filters.pack = editPack;
		if (editImpact !== "any") filters.impact = editImpact;
		if (editChange.length > 0) filters.change = editChange;

		const groupBy = editGroupBy === "none" ? null : editGroupBy;

		if (onEditViewSave) {
			onEditViewSave(editingViewId, { filters, groupBy });
		} else if (editingViewId) {
			// Fallback: PATCH directly
			try {
				const existingView = views.find((v) => v.id === editingViewId);
				const existingFilters = (existingView?.filters as Record<string, any>) || {};
				const mergedFilters = { ...existingFilters, ...filters };
				// Remove keys that are now empty/default
				if (!filters.severity) delete mergedFilters.severity;
				if (!filters.polarity) delete mergedFilters.polarity;
				if (!filters.pack) delete mergedFilters.pack;
				if (!filters.impact) delete mergedFilters.impact;
				if (!filters.change) delete mergedFilters.change;

				const res = await fetch(`/api/views/${editingViewId}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ filters: mergedFilters, groupBy }),
				});
				if (res.ok) {
					const data = await res.json();
					onViewUpdated?.(data.view);
					toast.success(t("view_saved"));
				} else {
					toast.error(t("save_error"));
				}
			} catch {
				toast.error(t("save_error"));
			}
		} else {
			// New view: open save modal (user still needs name/icon/color)
			onSaveView();
		}

		setEditSaving(false);
		handleCloseEdit();
	}

	async function handleToggleShare(view: SavedViewData) {
		if (!isOwner(view)) return;
		try {
			const res = await fetch(`/api/views/${view.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ isShared: !view.isShared }),
			});
			if (res.ok) {
				const data = await res.json();
				onViewUpdated?.(data.view);
			}
		} catch {
			toast.error(t("save_error"));
		}
		setOptionsViewId(null);
	}

	async function handleTogglePin(view: SavedViewData) {
		const newPinState = !view.isPinned;

		// Enforce max 5 pins
		if (newPinState) {
			const currentPinnedCount = views.filter((v) => v.isPinned).length;
			if (currentPinnedCount >= 5) {
				toast.error(t("max_pins"));
				setOptionsViewId(null);
				return;
			}
		}

		try {
			const res = await fetch(`/api/views/${view.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ isPinned: newPinState }),
			});
			if (res.ok) {
				const data = await res.json();
				onViewUpdated?.(data.view);
			}
		} catch {
			toast.error(t("save_error"));
		}
		setOptionsViewId(null);
	}

	async function handleDeleteView(view: SavedViewData) {
		if (!isOwner(view) || view.isDefault) return;
		try {
			const res = await fetch(`/api/views/${view.id}`, {
				method: "DELETE",
			});
			if (res.ok) {
				onViewUpdated?.({ ...view, id: "__deleted__" });
			}
		} catch {
			toast.error(t("save_error"));
		}
		setOptionsViewId(null);
	}

	// ── Chip toggle helpers ──
	function toggleChip(arr: string[], val: string): string[] {
		return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
	}

	// ── Constants for edit mode ──
	const SEVERITY_OPTIONS = ["critical", "high", "medium", "low"];
	const POLARITY_OPTIONS = ["all", "negative", "positive"];
	const PACK_OPTIONS = [
		"scale_readiness",
		"revenue_integrity",
		"chargeback_resilience",
		"money_moment_exposure",
		"saas_growth_readiness",
		"behavioral_heuristics",
		"copy_alignment",
		"content_freshness",
		"payment_health",
		"channel_integrity",
		"discoverability",
		"brand_integrity",
		"email_deliverability",
		"competitive_lens",
	];
	const IMPACT_OPTIONS = ["any", "gt1000", "gt5000", "gt10000"];
	const CHANGE_OPTIONS = ["new_issue", "regression", "stable_risk", "improvement"];
	const GROUP_BY_OPTIONS = ["none", "pack", "severity", "surface"];

	return (
		<div className="mb-4">
			{/* Tab bar */}
			<div className="flex items-center gap-1 overflow-x-auto border-b border-edge">
				{defaultViews.map((view) => {
					const IconComponent = view.icon ? ICON_MAP[view.icon] : null;
					const isActive = view.id === activeViewId;

					return (
						<button
							key={view.id}
							onClick={() => onViewChange(view)}
							className={`group relative flex shrink-0 items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors ${
								isActive
									? "text-content"
									: "text-content-muted hover:text-content-secondary"
							}`}
						>
							{IconComponent && (
								<IconComponent
									size={16}
									weight={isActive ? "fill" : "regular"}
									style={{ color: isActive ? (view.color || undefined) : undefined }}
								/>
							)}
							<span>{getViewLabel(view.name)}</span>
							{/* Active underline */}
							{isActive && (
								<span
									className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
									style={{ backgroundColor: view.color || "#10b981" }}
								/>
							)}
						</button>
					);
				})}

				{/* Custom view tabs (if any) */}
				{customViews.map((view) => {
					const IconComponent = view.icon ? ICON_MAP[view.icon] : null;
					const isActive = view.id === activeViewId;
					const owned = isOwner(view);

					return (
						<div key={view.id} className="group/tab relative flex items-center">
							<button
								onClick={() => onViewChange(view)}
								className={`relative flex shrink-0 items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors ${
									isActive
										? "text-content"
										: "text-content-muted hover:text-content-secondary"
								}`}
							>
								{IconComponent && (
									<IconComponent
										size={16}
										weight={isActive ? "fill" : "regular"}
										style={{ color: isActive ? (view.color || undefined) : undefined }}
									/>
								)}
								<span>{view.name}</span>
								{view.isShared && !owned && (
									<span title={t("shared_by", { name: "" })}>
										<UsersThreeIcon
											size={12}
											className="text-blue-500"
										/>
									</span>
								)}
								{view.isShared && owned && (
									<span className="rounded bg-blue-500/10 px-1 py-0.5 text-[9px] uppercase text-blue-500">
										{t("shared_badge")}
									</span>
								)}
								{isActive && (
									<span
										className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
										style={{ backgroundColor: view.color || "#10b981" }}
									/>
								)}
							</button>

							{/* Options button for custom views — visible on active or group hover */}
							{owned && !view.isDefault && (
								<div className={`relative transition-opacity ${isActive || optionsViewId === view.id ? "opacity-100" : "opacity-0 group-hover/tab:opacity-100"}`} ref={optionsViewId === view.id ? optionsRef : undefined}>
									<button
										onClick={(e) => {
											e.stopPropagation();
											setOptionsViewId(
												optionsViewId === view.id ? null : view.id,
											);
										}}
										className="flex h-6 w-6 items-center justify-center rounded text-content-muted transition-colors hover:bg-surface-card-hover hover:text-content-secondary"
									>
										<DotsThreeIcon size={14} weight="bold" />
									</button>

									{optionsViewId === view.id && (
										<div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-edge bg-surface-card py-1 shadow-xl">
											{/* Edit */}
											<button
												onClick={() => handleOpenEdit(view)}
												className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-content-secondary transition-colors hover:bg-surface-card-hover"
											>
												<PencilSimpleIcon size={14} />
												<span>{t("edit_view")}</span>
											</button>

											{/* Share toggle */}
											<button
												onClick={() => handleToggleShare(view)}
												className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-content-secondary transition-colors hover:bg-surface-card-hover"
											>
												<ShareNetworkIcon size={14} />
												<span>{t("share")}</span>
												<span
													className={`ml-auto flex h-5 w-9 items-center rounded-full px-0.5 transition-colors ${
														view.isShared ? "bg-blue-500" : "bg-surface-inset"
													}`}
												>
													<span
														className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
															view.isShared ? "translate-x-4" : "translate-x-0"
														}`}
													/>
												</span>
											</button>

											{/* Pin toggle */}
											<button
												onClick={() => handleTogglePin(view)}
												className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-content-secondary transition-colors hover:bg-surface-card-hover"
											>
												<PushPinIcon size={14} />
												<span>
													{view.isPinned ? t("unpin") : t("pin_to_sidebar")}
												</span>
											</button>

											{/* Delete */}
											<div className="my-1 border-t border-edge" />
											<button
												onClick={() => handleDeleteView(view)}
												className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-500 transition-colors hover:bg-surface-card-hover"
											>
												<span>{t("delete_view")}</span>
											</button>
										</div>
									)}
								</div>
							)}

							{/* Read-only indicator for non-owners */}
							{isActive && !owned && (
								<span className="ml-1 text-[10px] text-content-faint">
									{t("read_only")}
								</span>
							)}
						</div>
					);
				})}

				{/* Plus button — opens edit mode for new view */}
				<div className="ml-1">
					<button
						onClick={() => handleOpenCreate()}
						className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-content-muted transition-colors hover:bg-surface-card-hover hover:text-content-secondary"
						title={t("save_view")}
					>
						<PlusIcon size={16} weight="bold" />
					</button>
				</div>
			</div>

			{/* Edit Mode Panel */}
			{editMode && (
				<div className="animate-in slide-in-from-top-2 border-b border-edge bg-surface-card/50 px-4 py-4">
					<div className="flex flex-wrap items-start gap-4">
						{/* Severity multi-select chips */}
						<div className="flex flex-col gap-1.5">
							<span className="text-[11px] font-medium uppercase tracking-wide text-content-muted">
								{tc("severity.all").replace("All ", "").replace("Todas as ", "")}
							</span>
							<div className="flex flex-wrap gap-1.5">
								{SEVERITY_OPTIONS.map((sev) => (
									<button
										key={sev}
										onClick={() => setEditSeverity(toggleChip(editSeverity, sev))}
										className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
											editSeverity.includes(sev)
												? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
												: "border-edge bg-surface-inset text-content-muted hover:border-content-faint hover:text-content-secondary"
										}`}
									>
										{tc(`severity.${sev}`)}
									</button>
								))}
							</div>
						</div>

						{/* Polarity toggle */}
						<div className="flex flex-col gap-1.5">
							<span className="text-[11px] font-medium uppercase tracking-wide text-content-muted">
								{t("edit_polarity")}
							</span>
							<div className="flex gap-1.5">
								{POLARITY_OPTIONS.map((pol) => (
									<button
										key={pol}
										onClick={() => setEditPolarity(pol)}
										className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
											editPolarity === pol
												? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
												: "border-edge bg-surface-inset text-content-muted hover:border-content-faint hover:text-content-secondary"
										}`}
									>
										{tc(`polarity.${pol}`)}
									</button>
								))}
							</div>
						</div>

						{/* Pack multi-select chips */}
						<div className="flex flex-col gap-1.5">
							<span className="text-[11px] font-medium uppercase tracking-wide text-content-muted">
								{t("edit_pack")}
							</span>
							<div className="flex flex-wrap gap-1.5">
								{PACK_OPTIONS.map((pack) => (
									<button
										key={pack}
										onClick={() => setEditPack(toggleChip(editPack, pack))}
										className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
											editPack.includes(pack)
												? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
												: "border-edge bg-surface-inset text-content-muted hover:border-content-faint hover:text-content-secondary"
										}`}
									>
										{tc(`pack_labels.${pack}`)}
									</button>
								))}
							</div>
						</div>

						{/* Impact threshold select */}
						<div className="flex flex-col gap-1.5">
							<span className="text-[11px] font-medium uppercase tracking-wide text-content-muted">
								{t("edit_impact")}
							</span>
							<CustomSelect
								value={editImpact}
								onChange={setEditImpact}
								size="sm"
								options={IMPACT_OPTIONS.map((opt) => ({
									value: opt,
									label: opt === "any" ? t("impact_any") : opt === "gt1000" ? "> $1k" : opt === "gt5000" ? "> $5k" : "> $10k",
								}))}
							/>
						</div>

						{/* Change multi-select chips */}
						<div className="flex flex-col gap-1.5">
							<span className="text-[11px] font-medium uppercase tracking-wide text-content-muted">
								{t("edit_change")}
							</span>
							<div className="flex flex-wrap gap-1.5">
								{CHANGE_OPTIONS.map((ch) => (
									<button
										key={ch}
										onClick={() => setEditChange(toggleChip(editChange, ch))}
										className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
											editChange.includes(ch)
												? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
												: "border-edge bg-surface-inset text-content-muted hover:border-content-faint hover:text-content-secondary"
										}`}
									>
										{t(`change_${ch}`)}
									</button>
								))}
							</div>
						</div>

						{/* Group By dropdown */}
						<div className="flex flex-col gap-1.5">
							<span className="text-[11px] font-medium uppercase tracking-wide text-content-muted">
								{t("edit_group_by")}
							</span>
							<CustomSelect
								value={editGroupBy}
								onChange={setEditGroupBy}
								size="sm"
								options={GROUP_BY_OPTIONS.map((opt) => ({
									value: opt,
									label: t(`group_by_${opt}`),
								}))}
							/>
						</div>

						{/* Action buttons — pushed to the right */}
						<div className="ml-auto flex items-end gap-2 self-end">
							<button
								onClick={handleCloseEdit}
								className="rounded-md px-3 py-1.5 text-xs font-medium text-content-muted transition-colors hover:text-content-secondary"
							>
								{t("cancel")}
							</button>
							<button
								onClick={handleSaveEdit}
								disabled={editSaving}
								className="rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
							>
								{editSaving ? "..." : t("save_view_btn")}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
