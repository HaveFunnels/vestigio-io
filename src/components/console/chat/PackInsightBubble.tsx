"use client";

/**
 * PackInsightBubble — Renders a cross-domain pack insight during streaming.
 *
 * Each pack gets a colored avatar + name, and the insight appears as a
 * chat-like message. During streaming, these appear sequentially with
 * entrance animation, giving the impression of packs "discussing" the
 * user's question from their domain perspective.
 */

// ── Pack visual metadata ──

interface PackMeta {
	label: string;
	color: string;       // tailwind text color
	bgColor: string;     // tailwind bg for avatar
	borderColor: string; // tailwind border for the bubble
}

const PACK_META: Record<string, PackMeta> = {
	revenue: {
		label: "Revenue",
		color: "text-red-400",
		bgColor: "bg-red-500/20",
		borderColor: "border-red-500/20",
	},
	chargeback: {
		label: "Chargeback",
		color: "text-amber-400",
		bgColor: "bg-amber-500/20",
		borderColor: "border-amber-500/20",
	},
	security_posture: {
		label: "Security",
		color: "text-blue-400",
		bgColor: "bg-blue-500/20",
		borderColor: "border-blue-500/20",
	},
	preflight: {
		label: "Preflight",
		color: "text-emerald-400",
		bgColor: "bg-emerald-500/20",
		borderColor: "border-emerald-500/20",
	},
	first_impression: {
		label: "First Impression",
		color: "text-violet-400",
		bgColor: "bg-violet-500/20",
		borderColor: "border-violet-500/20",
	},
	action_value: {
		label: "Action Value",
		color: "text-pink-400",
		bgColor: "bg-pink-500/20",
		borderColor: "border-pink-500/20",
	},
	acquisition_integrity: {
		label: "Acquisition",
		color: "text-cyan-400",
		bgColor: "bg-cyan-500/20",
		borderColor: "border-cyan-500/20",
	},
	mobile_revenue: {
		label: "Mobile Revenue",
		color: "text-orange-400",
		bgColor: "bg-orange-500/20",
		borderColor: "border-orange-500/20",
	},
	friction_tax: {
		label: "Friction Tax",
		color: "text-rose-400",
		bgColor: "bg-rose-500/20",
		borderColor: "border-rose-500/20",
	},
	trust_gap: {
		label: "Trust Gap",
		color: "text-indigo-400",
		bgColor: "bg-indigo-500/20",
		borderColor: "border-indigo-500/20",
	},
	path_efficiency: {
		label: "Path Efficiency",
		color: "text-teal-400",
		bgColor: "bg-teal-500/20",
		borderColor: "border-teal-500/20",
	},
};

const FALLBACK_META: PackMeta = {
	label: "Analysis",
	color: "text-content-muted",
	bgColor: "bg-surface-inset",
	borderColor: "border-edge",
};

// ── Pack icon (first letter as avatar) ──

function PackAvatar({ pack, meta }: { pack: string; meta: PackMeta }) {
	const initial = meta.label.charAt(0).toUpperCase();
	return (
		<div
			className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${meta.bgColor} ${meta.color}`}
		>
			{initial}
		</div>
	);
}

// ── Component ──

export default function PackInsightBubble({
	pack,
	message,
}: {
	pack: string;
	message: string;
}) {
	const meta = PACK_META[pack] || FALLBACK_META;

	return (
		<div className="animate-message-appear flex items-start gap-2.5">
			<PackAvatar pack={pack} meta={meta} />
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className={`text-xs font-semibold ${meta.color}`}>
						{meta.label}
					</span>
					<span className="text-[10px] text-content-faint">
						analyzing
					</span>
				</div>
				<p className="mt-0.5 text-sm leading-relaxed text-content-secondary">
					{message}
				</p>
			</div>
		</div>
	);
}
