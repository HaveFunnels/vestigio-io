/**
 * registrableDomain — eTLD+1 without a full Public Suffix List.
 *
 * The naive "last two labels" rule breaks on multi-part public
 * suffixes: for `loja.com.br` it returns `com.br`, and every
 * `isSameDomain(x, "com.br")` check then accepts ANY *.com.br host —
 * crawl scope, same-domain relations and real-path sets all go wrong
 * together on Brazilian domains (docs/EXAME_DO_PLANO.md E1). Five
 * hand-rolled copies of the naive rule existed; this is the one
 * implementation they now share.
 *
 * A curated suffix set instead of the full PSL: Vestigio's customers
 * are LatAm + US/EU commerce and SaaS, and the browser snippet already
 * solves this exactly per-site via cookie-probe walk-up. The set below
 * covers every ccTLD second-level registration pattern we realistically
 * see; an unknown multi-part suffix degrades to the old behavior, never
 * worse than before.
 */

/** Two-label public suffixes under which names are registered. */
const MULTI_PART_SUFFIXES = new Set([
	// Brazil — the market that broke the naive rule
	'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br', 'art.br', 'adv.br',
	'ind.br', 'inf.br', 'srv.br', 'eco.br', 'blog.br', 'wiki.br', 'tv.br',
	'eti.br', 'app.br', 'dev.br', 'log.br', 'seg.br', 'tec.br',
	// Hispanic America
	'com.ar', 'com.mx', 'com.co', 'com.pe', 'com.uy', 'com.py', 'com.bo',
	'com.ec', 'com.ve', 'com.cl', 'com.gt', 'com.do', 'com.sv', 'com.hn',
	'com.ni', 'com.pa', 'org.ar', 'org.mx', 'net.ar', 'net.mx', 'edu.ar',
	'edu.mx', 'gob.mx', 'gob.ar', 'gov.co',
	// Anglosphere + Europe commerce
	'co.uk', 'org.uk', 'me.uk', 'ac.uk', 'gov.uk',
	'com.au', 'net.au', 'org.au', 'co.nz', 'org.nz',
	'co.za', 'com.pt', 'com.es', 'com.pl', 'com.de', 'co.at',
	// Asia commerce
	'co.jp', 'ne.jp', 'or.jp', 'com.cn', 'net.cn', 'org.cn',
	'com.hk', 'com.sg', 'com.tw', 'co.kr', 'co.in', 'com.my', 'co.th',
	'com.ph', 'com.vn', 'co.id',
]);

/**
 * The registrable (apex) domain for a hostname: `loja.com.br` for
 * `www.loja.com.br`, `loja.com` for `seguro.loja.com`. A hostname that
 * IS a public suffix (or an IP / single label) is returned unchanged.
 */
export function registrableDomain(hostname: string): string {
	const host = hostname.toLowerCase().replace(/\.$/, '');
	// IPv4 / IPv6 literals have no registrable domain — pass through.
	if (/^[0-9.]+$/.test(host) || host.includes(':')) return host;
	const parts = host.split('.');
	if (parts.length <= 2) return host;
	const lastTwo = parts.slice(-2).join('.');
	if (MULTI_PART_SUFFIXES.has(lastTwo)) {
		return parts.slice(-3).join('.');
	}
	return lastTwo;
}
