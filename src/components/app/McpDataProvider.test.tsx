import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { McpDataProvider, useMcpData, type McpDataSnapshot } from "./McpDataProvider";

const NOT_READY = { status: "not_ready", reason: "No data provider." } as const;

const FIXTURE: McpDataSnapshot = {
	findings: { status: "ready", data: [] },
	actions: { status: "ready", data: [] },
	changeReport: { status: "ready", data: {} as unknown as never },
	workspaces: { status: "ready", data: [] },
	maps: { status: "ready", data: [] },
	currency: "BRL",
};

describe("useMcpData", () => {
	it("returns provider data when wrapped", () => {
		const { result } = renderHook(() => useMcpData(), {
			wrapper: ({ children }) => (
				<McpDataProvider data={FIXTURE}>{children}</McpDataProvider>
			),
		});
		expect(result.current.currency).toBe("BRL");
		expect(result.current.findings.status).toBe("ready");
	});

	it("falls back to a not_ready snapshot when no provider above", () => {
		const { result } = renderHook(() => useMcpData());
		expect(result.current.currency).toBe("USD");
		expect(result.current.findings).toEqual(NOT_READY);
		expect(result.current.actions).toEqual(NOT_READY);
		expect(result.current.changeReport).toEqual(NOT_READY);
		expect(result.current.workspaces).toEqual(NOT_READY);
		expect(result.current.maps).toEqual(NOT_READY);
		expect(result.current.inventory).toBeUndefined();
	});

	it("passes inventory through when provided", () => {
		const withInventory: McpDataSnapshot = {
			...FIXTURE,
			inventory: { status: "ready", data: { pages: [] } as unknown as never },
		};
		const { result } = renderHook(() => useMcpData(), {
			wrapper: ({ children }) => (
				<McpDataProvider data={withInventory}>{children}</McpDataProvider>
			),
		});
		expect(result.current.inventory?.status).toBe("ready");
	});
});
