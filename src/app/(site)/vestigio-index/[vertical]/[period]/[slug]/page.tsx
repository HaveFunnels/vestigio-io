import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
	findEssay,
	listAllEssays,
	listEssaysByVertical,
	type IndexEssay,
	type IndexEssayBlock,
} from "@/data/vestigio-index";

// ──────────────────────────────────────────────
// /vestigio-index/[vertical]/[period]/[slug] — single essay
//
// Editorial layout, Fraunces serif for title + tese, single
// reading column max-w 680px. Block renderer iterates the
// IndexEssay.body array and dispatches on block.type. The
// inline hook block (single per essay, by convention) renders
// as a full-width quiet card breaking the reading flow at the
// chosen mid-essay point — per /frontend-design verdict it's
// the highest-converting hook position for editorial pages.
//
// SEO: generateMetadata fills title/description from the essay,
// canonicalizes, and emits OG. JSON-LD Article schema is
// rendered inline for structured-data eligibility on Google
// SERPs.
//
// Today the route serves only known slugs (essays in
// src/data/vestigio-index). When DB-backed essays land, swap
// findEssay() for a DB read; renderer stays the same.
// ──────────────────────────────────────────────

export const revalidate = 3600;

interface RouteParams {
	vertical: string;
	period: string;
	slug: string;
}

export async function generateStaticParams(): Promise<RouteParams[]> {
	return listAllEssays().map((e) => ({
		vertical: e.vertical,
		period: e.period,
		slug: e.slug,
	}));
}

