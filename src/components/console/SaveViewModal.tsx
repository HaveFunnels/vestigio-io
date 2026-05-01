"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
	FlameIcon,
	StarIcon,
	BookmarkIcon,
	FlagIcon,
	FunnelSimpleIcon,
} from "@phosphor-icons/react/dist/ssr";

// ──────────────────────────────────────────────
// SaveViewModal — modal/popover for saving the current filter state
// as a named view with icon + color.
// ──────────────────────────────────────────────

const ICON_OPTIONS: { name: string; component: React.ComponentType<any> }[] = [
	{ name: "Flame", component: FlameIcon },
	{ name: "Star", component: StarIcon },
	{ name: "Bookmark", component: BookmarkIcon },
	{ name: "Flag", component: FlagIcon },
	{ name: "FunnelSimple", component: FunnelSimpleIcon },
];

const COLOR_OPTIONS = [
	{ name: "red", hex: "#ef4444" },
	{ name: "blue", hex: "#3b82f6" },
	{ name: "purple", hex: "#a855f7" },
	{ name: "emerald", hex: "#10b981" },
	{ name: "amber", hex: "#f59e0b" },
];

interface SaveViewModalProps {
	open: boolean;
	onClose: () => void;
	onSave: (data: { name: string; icon: string; color: string }) => void;
	loading?: boolean;
}

export default function SaveViewModal({
	open,
	onClose,
	onSave,
	loading = false,
}: SaveViewModalProps) {
	const t = useTranslations("console.findings.views");
	const [name, setName] = useState("");
	const [selectedIcon, setSelectedIcon] = useState("Flame");
	const [selectedColor, setSelectedColor] = useState("#ef4444");

	if (!open) return null;

	function handleSave() {
		if (!name.trim()) return;
		onSave({ name: name.trim(), icon: selectedIcon, color: selectedColor });
		setName("");
		setSelectedIcon("Flame");
		setSelectedColor("#ef4444");
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			{/* Backdrop */}
			<div
				className="absolute inset-0 bg-black/50 backdrop-blur-sm"
				onClick={onClose}
			/>

			{/* Modal */}
			<div className="relative w-full max-w-sm rounded-xl border border-edge bg-surface-card p-6 shadow-2xl">
				<h3 className="mb-4 text-lg font-semibold text-content">
					{t("save_view")}
				</h3>

				{/* Name input */}
				<label className="mb-1 block text-xs font-medium text-content-muted">
					{t("view_name")}
				</label>
				<input
					type="text"
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder={t("view_name")}
					autoFocus
					className="mb-4 w-full rounded-md border border-edge bg-surface-inset px-3 py-2 text-sm text-content placeholder:text-content-faint focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
				/>

				{/* Icon picker */}
				<label className="mb-1 block text-xs font-medium text-content-muted">
					{t("select_icon")}
				</label>
				<div className="mb-4 flex gap-2">
					{ICON_OPTIONS.map(({ name: iconName, component: Icon }) => (
						<button
							key={iconName}
							onClick={() => setSelectedIcon(iconName)}
							className={`flex h-9 w-9 items-center justify-center rounded-md border transition-colors ${
								selectedIcon === iconName
									? "border-blue-500 bg-blue-500/10"
									: "border-edge hover:bg-surface-card-hover"
							}`}
						>
							<Icon
								size={18}
								weight={selectedIcon === iconName ? "fill" : "regular"}
								style={{ color: selectedColor }}
							/>
						</button>
					))}
				</div>

				{/* Color picker */}
				<label className="mb-1 block text-xs font-medium text-content-muted">
					{t("select_color")}
				</label>
				<div className="mb-6 flex gap-2">
					{COLOR_OPTIONS.map(({ name: colorName, hex }) => (
						<button
							key={colorName}
							onClick={() => setSelectedColor(hex)}
							className={`h-7 w-7 rounded-full border-2 transition-transform ${
								selectedColor === hex
									? "scale-110 border-content"
									: "border-transparent hover:scale-105"
							}`}
							style={{ backgroundColor: hex }}
						/>
					))}
				</div>

				{/* Actions */}
				<div className="flex items-center justify-end gap-3">
					<button
						onClick={onClose}
						className="rounded-md px-4 py-2 text-sm font-medium text-content-muted transition-colors hover:text-content-secondary"
					>
						{t("cancel")}
					</button>
					<button
						onClick={handleSave}
						disabled={!name.trim() || loading}
						className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
					>
						{loading ? "..." : t("save")}
					</button>
				</div>
			</div>
		</div>
	);
}
