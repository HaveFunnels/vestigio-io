import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SeverityBadge from "./SeverityBadge";

// Mock next-intl's useTranslations so the component can render without
// the NextIntlClientProvider wrapper. Returns labels untouched and
// reports every key as present, which keeps the assertions focused on
// SeverityBadge's color + label fallback behavior.
vi.mock("next-intl", () => ({
	useTranslations: () => {
		const fn = (key: string) => key;
		fn.has = () => true;
		return fn;
	},
}));

describe("SeverityBadge", () => {
	it("renders the value label as text", () => {
		render(<SeverityBadge value="critical" />);
		expect(screen.getByText("critical")).toBeInTheDocument();
	});

	it("applies red palette for critical severity", () => {
		const { container } = render(<SeverityBadge value="critical" />);
		const badge = container.firstChild as HTMLElement;
		expect(badge.className).toMatch(/red-500/);
	});

	it("applies orange palette for high severity", () => {
		const { container } = render(<SeverityBadge value="high" />);
		const badge = container.firstChild as HTMLElement;
		expect(badge.className).toMatch(/orange-500/);
	});

	it("applies amber palette for medium severity", () => {
		const { container } = render(<SeverityBadge value="medium" />);
		const badge = container.firstChild as HTMLElement;
		expect(badge.className).toMatch(/amber-500/);
	});

	it("applies blue palette for low severity", () => {
		const { container } = render(<SeverityBadge value="low" />);
		const badge = container.firstChild as HTMLElement;
		expect(badge.className).toMatch(/blue-500/);
	});

	it("applies emerald palette for healthy status", () => {
		const { container } = render(<SeverityBadge value="healthy" />);
		const badge = container.firstChild as HTMLElement;
		expect(badge.className).toMatch(/emerald-500/);
	});

	it("falls back to none palette for unknown value", () => {
		const { container } = render(<SeverityBadge value="totally-unknown-xyz" />);
		const badge = container.firstChild as HTMLElement;
		expect(badge.className).toMatch(/zinc-500/);
	});

	it("appends caller-provided className", () => {
		const { container } = render(
			<SeverityBadge value="critical" className="my-custom-class" />,
		);
		const badge = container.firstChild as HTMLElement;
		expect(badge.className).toContain("my-custom-class");
	});

	it("renders the badge as an inline-flex span", () => {
		const { container } = render(<SeverityBadge value="critical" />);
		const badge = container.firstChild as HTMLElement;
		expect(badge.tagName).toBe("SPAN");
		expect(badge.className).toMatch(/inline-flex/);
	});
});
