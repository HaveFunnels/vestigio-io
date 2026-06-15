import * as dns from "node:dns/promises";
import * as https from "node:https";
import * as http from "node:http";
import { URL } from "node:url";
import {
	CollectionMethod,
	Evidence,
	EvidenceType,
	FreshnessState,
	IdGenerator,
	SourceKind,
	type CompetitorPageSnapshotPayload,
} from "../../../packages/domain";
import type {
	EnrichmentContext,
	EnrichmentPass,
	EnrichmentResult,
	ShouldRunDecision,
} from "./types";
import { buildFailedResult } from "./types";
import { prisma } from "../../../src/libs/prismaDb";
import { isBlockedAddress } from "../../../packages/url-normalize/ssrf";

// ──────────────────────────────────────────────
// Wave 24 — Competitor fetch enrichment pass
//
// Loads the env's user-curated CompetitorDomain rows and, for each
// active one, fetches the homepage + does cheap DNS lookups so the
// competitive_lens inference pack can compare trust posture + copy
// fingerprint between you and your peer set.
//
// Polite observation pass — equivalent to opening their homepage in
// a browser tab:
//   - GET https://<domain>/ via existing httpFetch (15s timeout,
//     follows up to 10 redirects, identifies as VestigioBot).
//   - DNS lookup of `_dmarc.<domain>` and `<domain>` TXT (SPF).
//   - NO authenticated paths, NO crawl, NO nuclei/katana.
//
// Cap: max 25 competitors fetched per cycle (Wave 23 — era 10). Customer
// feedback: clientes com 15-20 concorrentes ativos só viam metade
// analisada por ciclo. 25 cobre o típico universo SaaS B2B + ecommerce
// sem custar muito (fetches são paralelos, ~3s cada — cycle ganha 2-3min
// a mais no worst case). UI continua avisando se ainda houver overflow.
//
// Gated to full-mode audits — same as brand-intel-scan. Hot/warm
// cycles skip; the data refreshes every audit cycle.
// ──────────────────────────────────────────────

const MAX_COMPETITORS_PER_CYCLE = 25;
const DNS_TIMEOUT_MS = 3_000;
const HTTP_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 3 * 1024 * 1024; // 3 MB cap — homepages should fit easily
const HERO_TEXT_LIMIT = 500;
const BODY_TEXT_LIMIT = 2_000;
const MAX_HEADINGS = 30;
const MAX_CTAS = 20;
const USER_AGENT =
	"Mozilla/5.0 (compatible; VestigioBot/1.0; +https://vestigio.io)";

// ── SSRF guard ──
//
// Helpers live in packages/url-normalize/ssrf.ts so the inventory
// manual-add API can reuse the same private-IP detection. Connect-
// time lookup behavior (re-resolve every redirect hop) stays here.

interface CompetitorRow {
	id: string;
	domain: string;
}

export interface SafeFetchResult {
	final_url: string;
	status_code: number;
	headers: Record<string, string>;
	body: string;
	/**
	 * Wave 23 — raw bytes do body, antes da conversão pra utf-8. Usado por
	 * callers que precisam de byte-precise data (favicon hashing, binary
	 * fingerprinting). Tem o MESMO content de `body` mas sem perda de
	 * encoding pra arquivos binários (PNG/ICO/JPEG).
	 */
	body_bytes: Buffer;
}

