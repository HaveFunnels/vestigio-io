import * as dns from "node:dns/promises";
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
import type { EmailAuthRecordPayload } from "../../../packages/domain";

// ──────────────────────────────────────────────
// Email deliverability — enrichment pass (Wave 23.1)
//
// Resolves the env's email-authentication DNS records (DMARC, SPF,
// DKIM, BIMI) and emits a single EmailAuthRecord evidence row per
// cycle. The email_deliverability inference pack reads that row
// and emits domain-level findings:
//   - dmarc_record_absent  (critical) — no DMARC at all
//   - dmarc_policy_weak    (high)     — p=none or p=quarantine
//   - spf_record_absent    (high)     — no SPF on the apex
//   - spf_includes_too_broad (medium) — +all or >10 includes
//   - dkim_selector_missing (medium)  — no DKIM resolved
//   - bimi_unconfigured    (low)      — no BIMI logo configured
//
// Why this matters: phishing is the #1 attack vector against brand
// domains. DMARC `p=reject` is the table-stakes posture; most
// enterprises THINK they have it, ~30% actually do (Wave 23.1 spec).
// Each finding cites the DNS record verbatim so the operator can
// copy-paste the fix.
//
// Zero infra change: stdlib DNS resolver only. ~200ms per env.
// ──────────────────────────────────────────────

const DNS_TIMEOUT_MS = 4_000;

const DKIM_SELECTORS_TO_PROBE = [
	"default",
	"google",
	"k1",
	"k2",
	"selector1",
	"selector2",
	"mail",
	"dkim",
	"smtp",
	"mandrill",
	"sendgrid",
	"mailgun",
];

interface DnsLookupResult {
	records: string[]; // joined TXT chunks
	lookup_failed: boolean;
}

/** Race a DNS lookup against a timeout. Returns lookup_failed=true on
 *  timeout or any genuine DNS error EXCEPT NXDOMAIN/ENODATA which is
 *  "no record exists" — that's data, not a failure. */
async function resolveTxtWithTimeout(name: string): Promise<DnsLookupResult> {
	try {
		const records = await Promise.race([
			dns.resolveTxt(name),
			new Promise<string[][]>((_, reject) =>
				setTimeout(() => reject(new Error("dns_timeout")), DNS_TIMEOUT_MS),
			),
		]);
		// Each record is an array of strings (TXT chunks); join chunks
		// per record so the consumer sees the full string.
		return {
			records: records.map((chunks) => chunks.join("")),
			lookup_failed: false,
		};
	} catch (err: any) {
		const code = err?.code as string | undefined;
		// NXDOMAIN / ENODATA = the record doesn't exist. That's a
		// legitimate observation, NOT a failure. Mark as found=false
		// with empty records so the pack can fire its "absent" rule.
		if (code === "ENOTFOUND" || code === "ENODATA" || code === "NXDOMAIN") {
			return { records: [], lookup_failed: false };
		}
		// Anything else (timeout, network unreachable, server failure)
		// is a real failure — the pack suppresses rules that depend
		// on this record so we don't false-positive.
		return { records: [], lookup_failed: true };
	}
}

/** Pick the first TXT record matching a leading marker (case-insensitive). */
function pickRecord(records: string[], marker: string): string | null {
	const m = marker.toLowerCase();
	for (const r of records) {
		if (r.toLowerCase().startsWith(m)) return r;
	}
	return null;
}

/** Parse `tag=value;` pairs out of a DMARC record. Spec: RFC 7489 §6.4. */
function parseDmarcTags(raw: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const part of raw.split(";")) {
		const idx = part.indexOf("=");
		if (idx < 0) continue;
		const tag = part.slice(0, idx).trim().toLowerCase();
		const value = part.slice(idx + 1).trim();
		if (tag && value) out[tag] = value;
	}
	return out;
}

function normalizeDmarcPolicy(p: string | undefined): "none" | "quarantine" | "reject" | null {
	if (p === "none" || p === "quarantine" || p === "reject") return p;
	return null;
}

