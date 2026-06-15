import type {
	EnrichmentContext,
	EnrichmentPass,
	EnrichmentResult,
	ShouldRunDecision,
} from "./types";
import { buildFailedResult } from "./types";
import {
	Evidence,
	EvidenceType,
	SourceKind,
	CollectionMethod,
	FreshnessState,
	IdGenerator,
} from "../../../packages/domain";

// ──────────────────────────────────────────────
// Subdomain Discovery — enrichment pass
//
// Queries Certificate Transparency logs (crt.sh) to find all
// subdomains that have had SSL certificates issued. Then verifies
// which are alive via DNS resolution + HTTP HEAD.
//
// This is critical for:
//   - Discovering app.*, cloud.*, staging.* subdomains
//   - Feeding the brand-intel scanner with real attack surface
//   - Finding exposed admin/staging panels
//   - Understanding the full digital footprint
//
// Data source: crt.sh (free, public CT log aggregator)
// No API key needed. Rate limit: ~5 requests/minute.
// ──────────────────────────────────────────────

const CRT_SH_TIMEOUT_MS = 10_000;
const RESOLVE_TIMEOUT_MS = 5_000;
const MAX_SUBDOMAINS = 50; // cap to prevent abuse on wildcard certs

interface SubdomainEntry {
	subdomain: string;
	alive: boolean;
	statusCode?: number;
	redirectsTo?: string;
}

/**
 * Query crt.sh for subdomains visible in Certificate Transparency logs.
 */
async function queryCrtSh(domain: string): Promise<string[]> {
	const url = `https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), CRT_SH_TIMEOUT_MS);

	try {
		const res = await fetch(url, {
			signal: controller.signal,
			headers: { "User-Agent": "Vestigio-Audit/1.0" },
		});
		clearTimeout(timer);

		if (!res.ok) return [];

		const entries: Array<{ name_value: string }> = await res.json();
		const seen = new Set<string>();

		for (const entry of entries) {
			// name_value can contain multiple domains separated by newlines
			const names = entry.name_value.split("\n");
			for (const name of names) {
				const clean = name.trim().toLowerCase();
				// Skip wildcards and the root domain itself
				if (clean.startsWith("*.")) continue;
				if (clean === domain) continue;
				if (!clean.endsWith(`.${domain}`)) continue;
				seen.add(clean);
			}
		}

		return [...seen].slice(0, MAX_SUBDOMAINS);
	} catch {
		clearTimeout(timer);
		return [];
	}
}

/**
 * Check if a subdomain is alive via HTTP HEAD.
 */
async function probeSubdomain(subdomain: string): Promise<SubdomainEntry> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);

	try {
		const res = await fetch(`https://${subdomain}`, {
			method: "HEAD",
			redirect: "manual",
			signal: controller.signal,
			headers: { "User-Agent": "Vestigio-Audit/1.0" },
		});
		clearTimeout(timer);

		const location = res.headers.get("location") || undefined;
		return {
			subdomain,
			alive: true,
			statusCode: res.status,
			redirectsTo: location,
		};
	} catch {
		clearTimeout(timer);
		// Try HTTP as fallback
		try {
			const res2 = await fetch(`http://${subdomain}`, {
				method: "HEAD",
				redirect: "manual",
				signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
				headers: { "User-Agent": "Vestigio-Audit/1.0" },
			});
			return {
				subdomain,
				alive: true,
				statusCode: res2.status,
				redirectsTo: res2.headers.get("location") || undefined,
			};
		} catch {
			return { subdomain, alive: false };
		}
	}
}

function shouldRun(ctx: EnrichmentContext): ShouldRunDecision {
	// Only run in full-mode audits (cold cycles)
	if (ctx.mode !== "full") {
		return {
			run: false,
			reason: `mode is '${ctx.mode}'. Subdomain discovery only runs in 'full' mode`,
		};
	}
	return { run: true, reason: "Full-mode audit. Discovering subdomains via CT logs" };
}