// SSRF-hardened single-hop fetch. Resolves DNS via a custom lookup
// callback that's invoked at TCP-connect time, blocks private IPs,
// and caps body size to MAX_BODY_BYTES. Used ONLY for competitor
// homepages — the rest of the audit pipeline trusts its inputs
// (own domain) and uses the shared httpFetch directly.
function singleSafeFetch(targetUrl: string): Promise<SafeFetchResult> {
	return new Promise((resolve, reject) => {
		let parsed: URL;
		try {
			parsed = new URL(targetUrl);
		} catch (err) {
			reject(new Error(`Invalid URL: ${targetUrl}`));
			return;
		}
		if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
			reject(new Error(`Disallowed protocol: ${parsed.protocol}`));
			return;
		}
		const transport = parsed.protocol === "https:" ? https : http;

		const lookup: http.RequestOptions["lookup"] = (
			hostname,
			options,
			callback,
		) => {
			dns.lookup(hostname, options as any).then(
				(res: any) => {
					// node's promise lookup returns either {address, family} or
					// (when options.all is true) an array — we don't set all,
					// so it's the single form.
					const address = res.address as string;
					const family = res.family as number;
					if (isBlockedAddress(address, family)) {
						callback(
							new Error(
								`SSRF guard: refused to connect to ${address} (private/loopback)`,
							),
							"",
							family,
						);
						return;
					}
					callback(null, address, family);
				},
				(err) => callback(err as NodeJS.ErrnoException, "", 0),
			);
		};

		const req = transport.get(
			targetUrl,
			{
				headers: { "User-Agent": USER_AGENT },
				timeout: HTTP_TIMEOUT_MS,
				lookup,
			},
			(res) => {
				const headers: Record<string, string> = {};
				for (const [key, val] of Object.entries(res.headers)) {
					if (val) headers[key] = Array.isArray(val) ? val.join(", ") : val;
				}

				if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
					res.resume();
					resolve({
						final_url: targetUrl,
						status_code: res.statusCode,
						headers,
						body: "",
						body_bytes: Buffer.alloc(0),
					});
					return;
				}

				let total = 0;
				const chunks: Buffer[] = [];
				res.on("data", (chunk: Buffer) => {
					total += chunk.length;
					if (total > MAX_BODY_BYTES) {
						res.destroy();
						reject(
							new Error(
								`Body exceeded ${MAX_BODY_BYTES} bytes for ${targetUrl}`,
							),
						);
						return;
					}
					chunks.push(chunk);
				});
				res.on("end", () => {
					// Wave 23 — Buffer.concat retém os bytes brutos, e
					// toString("utf-8") faz a versão texto. Callers binários
					// (favicon hashing) leem body_bytes pra evitar perda de
					// encoding em arquivos PNG/ICO/etc.
					const bodyBytes = Buffer.concat(chunks);
					resolve({
						final_url: targetUrl,
						status_code: res.statusCode || 0,
						headers,
						body: bodyBytes.toString("utf-8"),
						body_bytes: bodyBytes,
					});
				});
				res.on("error", reject);
			},
		);

		req.on("error", reject);
		req.on("timeout", () => {
			req.destroy();
			reject(new Error(`Timeout fetching ${targetUrl}`));
		});
	});
}

// Wave 23 — exportado pra competitor-deep-fetch.ts reusar o mesmo
// SSRF guard sem duplicar 200 linhas.
export async function safeFetch(initialUrl: string): Promise<SafeFetchResult> {
	let currentUrl = initialUrl;
	for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
		const result = await singleSafeFetch(currentUrl);
		if (
			result.status_code >= 300 &&
			result.status_code < 400 &&
			result.headers["location"]
		) {
			// Resolve Location relative to the current URL (handles both
			// absolute and relative redirects).
			let next: URL;
			try {
				next = new URL(result.headers["location"], currentUrl);
			} catch {
				throw new Error(`Invalid redirect Location: ${result.headers["location"]}`);
			}
			currentUrl = next.toString();
			continue;
		}
		return { ...result, final_url: currentUrl };
	}
	throw new Error(`Too many redirects (>${MAX_REDIRECTS}) for ${initialUrl}`);
}

async function loadActiveCompetitors(envId: string): Promise<CompetitorRow[]> {
	try {
		const rows = await prisma.competitorDomain.findMany({
			where: { environmentId: envId, active: true },
			orderBy: { addedAt: "desc" },
			take: MAX_COMPETITORS_PER_CYCLE,
			select: { id: true, domain: true },
		});
		return rows;
	} catch (err) {
		// Table missing (pre-migration) or transient DB error — degrade
		// gracefully. The pass returns 'skipped' with the reason.
		console.warn(
			"[competitor-fetch] failed to load CompetitorDomain rows:",
			err instanceof Error ? err.message : err,
		);
		return [];
	}
}

