// ──────────────────────────────────────────────
// Who this visitor is, for as long as the browser remembers.
//
// Two separate identities, deliberately:
//
//   session (sessionStorage) — one tab, one visit. Already used by
//     TrackingScript for MarketingEvent.sessionId.
//
//   first touch (localStorage) — the campaign that produced this
//     person, written once and never overwritten.
//
// The second is new and it is the one that mattered. UTM params were
// read straight off window.location.search at the moment each event
// fired, so an ad click landing on /?utm_source=facebook attributed
// the homepage pageview and nothing else: by /auth/signup the query
// string is gone and every later event carried no campaign at all.
// There was no way to answer "which campaign produced this signup",
// which is the only question that justifies ad spend.
//
// First touch is never overwritten, so a visitor who arrives from an
// ad, leaves, and returns via Google later still counts as the ad's.
// That is the honest attribution for a product with a long
// consideration window, and it is the opposite of what reading the
// live query string gave us.
//
// Every accessor is wrapped: storage throws in private windows and
// when site data is blocked, and attribution is never worth breaking
// a signup form over.
// ──────────────────────────────────────────────

const SESSION_KEY = "_vtg_sid";
const FIRST_TOUCH_KEY = "_vtg_ft";

export interface FirstTouch {
	utmSource?: string;
	utmMedium?: string;
	utmCampaign?: string;
	utmContent?: string;
	utmTerm?: string;
	/** Click ids, so a campaign can be reconciled with the ad platform
	 *  even when UTMs were not set on the creative. */
	fbclid?: string;
	gclid?: string;
	ttclid?: string;
	referrer?: string;
	landingPath?: string;
	firstSeenAt?: string;
}

/** Per-tab visit id. Same key and shape TrackingScript already used. */
export function getOrCreateSessionId(): string {
	if (typeof window === "undefined") return "";
	try {
		let sid = sessionStorage.getItem(SESSION_KEY);
		if (!sid) {
			sid = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
			sessionStorage.setItem(SESSION_KEY, sid);
		}
		return sid;
	} catch {
		// Private window or blocked site data. An un-attributed event
		// beats a thrown one.
		return "";
	}
}

function readParams(): FirstTouch {
	const p = new URLSearchParams(window.location.search);
	const pick = (k: string) => p.get(k) || undefined;
	return {
		utmSource: pick("utm_source"),
		utmMedium: pick("utm_medium"),
		utmCampaign: pick("utm_campaign"),
		utmContent: pick("utm_content"),
		utmTerm: pick("utm_term"),
		fbclid: pick("fbclid"),
		gclid: pick("gclid"),
		ttclid: pick("ttclid"),
	};
}

function hasAnyAttribution(t: FirstTouch): boolean {
	return Boolean(
		t.utmSource || t.utmMedium || t.utmCampaign || t.fbclid || t.gclid || t.ttclid,
	);
}

/**
 * The campaign that produced this visitor.
 *
 * Writes on the first page that carries attribution, or on the first
 * page at all when there is none (so a direct visitor still records a
 * referrer and a landing path). Never overwrites.
 */
export function getFirstTouch(): FirstTouch {
	if (typeof window === "undefined") return {};
	try {
		const existing = localStorage.getItem(FIRST_TOUCH_KEY);
		if (existing) {
			try {
				return JSON.parse(existing) as FirstTouch;
			} catch {
				// Corrupt value: fall through and rewrite it.
			}
		}
		const fresh: FirstTouch = {
			...readParams(),
			referrer: document.referrer || undefined,
			landingPath: window.location.pathname || undefined,
			firstSeenAt: new Date().toISOString(),
		};
		localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(fresh));
		return fresh;
	} catch {
		// Storage unavailable. Return what the current URL says rather
		// than nothing, which at least attributes a direct ad landing.
		try {
			return readParams();
		} catch {
			return {};
		}
	}
}

/** True when the stored first touch names a paid source. */
export function isPaidFirstTouch(t: FirstTouch = getFirstTouch()): boolean {
	return hasAnyAttribution(t);
}
