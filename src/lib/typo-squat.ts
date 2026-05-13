/**
 * typo-squat — Generate plausible typo-squat / impersonation domain
 * variants for Wave 11.4d Phishing Surface Monitor.
 *
 * Strategy: produce a bounded set of variants per input domain (max
 * ~30) so the DNS lookup pass stays under a few seconds. We use four
 * documented typo-squat patterns:
 *
 *   1. Character omission       (vestigo.io)
 *   2. Adjacent-key substitution  (vextigio.io)
 *   3. Common visual swaps      (vesti9io.io, vestlgio.io)
 *   4. TLD swap                 (vestigio.com / .net / .co / .app)
 *   5. Brand-appendage          (vestigio-app.io, get-vestigio.io)
 *
 * We deliberately don't include homoglyph (Unicode lookalikes) for
 * now — they need a separate registrar check and we want to ship a
 * confident first version.
 */

const TLD_SWAPS = ["com", "net", "co", "app", "io", "org", "xyz"];

const VISUAL_SWAPS: Record<string, string[]> = {
	o: ["0"],
	"0": ["o"],
	i: ["1", "l"],
	l: ["1", "i"],
	"1": ["i", "l"],
	s: ["5"],
	a: ["4"],
	e: ["3"],
	g: ["9"],
	b: ["8"],
};

const ADJACENT_KEYS: Record<string, string[]> = {
	q: ["w", "a"],
	w: ["q", "e", "s"],
	e: ["w", "r", "d"],
	r: ["e", "t", "f"],
	t: ["r", "y", "g"],
	y: ["t", "u", "h"],
	u: ["y", "i", "j"],
	i: ["u", "o", "k"],
	o: ["i", "p", "l"],
	p: ["o", "l"],
	a: ["q", "s", "z"],
	s: ["a", "w", "d", "z"],
	d: ["s", "e", "f"],
	f: ["d", "r", "g"],
	g: ["f", "t", "h"],
	h: ["g", "y", "j"],
	j: ["h", "u", "k"],
	k: ["j", "i", "l"],
	l: ["k", "o", "p"],
	z: ["a", "s", "x"],
	x: ["z", "c"],
	c: ["x", "v"],
	v: ["c", "b"],
	b: ["v", "n"],
	n: ["b", "m"],
	m: ["n"],
};

const BRAND_PREFIXES = ["get", "my", "the"];
const BRAND_SUFFIXES = ["app", "io", "hq", "labs", "co"];

/**
 * Split "vestigio.io" → { stem: "vestigio", tld: "io" }
 * Returns null if the input doesn't look like a single-label apex.
 */
function splitDomain(domain: string): { stem: string; tld: string } | null {
	const cleaned = domain.toLowerCase().trim().replace(/^www\./, "");
	const parts = cleaned.split(".");
	if (parts.length < 2) return null;
	const tld = parts[parts.length - 1];
	const stem = parts.slice(0, parts.length - 1).join(".");
	if (stem.length < 4) return null; // skip very short brands (too many false positives)
	return { stem, tld };
}

export function generateTypoVariants(domain: string, maxVariants = 30): string[] {
	const parts = splitDomain(domain);
	if (!parts) return [];
	const { stem, tld } = parts;
	const variants = new Set<string>();

	// 1. Character omission (drop each character once)
	for (let i = 0; i < stem.length; i++) {
		if (stem.length <= 4) break;
		const variant = stem.slice(0, i) + stem.slice(i + 1);
		variants.add(`${variant}.${tld}`);
	}

	// 2. Adjacent-key substitution (one swap per position)
	for (let i = 0; i < stem.length; i++) {
		const ch = stem[i];
		const swaps = ADJACENT_KEYS[ch];
		if (!swaps) continue;
		for (const swap of swaps) {
			variants.add(stem.slice(0, i) + swap + stem.slice(i + 1) + "." + tld);
			if (variants.size > maxVariants * 2) break;
		}
		if (variants.size > maxVariants * 2) break;
	}

	// 3. Visual character swaps
	for (let i = 0; i < stem.length; i++) {
		const ch = stem[i];
		const swaps = VISUAL_SWAPS[ch];
		if (!swaps) continue;
		for (const swap of swaps) {
			variants.add(stem.slice(0, i) + swap + stem.slice(i + 1) + "." + tld);
		}
	}

	// 4. TLD swap (same stem, different TLD)
	for (const t of TLD_SWAPS) {
		if (t === tld) continue;
		variants.add(`${stem}.${t}`);
	}

	// 5. Brand appendage
	for (const prefix of BRAND_PREFIXES) {
		variants.add(`${prefix}${stem}.${tld}`);
		variants.add(`${prefix}-${stem}.${tld}`);
	}
	for (const suffix of BRAND_SUFFIXES) {
		if (suffix === tld) continue;
		variants.add(`${stem}-${suffix}.${tld}`);
	}

	// Cap to maxVariants — sorted so the set is deterministic across runs.
	const list = Array.from(variants).sort();
	return list.slice(0, maxVariants);
}
