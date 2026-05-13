import { reconFetch, unreachable, type ReconResult } from "./types";

// ──────────────────────────────────────────────
// Reclame Aqui HTML scraper — Wave 12
//
// Zero-cost. ra.com.br (Reclame Aqui) is the canonical BR consumer
// complaint platform. Their public company pages live at
// reclameaqui.com.br/empresa/<slug> — slug = brand kebab-case.
//
// Reclame Aqui surfaces:
//   - "Índice de Solução" (resolution index, 0-10)
//   - "Reputação" badge (RA1000 / Bom / Regular / Ruim / Não recomendada)
//   - complaints count last 6 months
//   - response rate %
//   - last complaint date
//
// Inferences read:
//   - br_complaint_volume_high (>50 last 6mo)
//   - reputation_index_critical (RA score < 6)
//   - response_rate_decay (<70% answered)
//
// Brazilian consumers actively check Reclame Aqui before buying. A
// "Não recomendada" badge here costs more than any on-site signal.
// ──────────────────────────────────────────────

interface ReclameAquiData {
	listed: boolean;
	resolution_index?: number | null;
	reputation_label?: string | null;
	response_rate_pct?: number | null;
	complaints_last_6mo?: number | null;
	complaints_total?: number | null;
}

/** Best-effort slugifier: kebab-case + drop trailing tlds. */
function slugify(brand: string): string {
	return brand
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

function extractNumber(html: string, label: string): number | null {
	// Matches forms like:
	//   "Índice de Solução</span><span>7.8"
	//   <strong>50 reclamações<...
	// We try to be forgiving but bounded.
	const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const patterns = [
		new RegExp(`${escaped}[^0-9]{1,60}([0-9]+(?:[.,][0-9]+)?)`, "i"),
		new RegExp(`([0-9]+(?:[.,][0-9]+)?)[^0-9]{1,40}${escaped}`, "i"),
	];
	for (const re of patterns) {
		const m = html.match(re);
		if (m) {
			const n = parseFloat(m[1].replace(",", "."));
			if (!isNaN(n)) return n;
		}
	}
	return null;
}

function extractReputationLabel(html: string): string | null {
	// Reclame Aqui shows a coloured badge with one of these strings.
	const labels = [
		"RA1000",
		"Ótimo",
		"Bom",
		"Regular",
		"Ruim",
		"Não recomendada",
		"Sem reputação",
	];
	for (const lbl of labels) {
		const re = new RegExp(`\\b${lbl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
		if (re.test(html)) return lbl;
	}
	return null;
}

export async function scrapeReclameAqui(brand: string): Promise<ReconResult> {
	const slug = slugify(brand);
	const url = `https://www.reclameaqui.com.br/empresa/${slug}/`;
	const res = await reconFetch(url);
	if (!res) return unreachable(url, "timeout");

	if (res.status === 404) {
		return {
			reachable: true,
			fetched_url: url,
			data: { listed: false } satisfies ReclameAquiData,
		};
	}
	if (!res.ok) return unreachable(url, "http_error", { status: res.status });

	const html = await res.text();

	const data: ReclameAquiData = {
		listed: true,
		resolution_index: extractNumber(html, "Índice de Solução"),
		reputation_label: extractReputationLabel(html),
		response_rate_pct: extractNumber(html, "responde"),
		complaints_last_6mo: extractNumber(html, "últimos 6 meses"),
		complaints_total: extractNumber(html, "reclamações") ?? null,
	};

	return {
		reachable: true,
		fetched_url: url,
		data: data as unknown as Record<string, unknown>,
	};
}
