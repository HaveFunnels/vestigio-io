import { reconFetch, unreachable, type ReconResult } from "./types";

// ──────────────────────────────────────────────
// AI Machine-Readable Artifacts probe — Wave 13 AI Visibility
//
// Checks for the structured-file conventions AI agents look for when
// evaluating a product without rendering the site:
//
//   /llms.txt         — llmstxt.org spec, gives AI a tour of what
//                       the product does + key page links
//   /pricing.md       — plain-markdown pricing parseable by any LLM
//   /pricing.txt      — alternative plain-text variant
//   /AGENTS.md        — agent-capability declaration
//
// When AI agents do programmatic vendor comparison on behalf of buyers,
// missing these = silently skipped. They're 15-minute wins with
// measurable AI Overview / ChatGPT citation lift.
//
// Zero cost. 4 parallel HEAD-style fetches (we GET to get content size).
// ──────────────────────────────────────────────

const ARTIFACT_PATHS = [
	{ path: "/llms.txt", key: "llms_txt" },
	{ path: "/pricing.md", key: "pricing_md" },
	{ path: "/pricing.txt", key: "pricing_txt" },
	{ path: "/AGENTS.md", key: "agents_md" },
] as const;

interface ArtifactProbe {
	path: string;
	present: boolean;
	content_length: number;
	has_substantive_content: boolean;
}

async function probeArtifact(rootDomain: string, path: string): Promise<ArtifactProbe> {
	const url = `https://${rootDomain.replace(/^www\./, "")}${path}`;
	const res = await reconFetch(url);
	if (!res || !res.ok) {
		return {
			path,
			present: false,
			content_length: 0,
			has_substantive_content: false,
		};
	}
	const text = await res.text();
	// AI-parseable artifact needs >100 chars to be considered real
	// (avoids treating a placeholder "coming soon" or a single-line
	// stub as a hit).
	const trimmed = text.trim();
	const hasSubstantive = trimmed.length >= 100;
	return {
		path,
		present: hasSubstantive,
		content_length: text.length,
		has_substantive_content: hasSubstantive,
	};
}

export async function probeMachineReadableArtifacts(rootDomain: string): Promise<ReconResult> {
	const url = `https://${rootDomain.replace(/^www\./, "")}/llms.txt`;
	const results = await Promise.allSettled(
		ARTIFACT_PATHS.map((a) => probeArtifact(rootDomain, a.path)),
	);

	const probesByKey: Record<string, ArtifactProbe> = {};
	let anyFetchOk = false;
	for (let i = 0; i < ARTIFACT_PATHS.length; i++) {
		const r = results[i];
		if (r.status === "fulfilled") {
			probesByKey[ARTIFACT_PATHS[i].key] = r.value;
			anyFetchOk = true;
		} else {
			probesByKey[ARTIFACT_PATHS[i].key] = {
				path: ARTIFACT_PATHS[i].path,
				present: false,
				content_length: 0,
				has_substantive_content: false,
			};
		}
	}

	if (!anyFetchOk) return unreachable(url, "unknown");

	const hasLlmsTxt = probesByKey.llms_txt?.present === true;
	const hasMachineReadablePricing =
		probesByKey.pricing_md?.present === true ||
		probesByKey.pricing_txt?.present === true;
	const hasAgentsMd = probesByKey.agents_md?.present === true;

	return {
		reachable: true,
		fetched_url: url,
		data: {
			has_llms_txt: hasLlmsTxt,
			has_machine_readable_pricing: hasMachineReadablePricing,
			has_agents_md: hasAgentsMd,
			llms_txt_size: probesByKey.llms_txt?.content_length ?? 0,
			pricing_md_size: probesByKey.pricing_md?.content_length ?? 0,
			pricing_txt_size: probesByKey.pricing_txt?.content_length ?? 0,
			agents_md_size: probesByKey.agents_md?.content_length ?? 0,
			artifacts_found: [
				hasLlmsTxt && "llms.txt",
				hasMachineReadablePricing && (probesByKey.pricing_md?.present ? "pricing.md" : "pricing.txt"),
				hasAgentsMd && "AGENTS.md",
			].filter(Boolean),
		},
	};
}
