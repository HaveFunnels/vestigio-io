import { describe, it, expect, beforeEach, vi } from "vitest";
import { getFirstTouch, getOrCreateSessionId, isPaidFirstTouch } from "@/libs/marketing-session";

// jsdom here ships a localStorage stub without clear(), so the tests
// install a real one. Kept local to this file rather than in the
// global setup, so no other suite changes behaviour.
class MemoryStorage {
	private m = new Map<string, string>();
	getItem(k: string) {
		return this.m.has(k) ? this.m.get(k)! : null;
	}
	setItem(k: string, v: string) {
		this.m.set(k, String(v));
	}
	removeItem(k: string) {
		this.m.delete(k);
	}
	clear() {
		this.m.clear();
	}
	key(i: number) {
		return [...this.m.keys()][i] ?? null;
	}
	get length() {
		return this.m.size;
	}
}

function installStorage() {
	for (const name of ["localStorage", "sessionStorage"] as const) {
		Object.defineProperty(window, name, {
			value: new MemoryStorage(),
			configurable: true,
			writable: true,
		});
	}
}

// Attribution used to be read off window.location.search at the
// moment each event fired, so an ad click on /?utm_source=facebook
// attributed the landing pageview and nothing after it. By
// /auth/signup the query string was gone. These pin the behaviour
// that makes "which campaign produced this signup" answerable.

function navigate(url: string) {
	window.history.replaceState({}, "", url);
}

beforeEach(() => {
	installStorage();
	navigate("/");
});

describe("first-touch attribution", () => {
	it("survives navigating away from the landing page", () => {
		navigate("/?utm_source=facebook&utm_campaign=outubro&utm_medium=cpc");
		const landing = getFirstTouch();
		expect(landing.utmSource).toBe("facebook");
		expect(landing.utmCampaign).toBe("outubro");

		// The visitor walks to the signup page. No query string there.
		navigate("/auth/signup");
		const atSignup = getFirstTouch();
		expect(atSignup.utmSource).toBe("facebook");
		expect(atSignup.utmCampaign).toBe("outubro");
		expect(atSignup.landingPath).toBe("/");
	});

	it("never lets a later visit overwrite the campaign that earned it", () => {
		navigate("/?utm_source=facebook&utm_campaign=outubro");
		expect(getFirstTouch().utmSource).toBe("facebook");

		// Same person returns later via Google. First touch is the ad.
		navigate("/?utm_source=google&utm_campaign=brand");
		expect(getFirstTouch().utmSource).toBe("facebook");
		expect(getFirstTouch().utmCampaign).toBe("outubro");
	});

	it("captures click ids, so a campaign reconciles without UTMs on the creative", () => {
		navigate("/?fbclid=abc123");
		const ft = getFirstTouch();
		expect(ft.fbclid).toBe("abc123");
		expect(isPaidFirstTouch(ft)).toBe(true);
	});

	it("records a direct visit too, rather than nothing", () => {
		navigate("/pricing");
		const ft = getFirstTouch();
		expect(ft.landingPath).toBe("/pricing");
		expect(ft.firstSeenAt).toBeTruthy();
		expect(isPaidFirstTouch(ft)).toBe(false);
	});

	it("rewrites a corrupt stored value instead of throwing", () => {
		localStorage.setItem("_vtg_ft", "{not json");
		navigate("/?utm_source=tiktok");
		expect(getFirstTouch().utmSource).toBe("tiktok");
	});

	it("degrades quietly when storage is unavailable", () => {
		// Private windows and blocked site data throw on access.
		// Attribution is never worth breaking a signup form over.
		const spy = vi
			.spyOn(window.localStorage, "getItem")
			.mockImplementation(() => {
				throw new Error("blocked");
			});
		vi.spyOn(window.sessionStorage, "getItem").mockImplementation(() => {
			throw new Error("blocked");
		});
		navigate("/?utm_source=facebook");
		expect(() => getFirstTouch()).not.toThrow();
		// Falls back to the live query string, which still attributes a
		// direct ad landing.
		expect(getFirstTouch().utmSource).toBe("facebook");
		expect(getOrCreateSessionId()).toBe("");
		spy.mockRestore();
	});
});

describe("session id", () => {
	it("is stable within a tab", () => {
		const a = getOrCreateSessionId();
		const b = getOrCreateSessionId();
		expect(a).toBeTruthy();
		expect(a).toBe(b);
	});
});