async function run(ctx: EnrichmentContext): Promise<EnrichmentResult> {
	const start = Date.now();
	const ids = new IdGenerator("sub");
	const evidence: Evidence[] = [];

	try {
		const subdomains = await queryCrtSh(ctx.root_domain);

		if (subdomains.length === 0) {
			return {
				pass_name: "subdomain_discovery",
				status: "completed",
				reason: "No subdomains found in CT logs",
				evidence_added: [],
				duration_ms: Date.now() - start,
				attempts: 1,
			};
		}

		// Probe all discovered subdomains (parallel, limited concurrency)
		const CONCURRENCY = 5;
		const results: SubdomainEntry[] = [];

		for (let i = 0; i < subdomains.length; i += CONCURRENCY) {
			const batch = subdomains.slice(i, i + CONCURRENCY);
			const probes = await Promise.all(batch.map(probeSubdomain));
			results.push(...probes);
		}

		const alive = results.filter((r) => r.alive);
		const now = new Date();
		const freshUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);

		// Create one evidence entry with the full discovery payload
		evidence.push({
			id: ids.next(),
			evidence_key: `subdomain_scan_${ctx.root_domain}`,
			subject_ref: `subdomain_scan:${ctx.root_domain}`,
			evidence_type: EvidenceType.SubdomainDiscovery,
			url: `https://crt.sh/?q=%25.${ctx.root_domain}`,
			scoping: ctx.scoping,
			cycle_ref: ctx.cycle_ref,
			freshness: {
				observed_at: now,
				fresh_until: freshUntil,
				freshness_state: FreshnessState.Fresh,
				staleness_reason: null,
			},
			source_kind: SourceKind.SubdomainEnum,
			collection_method: CollectionMethod.ExternalToolScan,
			confidence: 85,
			quality_score: 80,
			payload: {
				type: "subdomain_discovery",
				root_domain: ctx.root_domain,
				total_found: subdomains.length,
				alive_count: alive.length,
				subdomains: results.map((r) => ({
					name: r.subdomain,
					alive: r.alive,
					status_code: r.statusCode ?? null,
					redirects_to: r.redirectsTo ?? null,
				})),
			},
			collected_at: now,
			created_at: now,
			updated_at: now,
			quality_hint: null,
			enrichment_source: null,
			enrichment_model: null,
		} as unknown as Evidence);

		// Also create individual evidence for each alive subdomain
		// so signals can reference specific subdomains
		for (const sub of alive) {
			evidence.push({
				id: ids.next(),
				evidence_key: `subdomain_${sub.subdomain}`,
				subject_ref: `subdomain:${sub.subdomain}`,
				evidence_type: EvidenceType.SubdomainDiscovery,
				url: `https://${sub.subdomain}`,
				scoping: ctx.scoping,
				cycle_ref: ctx.cycle_ref,
				freshness: {
					observed_at: now,
					fresh_until: freshUntil,
					freshness_state: FreshnessState.Fresh,
					staleness_reason: null,
				},
				source_kind: SourceKind.SubdomainEnum,
				collection_method: CollectionMethod.ExternalToolScan,
				confidence: 90,
				quality_score: 85,
				payload: {
					type: "subdomain_probe",
					subdomain: sub.subdomain,
					alive: true,
					status_code: sub.statusCode,
					redirects_to: sub.redirectsTo ?? null,
				},
				collected_at: now,
				created_at: now,
				updated_at: now,
				quality_hint: null,
				enrichment_source: null,
				enrichment_model: null,
			} as unknown as Evidence);
		}

		ctx.emit({
			type: "step",
			stage: "headless", // reuse existing stage for SSE
			data: {
				message: `Subdomain discovery: ${alive.length}/${subdomains.length} alive`,
				index: 0,
			},
			timestamp: now,
		});

		return {
			pass_name: "subdomain_discovery",
			status: "completed",
			reason: `Found ${subdomains.length} subdomains, ${alive.length} alive`,
			evidence_added: evidence,
			duration_ms: Date.now() - start,
			attempts: 1,
		};
	} catch (err) {
		return buildFailedResult(
			"subdomain_discovery",
			`Subdomain discovery failed: ${(err as Error).message}`,
			Date.now() - start,
			1,
		);
	}
}

export const subdomainDiscoveryPass: EnrichmentPass = {
	name: "subdomain_discovery",
	label: "Subdomain Discovery",
	shouldRun,
	run,
};
