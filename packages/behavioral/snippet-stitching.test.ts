import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// The snippet is a load-bearing browser IIFE that has caused production
// incidents before, so the cross-domain stitching it now does — the code
// that decides whether two page views on loja.com and seguro.loja.com
// are one funnel — gets loaded into jsdom and exercised for real.
//
// Loading it runs init() against the mocked DOM, so the stubs below have
// to be complete enough that init() does not throw; a throw here would
// mean the pixel breaks on a real store's page.

const SNIPPET = readFileSync(
	join(__dirname, "../../public/snippet/vestigio.js"),
	"utf-8",
);

function loadSnippetAt(url: string, opts: { cookie?: string } = {}) {
	const u = new URL(url);
	// Minimal but faithful browser surface.
	let cookieJar = opts.cookie ?? "";
	const scriptEl = {
		getAttribute: (a: string) => (a === "data-env" ? "env_test" : null),
		src: "https://app.vestigio.io/snippet/vestigio.js",
	};
	const store = new Map<string, string>();
	const makeStorage = () => {
		const m = new Map<string, string>();
		return {
			getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
			setItem: (k: string, v: string) => void m.set(k, String(v)),
			removeItem: (k: string) => void m.delete(k),
		};
	};
	const listeners: Record<string, Function[]> = {};
	const doc: any = {
		readyState: "complete",
		title: "Loja",
		referrer: "",
		querySelector: (sel: string) => (sel === "script[data-env]" ? scriptEl : null),
		querySelectorAll: () => [],
		addEventListener: (ev: string, fn: Function) => {
			(listeners[ev] = listeners[ev] || []).push(fn);
		},
		removeEventListener: () => {},
		get cookie() {
			return cookieJar;
		},
		set cookie(v: string) {
			// Accept probe + real cookies; store name=value, honor delete.
			const [pair] = v.split(";");
			const [name, val] = pair.split("=");
			if (/expires=Thu, 01 Jan 1970/.test(v)) {
				cookieJar = cookieJar
					.split("; ")
					.filter((c) => c && !c.startsWith(name + "="))
					.join("; ");
				return;
			}
			// Reject public-suffix scopes: a cookie whose Domain is a bare
			// TLD (.com) must not stick, so registrableDomain resolves to
			// loja.com, not com.
			const dm = /Domain=\.([^;]+)/.exec(v);
			if (dm && dm[1].indexOf(".") === -1) return; // .com → rejected
			const entry = `${name}=${val}`;
			const others = cookieJar
				.split("; ")
				.filter((c) => c && !c.startsWith(name + "="));
			cookieJar = [...others, entry].filter(Boolean).join("; ");
		},
	};
	const win: any = {
		location: { href: u.href, hostname: u.hostname, search: u.search, pathname: u.pathname },
		addEventListener: () => {},
		performance: { timing: {}, getEntriesByType: () => [] },
		history: {},
		vestigio: undefined,
	};
	const g: any = globalThis as any;
	g.window = win;
	g.document = doc;
	g.location = win.location;
	g.navigator = { userAgent: "test", sendBeacon: () => true };
	g.localStorage = makeStorage();
	g.sessionStorage = makeStorage();
	g.URLSearchParams = URLSearchParams;
	g.URL = URL;
	g.IntersectionObserver = class {
		observe() {}
		disconnect() {}
	};
	g.MutationObserver = class {
		observe() {}
		disconnect() {}
	};
	g.fetch = vi.fn(() => Promise.resolve({ ok: true } as never));
	g.setInterval = () => 0 as never;
	g.setTimeout = ((fn: Function) => {
		fn();
		return 0;
	}) as never;

	// eslint-disable-next-line no-new-func
	new Function(SNIPPET)();
	return { win, doc, sessionStorage: g.sessionStorage, cookie: () => cookieJar };
}

describe("snippet cross-domain stitching", () => {
	beforeEach(() => {
		for (const k of ["window", "document", "location", "navigator", "localStorage", "sessionStorage"]) {
			delete (globalThis as any)[k];
		}
	});

	it("loads and exposes the public API without throwing", () => {
		const { win } = loadSnippetAt("https://loja.com/produto/x");
		expect(typeof win.vestigio.decorate).toBe("function");
		expect(typeof win.vestigio.confirm).toBe("function");
	});

	it("resolves loja.com as the registrable domain and sets a visitor cookie there", () => {
		const { cookie } = loadSnippetAt("https://loja.com/produto/x");
		expect(cookie()).toMatch(/vg_vid=/);
	});

	it("decorates a link to a sibling subdomain with visitor and session ids", () => {
		const { win } = loadSnippetAt("https://loja.com/produto/x");
		const out = win.vestigio.decorate("https://seguro.loja.com/c/abc");
		expect(out).toMatch(/vg_vid=/);
		expect(out).toMatch(/vg_sid=/);
	});

	it("does NOT decorate a link to a different registrable domain", () => {
		const { win } = loadSnippetAt("https://loja.com/produto/x");
		const out = win.vestigio.decorate("https://outra-loja.com/x");
		expect(out).not.toMatch(/vg_vid=/);
	});

	it("does NOT decorate a same-host link", () => {
		const { win } = loadSnippetAt("https://loja.com/produto/x");
		const out = win.vestigio.decorate("https://loja.com/carrinho");
		expect(out).not.toMatch(/vg_vid=/);
	});

	it("adopts the session id carried in the URL — the funnel stays one session", () => {
		const { sessionStorage } = loadSnippetAt(
			`https://seguro.loja.com/c/abc?vg_vid=vgv_known&vg_sid=vgs_carried&vg_t=${Date.now()}`,
		);
		const stored = JSON.parse(sessionStorage.getItem("vg_session"));
		expect(stored.id).toBe("vgs_carried");
	});

	it("adopts the visitor id carried in the URL over generating a new one", () => {
		const { cookie } = loadSnippetAt(
			`https://seguro.loja.com/c/abc?vg_vid=vgv_known&vg_sid=vgs_carried&vg_t=${Date.now()}`,
		);
		expect(cookie()).toMatch(/vg_vid=vgv_known/);
	});

	it("does NOT adopt a stale carried session — a shared checkout link", () => {
		const stale = Date.now() - 60 * 60 * 1000; // 1h old, past the 30m TTL
		const { sessionStorage } = loadSnippetAt(
			`https://seguro.loja.com/c/abc?vg_vid=vgv_x&vg_sid=vgs_someone_else&vg_t=${stale}`,
		);
		const stored = JSON.parse(sessionStorage.getItem("vg_session"));
		expect(stored.id).not.toBe("vgs_someone_else");
	});

	it("window.vestigio.confirm dedupes by order id across calls", () => {
		const { win } = loadSnippetAt("https://seguro.loja.com/order/123");
		let fired = 0;
		const g: any = globalThis as any;
		const realFetch = g.fetch;
		// confirm calls flush → sendPayload/sendBeacon; count sends.
		g.navigator.sendBeacon = () => { fired++; return true; };
		win.vestigio.confirm({ order_id: "order-1", value: 129.9 });
		win.vestigio.confirm({ order_id: "order-1", value: 129.9 });
		g.fetch = realFetch;
		expect(fired).toBe(1);
	});

	it("window.vestigio.confirm fires once and is idempotent", () => {
		const { win } = loadSnippetAt("https://seguro.loja.com/order/123");
		expect(() => {
			win.vestigio.confirm({ order_id: "123", value: 100 });
			win.vestigio.confirm({ order_id: "123", value: 100 });
		}).not.toThrow();
	});
});
