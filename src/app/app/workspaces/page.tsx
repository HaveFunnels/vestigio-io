"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import * as Tooltip from "@radix-ui/react-tooltip";
import CompetitorsSection, {
	getEnvId,
} from "@/components/workspaces/CompetitorsSection";
import BrandSection from "@/components/workspaces/BrandSection";
import DataSourcesSection from "@/components/workspaces/DataSourcesSection";

/*
 * Workspaces hub — central configuration surface (replaces the old
 * redirect to /app/findings?lens=revenue).
 *
 * IA reform 2026-06-10: this is one of the 3 primary sidenav items
 * alongside Plano and Actions. The hub explicitly answers "what does
 * Vestigio look at, and how do I tune that?" — competitor list, brand
 * scan, data sources. Everything the customer configures lives here.
 *
 * Visual language mirrors the Plan: max-w-1100, motion.section per
 * block, eyebrow + serif title + bordered card. Deep links from the
 * Plan land on #-anchors that scroll to the section.
 */

const SECTIONS = [
	{ id: "concorrentes", label: "Concorrentes" },
	{ id: "marca", label: "Proteção de marca" },
	{ id: "fontes", label: "Fontes de dados" },
];

export default function WorkspacesHubPage() {
	const [envId, setEnvId] = useState<string>("default_env");
	const [envDomain, setEnvDomain] = useState<string | null>(null);
	const searchParams = useSearchParams();

	useEffect(() => {
		setEnvId(getEnvId());
		// Best-effort env domain — used only by the Brand section to
		// remind the customer which root domain Vestigio scans. Falls
		// back to "—" gracefully when not resolvable.
		void fetch("/api/organization/environments")
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				if (!data?.environments) return;
				const list = data.environments as Array<{ id: string; domain: string }>;
				const current = list.find((e) => e.id === getEnvId());
				if (current?.domain) setEnvDomain(current.domain);
			})
			.catch(() => {});
	}, []);

	// Honour deep-link anchor — scroll smoothly when the URL has a hash
	// or a ?section query param.
	useEffect(() => {
		const section = searchParams?.get("section");
		const hash =
			typeof window !== "undefined" ? window.location.hash.slice(1) : "";
		const target = hash || section;
		if (!target) return;
		const el = document.getElementById(target);
		if (el) {
			setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
		}
	}, [searchParams]);

	return (
		<div className="mx-auto max-w-[1100px] px-6 py-10 sm:py-14">
			{/* Header — matches Plan typography so the customer reads it as
			    "another room in the same building". */}
			<motion.div
				initial={{ opacity: 0, y: 12 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
				className="mb-10"
			>
				<div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-content-faint">
					Configuração
				</div>
				<h1 className="mt-2 flex items-center gap-2 font-serif text-[28px] font-medium tracking-tight text-content sm:text-[32px]">
					<span>Workspaces</span>
					{/* Tooltip — "Workspaces" is borrowed from Notion/Slack vocab
					    where it means "team space". Here it means "what Vestigio
					    monitors for you". The microcopy gap costs first-impression
					    clarity, so an inline tooltip closes it without renaming. */}
					<Tooltip.Provider delayDuration={150}>
						<Tooltip.Root>
							<Tooltip.Trigger asChild>
								<button
									type="button"
									aria-label="O que são Workspaces"
									className="flex h-5 w-5 items-center justify-center rounded-full border border-edge text-[11px] font-semibold text-content-faint transition-colors hover:border-edge-focus hover:text-content"
								>
									?
								</button>
							</Tooltip.Trigger>
							<Tooltip.Portal>
								<Tooltip.Content
									side="bottom"
									align="start"
									sideOffset={6}
									className="max-w-[280px] rounded-md border border-edge bg-surface-card px-3 py-2 text-[12.5px] leading-snug text-content shadow-lg"
								>
									Cada workspace agrupa o que Vestigio observa por você: concorrentes monitorados, identidade da marca e fontes de dados conectadas.
									<Tooltip.Arrow className="fill-surface-card" />
								</Tooltip.Content>
							</Tooltip.Portal>
						</Tooltip.Root>
					</Tooltip.Provider>
				</h1>
				<p className="mt-2 max-w-[640px] text-[14px] leading-snug text-content-secondary">
					Aqui você ajusta o que Vestigio observa. Cada alteração passa a
					valer no próximo ciclo de análise.
				</p>

				{/* Inline section nav — clicking scrolls. Lightweight; full
				    TOC rail comes later if needed. */}
				<nav className="mt-5 flex flex-wrap gap-1.5">
					{SECTIONS.map((s) => (
						<a
							key={s.id}
							href={`#${s.id}`}
							className="rounded-md border border-edge bg-surface-inset/40 px-2.5 py-1 text-[11.5px] font-medium text-content-secondary transition-colors hover:border-edge-focus hover:text-content"
						>
							{s.label}
						</a>
					))}
				</nav>
			</motion.div>

			<div id="concorrentes">
				<CompetitorsSection envId={envId} />
			</div>
			<div id="marca">
				<BrandSection envDomain={envDomain} />
			</div>
			<div id="fontes">
				<DataSourcesSection />
			</div>
		</div>
	);
}
