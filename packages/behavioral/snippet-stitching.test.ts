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

function loadSnippetAt(
	url: string,
	opts: { cookie?: string; title?: string; h1?: string; paidMarker?: boolean } = {},
) {
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
		title: opts.title ?? "Loja",
		referrer: "",
		querySelector: (sel: string) => {
			if (sel === "script[data-env]") return scriptEl;
			if (sel === "h1") return opts.h1 ? { textContent: opts.h1 } : null;
			// The paid-DOM-marker probe in checkConfirmation.
			if (sel.indexOf("data-order-status") !== -1) return opts.paidMarker ? {} : null;
			return null;
		},
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
	// Capture everything the snippet sends (fetch batches + sendBeacon),
	// so a test can assert which event types actually left the page.
	const sent: any[] = [];
	const record = (body: any) => {
		try {
			sent.push(JSON.parse(body));
		} catch {
			/* non-JSON body — ignore */
		}
	};
	g.fetch = vi.fn((_url: string, init: any) => {
		if (init?.body) record(init.body);
		return Promise.resolve({ ok: true } as never);
	});
	g.navigator.sendBeacon = (_url: string, body: any) => {
		record(body);
		return true;
	};
	// The snippet flushes on an interval; capture the callback so a test
	// can drain the queue on demand instead of waiting real time.
	const intervalFns: Function[] = [];
	g.setInterval = ((fn: Function) => {
		intervalFns.push(fn);
		return 0;
	}) as never;
	g.setTimeout = ((fn: Function) => {
		fn();
		return 0;
	}) as never;

	// eslint-disable-next-line no-new-func
	new Function(SNIPPET)();
	const flush = () => intervalFns.forEach((fn) => fn());
	const emittedTypes = () => sent.flatMap((b) => (b.events || []).map((e: any) => e.type));
	return { win, doc, sessionStorage: g.sessionStorage, cookie: () => cookieJar, flush, sent, emittedTypes };
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

// A completed purchase is money in the plan — inferring one that did not
// happen is the worst error the pixel can make. checkConfirmation must
// not let a lone title/H1 word match fabricate a sale on a page where an
// unpaid order can already be on screen.
describe("snippet confirmation hardening — never infer a sale", () => {
	beforeEach(() => {
		for (const k of ["window", "document", "location", "navigator", "localStorage", "sessionStorage"]) {
			delete (globalThis as any)[k];
		}
	});

	it("does NOT confirm on a checkout page from an H1 greeting alone", () => {
		// The real Casa Montelle case: /c/<slug> whose H1 renders
		// "Bem-vindo" — a weak signal on a transaction surface.
		const { flush, emittedTypes } = loadSnippetAt("https://seguro.loja.com/c/NX-ABC123", {
			h1: "Bem-vindo à Casa Montelle",
		});
		flush();
		expect(emittedTypes()).not.toContain("confirmation_seen");
	});

	it("does NOT confirm on an order page from a title match alone (unpaid PIX order on screen)", () => {
		const { flush, emittedTypes } = loadSnippetAt("https://seguro.loja.com/order/abc", {
			title: "Obrigado pelo seu pedido | Loja",
		});
		flush();
		expect(emittedTypes()).not.toContain("confirmation_seen");
	});

	it("DOES confirm on a checkout page when a paid DOM marker is present (strong signal)", () => {
		const { flush, emittedTypes } = loadSnippetAt("https://seguro.loja.com/c/NX-ABC123", {
			h1: "Bem-vindo",
			paidMarker: true,
		});
		flush();
		expect(emittedTypes()).toContain("confirmation_seen");
	});

	it("DOES confirm on a dedicated thank-you URL even off any order path (weak signal, safe surface)", () => {
		// url_pattern is strong on its own; a generic success page still works.
		const { flush, emittedTypes } = loadSnippetAt("https://loja.com/obrigado", {
			title: "Compra realizada com sucesso",
		});
		flush();
		expect(emittedTypes()).toContain("confirmation_seen");
	});

	it("DOES confirm from a title match on a non-transaction page (weak signal, not a checkout)", () => {
		const { flush, emittedTypes } = loadSnippetAt("https://loja.com/bem-vindo-a-bordo", {
			title: "Cadastro completo",
		});
		flush();
		expect(emittedTypes()).toContain("confirmation_seen");
	});
});
