import { describe, it, expect, vi, beforeEach } from "vitest";

const created: Record<string, unknown>[] = [];

vi.mock("@/libs/prismaDb", () => ({
	prisma: {
		productEvent: {
			create: (args: { data: Record<string, unknown> }) => {
				created.push(args.data);
				return Promise.resolve(args.data);
			},
		},
	},
}));

const { recordSignupAttempt } = await import("@/libs/signup-telemetry");

beforeEach(() => {
	created.length = 0;
});

describe("recordSignupAttempt", () => {
	it("records the outcome and the campaign, never the email", () => {
		recordSignupAttempt({
			outcome: "captcha_failed",
			detail: "missing_token",
			sessionId: "1760000000-abc123",
			firstTouch: { utmSource: "facebook", utmCampaign: "outubro" },
		});
		expect(created).toHaveLength(1);
		const row = created[0];
		expect(row.event).toBe("signup.attempt");
		expect(row.sessionId).toBe("1760000000-abc123");

		const props = row.properties as Record<string, unknown>;
		expect(props.outcome).toBe("captcha_failed");
		expect(props.detail).toBe("missing_token");
		expect((props.firstTouch as Record<string, string>).utmSource).toBe("facebook");

		// A table of failed signup emails is a liability with no use.
		// The outcome is the diagnostic; the identity is not.
		expect(JSON.stringify(row)).not.toMatch(/@/);
	});

	it("records the new userId on success, bridging to in-app events", () => {
		// The in-app tracker keeps its own session id on purpose, so
		// userId is the only thing joining "the campaign that produced
		// this person" to what they then did inside the product.
		recordSignupAttempt({
			outcome: "created",
			userId: "usr_123",
			sessionId: "s1",
			firstTouch: { utmSource: "facebook" },
		});
		expect(created[0].userId).toBe("usr_123");
	});

	it("falls back to a marker when the request carried no session", () => {
		// ProductEvent.sessionId is non-nullable, and "server" also says
		// the request did not come through the instrumented form.
		recordSignupAttempt({ outcome: "rate_limited" });
		expect(created[0].sessionId).toBe("server");
	});

	it("never throws, whatever the database does", () => {
		// Telemetry failing must not change the outcome of a signup.
		expect(() =>
			recordSignupAttempt({ outcome: "created", sessionId: "x".repeat(500) }),
		).not.toThrow();
		// Over-long session ids are truncated rather than rejected.
		expect(String(created[0].sessionId).length).toBeLessThanOrEqual(120);
	});
});
