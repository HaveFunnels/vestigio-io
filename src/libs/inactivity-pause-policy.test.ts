import { describe, it, expect } from "vitest";
import {
	isPauseableForInactivity,
	INACTIVITY_PAUSEABLE_ORG_FILTER,
} from "@/libs/inactivity-pause-policy";

// The inactivity pause clears nothing less than the whole service:
// both the audit scheduler and the probe cron filter on
// continuousPaused, so a paused environment produces no cycles of any
// kind. These pin who may be subjected to that.

describe("isPauseableForInactivity", () => {
	it("never pauses a paying, active customer", () => {
		// Casa Montelle's exact shape. It went dark for four days in
		// October 2026 because it was pauseable under the old rule.
		expect(isPauseableForInactivity({ orgType: "customer", status: "active" })).toBe(false);
	});

	it("still pauses an abandoned trial", () => {
		expect(isPauseableForInactivity({ orgType: "trial", status: "active" })).toBe(true);
		expect(isPauseableForInactivity({ orgType: "trial", status: "pending" })).toBe(true);
	});

	it("pauses a customer who has not started paying or has been cut off", () => {
		expect(isPauseableForInactivity({ orgType: "customer", status: "pending" })).toBe(true);
		expect(isPauseableForInactivity({ orgType: "customer", status: "suspended" })).toBe(true);
	});

	it("leaves demo orgs out, since they are stopped deliberately", () => {
		// operator_disabled is an explicit call. Folding demos into an
		// automatic pause would blur the two.
		expect(isPauseableForInactivity({ orgType: "demo", status: "active" })).toBe(false);
	});

	it("treats a null status on a customer org as not pauseable", () => {
		// Organization.status defaults to "pending", but legacy rows can
		// be null. Written as `status: { not: "active" }` this case would
		// flip to pauseable, because Prisma's `not` matches nulls. The
		// same trap already hit the orgType filter once.
		expect(isPauseableForInactivity({ orgType: "customer", status: null })).toBe(false);
		expect(isPauseableForInactivity({ orgType: "customer" })).toBe(false);
	});

	it("builds a filter with no negation in it", () => {
		// The predicate and the Prisma filter have to agree, and the
		// filter must stay in explicit-list form.
		expect(JSON.stringify(INACTIVITY_PAUSEABLE_ORG_FILTER)).not.toContain('"not"');
		expect(INACTIVITY_PAUSEABLE_ORG_FILTER.OR).toHaveLength(2);
	});
});
