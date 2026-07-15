"use client";

import { useState } from "react";

// ──────────────────────────────────────────────
// ShareBar — Wave 22.9 · war-room quick-win (Missing #2)
//
// Native share buttons (WhatsApp / X / LinkedIn / Copy Link) on
// /audit/result/[leadId]. Pre-filled copy names the top R$ finding
// so shared links carry emotional signal, not just a URL.
//
// The dynamic OG image at src/app/(site)/audit/result/[leadId]/opengraph-image.tsx
// already serves a per-leadId 1200x630 with domain + findings count +
// top-finding headline, cached at the edge. This bar is the surface
// that ACTIVATES that pre-existing infrastructure — without a share
// button, the OG image never leaves the visitor's session.
//
// Peer-share is the highest-ROI acquisition channel in DR when
// the free result is emotionally striking (a founder discovers
// $17k/mo vazando and screenshots it to their team). CAC ~$0 on this
// segment. Sales-checkout council seat flagged this as the single
// biggest missing lever on /audit/result.
// ──────────────────────────────────────────────

interface ShareBarProps {
	/** The audited domain, e.g. "casamontelle.com" */
	domain: string;
	/** Total or top-finding impact for the share text */
	topImpactLabel: string; // pre-formatted, e.g. "R$ 22.000/mês"
	/** leadId for the deep-link URL */
	leadId: string;
	/** Copy per locale */
	locale?: string;
}

function buildShareUrl(leadId: string): string {
	if (typeof window === "undefined") return `https://vestigio.io/audit/result/${leadId}`;
	return `${window.location.origin}/audit/result/${leadId}`;
}

function shareCopy(locale: string, domain: string, impact: string): string {
	// Loss-frame, peer-facing. Named domain in copy → recipient sees
	// specificity (this isn't a promo). Named R$ → primes them to
	// wonder about their own site.
	switch (locale) {
		case "en":
			return `Vestigio ran a 60-second scan on ${domain} and found ${impact} leaking every month. It's free — run it on yours:`;
		case "es":
			return `Vestigio escaneó ${domain} en 60 segundos y encontró ${impact} fugándose cada mes. Es gratis — corre el tuyo:`;
		case "de":
			return `Vestigio hat ${domain} in 60 Sekunden gescannt und ${impact} monatlichen Verlust identifiziert. Kostenlos — scannen Sie Ihre Seite:`;
		case "pt-BR":
		default:
			return `A Vestigio rodou um scan de 60s em ${domain} e achou ${impact} vazando todo mês. É grátis — roda no teu site:`;
	}
}

function labels(locale: string) {
	switch (locale) {
		case "en":
			return { title: "Share the leak", copy: "Copy link", copied: "Copied", whatsapp: "WhatsApp", x: "X", linkedin: "LinkedIn" };
		case "es":
			return { title: "Compartir la fuga", copy: "Copiar enlace", copied: "Copiado", whatsapp: "WhatsApp", x: "X", linkedin: "LinkedIn" };
		case "de":
			return { title: "Leak teilen", copy: "Link kopieren", copied: "Kopiert", whatsapp: "WhatsApp", x: "X", linkedin: "LinkedIn" };
		case "pt-BR":
		default:
			return { title: "Compartilhar o achado", copy: "Copiar link", copied: "Copiado", whatsapp: "WhatsApp", x: "X", linkedin: "LinkedIn" };
	}
}

export function ShareBar({ domain, topImpactLabel, leadId, locale = "pt-BR" }: ShareBarProps) {
	const [copied, setCopied] = useState(false);
	const shareUrl = buildShareUrl(leadId);
	const message = shareCopy(locale, domain, topImpactLabel);
	const l = labels(locale);

	const shareText = `${message} ${shareUrl}`;

	// Platform share intents. WhatsApp uses the web-tell URL; X uses
	// the intent tweet URL; LinkedIn uses shareArticle. All open in a
	// new tab.
	const whatsappHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
	const xHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}&url=${encodeURIComponent(shareUrl)}`;
	const linkedinHref = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(shareText);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// silent — some browsers block clipboard in insecure context
		}
	};

	return (
		<div className="mt-6 flex flex-col items-start gap-3 rounded-2xl border border-edge bg-surface-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
			<div className="text-[13px] font-medium text-content sm:text-sm">
				{l.title}
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<a
					href={whatsappHref}
					target="_blank"
					rel="noopener noreferrer"
					data-vtg-cta="share-whatsapp"
					aria-label={l.whatsapp}
					className="inline-flex items-center gap-1.5 rounded-lg border border-edge bg-surface-inset px-3 py-2 text-[12px] font-medium text-content transition-colors hover:border-edge-focus hover:bg-surface-card-hover"
				>
					<svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
						<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.174.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
					</svg>
					<span className="hidden sm:inline">{l.whatsapp}</span>
				</a>
				<a
					href={xHref}
					target="_blank"
					rel="noopener noreferrer"
					data-vtg-cta="share-x"
					aria-label={l.x}
					className="inline-flex items-center gap-1.5 rounded-lg border border-edge bg-surface-inset px-3 py-2 text-[12px] font-medium text-content transition-colors hover:border-edge-focus hover:bg-surface-card-hover"
				>
					<svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
						<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
					</svg>
					<span className="hidden sm:inline">{l.x}</span>
				</a>
				<a
					href={linkedinHref}
					target="_blank"
					rel="noopener noreferrer"
					data-vtg-cta="share-linkedin"
					aria-label={l.linkedin}
					className="inline-flex items-center gap-1.5 rounded-lg border border-edge bg-surface-inset px-3 py-2 text-[12px] font-medium text-content transition-colors hover:border-edge-focus hover:bg-surface-card-hover"
				>
					<svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
						<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
					</svg>
					<span className="hidden sm:inline">{l.linkedin}</span>
				</a>
				<button
					type="button"
					onClick={handleCopy}
					data-vtg-cta="share-copy"
					className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-medium transition-colors ${
						copied
							? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
							: "border-edge bg-surface-inset text-content hover:border-edge-focus hover:bg-surface-card-hover"
					}`}
				>
					<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
						{copied ? (
							<path d="M20 6L9 17l-5-5" />
						) : (
							<>
								<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
								<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
							</>
						)}
					</svg>
					<span>{copied ? l.copied : l.copy}</span>
				</button>
			</div>
		</div>
	);
}

export default ShareBar;
