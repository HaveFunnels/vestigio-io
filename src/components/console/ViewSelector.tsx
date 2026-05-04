"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
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
} from "@phosphor-icons/react/dist/ssr";
import toast from "react-hot-toast";

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
	currentUserId?: string;
}

export default function ViewSelector({
	views,
	activeViewId,
	onViewChange,
	onSaveView,
	onViewUpdated,
	currentUserId,
}: ViewSelectorProps) {
	const t = useTranslations("console.findings.views");
	const [optionsViewId, setOptionsViewId] = useState<string | null>(null);
	const optionsRef = useRef<HTMLDivElement>(null);

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
			toast.error("Failed to update view");
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
			toast.error("Failed to update view");
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
			toast.error("Failed to delete view");
		}
		setOptionsViewId(null);
	}

	return (
		<div className="mb-4 flex items-center gap-1 overflow-x-auto border-b border-edge">
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
					<div key={view.id} className="relative flex items-center">
						<button
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

						{/* Options button for active custom view */}
						{isActive && owned && (
							<div className="relative" ref={optionsViewId === view.id ? optionsRef : undefined}>
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

			{/* Plus button — opens Save View modal directly */}
			<div className="ml-1">
				<button
					onClick={() => onSaveView()}
					className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-content-muted transition-colors hover:bg-surface-card-hover hover:text-content-secondary"
					title={t("save_view")}
				>
					<PlusIcon size={16} weight="bold" />
				</button>
			</div>
		</div>
	);
}
