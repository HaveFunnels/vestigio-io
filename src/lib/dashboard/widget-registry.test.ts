import { describe, it, expect, beforeEach, vi } from "vitest";
import type { WidgetDefinition } from "./widget-registry";

// Each `it` block needs a clean module copy because the registry is
// module-scoped (singleton array). Re-import via vi.resetModules so
// previous registrations don't leak between tests.
let registry: typeof import("./widget-registry");

beforeEach(async () => {
	vi.resetModules();
	registry = await import("./widget-registry");
});

const FakeComponent = () => null;

function makeDef(id: string, overrides: Partial<WidgetDefinition> = {}): WidgetDefinition {
	return {
		id,
		version: 1,
		nameKey: `widgets.${id}.name`,
		descriptionKey: `widgets.${id}.desc`,
		category: "kpi",
		icon: "chart-bar",
		defaultSize: { w: 4, h: 2 },
		minSize: { w: 2, h: 1 },
		maxSize: { w: 12, h: 6 },
		resizable: true,
		removable: true,
		inCatalog: true,
		dataKeys: [],
		Component: FakeComponent,
		...overrides,
	};
}

describe("widget-registry", () => {
	it("starts empty before any registration", () => {
		expect(registry.listWidgets()).toEqual([]);
	});

	it("registers and looks up a widget by id", () => {
		const def = makeDef("test-widget");
		registry.registerWidget(def);
		expect(registry.getWidgetDef("test-widget")).toBe(def);
	});

	it("returns undefined for unknown id", () => {
		expect(registry.getWidgetDef("nonexistent")).toBeUndefined();
	});

	it("warns and ignores duplicate registrations", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const first = makeDef("dup", { version: 1 });
		const second = makeDef("dup", { version: 2 });
		registry.registerWidget(first);
		registry.registerWidget(second);
		expect(registry.listWidgets()).toHaveLength(1);
		expect(registry.getWidgetDef("dup")?.version).toBe(1);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining('duplicate registration for "dup"'),
		);
		warn.mockRestore();
	});

	it("filters by category", () => {
		registry.registerWidget(makeDef("kpi-a", { category: "kpi" }));
		registry.registerWidget(makeDef("trend-a", { category: "trends" }));
		registry.registerWidget(makeDef("kpi-b", { category: "kpi" }));
		const kpis = registry.listWidgetsByCategory("kpi");
		expect(kpis.map((w) => w.id)).toEqual(["kpi-a", "kpi-b"]);
	});

	it("listCatalogWidgets excludes those with inCatalog=false", () => {
		registry.registerWidget(makeDef("visible", { inCatalog: true }));
		registry.registerWidget(makeDef("hidden", { inCatalog: false }));
		const catalog = registry.listCatalogWidgets();
		expect(catalog.map((w) => w.id)).toEqual(["visible"]);
	});
});