export async function generateMetadata({
	params,
}: {
	params: Promise<RouteParams>;
}): Promise<Metadata> {
	const { vertical, period, slug } = await params;
	const essay = findEssay(vertical, period, slug);
	if (!essay) return { title: "Edição não encontrada" };
	const canonical = `https://vestigio.io/vestigio-index/${essay.vertical}/${essay.period}/${essay.slug}`;
	return {
		title: `${essay.title} — Vestigio Index`,
		description: essay.metaDescription,
		openGraph: {
			type: "article",
			title: essay.title,
			description: essay.metaDescription,
			url: canonical,
			publishedTime: essay.publishedAt,
			authors: ["Vestigio"],
		},
		twitter: {
			card: "summary_large_image",
			title: essay.title,
			description: essay.metaDescription,
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

function InlineHook({ vertical }: { vertical: string }) {
	// Full-width editorial pause card. Sits mid-essay. Not a banner
	// ad — reads as a margin note an editor would write to the
	// reader. Per the /signup-flow-cro audit pattern, this is the
	// highest-converting CTA position for editorial pages.
	return (
		<aside className="my-12 border-y border-edge bg-surface-card/40 px-5 py-8 sm:my-16 sm:px-8 sm:py-10">
			<div className="mb-2 text-[10px] font-medium uppercase tracking-[0.22em] text-content-faint">
				Nota do editor
			</div>
			<p className="font-serif text-[18px] italic leading-[1.55] text-zinc-100 sm:text-[20px]">
				Se você opera um {vertical === "ecommerce" ? "ecom" : vertical === "saas-b2b" ? "SaaS B2B" : "negócio digital"} brasileiro, vale rodar esta análise no seu site antes de continuar lendo —{" "}
				<Link
					href="/audit"
					className="text-emerald-400 underline decoration-emerald-400/40 underline-offset-4 hover:decoration-emerald-400"
				>
					o diagnóstico é gratuito
				</Link>
				. As mesmas lentes usadas pra escrever esta edição rodam contra a sua loja em ~60 segundos.
			</p>
		</aside>
	);
}

function Block({ block, essayVertical }: { block: IndexEssayBlock; essayVertical: string }) {
	switch (block.type) {
		case "lede":
			return (
				<p className="mb-8 font-serif text-[19px] leading-[1.6] text-zinc-200 sm:text-[21px]">
					{block.text}
				</p>
			);
		case "paragraph":
			return (
				<p className="mb-6 text-[16px] leading-[1.75] text-content-secondary sm:text-[17px]">
					{block.text}
				</p>
			);
		case "heading":
			return block.level === 2 ? (
				<h2 className="mb-5 mt-12 font-serif text-[24px] font-medium leading-tight text-zinc-100 sm:mt-16 sm:text-[28px]">
					{block.text}
				</h2>
			) : (
				<h3 className="mb-3 mt-8 font-serif text-[18px] font-medium leading-snug text-zinc-100 sm:text-[20px]">
					{block.text}
				</h3>
			);
		case "pullquote":
			return (
				<blockquote className="my-10 border-l-2 border-emerald-400/40 pl-6 sm:my-12">
					<p className="font-serif text-[20px] italic leading-[1.45] text-zinc-100 sm:text-[24px]">
						{block.text}
					</p>
				</blockquote>
			);
		case "list":
			return (
				<ul className="mb-6 ml-6 list-disc space-y-2 text-[16px] leading-relaxed text-content-secondary marker:text-content-faint sm:text-[17px]">
					{block.items.map((item, i) => (
						<li key={i}>{item}</li>
					))}
				</ul>
			);
		case "hook":
			return <InlineHook vertical={essayVertical} />;
		case "divider":
			// Pure visual rhythm — hairline gap between major sections.
			// Use sparingly (every 2-3 paragraphs is overkill); reserve
			// for hard chapter breaks the reader should feel.
			return (
				<div className="my-12 flex items-center justify-center sm:my-16" aria-hidden>
					<div className="h-px w-16 bg-content-faint/30" />
				</div>
			);
		case "stat_callout":
			// Inline data anchor — big Fraunces numeral + small label,
			// with optional 1-line context below. Set apart from the
			// surrounding prose by a hairline rule and slight indent.
			return (
				<div className="my-10 flex flex-col items-start gap-2 border-l-2 border-content-faint/30 pl-5 sm:my-12">
					<div className="font-serif text-[44px] font-medium leading-none tracking-tight text-zinc-100 sm:text-[56px]">
						{block.value}
					</div>
					<div className="text-[11px] font-medium uppercase tracking-[0.16em] text-content-faint sm:text-[12px]">
						{block.label}
					</div>
					{block.context && (
						<p className="mt-2 max-w-[480px] text-[14px] leading-relaxed text-content-secondary sm:text-[15px]">
							{block.context}
						</p>
					)}
				</div>
			);
		case "numbered_tiles":
			// Enumerated tiles for structured points — replaces a wall
			// of paragraphs when the content is a list of distinct
			// observations. Each tile has a Fraunces numeral marker +
			// title + optional body.
			return (
				<ol className="my-8 flex flex-col gap-6 sm:my-10 sm:gap-8">
					{block.items.map((item, i) => (
						<li key={i} className="flex items-start gap-5">
							<span className="shrink-0 font-serif text-[28px] font-medium leading-none tabular-nums text-content-secondary sm:text-[32px]">
								{item.n}
							</span>
							<div className="min-w-0 flex-1">
								<div className="font-serif text-[17px] font-medium leading-snug text-zinc-100 sm:text-[19px]">
									{item.title}
								</div>
								{item.body && (
									<p className="mt-2 text-[15px] leading-relaxed text-content-secondary sm:text-[16px]">
										{item.body}
									</p>
								)}
							</div>
						</li>
					))}
				</ol>
			);
	}
}

function ArticleStructuredData({ essay }: { essay: IndexEssay }) {
	const canonical = `https://vestigio.io/vestigio-index/${essay.vertical}/${essay.period}/${essay.slug}`;
	const ld = {
		"@context": "https://schema.org",
		"@type": "Article",
		headline: essay.title,
		description: essay.metaDescription,
		datePublished: essay.publishedAt,
		author: {
			"@type": "Organization",
			name: "Vestigio",
			url: "https://vestigio.io",
		},
		publisher: {
			"@type": "Organization",
			name: "Vestigio",
			url: "https://vestigio.io",
			logo: {
				"@type": "ImageObject",
				url: "https://vestigio.io/images/logo/logo-light.png",
			},
		},
		mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
		about: essay.verticalLabel,
		articleSection: "Vestigio Index",
	};
	// JSON-LD must ship as raw text inside a <script> tag for Google
	// to parse it as structured data (a stringified attribute won't
	// be picked up). dangerouslySetInnerHTML is the only React API
	// that allows that. The XSS surface is the essay content fields
	// (title, description, etc.) — today these come from static
	// repo files authored by developers, but when LLM-generated
	// drafts land in DB the same fields will carry whatever text the
	// editor approves. JSON.stringify escapes quotes and control
	// chars but does NOT escape '<' — a stray '</script>' in any
	// content field would break out of the <script> tag and let
	// arbitrary HTML follow. The .replace below converts '<' to its
	// JSON unicode escape '<', which JSON parsers still
	// interpret correctly but the HTML tokenizer treats as inert
	// text. Standard defense for inline JSON-LD; cheap, doesn't
	// require DOMPurify (which would HTML-escape the JSON itself and
	// break Google's structured-data parser).
	const safeJson = JSON.stringify(ld).replace(/</g, "\\u003c");
	return (
		<script
			type="application/ld+json"
			dangerouslySetInnerHTML={{ __html: safeJson }}
		/>
	);
}

export default async function VestigioIndexEssay({
	params,
}: {
	params: Promise<RouteParams>;
}) {
	const { vertical, period, slug } = await params;
	const essay = findEssay(vertical, period, slug);
	if (!essay) notFound();

	const verticalArchive = listEssaysByVertical(essay.vertical).filter(
		(e) => e.slug !== essay.slug,
	);

	return (
		<main className="relative bg-[#090911] pb-32 pt-32 sm:pb-40 sm:pt-40">
			<ArticleStructuredData essay={essay} />

			{/* Quiet editorial halo */}
			<div
				className="pointer-events-none absolute left-1/2 top-[10%] -z-10 h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-emerald-900/[0.04] blur-[140px]"
				aria-hidden
			/>

			<div className="relative mx-auto w-full max-w-[720px] px-5 sm:px-8">
				{/* Crumbs — vertical label is a link to the vertical
				    archive so a reader who lands on this essay can
				    browse the rest of the vertical in one click. */}
				<nav className="mb-10 text-[12px] text-content-faint">
					<Link href="/vestigio-index" className="hover:text-zinc-100">
						Vestigio Index
					</Link>
					<span className="mx-2">/</span>
					<Link
						href={`/vestigio-index/${essay.vertical}`}
						className="hover:text-zinc-100"
					>
						{essay.verticalLabel}
					</Link>
				</nav>

				{/* Masthead */}
				<header className="mb-12">
					<div className="mb-4 flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-content-faint">
						<span>Edição #{String(essay.editionNumber).padStart(3, "0")}</span>
						<span className="text-content-faint/40">·</span>
						<span>{essay.verticalLabel}</span>
						<span className="text-content-faint/40">·</span>
						<time dateTime={essay.publishedAt}>{formatPtBrDate(essay.publishedAt)}</time>
					</div>
					<h1 className="mb-5 font-serif text-[2rem] font-medium leading-[1.1] tracking-tight text-zinc-100 sm:text-[3rem] lg:text-[3.5rem]">
						{essay.title}
					</h1>
					<p className="text-[17px] leading-relaxed text-content-secondary sm:text-[19px]">
						{essay.subtitle}
					</p>

					{/* Tese — italic Fraunces, set apart by hairline */}
					<div className="mt-10 border-l-2 border-emerald-400/40 pl-5">
						<p className="font-serif text-[18px] italic leading-[1.5] text-zinc-100 sm:text-[20px]">
							{essay.tese}
						</p>
					</div>

					{/* Stats strip — 3-4 punch-line numbers below the
					    tese. Per editorial decision 2026-06-24, we
					    deliberately don't surface 'X sites analisados'
					    here (the cohort is small and the framing
					    weakens the claim). The sample-size disclosure
					    lives in the footer; this strip is reader-eye
					    anchoring with the data that matters. */}
					{essay.stats && essay.stats.length > 0 && (
						<dl className="mt-10 grid grid-cols-1 gap-y-6 border-y border-edge py-8 sm:grid-cols-3 sm:gap-y-0 sm:gap-x-8 sm:py-10">
							{essay.stats.map((stat, i) => (
								<div key={i}>
									<dt className="font-serif text-[36px] font-medium leading-none tracking-tight text-zinc-100 sm:text-[44px]">
										{stat.value}
									</dt>
									<dd className="mt-2 text-[11px] font-medium uppercase tracking-[0.16em] text-content-faint sm:text-[12px]">
										{stat.label}
									</dd>
								</div>
							))}
						</dl>
					)}
				</header>

				{/* Body */}
				<article className="mt-12">
					{essay.body.map((block, i) => (
						<Block key={i} block={block} essayVertical={essay.vertical} />
					))}
				</article>

				{/* Footer signature */}
				<footer className="mt-20 border-t border-edge pt-8 sm:mt-28">
					<div className="flex flex-col gap-3 text-[12px] text-content-faint sm:flex-row sm:items-center sm:justify-between">
						<div className="font-mono uppercase tracking-[0.18em]">
							Assinado por Vestigio
						</div>
						<div>
							{essay.sitesAnalyzed} sites brasileiros analisados nesta edição
						</div>
					</div>
				</footer>

				{/* Related editions in the same vertical */}
				{verticalArchive.length > 0 && (
					<section className="mt-20 sm:mt-28">
						<div className="mb-4 flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.22em] text-content-faint">
							<div className="h-px w-8 bg-content-faint/40" />
							<span>Outras edições — {essay.verticalLabel}</span>
						</div>
						<ul className="flex flex-col gap-3">
							{verticalArchive.map((e) => (
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
					</section>
				)}

				{/* Final pivot */}
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