// ── DNS helpers (cheap TXT lookups, mirror email-deliverability) ──
async function resolveTxtWithTimeout(
	name: string,
): Promise<{ records: string[]; lookup_failed: boolean }> {
	try {
		const records = await Promise.race([
			dns.resolveTxt(name),
			new Promise<string[][]>((_, reject) =>
				setTimeout(
					() => reject(new Error(`DNS timeout for ${name}`)),
					DNS_TIMEOUT_MS,
				),
			),
		]);
		const joined = records.map((chunks) => chunks.join(""));
		return { records: joined, lookup_failed: false };
	} catch (err) {
		const code = (err as NodeJS.ErrnoException)?.code;
		if (code === "ENOTFOUND" || code === "ENODATA") {
			return { records: [], lookup_failed: false };
		}
		return { records: [], lookup_failed: true };
	}
}

function pickRecord(records: string[], prefix: string): string | null {
	const match = records.find((r) =>
		r.toLowerCase().startsWith(prefix.toLowerCase()),
	);
	return match ?? null;
}

function parseDmarcPolicy(
	raw: string | null,
): "none" | "quarantine" | "reject" | null {
	if (!raw) return null;
	const match = raw.match(/\bp\s*=\s*(none|quarantine|reject)\b/i);
	if (!match) return null;
	const v = match[1].toLowerCase();
	return v === "none" || v === "quarantine" || v === "reject" ? v : null;
}

// ── HTML helpers ──
function stripHtml(html: string): string {
	return html
		.replace(/<script\b[\s\S]*?<\/script>/gi, " ")
		.replace(/<style\b[\s\S]*?<\/style>/gi, " ")
		.replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/\s+/g, " ")
		.trim();
}

function extractTitle(html: string): string | null {
	const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	return m ? stripHtml(m[1]).slice(0, 200) : null;
}

function extractH1(html: string): string | null {
	const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
	return m ? stripHtml(m[1]).slice(0, 200) : null;
}

function extractMetaDescription(html: string): string | null {
	const m = html.match(
		/<meta\s+(?:[^>]*\s+)?name\s*=\s*["']description["'][^>]*>/i,
	);
	if (!m) return null;
	const contentMatch = m[0].match(/content\s*=\s*["']([^"']*)["']/i);
	return contentMatch ? contentMatch[1].slice(0, 300) : null;
}

function extractHeadings(
	html: string,
): Array<{ level: 1 | 2 | 3; text: string }> {
	const out: Array<{ level: 1 | 2 | 3; text: string }> = [];
	const matches = html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi);
	for (const m of matches) {
		if (out.length >= MAX_HEADINGS) break;
		const level = Number(m[1]) as 1 | 2 | 3;
		const text = stripHtml(m[2]).slice(0, 160);
		if (text.length > 0) out.push({ level, text });
	}
	return out;
}

function looksLikeCta(text: string): boolean {
	const lower = text.toLowerCase();
	return /^(comece|comecar|cadastre|cadastrar|inscreva|inscrever|experimente|experimentar|teste|testar|baixar|baixe|veja|ver|descubra|saiba|comprar|adquirir|assinar|contratar|agendar|solicitar|fale|falar|conversar|entrar|login|criar conta|get started|try|sign up|start free|start now|book a demo|talk to|contact)/i.test(
		lower,
	);
}

function extractCtas(html: string): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	const matches = html.matchAll(
		/<(?:button|a)\b[^>]*>([\s\S]*?)<\/(?:button|a)>/gi,
	);
	for (const m of matches) {
		if (out.length >= MAX_CTAS) break;
		const text = stripHtml(m[1]).slice(0, 80);
		if (text.length < 3 || text.length > 60) continue;
		if (!looksLikeCta(text)) continue;
		const key = text.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(text);
	}
	return out;
}

function computeHeadersScore(headers: Record<string, string>): {
	hsts_present: boolean;
	csp_present: boolean;
	x_frame_options_present: boolean;
	x_content_type_options_present: boolean;
	referrer_policy_present: boolean;
	permissions_policy_present: boolean;
	headers_score: number;
} {
	const lower: Record<string, string> = {};
	for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
	const flags = {
		hsts_present: !!lower["strict-transport-security"],
		csp_present: !!lower["content-security-policy"],
		x_frame_options_present: !!lower["x-frame-options"],
		x_content_type_options_present: !!lower["x-content-type-options"],
		referrer_policy_present: !!lower["referrer-policy"],
		permissions_policy_present:
			!!lower["permissions-policy"] || !!lower["feature-policy"],
	};
	const trueCount = Object.values(flags).filter(Boolean).length;
	const headers_score = Math.round((trueCount / 6) * 100);
	return { ...flags, headers_score };
}

