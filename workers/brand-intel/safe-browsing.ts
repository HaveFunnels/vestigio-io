import { createHash } from "crypto";

// ──────────────────────────────────────────────
// Wave 23 P2.2 — Google Safe Browsing cross-check
//
// Antes: Vestigio detectava clones via similarity-scorer e emitia
// confidence_score. Não sabíamos se Google já tinha o domínio como
// malicioso. Agora cross-checa os matches contra Safe Browsing API
// — se o Google já flagrou como malware/social-engineering/unwanted,
// boostamos confidence + adicionamos contexto pro customer ("Google
// também já listou esse domínio como phishing").
//
// API: https://developers.google.com/safe-browsing/v4/lookup-api
// Key necessária: GOOGLE_SAFE_BROWSING_API_KEY (env var).
// Sem a key, função retorna [] e o pipeline degrada silenciosamente.
//
// Threats checadas:
//   MALWARE                    — site distribui malware
//   SOCIAL_ENGINEERING         — phishing
//   UNWANTED_SOFTWARE          — adware, PUPs
//   POTENTIALLY_HARMFUL_APPLICATION — apps maliciosos
//
// Caching: feito em memória por 24h (Google Safe Browsing TTL típico).
// Mata o problema de re-lookup do mesmo domínio em ciclos sucessivos.
//
// Rate limit: Google permite 10k requests/dia free. Lookup endpoint
// aceita batch de até 500 URLs por call — usamos isso pra cap o gasto.
// ──────────────────────────────────────────────

export type SafeBrowsingThreatType =
	| "MALWARE"
	| "SOCIAL_ENGINEERING"
	| "UNWANTED_SOFTWARE"
	| "POTENTIALLY_HARMFUL_APPLICATION";

export interface SafeBrowsingMatch {
	url: string;
	threatType: SafeBrowsingThreatType;
}

interface CacheEntry {
	matches: SafeBrowsingMatch[];
	cachedAt: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const cache = new Map<string, CacheEntry>();

function cacheKey(urls: string[]): string {
	const sorted = [...urls].sort().join(",");
	return createHash("sha256").update(sorted).digest("hex").slice(0, 32);
}

/**
 * Cross-check uma lista de URLs contra Google Safe Browsing.
 * Retorna apenas os matches positivos. URLs sem match não aparecem
 * no retorno (silent OK).
 *
 * No key configurada → retorna []. Pipeline upstream degrada
 * silenciosamente (clones continuam sendo detectados, só sem o boost
 * adicional de "Google também flagrou").
 *
 * Cap: 500 URLs por call (limite do endpoint).
 */
export async function checkSafeBrowsing(
	urls: string[],
): Promise<SafeBrowsingMatch[]> {
	const apiKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
	if (!apiKey) {
		// Sem key, silencioso. Operador configura quando quiser o sinal extra.
		return [];
	}
	if (urls.length === 0) return [];

	const dedup = Array.from(new Set(urls)).slice(0, 500);

	// Cache hit — devolve sem tocar a API.
	const key = cacheKey(dedup);
	const hit = cache.get(key);
	if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS) {
		return hit.matches;
	}

	try {
		const response = await fetch(
			`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					client: {
						clientId: "vestigio-io",
						clientVersion: "1.0.0",
					},
					threatInfo: {
						threatTypes: [
							"MALWARE",
							"SOCIAL_ENGINEERING",
							"UNWANTED_SOFTWARE",
							"POTENTIALLY_HARMFUL_APPLICATION",
						],
						platformTypes: ["ANY_PLATFORM"],
						threatEntryTypes: ["URL"],
						threatEntries: dedup.map((url) => ({ url })),
					},
				}),
			},
		);

		if (!response.ok) {
			console.warn(
				`[safe-browsing] API returned ${response.status}: ${await response.text().catch(() => "")}`,
			);
			return [];
		}

		const data = (await response.json()) as {
			matches?: Array<{
				threat: { url: string };
				threatType: SafeBrowsingThreatType;
			}>;
		};

		const matches: SafeBrowsingMatch[] = (data.matches ?? []).map((m) => ({
			url: m.threat.url,
			threatType: m.threatType,
		}));

		cache.set(key, { matches, cachedAt: Date.now() });
		return matches;
	} catch (err) {
		console.warn(
			"[safe-browsing] lookup failed:",
			err instanceof Error ? err.message : err,
		);
		return [];
	}
}

/**
 * Helper: dado um domínio, gera as URLs que o Safe Browsing reconhece
 * (http e https, com e sem www).
 */
export function urlsForDomain(domain: string): string[] {
	const bare = domain.replace(/^https?:\/\//, "").replace(/^www\./, "");
	return [`https://${bare}/`, `http://${bare}/`, `https://www.${bare}/`];
}