/** Parse SPF mechanisms — count `include:` entries and detect the all
 *  qualifier. Spec: RFC 7208. */
function parseSpf(raw: string): {
	include_count: number;
	all_qualifier: "+" | "-" | "~" | "?" | null;
} {
	let include_count = 0;
	let all_qualifier: "+" | "-" | "~" | "?" | null = null;
	// Tokenize on whitespace; SPF is space-separated mechanisms.
	for (const token of raw.split(/\s+/)) {
		const t = token.toLowerCase();
		if (t.startsWith("include:")) include_count += 1;
		// Detect the `all` mechanism with optional qualifier prefix.
		// Mechanisms without explicit qualifier default to `+`.
		if (t === "all") all_qualifier = "+";
		else if (t === "+all") all_qualifier = "+";
		else if (t === "-all") all_qualifier = "-";
		else if (t === "~all") all_qualifier = "~";
		else if (t === "?all") all_qualifier = "?";
	}
	return { include_count, all_qualifier };
}

/** Extract a tag value from a BIMI record (l= or a=). */
function parseBimiTag(raw: string, tag: "l" | "a"): string | null {
	const matches = raw.match(new RegExp(`(?:^|;)\\s*${tag}\\s*=\\s*([^;]+)`, "i"));
	return matches ? matches[1].trim() : null;
}

async function collect(
	apex: string,
): Promise<EmailAuthRecordPayload> {
	// Fire all DNS lookups in parallel. Each has its own try/catch
	// inside resolveTxtWithTimeout, so the worst case is some records
	// marked lookup_failed=true — never a thrown exception.
	const dmarcP = resolveTxtWithTimeout(`_dmarc.${apex}`);
	const spfP = resolveTxtWithTimeout(apex);
	const bimiP = resolveTxtWithTimeout(`default._bimi.${apex}`);
	const dkimPromises = DKIM_SELECTORS_TO_PROBE.map((selector) =>
		resolveTxtWithTimeout(`${selector}._domainkey.${apex}`).then((res) => ({
			selector,
			res,
		})),
	);

	const [dmarcRes, spfRes, bimiRes, dkimResults] = await Promise.all([
		dmarcP,
		spfP,
		bimiP,
		Promise.all(dkimPromises),
	]);

	// DMARC parse
	const dmarcRaw = pickRecord(dmarcRes.records, "v=DMARC1");
	const dmarcTags = dmarcRaw ? parseDmarcTags(dmarcRaw) : {};
	const dmarcPolicy = normalizeDmarcPolicy(dmarcTags.p);
	const dmarcSp = normalizeDmarcPolicy(dmarcTags.sp) ?? dmarcPolicy;

	// SPF parse
	const spfRaw = pickRecord(spfRes.records, "v=spf1");
	const spfParsed = spfRaw
		? parseSpf(spfRaw)
		: { include_count: 0, all_qualifier: null as null | "+" | "-" | "~" | "?" };

	// DKIM aggregation — any selector that returned a v=DKIM1 record
	// counts as "found". We surface ALL selectors that resolved so
	// the operator can see which providers are configured.
	const foundDkimSelectors: string[] = [];
	const dkimRawBySelector: Record<string, string> = {};
	let anyDkimFailed = false;
	for (const { selector, res } of dkimResults) {
		if (res.lookup_failed) {
			anyDkimFailed = true;
			continue;
		}
		const raw = pickRecord(res.records, "v=DKIM1");
		if (raw) {
			foundDkimSelectors.push(selector);
			dkimRawBySelector[selector] = raw;
		}
	}

	// BIMI parse
	const bimiRaw = pickRecord(bimiRes.records, "v=BIMI1");

	return {
		type: "email_auth_record",
		apex_domain: apex,
		dmarc: {
			found: !!dmarcRaw,
			raw: dmarcRaw,
			policy: dmarcPolicy,
			rua: dmarcTags.rua ?? null,
			subdomain_policy: dmarcSp,
			lookup_failed: dmarcRes.lookup_failed,
		},
		spf: {
			found: !!spfRaw,
			raw: spfRaw,
			include_count: spfParsed.include_count,
			all_qualifier: spfParsed.all_qualifier,
			lookup_failed: spfRes.lookup_failed,
		},
		dkim: {
			probed_selectors: DKIM_SELECTORS_TO_PROBE,
			found_selectors: foundDkimSelectors,
			raw_by_selector: dkimRawBySelector,
			// Only mark lookup_failed if EVERY selector lookup failed —
			// otherwise we have a legit signal: NXDOMAIN on some
			// selectors is the normal "this selector isn't configured"
			// state, not a transient error. A mix of timeouts on some
			// selectors + NXDOMAIN on the rest used to short-circuit to
			// lookup_failed=true (suppressing the missing-DKIM signal);
			// require ALL selectors to have actually errored.
			lookup_failed: dkimResults.every(({ res }) => res.lookup_failed),
		},
		bimi: {
			found: !!bimiRaw,
			raw: bimiRaw,
			logo_url: bimiRaw ? parseBimiTag(bimiRaw, "l") : null,
			vmc_url: bimiRaw ? parseBimiTag(bimiRaw, "a") : null,
			lookup_failed: bimiRes.lookup_failed,
		},
	};
}

