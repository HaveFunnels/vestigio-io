import { describe, it, expect } from "vitest";
import { messagingConversations } from "./poller";

describe("messaging conversations, the only signal for a DM-only business", () => {
	it("reads the 7-day window Meta returns by default", () => {
		expect(
			messagingConversations([
				{ action_type: "link_click", value: "412" },
				{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "38" },
			]),
		).toBe(38);
	});

	it("does not sum overlapping windows into a double count", () => {
		// The 1d figure is a subset of the 7d. Adding them would report
		// 50 conversations where there were 38.
		expect(
			messagingConversations([
				{ action_type: "onsite_conversion.messaging_conversation_started_1d", value: "12" },
				{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "38" },
			]),
		).toBe(38);
	});

	it("tells 'runs no click-to-message campaigns' apart from 'got zero'", () => {
		// A store that never ran one gets null and the figure is simply
		// not shown. A campaign that ran and produced nothing gets 0,
		// which is a finding.
		expect(messagingConversations([{ action_type: "link_click", value: "9" }])).toBeNull();
		expect(messagingConversations([])).toBeNull();
		expect(messagingConversations(undefined)).toBeNull();
		expect(
			messagingConversations([
				{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "0" },
			]),
		).toBe(0);
	});

	it("survives a malformed value", () => {
		expect(
			messagingConversations([
				{ action_type: "onsite_conversion.messaging_conversation_started_7d" },
			]),
		).toBe(0);
		expect(
			messagingConversations([
				{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "abc" },
			]),
		).toBe(0);
	});
});
