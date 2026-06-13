// ──────────────────────────────────────────────
// Crawl Progress Types
//
// Persisted as JSONB on AnonymousLead.crawlProgress. Drives the live
// crawl indicator on /audit (Sprint 2) and the finding teaser interstitial
// (Sprint 3).
//
// Lifecycle:
//   step 1 (domain submitted) → POST /api/lead/[id]/early-crawl
//   → run-early-crawl sets status="fetching"
//   → on success: status="ready" + stack + (optional) teaserFinding + cachedHtml
//   → on error: status="error" + errorCode
//
// run-mini-audit (terminal step 7) consumes cachedHtml to avoid a
// second httpFetch — saves 1-4s on the final audit. After consumption,
// cachedHtml is nulled to keep the JSONB row lean.
// ──────────────────────────────────────────────

export type CrawlProgressStatus = "idle" | "fetching" | "ready" | "error";

export interface CrawlTeaserFinding {
	id: string;
	title: string;
	category: string;
	severity: "critical" | "high" | "medium";
	/** Faixa R$ em CENTAVOS. Renderizada como "R$ X-Y k/mês" no frame. */
	rangeLowBrlCents: number;
	rangeHighBrlCents: number;
}

export interface CrawlProgress {
	status: CrawlProgressStatus;
	/** ISO timestamp do start do early-crawl. */
	startedAt?: string;
	/** ISO timestamp do término (success ou error). */
	finishedAt?: string;
	/** Pages mapped — sempre 1 no early-crawl (homepage only). */
	pagesFound: number;
	/** Display names das technologies detectadas. Ex: ["Shopify", "Klaviyo", "GTM"]. */
	stack: string[];
	/** 1 finding-teaser pra mostrar nos steps 5-6 (opcional — null se nenhum detectado). */
	teaserFinding: CrawlTeaserFinding | null;
	/**
	 * Raw HTML da homepage cacheado pro run-audit reusar e evitar segundo
	 * fetch. Cap 200KB (truncado no worker). Null quando: (a) ainda fetching,
	 * (b) erro, (c) já consumido pelo run-audit.
	 *
	 * Persistido como base64 pra escapar gotchas de jsonb com strings
	 * grandes que contêm caracteres de controle (HTML real às vezes tem).
	 */
	cachedHtmlB64?: string | null;
	/** Final URL após redirect chain do early-crawl. Usado em conjunto com cachedHtmlB64. */
	cachedFinalUrl?: string | null;
	/** Código de erro curto (network_error, dns_fail, blocked, etc) — UI usa pra mensagem. */
	errorCode?: string | null;
}
