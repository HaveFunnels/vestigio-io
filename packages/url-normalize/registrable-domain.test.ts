import { describe, it, expect } from "vitest";
import { registrableDomain } from "./registrable-domain";

// The regression this fences: the naive "last two labels" rule returned
// `com.br` for `loja.com.br`, and isSameDomain(x, "com.br") then
// accepted every *.com.br host — crawl scope, same-domain relations and
// real-path sets all wrong together on Brazilian stores.

describe("registrableDomain", () => {
	it("keeps simple apex domains", () => {
		expect(registrableDomain("loja.com")).toBe("loja.com");
		expect(registrableDomain("vestigio.io")).toBe("vestigio.io");
	});

	it("strips subdomains on simple TLDs", () => {
		expect(registrableDomain("www.loja.com")).toBe("loja.com");
		expect(registrableDomain("seguro.loja.com")).toBe("loja.com");
	});

	it("handles Brazilian second-level registrations", () => {
		expect(registrableDomain("loja.com.br")).toBe("loja.com.br");
		expect(registrableDomain("www.loja.com.br")).toBe("loja.com.br");
		expect(registrableDomain("seguro.loja.com.br")).toBe("loja.com.br");
	});

	it("never returns a bare public suffix for a registered name", () => {
		expect(registrableDomain("casamontelle.com.br")).not.toBe("com.br");
		expect(registrableDomain("shop.example.co.uk")).toBe("example.co.uk");
		expect(registrableDomain("tienda.example.com.mx")).toBe("example.com.mx");
	});

	it("is case-insensitive and tolerates a trailing dot", () => {
		expect(registrableDomain("WWW.Loja.COM.BR.")).toBe("loja.com.br");
	});

	it("passes through single labels and IPs unchanged", () => {
		expect(registrableDomain("localhost")).toBe("localhost");
		expect(registrableDomain("127.0.0.1")).toBe("127.0.0.1");
	});
});