// Exported pure helper so tests can drive the collector with fake
// DNS responses without mocking the resolver layer.
export const __testing = { collect, parseSpf, parseDmarcTags, parseBimiTag };

export const emailDeliverabilityPass: EnrichmentPass = {
	name: "email_deliverability",
	label: "Analisando autenticação de email (DMARC / SPF / DKIM / BIMI)",

	shouldRun(_ctx: EnrichmentContext): ShouldRunDecision {
		// Cheap DNS lookups — run on every cycle mode. No reason to
		// gate by `shallow`/`full` since the cost is bounded at
		// ~200ms in the worst case.
		return { run: true, reason: "DNS lookups are cheap; runs on every cycle" };
	},

	async run(ctx: EnrichmentContext): Promise<EnrichmentResult> {
		const start = Date.now();
		try {
			const ids = new IdGenerator(ctx.cycle_ref + ":email_deliverability");
			const apex = ctx.root_domain;
			const payload = await collect(apex);

			const now = new Date();
			const freshUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);

			const evidence: Evidence = {
				id: ids.next(),
				evidence_key: `email_auth:${apex}`,
				subject_ref: `email_auth:${apex}`,
				evidence_type: EvidenceType.EmailAuthRecord,
				url: `dns:${apex}`,
				scoping: ctx.scoping,
				cycle_ref: ctx.cycle_ref,
				freshness: {
					observed_at: now,
					fresh_until: freshUntil,
					freshness_state: FreshnessState.Fresh,
					staleness_reason: null,
				},
				source_kind: SourceKind.DnsLookup,
				collection_method: CollectionMethod.StaticFetch,
				confidence: 90,
				quality_score: 85,
				payload,
				collected_at: now,
				created_at: now,
				updated_at: now,
				quality_hint: null,
				enrichment_source: null,
				enrichment_model: null,
			} as unknown as Evidence;

			ctx.emit({
				type: "step",
				stage: "static_checks",
				data: {
					message: `Email auth: DMARC=${payload.dmarc.found ? payload.dmarc.policy ?? "invalid" : "absent"}, SPF=${payload.spf.found ? "ok" : "absent"}, DKIM=${payload.dkim.found_selectors.length} selectors, BIMI=${payload.bimi.found ? "ok" : "absent"}`,
				},
			} as any);

			return {
				pass_name: emailDeliverabilityPass.name,
				status: "completed",
				reason: "Resolved email auth records",
				evidence_added: [evidence],
				duration_ms: Date.now() - start,
				attempts: 1,
			};
		} catch (err) {
			return buildFailedResult(
				emailDeliverabilityPass.name,
				`email-deliverability pass threw: ${err instanceof Error ? err.message : String(err)}`,
				Date.now() - start,
				1,
			);
		}
	},
};