function emptyTrustSnapshot(): CompetitorPageSnapshotPayload["trust_snapshot"] {
	return {
		https_redirect: false,
		hsts_present: false,
		csp_present: false,
		x_frame_options_present: false,
		x_content_type_options_present: false,
		referrer_policy_present: false,
		permissions_policy_present: false,
		headers_score: 0,
		dmarc_present: false,
		dmarc_policy: null,
		spf_present: false,
	};
}

async function snapshotOne(
	competitorDomain: string,
): Promise<CompetitorPageSnapshotPayload> {
	const fetched_at = new Date().toISOString();
	const url = `https://${competitorDomain}/`;
	let httpStatus: number | null = null;
	let html = "";
	let httpsRedirect = true;
	let headersFlags = {
		hsts_present: false,
		csp_present: false,
		x_frame_options_present: false,
		x_content_type_options_present: false,
		referrer_policy_present: false,
		permissions_policy_present: false,
		headers_score: 0,
	};
	let fetchFailed = false;
	let fetchError: string | null = null;
	try {
		const res = await safeFetch(url);
		httpStatus = res.status_code;
		html = res.body || "";
		httpsRedirect = res.final_url.startsWith("https://");
		headersFlags = computeHeadersScore(res.headers);
	} catch (err) {
		fetchFailed = true;
		fetchError = err instanceof Error ? err.message : String(err);
	}

	// DNS lookups (run even if HTTP failed — DMARC/SPF are independent
	// observations and still useful for trust comparison).
	const [dmarcRes, spfRes] = await Promise.all([
		resolveTxtWithTimeout(`_dmarc.${competitorDomain}`),
		resolveTxtWithTimeout(competitorDomain),
	]);
	const dmarcRaw = pickRecord(dmarcRes.records, "v=DMARC1");
	const spfRaw = pickRecord(spfRes.records, "v=spf1");

	if (fetchFailed) {
		return {
			type: "competitor_page_snapshot",
			competitor_domain: competitorDomain,
			url_fetched: url,
			fetch_failed: true,
			fetch_error: fetchError,
			http_status: httpStatus,
			title: null,
			h1: null,
			meta_description: null,
			hero_text: null,
			body_text_snippet: null,
			headings: [],
			cta_texts: [],
			trust_snapshot: {
				https_redirect: false,
				...headersFlags,
				dmarc_present: !!dmarcRaw,
				dmarc_policy: parseDmarcPolicy(dmarcRaw),
				spf_present: !!spfRaw,
			},
			fetched_at,
		};
	}

	const title = extractTitle(html);
	const h1 = extractH1(html);
	const metaDescription = extractMetaDescription(html);
	const headings = extractHeadings(html);
	const ctaTexts = extractCtas(html);
	const fullBody = stripHtml(html);
	const bodyText = fullBody.slice(0, BODY_TEXT_LIMIT);
	const heroText = fullBody.slice(0, HERO_TEXT_LIMIT);

	return {
		type: "competitor_page_snapshot",
		competitor_domain: competitorDomain,
		url_fetched: url,
		fetch_failed: false,
		fetch_error: null,
		http_status: httpStatus,
		title,
		h1,
		meta_description: metaDescription,
		hero_text: heroText || null,
		body_text_snippet: bodyText || null,
		headings,
		cta_texts: ctaTexts,
		trust_snapshot: {
			https_redirect: httpsRedirect,
			...headersFlags,
			dmarc_present: !!dmarcRaw,
			dmarc_policy: parseDmarcPolicy(dmarcRaw),
			spf_present: !!spfRaw,
		},
		fetched_at,
	};
}

function envIdFromRef(environmentRef: string): string | null {
	// Format: "environment:<id>"
	const idx = environmentRef.indexOf(":");
	if (idx < 0) return null;
	return environmentRef.slice(idx + 1) || null;
}

