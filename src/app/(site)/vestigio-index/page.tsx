import { Metadata } from "next";
import Link from "next/link";
import { listAllEssays, listActiveVerticals } from "@/data/vestigio-index";

// ──────────────────────────────────────────────
// /vestigio-index — public landing
//
// The masthead for the editorial Vestigio Index. Lists the latest
// edition prominently, with all editions below grouped by vertical.
// Anchors SEO at vestigio.io/vestigio-index and serves as the
// canonical entry point from internal nav + external links.
//
// Editorial layout (Stratechery/The Generalist register): wide
// editorial column, serif title display, restrained palette. No
// loud CTAs at the top — the hook lives inside each essay (mid-
// essay inline CTA, per editorial-team preference).
// ──────────────────────────────────────────────

export const revalidate = 3600;

export const metadata: Metadata = {
	title: "Vestigio Index — Análise editorial pública",
	description:
		"Análise editorial mensal de mercados brasileiros: ecommerce, SaaS B2B, infoprodutos, agências. Dados próprios, opinião assinada.",
	openGraph: {
		type: "website",
		title: "Vestigio Index — Análise editorial pública",
		description:
			"Análise editorial mensal de mercados brasileiros. Dados próprios, opinião assinada.",
		url: "https://vestigio.io/vestigio-index",
	},
	alternates: {
		canonical: "https://vestigio.io/vestigio-index",
	},
};

function formatPtBrDate(iso: string): string {
	const [y, m, d] = iso.split("-").map(Number);
	const months = [
		"jan", "fev", "mar", "abr", "mai", "jun",
		"jul", "ago", "set", "out", "nov", "dez",
	];
	return `${String(d).padStart(2, "0")} ${months[m - 1]} ${y}`;
}

export default function VestigioIndexLanding() {
	const essays = listAllEssays();
	const verticals = listActiveVerticals();
	const latest = essays[0];

	return (
		<main className="relative bg-[#090911] pb-32 pt-32 sm:pb-40 sm:pt-40">
			{/* Ambient editorial halo — single restrained source. */}
			<div
				className="pointer-events-none absolute left-1/2 top-[20%] -z-10 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-emerald-900/[0.04] blur-[140px]"
				aria-hidden
			/>

			<div className="relative mx-auto w-full max-w-[860px] px-5 sm:px-8">
				{/* Masthead */}
				<header className="mb-16 text-center sm:mb-24">
					<div className="mb-6 inline-flex items-center gap-2 rounded-full border border-edge bg-surface-card px-3 py-1">
						<span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
						<span className="text-[10px] font-medium uppercase tracking-[0.22em] text-content-secondary">
							Análise pública
						</span>
					</div>
					<h1 className="mb-5 font-serif text-[2.5rem] font-medium leading-[1.05] tracking-tight text-zinc-100 sm:text-[3.5rem] lg:text-[4rem]">
						Vestigio Index
					</h1>
					<p className="mx-auto max-w-[600px] text-[15px] leading-relaxed text-content-secondary sm:text-[17px]">
						Análise editorial mensal de mercados brasileiros. Dados próprios,
						opinião assinada. Uma edição por vertical, todo mês.
					</p>
				</header>

				{/* Latest edition — full-width feature card */}
				{latest && (
					<section className="mb-20 sm:mb-28">
						<div className="mb-4 flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.22em] text-content-faint">
							<div className="h-px w-8 bg-content-faint/40" />
							<span>Última edição</span>
						</div>
						<Link
							href={`/vestigio-index/${latest.vertical}/${latest.period}/${latest.slug}`}
							className="group block"
						>
							<div className="mb-3 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-content-faint">
								<span>Edição #{String(latest.editionNumber).padStart(3, "0")}</span>
								<span className="text-content-faint/40">·</span>
								<span>{latest.verticalLabel}</span>
								<span className="text-content-faint/40">·</span>
								<span>{formatPtBrDate(latest.publishedAt)}</span>
							</div>
							<h2 className="mb-4 font-serif text-[2rem] font-medium leading-[1.15] tracking-tight text-zinc-100 transition-colors group-hover:text-white sm:text-[2.5rem] lg:text-[3rem]">
								{latest.title}
							</h2>
							<p className="max-w-[680px] text-[15px] leading-relaxed text-content-secondary sm:text-[16px]">
								{latest.subtitle}
							</p>
							<div className="mt-5 inline-flex items-center gap-2 text-[13px] font-medium text-emerald-400 transition-opacity group-hover:opacity-80">
								Ler edição
								<span aria-hidden>→</span>
							</div>
						</Link>
					</section>
				)}

				{/* All editions by vertical. Each vertical title links to
				    its archive page so a reader who wants to browse just
				    Ecommerce (or just SaaS B2B) has a one-click path. */}
				<section>
					<div className="mb-4 flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.22em] text-content-faint">
						<div className="h-px w-8 bg-content-faint/40" />
						<span>Arquivo</span>
					</div>
					<div className="grid grid-cols-1 gap-y-12 sm:grid-cols-2 sm:gap-x-12">
						{verticals.map((v) => {
							const verticalEssays = essays.filter((e) => e.vertical === v.slug);
							return (
								<div key={v.slug}>
									<Link
										href={`/vestigio-index/${v.slug}`}
										className="group mb-4 inline-flex items-baseline gap-2 font-serif text-[18px] font-medium text-zinc-100 transition-colors hover:text-white sm:text-[20px]"
									>
										{v.label}
										<span className="text-[11px] font-normal text-content-faint transition-colors group-hover:text-emerald-400" aria-hidden>
											→
										</span>
									</Link>
									<ul className="flex flex-col gap-3">
										{verticalEssays.map((e) => (
											<li key={e.slug}>
												<Link
													href={`/vestigio-index/${e.vertical}/${e.period}/${e.slug}`}
													className="group flex items-start gap-3 text-[14px] leading-snug text-content-secondary transition-colors hover:text-zinc-100"
												>
													<span className="mt-0.5 shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-content-faint">
														#{String(e.editionNumber).padStart(3, "0")}
													</span>
													<span className="font-serif">{e.title}</span>
												</Link>
											</li>
										))}
									</ul>
								</div>
							);
						})}
					</div>
				</section>

				{/* Quiet footer pivot */}
				<div className="mt-24 flex flex-col items-center gap-5 text-center sm:mt-32">
					<div className="h-px w-12 bg-content-faint/40" />
					<p className="max-w-[440px] font-serif text-[15px] italic leading-[1.55] text-content-secondary sm:text-[17px]">
						A análise é pública. A do seu site, não precisa esperar.
					</p>
					<Link
						href="/audit"
						className="inline-flex items-center gap-2 rounded-full border border-edge bg-surface-card px-4 py-2 text-[13px] font-medium text-zinc-100 transition-colors hover:bg-white/[0.04]"
					>
						Rodar diagnóstico gratuito
						<span aria-hidden>→</span>
					</Link>
				</div>
			</div>
		</main>
	);
}
