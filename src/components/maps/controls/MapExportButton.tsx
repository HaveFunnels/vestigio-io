"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Export } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import html2canvas from "html2canvas";

interface MapExportButtonProps {
	mapTitle: string;
}

export default function MapExportButton({ mapTitle }: MapExportButtonProps) {
	const t = useTranslations("console.maps.toolbar");
	const [open, setOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	// Close dropdown on outside click
	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(e.target as Node)
			) {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	const sanitizedTitle = mapTitle
		.replace(/[^a-zA-Z0-9_-]/g, "_")
		.toLowerCase();
	const dateStr = new Date().toISOString().slice(0, 10);

	const downloadPng = useCallback(async () => {
		setOpen(false);
		const container = document.querySelector(".react-flow") as HTMLElement;
		if (!container) return;

		const canvas = await html2canvas(container, {
			backgroundColor: "#18181b",
			useCORS: true,
			scale: 2,
		});

		canvas.toBlob((blob) => {
			if (!blob) return;
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `vestigio-map-${sanitizedTitle}-${dateStr}.png`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		});
	}, [sanitizedTitle, dateStr]);

	const downloadSvg = useCallback(() => {
		setOpen(false);
		const svgEl = document.querySelector(
			".react-flow__renderer svg, .react-flow__viewport"
		) as SVGElement | HTMLElement | null;
		if (!svgEl) return;

		// Try to get the viewport SVG or fall back to grabbing edges/nodes from the viewport
		const viewport = document.querySelector(
			".react-flow__viewport"
		) as HTMLElement;
		if (!viewport) return;

		const rfContainer = document.querySelector(".react-flow") as HTMLElement;
		const width = rfContainer?.clientWidth || 1200;
		const height = rfContainer?.clientHeight || 800;

		const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#18181b"/>
  <foreignObject width="100%" height="100%">
    <div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;overflow:hidden;">
      ${viewport.outerHTML}
    </div>
  </foreignObject>
</svg>`;

		const blob = new Blob([svgContent], { type: "image/svg+xml" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `vestigio-map-${sanitizedTitle}-${dateStr}.svg`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}, [sanitizedTitle, dateStr]);

	return (
		<div className='relative' ref={dropdownRef}>
			<button
				onClick={() => setOpen((prev) => !prev)}
				className='flex items-center gap-1.5 rounded-lg border border-edge px-2.5 py-1.5 text-xs font-medium text-content-muted transition-colors hover:border-edge-strong hover:bg-surface-card-hover hover:text-content-secondary'
				aria-label={t("export")}
			>
				<Export size={14} weight='bold' />
				<span className='hidden sm:inline'>{t("export")}</span>
			</button>

			{open && (
				<div className='absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-lg border border-edge bg-surface-card shadow-xl'>
					<button
						onClick={downloadPng}
						className='flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-content-secondary transition-colors hover:bg-surface-card-hover'
					>
						{t("export_png")}
					</button>
					<button
						onClick={downloadSvg}
						className='flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-content-secondary transition-colors hover:bg-surface-card-hover'
					>
						{t("export_svg")}
					</button>
				</div>
			)}
		</div>
	);
}
