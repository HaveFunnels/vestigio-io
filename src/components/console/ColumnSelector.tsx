"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { SlidersHorizontalIcon } from "@phosphor-icons/react/dist/ssr";

// ──────────────────────────────────────────────
// ColumnSelector — popover to show/hide DataTable columns
//
// Renders a "Columns" button that opens a dropdown with toggle
// switches for each available column. Changes auto-save to the
// active view via PATCH (debounced 500ms).
// ──────────────────────────────────────────────

export interface ColumnConfig {
	key: string;
	labelKey: string;
	defaultOn: boolean;
	alwaysOn?: boolean; // e.g. "title" is never toggleable
}

export const AVAILABLE_COLUMNS: ColumnConfig[] = [
	{ key: "title", labelKey: "title", defaultOn: true, alwaysOn: true },
	{ key: "severity", labelKey: "severity", defaultOn: true },
	{ key: "impact", labelKey: "impact", defaultOn: true },
	{ key: "pack", labelKey: "pack", defaultOn: true },
	{ key: "surface", labelKey: "surface", defaultOn: true },
	{ key: "change", labelKey: "change", defaultOn: true },
	{ key: "verification", labelKey: "verification", defaultOn: false },
	{ key: "root_cause", labelKey: "root_cause", defaultOn: false },
	{ key: "confidence_tier", labelKey: "confidence_tier", defaultOn: false },
	{ key: "first_seen", labelKey: "first_seen", defaultOn: false },
];

export const DEFAULT_COLUMNS = AVAILABLE_COLUMNS.filter((c) => c.defaultOn).map(
	(c) => c.key,
);

interface ColumnSelectorProps {
	activeColumns: string[];
	onColumnsChange: (columns: string[]) => void;
}

export default function ColumnSelector({
	activeColumns,
	onColumnsChange,
}: ColumnSelectorProps) {
	const t = useTranslations("console.findings.views");
	const [open, setOpen] = useState(false);
	const popoverRef = useRef<HTMLDivElement>(null);

	// Close on outside click
	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (
				popoverRef.current &&
				!popoverRef.current.contains(e.target as Node)
			) {
				setOpen(false);
			}
		}
		if (open) {
			document.addEventListener("mousedown", handleClickOutside);
			return () =>
				document.removeEventListener("mousedown", handleClickOutside);
		}
	}, [open]);

	function toggleColumn(key: string) {
		const col = AVAILABLE_COLUMNS.find((c) => c.key === key);
		if (!col || col.alwaysOn) return;

		let next: string[];
		if (activeColumns.includes(key)) {
			next = activeColumns.filter((c) => c !== key);
		} else {
			// Insert in the order defined by AVAILABLE_COLUMNS
			next = AVAILABLE_COLUMNS.filter(
				(c) => activeColumns.includes(c.key) || c.key === key,
			).map((c) => c.key);
		}
		onColumnsChange(next);
	}

	return (
		<div className="relative" ref={popoverRef}>
			<button
				onClick={() => setOpen(!open)}
				className="flex items-center gap-1.5 rounded-md border border-edge px-2.5 py-1.5 text-xs font-medium text-content-muted transition-colors hover:bg-surface-card-hover hover:text-content-secondary"
			>
				<SlidersHorizontalIcon size={14} />
				<span>{t("columns")}</span>
			</button>

			{open && (
				<div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-edge bg-surface-card py-1 shadow-xl">
					{AVAILABLE_COLUMNS.filter((c) => !c.alwaysOn).map((col) => {
						const isOn = activeColumns.includes(col.key);
						return (
							<button
								key={col.key}
								onClick={() => toggleColumn(col.key)}
								className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-content-secondary transition-colors hover:bg-surface-card-hover"
							>
								<span>{t(`column_names.${col.labelKey}`)}</span>
								<span
									className={`flex h-5 w-9 items-center rounded-full px-0.5 transition-colors ${
										isOn ? "bg-emerald-500" : "bg-surface-inset"
									}`}
								>
									<span
										className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
											isOn ? "translate-x-4" : "translate-x-0"
										}`}
									/>
								</span>
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}
