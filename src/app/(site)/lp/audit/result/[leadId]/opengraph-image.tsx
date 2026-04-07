import { ImageResponse } from "next/og";

// ──────────────────────────────────────────────
// Dynamic OpenGraph image — /lp/audit/result/[leadId]
//
// Next.js file convention: this file becomes a route that serves
// a 1200x630 PNG. The image is regenerated per leadId, cached at
// the edge by Next's built-in revalidation, and rendered server-side.
//
// Inputs come from /api/lead/[id] (the same public endpoint the
// result page polls). The image shows:
//   - Vestigio brand mark
//   - The audited domain
//   - Number of findings detected
//   - The headline of the top finding
//
// This is what gets shown when a visitor pastes the result URL into
// Slack, Twitter, LinkedIn, WhatsApp, etc. The whole point of having
// a dynamic OG image is virality: someone runs an audit, drops the
// link in their team chat, and now everyone sees that THEIR domain
// has issues — which seeds more leads.
// ──────────────────────────────────────────────

export const runtime = "edge";

export const size = {
	width: 1200,
	height: 630,
};

export const contentType = "image/png";

interface LeadOgPayload {
	domain: string | null;
	findingsCount: number;
	headlineFinding: string | null;
}

async function fetchLeadForOg(leadId: string): Promise<LeadOgPayload> {
	const fallback: LeadOgPayload = {
		domain: null,
		findingsCount: 0,
		headlineFinding: null,
	};

	try {
		const baseUrl =
			process.env.NEXT_PUBLIC_APP_URL ||
			process.env.NEXTAUTH_URL ||
			"https://vestigio.io";
		const res = await fetch(`${baseUrl}/api/lead/${leadId}`, {
			// edge runtime — must use absolute URL. Cache for 60s.
			next: { revalidate: 60 },
		});
		if (!res.ok) return fallback;
		const data = await res.json();
		const visible = data.result?.visibleFindings || [];
		return {
			domain: data.domain,
			findingsCount: visible.length + (data.result?.blurredFindings?.length || 0),
			headlineFinding: visible[0]?.title || null,
		};
	} catch {
		return fallback;
	}
}

export default async function OgImage({
	params,
}: {
	params: Promise<{ leadId: string }>;
}) {
	const { leadId } = await params;
	const data = await fetchLeadForOg(leadId);

	return new ImageResponse(
		(
			<div
				style={{
					height: "100%",
					width: "100%",
					display: "flex",
					flexDirection: "column",
					backgroundColor: "#070710",
					backgroundImage:
						"radial-gradient(ellipse 800px 500px at 50% 0%, rgba(16, 185, 129, 0.18), transparent)",
					padding: "60px 80px",
					fontFamily: "system-ui, -apple-system, sans-serif",
					color: "#fafafa",
				}}
			>
				{/* Brand */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						marginBottom: 48,
					}}
				>
					<div
						style={{
							fontSize: 32,
							fontWeight: 800,
							letterSpacing: "0.08em",
							color: "#ffffff",
						}}
					>
						VESTIGIO
					</div>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 10,
							padding: "10px 20px",
							borderRadius: 999,
							backgroundColor: "rgba(16, 185, 129, 0.12)",
							border: "1px solid rgba(16, 185, 129, 0.3)",
							color: "#34d399",
							fontSize: 18,
							fontWeight: 600,
							textTransform: "uppercase",
							letterSpacing: "0.1em",
						}}
					>
						<span
							style={{
								width: 10,
								height: 10,
								borderRadius: 999,
								backgroundColor: "#10b981",
							}}
						/>
						Audit complete
					</div>
				</div>

				{/* Hero */}
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						flex: 1,
						justifyContent: "center",
					}}
				>
					{data.domain && (
						<div
							style={{
								fontSize: 30,
								color: "#a1a1aa",
								fontFamily: "monospace",
								marginBottom: 16,
							}}
						>
							{data.domain}
						</div>
					)}

					<div
						style={{
							fontSize: 78,
							fontWeight: 800,
							lineHeight: 1.1,
							color: "#fafafa",
							marginBottom: 32,
							maxWidth: "100%",
						}}
					>
						{data.findingsCount > 0
							? `${data.findingsCount} ${data.findingsCount === 1 ? "issue" : "issues"} detected`
							: "Free site audit"}
					</div>

					{data.headlineFinding && (
						<div
							style={{
								fontSize: 30,
								color: "#d4d4d8",
								fontWeight: 500,
								lineHeight: 1.4,
								maxWidth: "90%",
							}}
						>
							&ldquo;{data.headlineFinding}&rdquo;
						</div>
					)}
				</div>

				{/* Footer */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						borderTop: "1px solid #27272a",
						paddingTop: 28,
						marginTop: 32,
					}}
				>
					<div
						style={{
							fontSize: 22,
							color: "#71717a",
						}}
					>
						vestigio.io · free audit
					</div>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							fontSize: 22,
							color: "#34d399",
							fontWeight: 600,
						}}
					>
						See full results →
					</div>
				</div>
			</div>
		),
		{
			...size,
		},
	);
}
