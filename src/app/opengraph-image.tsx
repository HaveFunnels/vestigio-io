import { ImageResponse } from "next/og";

export const alt = "Vestigio — Intelligence & Decision Engine for SaaS";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
	return new ImageResponse(
		(
			<div
				style={{
					width: "100%",
					height: "100%",
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					backgroundColor: "#090911",
					border: "4px solid #10b981",
				}}
			>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: "24px",
					}}
				>
					<div
						style={{
							fontSize: 72,
							fontWeight: 700,
							color: "#ffffff",
							letterSpacing: "-0.02em",
						}}
					>
						Vestigio
					</div>
					<div
						style={{
							fontSize: 32,
							color: "#a1a1aa",
							textAlign: "center",
							maxWidth: "800px",
						}}
					>
						Intelligence & Decision Engine for SaaS
					</div>
					<div
						style={{
							width: 80,
							height: 4,
							backgroundColor: "#10b981",
							borderRadius: 2,
							marginTop: 8,
						}}
					/>
				</div>
			</div>
		),
		{ ...size },
	);
}
