// ──────────────────────────────────────────────
// A rate over weeks, drawn small.
//
// Trend belongs next to the metric, not in a chapter of its own: that
// is the convention every mature dashboard follows and the one we were
// breaking. Search Console draws the line beside the number.
//
// Hand-drawn SVG rather than a charting library. The whole thing is a
// polyline and a dot; pulling in a dependency to draw thirteen points
// would cost more bytes than the page it sits on.
// ──────────────────────────────────────────────

interface Props {
	points: { week: string; blindPct: number }[];
	width?: number;
	height?: number;
	/** Worse is up here, because the metric counts people who did
	 *  nothing, so the colour follows the direction of travel. */
	className?: string;
	title?: string;
}

export default function Sparkline({
	points,
	width = 92,
	height = 26,
	className,
	title,
}: Props) {
	// Two points is a line between two dots, not a trend. Saying
	// nothing is more honest than drawing a slope.
	if (points.length < 3) return null;

	const pad = 3;
	const values = points.map((p) => p.blindPct);
	const min = Math.min(...values);
	const max = Math.max(...values);
	// A flat series would divide by zero and, worse, would be drawn as
	// a dramatic line through floating-point noise.
	const span = max - min < 0.5 ? 1 : max - min;

	const x = (i: number) => pad + (i * (width - pad * 2)) / (points.length - 1);
	const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);

	const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.blindPct).toFixed(1)}`).join(" ");
	const last = points[points.length - 1];
	const rising = last.blindPct > points[0].blindPct;

	return (
		<svg
			width={width}
			height={height}
			viewBox={`0 0 ${width} ${height}`}
			className={className}
			role="img"
			aria-label={
				title ??
				`De ${values[0].toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% a ${last.blindPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% em ${points.length} semanas`
			}
		>
			<path
				d={d}
				fill="none"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
				className={rising ? "text-attention" : "text-accent"}
			/>
			{/* The endpoint, so the eye lands on now rather than on the
			    middle of the line. */}
			<circle
				cx={x(points.length - 1)}
				cy={y(last.blindPct)}
				r="2.2"
				className={rising ? "fill-attention" : "fill-accent"}
			/>
		</svg>
	);
}
