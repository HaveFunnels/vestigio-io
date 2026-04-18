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

	if (!open) return null;

	return (
		<>
			{/* Backdrop */}
			<div
				className='fixed inset-0 z-40 bg-surface-overlay/50'
				onClick={onClose}
			/>

			{/* Drawer */}
			<div
				ref={drawerRef}
				className='fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-edge bg-surface shadow-2xl sm:max-w-lg'
			>
				{/* Header */}
				<div className='flex items-center justify-between border-b border-edge px-4 py-4 sm:px-6'>
					<h2 className='truncate text-base font-semibold text-content'>
						{title}
					</h2>
					<button
						onClick={onClose}
						className='ml-3 shrink-0 rounded-lg p-2 text-content-faint hover:bg-surface-card-hover hover:text-content-tertiary'
						aria-label='Close drawer'
					>
						<svg
							className='h-5 w-5'
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
				<div className='flex-1 overflow-y-auto px-4 py-4 sm:px-6'>
					{children}
				</div>
			</div>
		</>
	);
}
