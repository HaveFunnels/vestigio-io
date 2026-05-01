"use client";

import {
	useState,
	useEffect,
	useRef,
	useMemo,
	useCallback,
	type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { useReactFlow, type Node } from "@xyflow/react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "motion/react";

interface MapSearchProps {
	nodes: Node[];
	open: boolean;
	onClose: () => void;
}

/** Simple fuzzy match — checks if all chars appear in order */
function fuzzyMatch(query: string, target: string): boolean {
	const q = query.toLowerCase();
	const t = target.toLowerCase();
	let qi = 0;
	for (let ti = 0; ti < t.length && qi < q.length; ti++) {
		if (t[ti] === q[qi]) qi++;
	}
	return qi === q.length;
}

export default function MapSearch({ nodes, open, onClose }: MapSearchProps) {
	const t = useTranslations("console.maps.toolbar");
	const { setCenter } = useReactFlow();
	const [query, setQuery] = useState("");
	const [activeIndex, setActiveIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);

	// Focus input when opened
	useEffect(() => {
		if (open) {
			setQuery("");
			setActiveIndex(0);
			setTimeout(() => inputRef.current?.focus(), 50);
		}
	}, [open]);

	// Close on ESC
	useEffect(() => {
		if (!open) return;
		const handler = (e: globalThis.KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onClose();
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [open, onClose]);

	const results = useMemo(() => {
		if (!query.trim()) return [];
		return nodes.filter((n) => {
			const label = (n.data?.label as string) || "";
			const type = n.type || "";
			return fuzzyMatch(query, label) || fuzzyMatch(query, type);
		});
	}, [query, nodes]);

	// Reset index when results change
	useEffect(() => {
		setActiveIndex(0);
	}, [results.length]);

	const selectNode = useCallback(
		(node: Node) => {
			onClose();
			const x = (node.position?.x || 0) + ((node.measured?.width || 200) / 2);
			const y = (node.position?.y || 0) + ((node.measured?.height || 50) / 2);
			setCenter(x, y, { zoom: 1.5, duration: 500 });

			// Pulse effect via temporary class
			setTimeout(() => {
				const el = document.querySelector(
					`[data-id="${node.id}"]`
				) as HTMLElement;
				if (el) {
					el.classList.add("map-search-pulse");
					setTimeout(() => el.classList.remove("map-search-pulse"), 1500);
				}
			}, 550);
		},
		[onClose, setCenter]
	);

	const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setActiveIndex((i) => Math.min(i + 1, results.length - 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setActiveIndex((i) => Math.max(i - 1, 0));
		} else if (e.key === "Enter" && results[activeIndex]) {
			e.preventDefault();
			selectNode(results[activeIndex]);
		}
	};

	return (
		<AnimatePresence>
			{open && (
				<motion.div
					initial={{ opacity: 0, y: -8 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -8 }}
					transition={{ duration: 0.15 }}
					className='absolute inset-x-0 top-14 z-50 mx-auto w-full max-w-md px-4'
				>
					<div className='overflow-hidden rounded-xl border border-edge bg-surface-card/95 shadow-2xl backdrop-blur-md'>
						{/* Search input */}
						<div className='flex items-center gap-2 border-b border-edge px-3 py-2.5'>
							<MagnifyingGlass
								size={16}
								className='shrink-0 text-content-muted'
							/>
							<input
								ref={inputRef}
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								onKeyDown={handleKeyDown}
								placeholder={t("search_placeholder")}
								className='flex-1 bg-transparent text-sm text-content outline-none placeholder:text-content-muted'
							/>
							<button
								onClick={onClose}
								className='rounded p-0.5 text-content-muted hover:text-content-secondary'
							>
								<X size={14} />
							</button>
						</div>

						{/* Results */}
						{query.trim() && (
							<div className='max-h-60 overflow-y-auto p-1'>
								{results.length === 0 ? (
									<div className='px-3 py-4 text-center text-xs text-content-muted'>
										{t("search_no_results")}
									</div>
								) : (
									results.slice(0, 20).map((node, i) => (
										<button
											key={node.id}
											onClick={() => selectNode(node)}
											className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
												i === activeIndex
													? "bg-surface-card-hover text-content"
													: "text-content-secondary hover:bg-surface-card-hover"
											}`}
										>
											<span className='truncate font-medium'>
												{(node.data?.label as string) || node.id}
											</span>
											{node.type && (
												<span className='shrink-0 rounded border border-edge px-1.5 py-0.5 text-[10px] text-content-muted'>
													{node.type}
												</span>
											)}
										</button>
									))
								)}
							</div>
						)}
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}

/** Trigger button for the toolbar */
export function MapSearchButton({ onClick }: { onClick: () => void }) {
	const t = useTranslations("console.maps.toolbar");
	return (
		<button
			onClick={onClick}
			className='flex items-center gap-1.5 rounded-lg border border-edge px-2.5 py-1.5 text-xs font-medium text-content-muted transition-colors hover:border-edge-strong hover:bg-surface-card-hover hover:text-content-secondary'
			aria-label={t("search")}
			title='Cmd+K'
		>
			<MagnifyingGlass size={14} weight='bold' />
			<span className='hidden sm:inline'>{t("search")}</span>
		</button>
	);
}
