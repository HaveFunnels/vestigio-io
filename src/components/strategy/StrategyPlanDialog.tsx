"use client";

import { useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import StrategyPlanPanel from "./StrategyPlanPanel";
import type { StrategyPlan } from "./types";

/*
 * Full-screen Dialog wrapper for the strategy plan
 *
 * Renders the StrategyPlanPanel as a full-viewport overlay launched
 * from the strip on /app/actions. Keeps the operator's URL on
 * /app/actions (with ?plan=<month> as a state marker) so closing
 * the dialog returns them to the actions queue they were on, without
 * a page transition or losing their filter state.
 *
 * Slides up from below + fades the backdrop; matches the animation
 * vocabulary of the rest of the plan (cubic-bezier(0.22,1,0.36,1),
 * 320–350ms range).
 */

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	plan: StrategyPlan;
}

export default function StrategyPlanDialog({ open, onOpenChange, plan }: Props) {
	// Lock body scroll while the dialog is open — without this the
	// actions page underneath can scroll behind the overlay.
	useEffect(() => {
		if (!open) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => { document.body.style.overflow = prev; };
	}, [open]);

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
								transition={{ duration: 0.22 }}
								className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm"
							/>
						</Dialog.Overlay>
						<Dialog.Content asChild>
							<motion.div
								initial={{ opacity: 0, y: 24 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: 24 }}
								transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
								className="fixed inset-0 z-50 overflow-y-auto bg-surface"
							>
								{/* a11y: aria title/description are required by
								    Radix Dialog. Visually hidden because the
								    panel itself carries the document hierarchy. */}
								<Dialog.Title className="sr-only">
									Plano de Estratégia
								</Dialog.Title>
								<Dialog.Description className="sr-only">
									Documento mensal de estratégia para o ambiente.
									Use o botão de fechar no topo direito para retornar.
								</Dialog.Description>
								<StrategyPlanPanel
									plan={plan}
									onClose={() => onOpenChange(false)}
								/>
							</motion.div>
						</Dialog.Content>
					</Dialog.Portal>
				)}
			</AnimatePresence>
		</Dialog.Root>
	);
}
