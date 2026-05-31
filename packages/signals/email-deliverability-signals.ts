import {
	Evidence,
	EvidenceType,
	Signal,
	Scoping,
	SignalCategory,
	IdGenerator,
	makeRef,
} from "../domain";
import type { EmailAuthRecordPayload } from "../domain";
import { createSignal } from "./create";

// ──────────────────────────────────────────────
// Email Deliverability signals — Wave 23.1
//
// Reads the single EmailAuthRecord evidence (one per env per cycle)
// produced by workers/ingestion/enrichment/email-deliverability.ts
// and emits per-rule signals the inference pack consumes.
//
// One evidence → up to 6 signals (one per rule). Each signal carries
// the raw DNS string in its `description` so the inference pack can
// cite the record verbatim — operators copy-paste the fix directly.
//
// Field convention (Signal has no free-form `data` field, so we pack
// what the pack needs into the standard slots):
//   - subject_label = apex domain
//   - value         = primary discriminator (policy / qualifier / "false")
//   - numeric_value = secondary scalar (include_count, has_rua flag)
//   - description   = raw DNS record text (truncated) or selector list
//
// Signals do NOT fire when the corresponding DNS lookup_failed=true
// (timeout, server error). We don't false-positive on transient DNS
// issues; the rule re-evaluates on the next cycle.
// ──────────────────────────────────────────────

const SPF_LOOKUP_LIMIT = 10;
const RAW_RECORD_MAX = 280;

function truncRaw(raw: string | null | undefined): string {
	if (!raw) return "";
	return raw.length > RAW_RECORD_MAX ? raw.slice(0, RAW_RECORD_MAX) + "…" : raw;
}

export function extractEmailDeliverabilitySignals(
	byType: Map<EvidenceType, Evidence[]>,
	scoping: Scoping,
	cycle_ref: string,
	signals: Signal[],
	ids: IdGenerator,
): void {
	const records = byType.get(EvidenceType.EmailAuthRecord) || [];
	if (records.length === 0) return;
	// One env, one record per cycle. If more land, just consume the
	// first — the others would be duplicates from a retried pass.
	const evidence = records[0];
	const payload = evidence.payload as EmailAuthRecordPayload;
	const evidence_refs = [makeRef("evidence", evidence.id)];
	const apex = payload.apex_domain;

	const push = (s: Signal) => {
		s.subject_label = apex;
		signals.push(s);
	};

	// ── DMARC ─────────────────────────────────
	if (!payload.dmarc.lookup_failed) {
		if (!payload.dmarc.found) {
			push(
				createSignal({
					signal_key: "email.dmarc_absent",
					attribute: "email_auth.dmarc.present",
					value: "false",
					category: SignalCategory.Security,
					confidence: 95,
					scoping,
					cycle_ref,
					ids,
					evidence_refs,
					description: `_dmarc.${apex}: no TXT record found`,
				}),
			);
		} else if (
			payload.dmarc.policy === "none" ||
			payload.dmarc.policy === "quarantine"
		) {
			push(
				createSignal({
					signal_key: "email.dmarc_policy_weak",
					attribute: "email_auth.dmarc.policy",
					value: payload.dmarc.policy,
					numeric_value: payload.dmarc.rua ? 1 : 0,
					category: SignalCategory.Security,
					confidence: 95,
					scoping,
					cycle_ref,
					ids,
					evidence_refs,
					description: truncRaw(payload.dmarc.raw),
				}),
			);
		}
	}

	// ── SPF ───────────────────────────────────
	if (!payload.spf.lookup_failed) {
		if (!payload.spf.found) {
			push(
				createSignal({
					signal_key: "email.spf_absent",
					attribute: "email_auth.spf.present",
					value: "false",
					category: SignalCategory.Security,
					confidence: 95,
					scoping,
					cycle_ref,
					ids,
					evidence_refs,
					description: `${apex}: no v=spf1 TXT record found`,
				}),
			);
		} else {
			// SPF too broad — `+all` (open relay) OR include_count > 10
			// (lookup-limit violation: SPF resolvers reject the record).
			const tooBroad =
				payload.spf.all_qualifier === "+" ||
				payload.spf.include_count > SPF_LOOKUP_LIMIT;
			if (tooBroad) {
				push(
					createSignal({
						signal_key: "email.spf_includes_too_broad",
						attribute: "email_auth.spf.qualifier",
						value: payload.spf.all_qualifier ?? "unknown",
						numeric_value: payload.spf.include_count,
						category: SignalCategory.Security,
						confidence: 90,
						scoping,
						cycle_ref,
						ids,
						evidence_refs,
						description: truncRaw(payload.spf.raw),
					}),
				);
			}
		}
	}

	// ── DKIM ──────────────────────────────────
	if (!payload.dkim.lookup_failed && payload.dkim.found_selectors.length === 0) {
		push(
			createSignal({
				signal_key: "email.dkim_selector_missing",
				attribute: "email_auth.dkim.selectors",
				value: "0",
				numeric_value: 0,
				category: SignalCategory.Security,
				confidence: 85, // a bit lower — we probe a fixed selector list
				scoping,
				cycle_ref,
				ids,
				evidence_refs,
				description: `probed: ${payload.dkim.probed_selectors.join(", ")}`,
			}),
		);
	}

	// ── BIMI ──────────────────────────────────
	if (!payload.bimi.lookup_failed && !payload.bimi.found) {
		push(
			createSignal({
				signal_key: "email.bimi_unconfigured",
				attribute: "email_auth.bimi.present",
				value: "false",
				category: SignalCategory.Security,
				confidence: 95,
				scoping,
				cycle_ref,
				ids,
				evidence_refs,
				description: `default._bimi.${apex}: no BIMI record found`,
			}),
		);
	}
}
