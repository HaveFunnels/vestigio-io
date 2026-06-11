"use client";

import { useEffect, useRef } from "react";

interface SideDrawerProps {
	open: boolean;
	onClose: () => void;
	title: string;
	children: React.ReactNode;
}

export default function SideDrawer({
	open,
	onClose,
	title,
	children,
}: SideDrawerProps) {
	const drawerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
		}
		if (open) document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [open, onClose]);

	// 3.14: Notify copilot of drawer state changes (auto-minimize when drawer opens)
	useEffect(() => {
		if (typeof window !== "undefined") {
			window.dispatchEvent(
				new CustomEvent("vestigio:sidedrawer", { detail: { open } }),
			);
		}
	}, [open]);

	if (!open) return null;

	return (
		<>
			{/* Backdrop */}
			<div
				className='fixed inset-0 z-40 bg-surface-overlay/50'
				onClick={onClose}
			/>

			{/* Drawer — alinhado com PlanSideDrawer:
			    - largura max-w-[720px] w-[50vw] (era sm:max-w-lg ~448px,
			      menor que o do plano)
			    - padding px-6 py-5 universal (era px-4 py-4 sm:px-6)
			    - header com h2 font-serif text-[18px] (era text-base
			      font-semibold sans)
			    - close button h-8 w-8 rounded-md border (era h-5 w-5
			      rounded-lg p-2 sem border) */}
			<div
				ref={drawerRef}
				className='fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-edge bg-surface shadow-2xl sm:w-[50vw] sm:max-w-[720px]'
			>
				{/* Header */}
				<div className='flex items-center justify-between border-b border-edge px-6 py-5'>
					{/* Desktop: native tooltip on hover when title overflows.
					    Mobile: horizontal scroll for the title so users can
					    read long action names without losing context. */}
					<h2
						title={title}
						className='min-w-0 flex-1 truncate font-serif text-[18px] font-medium leading-tight text-content max-sm:overflow-x-auto max-sm:whitespace-nowrap max-sm:[scrollbar-width:none] max-sm:[&::-webkit-scrollbar]:hidden'
					>
						{title}
					</h2>
					<button
						onClick={onClose}
						className='ml-3 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-edge bg-surface-card text-content-muted transition-colors hover:border-edge-focus hover:bg-surface-card-hover hover:text-content'
						aria-label='Close drawer'
					>
						<svg
							className='h-4 w-4'
							fill='none'
							viewBox='0 0 24 24'
							stroke='currentColor'
							strokeWidth={2}
						>
							<path
								strokeLinecap='round'
								strokeLinejoin='round'
								d='M6 18L18 6M6 6l12 12'
							/>
						</svg>
					</button>
				</div>

				{/* Content */}
				<div className='flex-1 overflow-y-auto px-6 py-5'>
					{children}
				</div>
			</div>
		</>
	);
}
