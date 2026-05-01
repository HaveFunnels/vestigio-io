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
} from "@phosphor-icons/react/dist/ssr";

// ──────────────────────────────────────────────
// ViewSelector — horizontal tab bar for saved views
//
// Renders at the top of the Findings page. Each tab shows a
// Phosphor icon + translated name. Active tab has colored underline.
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
	order: number;
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
}

export default function ViewSelector({
	views,
	activeViewId,
	onViewChange,
	onSaveView,
}: ViewSelectorProps) {
	const t = useTranslations("console.findings.views");
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	// Close dropdown on outside click
	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(e.target as Node)
			) {
				setDropdownOpen(false);
			}
		}
		if (dropdownOpen) {
			document.addEventListener("mousedown", handleClickOutside);
			return () => document.removeEventListener("mousedown", handleClickOutside);
		}
	}, [dropdownOpen]);

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
						<span>{view.name}</span>
						{view.isShared && (
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
				);
			})}

			{/* Plus button with dropdown */}
			<div className="relative ml-1" ref={dropdownRef}>
				<button
					onClick={() => setDropdownOpen(!dropdownOpen)}
					className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-content-muted transition-colors hover:bg-surface-card-hover hover:text-content-secondary"
					title={t("save_view")}
				>
					<PlusIcon size={16} weight="bold" />
				</button>

				{dropdownOpen && (
					<div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-lg border border-edge bg-surface-card py-1 shadow-xl">
						<button
							onClick={() => {
								setDropdownOpen(false);
								onSaveView();
							}}
							className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-content-secondary transition-colors hover:bg-surface-card-hover"
						>
							<PlusIcon size={14} />
							{t("save_view")}
						</button>
						{customViews.length > 0 && (
							<>
								<div className="my-1 border-t border-edge" />
								{customViews.map((view) => {
									const Icon = view.icon ? ICON_MAP[view.icon] : null;
									return (
										<button
											key={view.id}
											onClick={() => {
												setDropdownOpen(false);
												onViewChange(view);
											}}
											className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-content-secondary transition-colors hover:bg-surface-card-hover"
										>
											{Icon && <Icon size={14} style={{ color: view.color || undefined }} />}
											<span>{view.name}</span>
										</button>
									);
								})}
							</>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
