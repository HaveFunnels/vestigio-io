import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
	listActiveVerticals,
	listEssaysByVertical,
	type VerticalSlug,
} from "@/data/vestigio-index";

// ──────────────────────────────────────────────
// /vestigio-index/[vertical] — vertical archive
//
// All published editions of a single vertical (e.g. all
// Ecommerce/D2C editions over time) on one page. Sits between
// the global /vestigio-index landing and the per-essay detail
// route. Lets a reader who landed on one essay browse the rest
// of that vertical without going up to the master landing.
//
// Same editorial register + dark canvas + Fraunces serif as the
// other Index surfaces. Single-column reading layout.
//
// Verticals come from listActiveVerticals — a vertical with zero
// essays today doesn't have a route (notFound() at request time).
// generateStaticParams emits routes only for verticals with
// published essays, so the build doesn't pre-render empty pages.
// ──────────────────────────────────────────────

export const revalidate = 3600;

interface RouteParams {
	vertical: string;
}

const KNOWN_VERTICAL_LABELS: Record<VerticalSlug, { label: string; tagline: string }> = {
	ecommerce: {
		label: "Ecommerce / D2C",
		tagline:
			"Análise editorial mensal do que move (e do que freia) lojas D2C brasileiras.",
	},
	"saas-b2b": {
		label: "SaaS B2B",
		tagline:
			"Análise editorial mensal de SaaS B2B brasileiro — onde a receita escapa entre o trial e a renovação.",
	},
	cursos: {
		label: "Cursos / Infoprodutos",
		tagline:
			"Análise editorial mensal de infoprodutos brasileiros — checkout, retenção, e o que separa o curso que vende do que estagna.",
	},
	agencias: {
		label: "Agências",
		tagline:
			"Análise editorial mensal de agências digitais brasileiras — proposta, retenção de cliente, e o gap entre pitch e entrega.",
	},
};

function isVerticalSlug(s: string): s is VerticalSlug {
	return s === "ecommerce" || s === "saas-b2b" || s === "cursos" || s === "agencias";
}

export async function generateStaticParams(): Promise<RouteParams[]> {
	return listActiveVerticals().map((v) => ({ vertical: v.slug }));
}

export async function generateMetadata({
	params,
}: {
	params: Promise<RouteParams>;
}): Promise<Metadata> {
	const { vertical } = await params;
	if (!isVerticalSlug(vertical)) return { title: "Vertical não encontrada" };
	const info = KNOWN_VERTICAL_LABELS[vertical];
	const canonical = `https://vestigio.io/vestigio-index/${vertical}`;
	return {
		title: `Vestigio Index — ${info.label}`,
		description: info.tagline,
		openGraph: {
			type: "website",
			title: `Vestigio Index — ${info.label}`,
			description: info.tagline,
			url: canonical,
		},
		alternates: { canonical },
	};
}

function formatPtBrDate(iso: string): string {
	const [y, m, d] = iso.split("-").map(Number);
	const months = [
		"jan", "fev", "mar", "abr", "mai", "jun",
		"jul", "ago", "set", "out", "nov", "dez",
	];
	return `${String(d).padStart(2, "0")} ${months[m - 1]} ${y}`;
}

export default async function VestigioIndexVertical({
	params,
}: {
	params: Promise<RouteParams>;
}) {
	const { vertical } = await params;
	if (!isVerticalSlug(vertical)) notFound();
	const info = KNOWN_VERTICAL_LABELS[vertical];
	const essays = listEssaysByVertical(vertical);
	if (essays.length === 0) notFound();

	const latest = essays[0];
	const rest = essays.slice(1);

	return (
		<main className="relative bg-[#090911] pb-32 pt-32 sm:pb-40 sm:pt-40">
			<div
				className="pointer-events-none absolute left-1/2 top-[20%] -z-10 h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-emerald-900/[0.04] blur-[140px]"
				aria-hidden
			/>

			<div className="relative mx-auto w-full max-w-[860px] px-5 sm:px-8">
				{/* Crumbs */}
				<nav className="mb-10 text-[12px] text-content-faint">
					<Link href="/vestigio-index" className="hover:text-zinc-100">
						Vestigio Index
					</Link>
					<span className="mx-2">/</span>
					<span>{info.label}</span>
				</nav>

				{/* Masthead */}
				<header className="mb-16 sm:mb-20">
					<div className="mb-4 inline-flex items-center gap-2 rounded-full border border-edge bg-surface-card px-3 py-1">
						<span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
						<span className="text-[10px] font-medium uppercase tracking-[0.22em] text-content-secondary">
							{info.label}
						</span>
					</div>
					<h1 className="mb-5 font-serif text-[2.25rem] font-medium leading-[1.1] tracking-tight text-zinc-100 sm:text-[3rem] lg:text-[3.5rem]">
						{info.label}
					</h1>
					<p className="max-w-[600px] text-[15px] leading-relaxed text-content-secondary sm:text-[17px]">
						{info.tagline}
					</p>
					<div className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-content-faint">
						{essays.length} {essays.length === 1 ? "edição publicada" : "edições publicadas"}
					</div>
				</header>

				{/* Latest edition — feature */}
				<section className="mb-16 sm:mb-20">
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
							<span>{formatPtBrDate(latest.publishedAt)}</span>
						</div>
						<h2 className="mb-4 font-serif text-[1.75rem] font-medium leading-[1.15] tracking-tight text-zinc-100 transition-colors group-hover:text-white sm:text-[2.25rem]">
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

				{/* Older editions — list */}
				{rest.length > 0 && (
					<section>
						<div className="mb-4 flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.22em] text-content-faint">
							<div className="h-px w-8 bg-content-faint/40" />
							<span>Edições anteriores</span>
						</div>
						<ul className="flex flex-col gap-5 border-t border-edge pt-5">
							{rest.map((e) => (
								<li key={e.slug} className="border-b border-edge pb-5 last:border-b-0">
									<Link
										href={`/vestigio-index/${e.vertical}/${e.period}/${e.slug}`}
										className="group block"
									>
										<div className="mb-2 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-content-faint">
											<span>#{String(e.editionNumber).padStart(3, "0")}</span>
											<span className="text-content-faint/40">·</span>
											<span>{formatPtBrDate(e.publishedAt)}</span>
										</div>
										<h3 className="font-serif text-[18px] font-medium leading-snug text-zinc-100 transition-colors group-hover:text-white sm:text-[20px]">
											{e.title}
										</h3>
										<p className="mt-1 text-[14px] leading-snug text-content-secondary">
											{e.subtitle}
										</p>
									</Link>
								</li>
							))}
						</ul>
					</section>
				)}

				{/* Quiet pivot */}
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
