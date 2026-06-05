"use client";

/**
 * /lp/audit/preview — dev-only scenario picker.
 *
 * Lets us inspect the mini-audit pages (loading + result) without
 * walking through the funnel each time. Each scenario links to
 * `/lp/audit/result/<leadId>?preview=<id>&theme=<light|dark>`,
 * which the result page short-circuits with mocked data.
 *
 * In production this route still renders, but the result page
 * ignores the `?preview=` param when NODE_ENV === "production", so
 * there's no risk of leaking the mocks publicly. Delete this whole
 * route + lp-audit-preview-scenarios.ts after design validation.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { PREVIEW_SCENARIO_LIST } from "@/lib/lp-audit-preview-scenarios";

export default function PreviewPicker() {
	const [theme, setTheme] = useState<"light" | "dark">("dark");

	// Sync html.dark to the picker's selection so the picker itself
	// also flips, not just the linked result page.
	useEffect(() => {
		const html = document.documentElement;
		if (theme === "light") html.classList.remove("dark");
		else html.classList.add("dark");
	}, [theme]);

	return (
		<div className="min-h-screen bg-surface-shell px-5 py-12 sm:py-16">
			<div className="mx-auto max-w-2xl">
				<div className="mb-2 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.18em] text-content-muted">
					dev-only · não indexado · será deletado
				</div>
				<h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-medium leading-tight text-content sm:text-4xl">
					Mini-audit preview
				</h1>
				<p className="mt-3 text-[15px] leading-relaxed text-content-secondary">
					Cada card abre a página de resultado (ou de loading)
					populada com dados sintéticos. O fetch real para{" "}
					<code className="rounded bg-surface-inset px-1.5 py-0.5 font-mono text-[12px]">
						/api/lead/[id]
					</code>{" "}
					fica desativado quando há{" "}
					<code className="rounded bg-surface-inset px-1.5 py-0.5 font-mono text-[12px]">
						?preview=
					</code>{" "}
					na URL.
				</p>

				{/* Theme toggle */}
				<div className="mt-8 flex items-center gap-2 rounded-2xl border border-edge bg-surface-card p-2">
					<span className="px-2 text-[12px] font-medium text-content-muted">
						theme
					</span>
					<button
						type="button"
						onClick={() => setTheme("light")}
						className={`rounded-xl px-3 py-1.5 text-[13px] font-semibold transition-colors ${
							theme === "light"
								? "bg-emerald-100 text-zinc-900 dark:bg-emerald-500/20 dark:text-content"
								: "text-content-muted hover:bg-surface-card-hover"
						}`}
					>
						light
					</button>
					<button
						type="button"
						onClick={() => setTheme("dark")}
						className={`rounded-xl px-3 py-1.5 text-[13px] font-semibold transition-colors ${
							theme === "dark"
								? "bg-emerald-100 text-zinc-900 dark:bg-emerald-500/20 dark:text-content"
								: "text-content-muted hover:bg-surface-card-hover"
						}`}
					>
						dark
					</button>
				</div>

				{/* Scenarios */}
				<div className="mt-6 grid gap-3 sm:grid-cols-2">
					{PREVIEW_SCENARIO_LIST.map((s) => (
						<Link
							key={s.id}
							href={`/lp/audit/result/${s.lead.id}?preview=${s.id}&theme=${theme}`}
							className="group block rounded-2xl border border-edge bg-surface-card p-5 transition-all hover:border-emerald-500/50 hover:bg-emerald-50/40 dark:hover:bg-emerald-500/5"
						>
							<div className="mb-1.5 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
								{s.id}
							</div>
							<div className="text-[15px] font-semibold leading-tight text-content">
								{s.label}
							</div>
							<div className="mt-1 text-[13px] leading-snug text-content-muted">
								{s.description}
							</div>
							<div className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-emerald-700 group-hover:text-emerald-600 dark:text-emerald-300">
								abrir
								<svg
									className="h-3 w-3"
									viewBox="0 0 16 16"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="M3 8h10M9 4l4 4-4 4" />
								</svg>
							</div>
						</Link>
					))}
				</div>

				<div className="mt-8 rounded-2xl border border-dashed border-edge bg-surface-inset/40 p-4 text-[12px] leading-relaxed text-content-muted">
					<strong className="font-semibold text-content-secondary">
						Notas:
					</strong>{" "}
					Botões "Criar conta" / "Desbloquear" não disparam Paddle no
					modo preview (apenas logam no console). O widget flutuante
					no canto inferior direito troca theme e volta para esta
					página sem perder contexto.
				</div>
			</div>
		</div>
	);
}
