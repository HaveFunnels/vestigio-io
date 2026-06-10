"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
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
	// Null until resolved on mount; child sections that need envId are
	// gated below so they don't fire API calls with "default_env" (which
	// the backend rejects with "Environment not found", surfacing as a
	// flash of error before the real env loads).
	const [envId, setEnvId] = useState<string | null>(null);
	const [envDomain, setEnvDomain] = useState<string | null>(null);
	const searchParams = useSearchParams();

	useEffect(() => {
		const resolved = getEnvId();
		// Treat "default_env" as unresolved — backend has no row for it.
		if (resolved && resolved !== "default_env" && resolved !== "default") {
			setEnvId(resolved);
		}
		// Best-effort env domain — used by Brand section to show which
		// root domain Vestigio monitors. Also resolves envId when the
		// cookie/URL fallback didn't pin one (uses the org's first env).
		void fetch("/api/organization/environments")
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				if (!data?.environments) return;
				const list = data.environments as Array<{ id: string; domain: string }>;
				const fromUrlOrCookie = getEnvId();
				const current = list.find((e) => e.id === fromUrlOrCookie);
				const fallback = current ?? list[0];
				if (fallback?.id) {
					setEnvId(fallback.id);
					if (fallback.domain) setEnvDomain(fallback.domain);
				}
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
		<div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6 sm:py-14">
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
				<h1 className="mt-2 font-serif text-[24px] font-medium tracking-tight text-content sm:text-[32px]">
					Áreas monitoradas
				</h1>
				<p className="mt-2 max-w-[640px] text-[14px] leading-snug text-content-secondary">
					O que Vestigio observa por você: concorrentes, marca e fontes de dados conectadas. Cada alteração passa a valer no próximo ciclo de análise.
				</p>

				{/* Inline section nav — clicking scrolls. Touch-target sized
				    on mobile (min-h-9) so anchors don't fall under the
				    ~10mm minimum thumb hit zone. */}
				<nav className="mt-5 -mx-1 flex flex-wrap gap-1.5 px-1">
					{SECTIONS.map((s) => (
						<a
							key={s.id}
							href={`#${s.id}`}
							className="inline-flex min-h-[36px] items-center rounded-md border border-edge bg-surface-inset/40 px-3 py-1.5 text-[12.5px] font-medium text-content-secondary transition-colors hover:border-edge-focus hover:text-content sm:min-h-0 sm:px-2.5 sm:py-1 sm:text-[11.5px]"
						>
							{s.label}
						</a>
					))}
				</nav>
			</motion.div>

			<div id="concorrentes">
				{envId ? (
					<CompetitorsSection envId={envId} />
				) : (
					<div className="mb-12 space-y-3">
						<div className="h-7 w-48 animate-pulse rounded bg-surface-card" />
						<div className="h-40 w-full animate-pulse rounded-2xl bg-surface-card" />
					</div>
				)}
			</div>
			<div id="marca">
				<BrandSection envDomain={envDomain} />
			</div>
			<div id="fontes">
				{envId ? (
					<DataSourcesSection envId={envId} />
				) : (
					<div className="mb-12 space-y-3">
						<div className="h-7 w-48 animate-pulse rounded bg-surface-card" />
						<div className="h-40 w-full animate-pulse rounded-2xl bg-surface-card" />
					</div>
				)}
			</div>
		</div>
	);
}
