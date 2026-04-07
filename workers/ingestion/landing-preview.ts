import type { ParsedPage } from "./parser";
import type { HttpResponse } from "./http-client";

// ──────────────────────────────────────────────
// Landing Preview Extractor
//
// Pulls the "this is your real site" proof signals from a single
// homepage fetch. Used by the mini-audit (/lp/audit result page) and
// the Growth admin prospect audits to render a thumbnail card that
// makes it obvious to the visitor that we actually crawled their
// landing page (not a generic placeholder).
//
// Inputs come from the existing pipeline pieces:
//   - HttpResponse (response time, status, final URL)
//   - ParsedPage   (title, meta_tags, h1)
//   - raw HTML     (only needed for favicon link extraction since
//                   parser.ts doesn't track <link rel="icon">)
//
// Output is a single LandingPreview object that can be JSON-stringified
// into MiniAuditResult.preview without further processing.
// ──────────────────────────────────────────────

export interface LandingPreview {
	url: string;
	host: string;
	final_url: string;
	title: string | null;
	description: string | null;
	og_image_url: string | null;
	favicon_url: string | null;
	h1: string | null;
	http_status: number;
	response_time_ms: number;
	content_length: number | null;
	captured_at: string; // ISO timestamp — shown in the preview card
}

interface ExtractInput {
	response: HttpResponse;
	parsed: ParsedPage;
	rawHtml: string;
}

export function extractLandingPreview({
	response,
	parsed,
	rawHtml,
}: ExtractInput): LandingPreview {
	// og:image — already captured by parser into meta_tags. The parser
	// stores both `name=` and `property=` keys verbatim, so OpenGraph
	// tags land under their full property name.
	const ogImageRaw =
		parsed.meta_tags["og:image"] ||
		parsed.meta_tags["og:image:url"] ||
		parsed.meta_tags["twitter:image"] ||
		null;
	const ogImageUrl = ogImageRaw ? resolveUrl(ogImageRaw, response.final_url) : null;

	// Favicon — parser doesn't track <link> tags. Lightweight regex
	// matches the first `<link rel="icon">` (or `apple-touch-icon`,
	// `shortcut icon`) variant. Falls back to /favicon.ico convention.
	const faviconUrl = extractFaviconUrl(rawHtml, response.final_url);

	// Description — prefer <meta name="description">, then OG description,
	// then Twitter description. parser captures meta_description into a
	// dedicated field for the standard tag.
	const description =
		parsed.meta_description ||
		parsed.meta_tags["og:description"] ||
		parsed.meta_tags["twitter:description"] ||
		null;

	const url = response.url;
	let host = "";
	try {
		host = new URL(response.final_url).hostname;
	} catch {
		host = "";
	}

	return {
		url,
		host,
		final_url: response.final_url,
		title: cleanText(parsed.title),
		description: cleanText(description),
		og_image_url: ogImageUrl,
		favicon_url: faviconUrl,
		h1: cleanText(parsed.h1),
		http_status: response.status_code,
		response_time_ms: response.response_time_ms,
		content_length: response.content_length ?? null,
		captured_at: new Date().toISOString(),
	};
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function cleanText(input: string | null | undefined): string | null {
	if (!input) return null;
	const trimmed = input.replace(/\s+/g, " ").trim();
	return trimmed.length > 0 ? trimmed : null;
}

function resolveUrl(raw: string, base: string): string | null {
	try {
		return new URL(raw, base).toString();
	} catch {
		return null;
	}
}

function extractFaviconUrl(html: string, baseUrl: string): string | null {
	// Try the rel variants in order of preference. First match wins.
	const patterns: RegExp[] = [
		/<link[^>]*rel=["'](?:icon|shortcut icon)["'][^>]*href=["']([^"']+)["']/i,
		/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:icon|shortcut icon)["']/i,
		/<link[^>]*rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i,
	];
	for (const pattern of patterns) {
		const match = html.match(pattern);
		if (match?.[1]) {
			const resolved = resolveUrl(match[1], baseUrl);
			if (resolved) return resolved;
		}
	}
	// Convention fallback. Most sites have /favicon.ico even when not
	// declared explicitly. We don't HEAD it — just give the URL and let
	// the browser handle the 404 gracefully if it doesn't exist.
	try {
		const u = new URL(baseUrl);
		return `${u.protocol}//${u.host}/favicon.ico`;
	} catch {
		return null;
	}
}
