"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import type { ReactNode } from "react";

// ──────────────────────────────────────────────
// PlanSideDrawer — unified drawer chrome for the Monthly Strategy
// Plan surface. Replaces the per-context drawers (ActionDrawer,
// FindingDetailPanel via SideDrawer, etc.) which each had their own
// width, animation, header treatment.
//
// Layout:
//   - Desktop (>=640px): slides from the right, fills 50% of the
//     viewport up to a 720px cap so very wide monitors don't render
//     a half-page slab. Click-outside / Esc dismiss.
//   - Mobile (<640px): bottom sheet, 85% viewport height, slides up.
//     Drag-handle indicator at the top for affordance; tap backdrop
//     dismisses.
//
// Visual language matches the mini-audit cards (rounded-2xl,
// border-edge, surface-card, editorial Fraunces for narrative,
// JetBrains Mono for tabular numbers) so the buyer feels they're
// drilling into the same product, not a different one.
//
// Content is fully controlled by callers via `children` — this
// component owns chrome only.
// ──────────────────────────────────────────────

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Tiny uppercase eyebrow above the title (e.g. "Ações deste passo"). */
	eyebrow?: string;
	title: string;
	description?: string;
	children: ReactNode;
	/** Optional thin footer hint anchored at the bottom. */
	footer?: ReactNode;
}

export default function PlanSideDrawer({
	open,
	onOpenChange,
	eyebrow,
	title,
	description,
	children,
	footer,
}: Props) {
	// Lock body scroll while the drawer is open so the underlying plan
	// canvas doesn't double-scroll on touch devices.
	useEffect(() => {
		if (!open) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => { document.body.style.overflow = prev; };
	}, [open]);

	// Decide presentation form based on viewport. We avoid useState +
	// resize listener and instead let CSS pick (sm: breakpoint) by
	// rendering both motions and only animating the active one. Saves
	// a hydration step + matches Tailwind's mobile-first defaults.
	// Both panels are rendered, but each is hidden at the wrong
	// breakpoint via the responsive classes.
	const [isMobile, setIsMobile] = useState(false);
	useEffect(() => {
		const mq = window.matchMedia("(max-width: 639px)");
		const sync = () => setIsMobile(mq.matches);
		sync();
		mq.addEventListener("change", sync);
		return () => mq.removeEventListener("change", sync);
	}, []);

	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<AnimatePresence>
				{open && (
					<Dialog.Portal forceMount>
						<Dialog.Overlay asChild>
							<motion.div
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: 0.2 }}
								className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
							/>
						</Dialog.Overlay>
						<Dialog.Content asChild>
							{isMobile ? (
								<motion.div
									initial={{ y: "100%" }}
									animate={{ y: 0 }}
									exit={{ y: "100%" }}
									transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
									className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl border-t border-edge bg-surface shadow-2xl"
								>
									<DragHandle />
									<DrawerHeader eyebrow={eyebrow} title={title} description={description} />
									<div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
									{footer && <DrawerFooter>{footer}</DrawerFooter>}
								</motion.div>
							) : (
								<motion.div
									initial={{ x: "100%" }}
									animate={{ x: 0 }}
									exit={{ x: "100%" }}
									transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
									className="fixed right-0 top-0 z-50 flex h-full w-[50vw] min-w-[420px] max-w-[720px] flex-col border-l border-edge bg-surface shadow-2xl"
								>
									<DrawerHeader eyebrow={eyebrow} title={title} description={description} />
									<div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
									{footer && <DrawerFooter>{footer}</DrawerFooter>}
								</motion.div>
							)}
						</Dialog.Content>
					</Dialog.Portal>
				)}
			</AnimatePresence>
		</Dialog.Root>
	);
}

function DragHandle() {
	return (
		<div className="flex justify-center pb-1 pt-3">
			<div className="h-1 w-10 rounded-full bg-content-faint/40" />
		</div>
	);
}

function DrawerHeader({
	eyebrow,
	title,
	description,
}: {
	eyebrow?: string;
	title: string;
	description?: string;
}) {
	return (
		<div className="flex items-start justify-between gap-4 border-b border-edge px-6 py-5">
			<div className="min-w-0 flex-1">
				{eyebrow && (
					<div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-content-faint">
						{eyebrow}
					</div>
				)}
				<Dialog.Title className="truncate font-serif text-[18px] font-medium leading-tight text-content">
					{title}
				</Dialog.Title>
				{description && (
					<Dialog.Description className="mt-1 text-[12px] text-content-muted">
						{description}
					</Dialog.Description>
				)}
			</div>
			<Dialog.Close asChild>
				<button
					type="button"
					aria-label="Fechar"
					className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-edge bg-surface-card text-content-muted transition-colors hover:border-edge-focus hover:bg-surface-card-hover hover:text-content"
				>
					<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
						<path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
					</svg>
				</button>
			</Dialog.Close>
		</div>
	);
}

function DrawerFooter({ children }: { children: ReactNode }) {
	return (
		<div className="border-t border-edge px-6 py-3 text-[11px] text-content-faint">{children}</div>
	);
}
