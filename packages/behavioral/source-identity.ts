// ──────────────────────────────────────────────
// Traffic-source identity — ONE module (EXAME A2)
//
// The plan used to present the same session source three different
// ways: the measured table rendered the raw lowercase token
// ("facebook", "tiktok", "direto/sem origem" — any arbitrary
// utm_source passed straight through), the journeys persona said
// "Facebook Ads" via its own humanizer, and the behavioral alert
// interpolated the raw token into a sentence. This module is the
// single source of truth: canonical key → display label → brand color.
//
// Server sections persist the CANONICAL KEY in planJson; every
// customer-facing string uses `label`; the UI renders `color` as a
// small brand dot beside the label (the house bans emoji, and full
// third-party logos are a licensing/asset question — a brand-colored
// dot plus the proper name reads as deliberate design, which is what
// A2 was about).
// ──────────────────────────────────────────────

export interface SourceIdentity {
	/** Canonical machine key — stable, lowercase. */
	key: string;
	/** Customer-facing display name. */
	label: string;
	/** Brand-ish hex for the identity dot. */
	color: string;
}

interface SourceSignals {
	source?: string | null;
	medium?: string | null;
	referrer?: string | null;
	gclid?: string | null;
	fbclid?: string | null;
}

const IDENTITIES: Record<string, Omit<SourceIdentity, "key">> = {
	facebook: { label: "Facebook", color: "#1877F2" },
	facebook_ads: { label: "Facebook Ads", color: "#1877F2" },
	instagram: { label: "Instagram", color: "#E1306C" },
	tiktok: { label: "TikTok", color: "#00F2EA" },
	google: { label: "Google", color: "#4285F4" },
	google_ads: { label: "Google Ads", color: "#4285F4" },
	youtube: { label: "YouTube", color: "#FF0000" },
	linkedin: { label: "LinkedIn", color: "#0A66C2" },
	pinterest: { label: "Pinterest", color: "#E60023" },
	x: { label: "X (Twitter)", color: "#9CA3AF" },
	whatsapp: { label: "WhatsApp", color: "#25D366" },
	email: { label: "Email", color: "#A78BFA" },
	organic: { label: "Busca orgânica", color: "#34D399" },
	referral: { label: "Referência", color: "#94A3B8" },
	direct: { label: "Direto", color: "#94A3B8" },
};

/** Canonical key from raw attribution signals. Extend here, nowhere else. */
export function canonicalSourceKey(signals: SourceSignals): string {
	const source = (signals.source ?? "").toLowerCase().trim();
	const medium = (signals.medium ?? "").toLowerCase().trim();
	const isPaid = medium === "cpc" || medium === "paid" || medium === "ppc" || medium === "paid_social";

	if (signals.gclid || (source.includes("google") && isPaid)) return "google_ads";
	if (signals.fbclid) return "facebook_ads";
	if (source === "fb" || source === "meta" || source.includes("facebook")) {
		return isPaid ? "facebook_ads" : "facebook";
	}
	if (source === "ig" || source.includes("instagram")) return "instagram";
	if (source.includes("tiktok")) return "tiktok";
	if (source.includes("youtube")) return "youtube";
	if (source.includes("linkedin")) return "linkedin";
	if (source.includes("pinterest")) return "pinterest";
	if (source === "x" || source.includes("twitter")) return "x";
	if (source.includes("whatsapp") || source === "wa") return "whatsapp";
	if (medium === "email" || source.includes("klaviyo") || source.includes("brevo") || source.includes("mailchimp") || source === "email" || source === "newsletter") return "email";
	if (medium === "organic" || ((source === "google" || source === "bing" || source === "duckduckgo") && !isPaid)) return "organic";
	if (source) return source; // unknown-but-present utm_source keeps its token as key
	if (signals.referrer) return "referral";
	return "direct";
}

/** Full identity for a canonical key (or raw signals via canonicalSourceKey). */
export function sourceIdentity(key: string, referrer?: string | null): SourceIdentity {
	const known = IDENTITIES[key];
	if (known) {
		if (key === "referral" && referrer) {
			try {
				const host = new URL(referrer).hostname.replace(/^www\./, "");
				return { key, label: `Referência (${host})`, color: known.color };
			} catch {
				/* fall through to plain label */
			}
		}
		return { key, ...known };
	}
	// Unknown utm_source token: present it capitalized, never raw-lowercase.
	const label = key
		.replace(/[_-]+/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());
	return { key, label: label || "Direto", color: "#94A3B8" };
}

/** Convenience: signals → identity in one call. */
export function identifySource(signals: SourceSignals): SourceIdentity {
	return sourceIdentity(canonicalSourceKey(signals), signals.referrer);
}
