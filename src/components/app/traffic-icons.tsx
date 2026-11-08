// ──────────────────────────────────────────────
// The statement's icon set.
//
// Kept in one file rather than inlined at each use, because the
// identity asks for icons on nearly every row and a hundred loose
// <svg> blocks inside a page component is how an interface stops
// being editable.
//
// Stroke-only, 1.7 weight, 20px grid, currentColor throughout: one
// visual language, so an icon never looks borrowed from another set.
// Never emoji, which the house style rules out for good reason here:
// this surface is read by people deciding where to stop spending.
// ──────────────────────────────────────────────

interface IconProps {
	className?: string;
	size?: number;
}

function Svg({
	children,
	className,
	size = 17,
}: IconProps & { children: React.ReactNode }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 20 20"
			fill="none"
			aria-hidden="true"
			className={className}
		>
			{children}
		</svg>
	);
}

/** A rate that got worse. Arrow up, because the metric counts people
 *  who did nothing: up is bad here and the icon has to agree. */
export const IconWorse = (p: IconProps) => (
	<Svg {...p}>
		<path
			d="M10 15.5V5m0 0L5.6 9.4M10 5l4.4 4.4"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			transform="rotate(180 10 10)"
		/>
	</Svg>
);

export const IconBetter = (p: IconProps) => (
	<Svg {...p}>
		<path
			d="M10 15.5V5m0 0L5.6 9.4M10 5l4.4 4.4"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
	</Svg>
);

/** What changed. A line stepping up to a corner. */
export const IconChange = (p: IconProps) => (
	<Svg {...p}>
		<path
			d="M3 13.4 7.5 8.6l3.2 3.2 6-6.6"
			stroke="currentColor"
			strokeWidth="1.9"
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
		<path
			d="M13.6 5.2h3.4v3.4"
			stroke="currentColor"
			strokeWidth="1.9"
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
	</Svg>
);

export const IconPage = (p: IconProps) => (
	<Svg {...p}>
		<rect x="3" y="2.6" width="14" height="14.8" rx="3.2" stroke="currentColor" strokeWidth="1.7" />
		<path d="M6.5 7.4h7M6.5 11h4.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
	</Svg>
);

/** The conclusion, when several campaigns point the same way. */
export const IconVerdict = (p: IconProps) => (
	<Svg {...p}>
		<path d="M10 2.6 17.4 15H2.6L10 2.6Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
		<path d="M10 8.2v2.6M10 12.9v.1" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
	</Svg>
);

/** Paid against organic: a dial, because it is a comparison. */
export const IconCompare = (p: IconProps) => (
	<Svg {...p}>
		<path d="M7.4 4.6h9M7.4 10h9M7.4 15.4h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
		<circle cx="3.6" cy="4.6" r="1.5" fill="currentColor" />
		<circle cx="3.6" cy="10" r="1.5" fill="currentColor" />
		<circle cx="3.6" cy="15.4" r="1.5" fill="currentColor" />
	</Svg>
);

export const IconSearch = (p: IconProps) => (
	<Svg {...p}>
		<circle cx="8.8" cy="8.8" r="5.6" stroke="currentColor" strokeWidth="1.7" />
		<path d="M13 13l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
	</Svg>
);

export const IconWhatsapp = (p: IconProps) => (
	<Svg {...p}>
		<path
			d="M17 9.6a6.6 6.6 0 0 1-9.6 5.9L3 17l1.5-4.3A6.6 6.6 0 1 1 17 9.6Z"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinejoin="round"
		/>
	</Svg>
);

export const IconPhone = (p: IconProps) => (
	<Svg {...p}>
		<path
			d="M16.6 13.9v2a1.8 1.8 0 0 1-2 1.8A14.4 14.4 0 0 1 2.3 5.4 1.8 1.8 0 0 1 4.1 3.4h2a1.8 1.8 0 0 1 1.8 1.6c.1.8.3 1.5.6 2.2a1.8 1.8 0 0 1-.4 1.9l-.9.8a14 14 0 0 0 5.4 5.4l.8-.9a1.8 1.8 0 0 1 1.9-.4c.7.3 1.4.5 2.2.6a1.8 1.8 0 0 1 1.6 1.9Z"
			stroke="currentColor"
			strokeWidth="1.7"
			strokeLinejoin="round"
		/>
	</Svg>
);

export const IconMail = (p: IconProps) => (
	<Svg {...p}>
		<rect x="2.6" y="4.4" width="14.8" height="11.2" rx="2.4" stroke="currentColor" strokeWidth="1.8" />
		<path d="M3.2 5.8 10 10.6l6.8-4.8" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
	</Svg>
);

export const IconMessage = (p: IconProps) => (
	<Svg {...p}>
		<path
			d="M17 9.6a6.6 6.6 0 0 1-9.6 5.9L3 17l1.5-4.3A6.6 6.6 0 1 1 17 9.6Z"
			stroke="currentColor"
			strokeWidth="1.7"
			strokeLinejoin="round"
		/>
		<path d="M7.4 9.6h5.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
	</Svg>
);

/** Fix, do not cut. A wrench, because the target is the page. */
export const IconFix = (p: IconProps) => (
	<Svg {...p}>
		<path
			d="M12.4 3.6a4 4 0 0 1 4.6 5.3l-8 8-3.9-3.9 8-8a4 4 0 0 1-.7-1.4Z"
			stroke="currentColor"
			strokeWidth="1.6"
			strokeLinejoin="round"
		/>
		<path d="M5.1 13 3 17l4-2.1" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
	</Svg>
);

export const IconCheck = (p: IconProps) => (
	<Svg {...p}>
		<path d="M4.4 10.6 8 14.2l7.6-8" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
	</Svg>
);

export const IconCopy = (p: IconProps) => (
	<Svg {...p}>
		<rect x="7" y="7" width="10" height="10" rx="2.4" stroke="currentColor" strokeWidth="1.7" />
		<path
			d="M13 4.6A1.6 1.6 0 0 0 11.4 3H4.6A1.6 1.6 0 0 0 3 4.6v6.8A1.6 1.6 0 0 0 4.6 13"
			stroke="currentColor"
			strokeWidth="1.7"
			strokeLinecap="round"
		/>
	</Svg>
);

export const IconMoney = (p: IconProps) => (
	<Svg {...p}>
		<rect x="2.4" y="5" width="15.2" height="10" rx="2.4" stroke="currentColor" strokeWidth="1.7" />
		<circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.7" />
	</Svg>
);

/** Measurement we cannot make. A struck circle, never a warning
 *  triangle: a gap is not an error. */
export const IconUnmeasured = (p: IconProps) => (
	<Svg {...p}>
		<circle cx="10" cy="10" r="7.4" stroke="currentColor" strokeWidth="1.6" />
		<path d="M5.2 5.2l9.6 9.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
	</Svg>
);
