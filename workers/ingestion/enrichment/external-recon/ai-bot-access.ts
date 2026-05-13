import { reconFetch, unreachable, type ReconResult } from "./types";

// ──────────────────────────────────────────────
// AI Bot Access probe — Wave 13 AI Visibility
//
// Fetches /robots.txt on the customer's own root domain and parses for
// AI-specific user agents. Each AI assistant (ChatGPT, Claude, Perplexity,
// Google Gemini, Microsoft Copilot) ships its own crawler. Blocking the
// crawler in robots.txt = auto-eliminating yourself from that platform's
// citation pool.
//
// Detection: we parse User-agent / Disallow stanzas. A blocked AI bot is:
//   - A `User-agent: GPTBot` (or others) block with `Disallow: /` anywhere
//   - A wildcard `User-agent: *` block with `Disallow: /` (blocks everyone)
//
// Zero cost. No auth. Single HTTP GET.
// ──────────────────────────────────────────────

// The major AI search / training crawlers. List is conservative — only
// the bots whose absence in citations is operationally meaningful in 2026.
const AI_BOTS = [
	"GPTBot",            // OpenAI ChatGPT (search + training)
	"ChatGPT-User",      // OpenAI ChatGPT live browse
	"OAI-SearchBot",     // OpenAI SearchGPT
	"ClaudeBot",         // Anthropic Claude (search)
	"anthropic-ai",      // Anthropic training
	"PerplexityBot",     // Perplexity
	"Google-Extended",   // Google Gemini + AI Overviews opt-in
	"Bingbot",           // Microsoft Copilot via Bing
	"Applebot-Extended", // Apple Intelligence opt-in
] as const;

interface RobotsBlock {
	user_agents: string[];
	disallow: string[];
	allow: string[];
}

function parseRobotsTxt(text: string): RobotsBlock[] {
	const blocks: RobotsBlock[] = [];
	let current: RobotsBlock | null = null;
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.replace(/#.*$/, "").trim();
		if (!line) continue;
		const colonIdx = line.indexOf(":");
		if (colonIdx < 0) continue;
		const key = line.slice(0, colonIdx).trim().toLowerCase();
		const value = line.slice(colonIdx + 1).trim();
		if (key === "user-agent") {
			// New block starts when previous block had a Disallow/Allow rule.
			if (!current || current.disallow.length > 0 || current.allow.length > 0) {
				current = { user_agents: [], disallow: [], allow: [] };
				blocks.push(current);
			}
			current.user_agents.push(value);
		} else if (current && key === "disallow") {
			current.disallow.push(value);
		} else if (current && key === "allow") {
			current.allow.push(value);
		}
	}
	return blocks;
}

function isBotBlocked(blocks: RobotsBlock[], botName: string): boolean {
	for (const block of blocks) {
		const matchesBot = block.user_agents.some(
			(ua) => ua.toLowerCase() === botName.toLowerCase(),
		);
		if (!matchesBot) continue;
		// "Disallow: /" blocks the entire site for this UA. An empty
		// Disallow line means explicitly allow everything.
		const blocksRoot = block.disallow.some((d) => d === "/" || d === "/*");
		if (blocksRoot) return true;
	}
	// Wildcard block also counts unless the bot has its own permissive stanza.
	const wildcardBlocked = blocks.some(
		(b) =>
			b.user_agents.some((ua) => ua === "*") &&
			b.disallow.some((d) => d === "/" || d === "/*"),
	);
	if (wildcardBlocked) {
		// Bot-specific permissive stanza overrides wildcard ban.
		const hasBotStanza = blocks.some(
			(b) =>
				b.user_agents.some((ua) => ua.toLowerCase() === botName.toLowerCase()) &&
				b.disallow.every((d) => d === "" || d.length === 0),
		);
		return !hasBotStanza;
	}
	return false;
}

export async function probeAiBotAccess(rootDomain: string): Promise<ReconResult> {
	const url = `https://${rootDomain.replace(/^www\./, "")}/robots.txt`;
	const res = await reconFetch(url);
	if (!res) return unreachable(url, "timeout");
	if (res.status === 404) {
		// No robots.txt = everything implicitly allowed. This is the
		// permissive default — favorable for AI visibility.
		return {
			reachable: true,
			fetched_url: url,
			data: {
				has_robots_txt: false,
				blocked_bots: [],
				allowed_bots: AI_BOTS.slice(),
				all_ai_bots_allowed: true,
				total_blocked: 0,
			},
		};
	}
	if (!res.ok) return unreachable(url, "http_error", { status: res.status });
	const text = await res.text();
	const blocks = parseRobotsTxt(text);

	const blocked: string[] = [];
	const allowed: string[] = [];
	for (const bot of AI_BOTS) {
		if (isBotBlocked(blocks, bot)) blocked.push(bot);
		else allowed.push(bot);
	}

	return {
		reachable: true,
		fetched_url: url,
		data: {
			has_robots_txt: true,
			robots_size: text.length,
			blocked_bots: blocked,
			allowed_bots: allowed,
			all_ai_bots_allowed: blocked.length === 0,
			total_blocked: blocked.length,
		},
	};
}
