import { ImageResponse } from "next/og";
import { findEssay } from "@/data/vestigio-index";

// ──────────────────────────────────────────────
// OG image for a Vestigio Index essay.
//
// Generated at request time by Next.js based on the [slug] route
// params. Each essay gets a unique 1200×630 social card with:
//
//   - Dark canvas matching the brand (#090911)
//   - Small uppercase mono line: edition number · vertical · date
//   - Big Fraunces serif title (fetched at runtime from Google
//     Fonts CDN — Edge runtime can fetch but can't read fs, so
//     CDN-fetch is the only path for custom display fonts)
//   - Vestigio wordmark + emerald accent rule at the bottom
//
// Falls back to a Sans-only render if the font fetch fails, so a
// bad CDN response doesn't break the share preview entirely.
// ──────────────────────────────────────────────

export const runtime = "edge";

export const alt = "Vestigio Index — edição editorial";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface RouteParams {
	vertical: string;
	period: string;
	slug: string;
}

const VERTICAL_LABEL: Record<string, string> = {
	ecommerce: "Ecommerce",
	"saas-b2b": "SaaS B2B",
	infoprodutos: "Infoprodutos",
	cursos: "Cursos",
	agencias: "Agências",
};

function formatPtBrDate(iso: string): string {
	const [y, m, d] = iso.split("-").map(Number);
	const months = [
		"jan", "fev", "mar", "abr", "mai", "jun",
		"jul", "ago", "set", "out", "nov", "dez",
	];
	return `${String(d).padStart(2, "0")} ${months[m - 1]} ${y}`;
}

async function fetchFraunces(): Promise<ArrayBuffer | null> {
	// Google Fonts static binary for Fraunces 500 (medium). The
	// gstatic URL is stable; if it ever moves, the fallback below
	// kicks in. Cached by the Vercel/Railway edge so repeat
	// renders don't re-download.
	try {
		const res = await fetch(
			"https://fonts.gstatic.com/s/fraunces/v33/6NUh8FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk.woff2",
			{ cache: "force-cache" },
		);
		if (!res.ok) return null;
		return await res.arrayBuffer();
	} catch {
		return null;
	}
}

export default async function OGEssay({
	params,
}: {
	params: Promise<RouteParams>;
}) {
	const { vertical, period, slug } = await params;
	const essay = findEssay(vertical, period, slug);
	const title = essay?.title || "Vestigio Index";
	const verticalLabel =
		essay?.verticalLabel ||
		VERTICAL_LABEL[vertical] ||
		"Vestigio Index";
	const editionLine = essay
		? `Edição #${String(essay.editionNumber).padStart(3, "0")} · ${verticalLabel} · ${formatPtBrDate(essay.publishedAt)}`
		: "Análise editorial pública";

	const fraunces = await fetchFraunces();
	// fontFamily references the loaded font when available, otherwise
	// uses the system serif stack as a graceful fallback.
	const titleFont = fraunces ? "Fraunces" : "Georgia, serif";

	return new ImageResponse(
		(
			<div
				style={{
					width: "100%",
					height: "100%",
					display: "flex",
					flexDirection: "column",
					backgroundColor: "#090911",
					padding: "72px 80px",
					justifyContent: "space-between",
				}}
			>
				{/* Top: edition line */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 14,
						color: "#a1a1aa",
						fontSize: 20,
						fontWeight: 500,
						letterSpacing: "0.18em",
						textTransform: "uppercase",
					}}
				>
					<div
						style={{
							width: 8,
							height: 8,
							borderRadius: 4,
							backgroundColor: "#10b981",
						}}
					/>
					Vestigio Index
				</div>

				{/* Middle: title + meta line */}
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 28,
					}}
				>
					<div
						style={{
							color: "#71717a",
							fontSize: 18,
							fontWeight: 500,
							letterSpacing: "0.14em",
							textTransform: "uppercase",
							fontFamily: "ui-monospace, SFMono-Regular, monospace",
						}}
					>
						{editionLine}
					</div>
					<div
						style={{
							color: "#f4f4f5",
							fontSize: 76,
							lineHeight: 1.05,
							letterSpacing: "-0.02em",
							fontFamily: titleFont,
							fontWeight: 500,
							maxWidth: 1040,
							// Force the renderer to wrap if title exceeds box;
							// long titles auto-shrink visually by line count.
							display: "block",
						}}
					>
						{title}
					</div>
				</div>

				{/* Bottom: wordmark + rule */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
					}}
				>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 16,
						}}
					>
						<div
							style={{
								color: "#f4f4f5",
								fontSize: 36,
								fontWeight: 700,
								letterSpacing: "-0.02em",
							}}
						>
							vestigio
						</div>
						<div
							style={{
								width: 60,
								height: 3,
								backgroundColor: "#10b981",
								borderRadius: 2,
							}}
						/>
					</div>
					<div
						style={{
							color: "#71717a",
							fontSize: 16,
							fontWeight: 500,
							letterSpacing: "0.14em",
							textTransform: "uppercase",
							fontFamily: "ui-monospace, SFMono-Regular, monospace",
						}}
					>
						vestigio.io
					</div>
				</div>
			</div>
		),
		{
			...size,
			fonts: fraunces
				? [
						{
							name: "Fraunces",
							data: fraunces,
							weight: 500,
							style: "normal",
						},
				  ]
				: undefined,
		},
	);
}
