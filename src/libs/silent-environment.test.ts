import { describe, it, expect } from "vitest";
import { classifyEnvironmentSilence, type EnvForSilenceCheck } from "@/libs/silent-environment";

const NOW = new Date("2026-10-15T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

function env(over: Partial<EnvForSilenceCheck> = {}): EnvForSilenceCheck {
	return {
		id: "env_1",
		domain: "casamontelle.com",
		activated: true,
		continuousPaused: false,
		pausedReason: null,
		createdAt: hoursAgo(5000),
		lastCycleAt: hoursAgo(1),
		orgType: "customer",
		orgStatus: "active",
		plan: "max",
		...over,
	};
}

describe("classifyEnvironmentSilence", () => {
	it("catches the October incident: a paying env paused for anything but an operator", () => {
		// Casa Montelle on 2026-10-11: continuousPaused with reason
		// "inactivity", producing nothing of any kind, for four days.
		const f = classifyEnvironmentSilence(
			env({ continuousPaused: true, pausedReason: "inactivity", lastCycleAt: hoursAgo(48) }),
			NOW,
		);
		expect(f?.kind).toBe("unexpectedly_paused");
		expect(f?.detail).toContain("inactivity");
	});

	it("stays quiet about a pause an operator asked for", () => {
		expect(
			classifyEnvironmentSilence(
				env({ continuousPaused: true, pausedReason: "operator_disabled" }),
				NOW,
			),
		).toBeNull();
	});

	it("stays quiet about a paused trial, which is the pause working", () => {
		expect(
			classifyEnvironmentSilence(
				env({ orgType: "trial", continuousPaused: true, pausedReason: "inactivity" }),
				NOW,
			),
		).toBeNull();
	});

	it("flags an unpaused env the scheduler has stopped feeding", () => {
		// Max guarantees a cold cycle daily, so two days of total
		// silence is not "between cycles".
		const f = classifyEnvironmentSilence(env({ lastCycleAt: hoursAgo(60) }), NOW);
		expect(f?.kind).toBe("silent");
		expect(f?.hoursSinceLastCycle).toBe(60);
		expect(f?.thresholdHours).toBe(48);
	});

	it("gives each plan its own bar instead of one global number", () => {
		// 60h of silence is broken for Max (48h bar) and perfectly
		// normal for Starter, whose cold cycle is weekly.
		expect(classifyEnvironmentSilence(env({ plan: "max", lastCycleAt: hoursAgo(60) }), NOW)).not.toBeNull();
		expect(classifyEnvironmentSilence(env({ plan: "pro", lastCycleAt: hoursAgo(60) }), NOW)).toBeNull();
		expect(classifyEnvironmentSilence(env({ plan: "vestigio", lastCycleAt: hoursAgo(60) }), NOW)).toBeNull();
	});

	it("does not fire while an env is simply between cycles", () => {
		expect(classifyEnvironmentSilence(env({ lastCycleAt: hoursAgo(10) }), NOW)).toBeNull();
	});

	it("catches an environment activated long ago that never ran once", () => {
		const f = classifyEnvironmentSilence(
			env({ lastCycleAt: null, createdAt: hoursAgo(72) }),
			NOW,
		);
		expect(f?.kind).toBe("silent");
		expect(f?.hoursSinceLastCycle).toBeNull();
		expect(f?.detail).toContain("never produced a cycle");
	});

	it("ignores demo fixtures and un-activated environments", () => {
		expect(classifyEnvironmentSilence(env({ orgType: "demo", lastCycleAt: hoursAgo(5000) }), NOW)).toBeNull();
		expect(classifyEnvironmentSilence(env({ activated: false, lastCycleAt: hoursAgo(5000) }), NOW)).toBeNull();
	});
});