function emptyFailedSnapshot(
	competitorDomain: string,
	message: string,
): CompetitorPageSnapshotPayload {
	return {
		type: "competitor_page_snapshot",
		competitor_domain: competitorDomain,
		url_fetched: `https://${competitorDomain}/`,
		fetch_failed: true,
		fetch_error: message,
		http_status: null,
		title: null,
		h1: null,
		meta_description: null,
		hero_text: null,
		body_text_snippet: null,
		headings: [],
		cta_texts: [],
		trust_snapshot: emptyTrustSnapshot(),
		fetched_at: new Date().toISOString(),
	};
}

export const competitorFetchPass: EnrichmentPass = {
	name: "competitor_fetch",
	label: "Capturando concorrentes vigiados",

	shouldRun(ctx: EnrichmentContext): ShouldRunDecision {
		if (ctx.mode !== "full") {
			return {
				run: false,
				reason: `Skipped: competitor fetch runs only in full-mode audits (mode=${ctx.mode})`,
			};
		}
		const envId = envIdFromRef(ctx.scoping.environment_ref);
		if (!envId) {
			return {
				run: false,
				reason: "Skipped: cannot derive environmentId from scoping",
			};
		}
		return {
			run: true,
			reason: "Polite homepage fetch of user-curated competitors",
		};
	},

	async run(ctx: EnrichmentContext): Promise<EnrichmentResult> {
		const start = Date.now();
		try {
			const envId = envIdFromRef(ctx.scoping.environment_ref);
			if (!envId) {
				return buildFailedResult(
					competitorFetchPass.name,
					"cannot derive environmentId from scoping",
					Date.now() - start,
					1,
				);
			}
			const competitors = await loadActiveCompetitors(envId);
			if (competitors.length === 0) {
				return {
					pass_name: competitorFetchPass.name,
					status: "completed",
					reason: "No active competitor domains configured for this env",
					evidence_added: [],
					duration_ms: Date.now() - start,
					attempts: 1,
				};
			}

			ctx.emit({
				type: "pass_progress",
				pass: competitorFetchPass.name,
				message: `Fetching ${competitors.length} competitor homepage(s)`,
			} as any);

			const snapshots = await Promise.all(
				competitors.map((c) =>
					snapshotOne(c.domain).catch((err) =>
						emptyFailedSnapshot(
							c.domain,
							err instanceof Error ? err.message : String(err),
						),
					),
				),
			);

			const evidenceIds = new IdGenerator("ev_compet");
			const now = new Date();
			const evidence: Evidence[] = snapshots.map((payload) => ({
				id: evidenceIds.next(),
				evidence_key: `competitor_page_snapshot:${payload.competitor_domain}`,
				evidence_type: EvidenceType.CompetitorPageSnapshot,
				subject_ref: `competitor:${payload.competitor_domain}`,
				scoping: ctx.scoping,
				cycle_ref: ctx.cycle_ref,
				freshness: {
					observed_at: now,
					fresh_until: new Date(now.getTime() + 24 * 60 * 60 * 1000),
					freshness_state: FreshnessState.Fresh,
					staleness_reason: null,
				},
				source_kind: SourceKind.HttpFetch,
				collection_method: CollectionMethod.StaticFetch,
				payload,
				quality_score: payload.fetch_failed ? 30 : 75,
				content_hash: null,
				created_at: now,
				updated_at: now,
			}));

			const okCount = snapshots.filter((s) => !s.fetch_failed).length;
			return {
				pass_name: competitorFetchPass.name,
				status: "completed",
				reason: `Captured ${snapshots.length} competitor snapshot(s); ${okCount} succeeded`,
				evidence_added: evidence,
				duration_ms: Date.now() - start,
				attempts: 1,
			};
		} catch (err) {
			return buildFailedResult(
				competitorFetchPass.name,
				`competitor-fetch pass threw: ${err instanceof Error ? err.message : String(err)}`,
				Date.now() - start,
				1,
			);
		}
	},
};

// ── Testing helpers ──
export const __testing = {
	stripHtml,
	extractTitle,
	extractH1,
	extractMetaDescription,
	extractHeadings,
	extractCtas,
	parseDmarcPolicy,
	computeHeadersScore,
	snapshotOne,
};
