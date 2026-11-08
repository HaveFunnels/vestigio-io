import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

// ──────────────────────────────────────────────
// The pixel's contact classifier, tested as shipped.
//
// `contactChannelOf` lives inside the IIFE in public/snippet/vestigio.js
// and cannot be imported: that file is served verbatim to browsers on
// customer origins, so it has no module system. Rather than keep a
// copy here and let the two drift, this extracts the function source
// from the file that actually ships and evaluates it.
//
// The classifier matters more than its size suggests. Six of twenty
// reviewers from service businesses said the conversion this product
// measures is not the one their business has, and this function is
// where that gets fixed. If it misses a wa.me link, a lawyer's leads
// are invisible; if it over-matches, a store's support clicks get
// counted as sales.
// ──────────────────────────────────────────────

function loadClassifier(): (href: unknown) => string | null {
	const src = readFileSync(
		join(process.cwd(), "public/snippet/vestigio.js"),
		"utf8",
	);
	const start = src.indexOf("function contactChannelOf(");
	if (start < 0) {
		throw new Error(
			"contactChannelOf is gone from the shipped pixel. If it was renamed, " +
				"rename it here too; if it was removed, the service-business " +
				"conversion models have silently stopped working.",
		);
	}
	// Brace-match rather than regex: the body contains braces in its
	// string literals and a lazy match would truncate it.
	let depth = 0;
	let end = -1;
	for (let i = src.indexOf("{", start); i < src.length; i++) {
		if (src[i] === "{") depth++;
		else if (src[i] === "}") {
			depth--;
			if (depth === 0) {
				end = i + 1;
				break;
			}
		}
	}
	const body = src.slice(start, end);
	// Evaluated in an explicit sandbox rather than with new Function,
	// so what the code under test can reach is written down: a stub
	// window (the function resolves a relative href against
	// location.origin) and the URL global. The source is this repo's
	// own shipped pixel, read off disk, never anything a user supplies.
	const sandbox = {
		window: { location: { origin: "https://loja.com.br" } },
		URL,
		exported: null as unknown,
	};
	runInNewContext(`${body}; exported = contactChannelOf;`, sandbox, {
		timeout: 1000,
	});
	return sandbox.exported as (href: unknown) => string | null;
}

const channelOf = loadClassifier();

describe("the pixel's contact classifier, as shipped", () => {
	it("reads tel:, which the checkout-handoff branch could never see", () => {
		// A tel: URL has no hostname, so the existing handoff detection
		// (which compares hostnames) skipped it entirely. That is why
		// handoff_started is false on every session ever measured.
		expect(channelOf("tel:+5531988887777")).toBe("phone");
		expect(channelOf("TEL:08001234567")).toBe("phone");
	});

	it("reads every WhatsApp link shape in the wild", () => {
		expect(channelOf("https://wa.me/5531988887777")).toBe("whatsapp");
		expect(channelOf("https://www.wa.me/5531988887777")).toBe("whatsapp");
		expect(
			channelOf("https://api.whatsapp.com/send?phone=5531988887777&text=oi"),
		).toBe("whatsapp");
		expect(channelOf("https://web.whatsapp.com/send?phone=55319")).toBe("whatsapp");
		expect(channelOf("https://chat.whatsapp.com/ABC123")).toBe("whatsapp");
		expect(channelOf("whatsapp://send?phone=5531988887777")).toBe("whatsapp");
	});

	it("reads a Direct message link", () => {
		expect(channelOf("https://ig.me/m/minhaloja")).toBe("instagram_dm");
		expect(channelOf("https://instagram.com/direct/inbox/")).toBe("instagram_dm");
		expect(channelOf("https://m.me/minhaloja")).toBe("messenger");
		expect(channelOf("https://t.me/minhaloja")).toBe("telegram");
	});

	it("reads sms and mailto", () => {
		expect(channelOf("sms:+5531988887777")).toBe("sms");
		expect(channelOf("mailto:contato@loja.com.br")).toBe("email");
	});

	it("does not fire on an ordinary Instagram profile link", () => {
		// Every store footer has one. Counting it as a Direct message
		// would turn a social icon into a lead.
		expect(channelOf("https://instagram.com/minhaloja")).toBeNull();
		expect(channelOf("https://www.instagram.com/minhaloja/")).toBeNull();
	});

	it("does not fire on the store's own pages", () => {
		expect(channelOf("/products/vedaplus-kit")).toBeNull();
		expect(channelOf("https://loja.com.br/contato")).toBeNull();
		// Including a page whose path merely mentions whatsapp.
		expect(channelOf("https://loja.com.br/fale-no-whatsapp")).toBeNull();
	});

	it("survives junk without throwing", () => {
		expect(channelOf("")).toBeNull();
		expect(channelOf(null)).toBeNull();
		expect(channelOf(undefined)).toBeNull();
		expect(channelOf("javascript:void(0)")).toBeNull();
		expect(channelOf("#")).toBeNull();
		expect(channelOf("not a url at all")).toBeNull();
	});
});
