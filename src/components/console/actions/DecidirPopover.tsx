"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
	Popover,
	PopoverTrigger,
	PopoverContent,
} from "@/components/ui/popover";
import {
	Lightbulb as LightbulbIcon,
	ChatCircle as ChatCircleIcon,
	ArrowsClockwise as ArrowsClockwiseIcon,
	CheckCircle as CheckCircleIcon,
	CaretDown as CaretDownIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { ActionProjection } from "../../../../packages/projections/types";

interface DecidirPopoverProps {
	action: ActionProjection;
	onPlanRemediation: (action: ActionProjection) => void;
	onDiscuss: (action: ActionProjection) => void;
	onRunVerification: (action: ActionProjection) => void;
	onMarkResolved: (action: ActionProjection) => void;
	verificationDisabled: boolean;
	isVerifying: boolean;
}

export default function DecidirPopover({
	action,
	onPlanRemediation,
	onDiscuss,
	onRunVerification,
	onMarkResolved,
	verificationDisabled,
	isVerifying,
}: DecidirPopoverProps) {
	const t = useTranslations("console.actions.decidir");
	const [open, setOpen] = useState(false);

	const items: {
		key: string;
		icon: React.ReactNode;
		label: string;
		onClick: () => void;
		disabled?: boolean;
	}[] = [
		{
			key: "plan",
			icon: <LightbulbIcon size={15} weight="duotone" />,
			label: t("planRemediation"),
			onClick: () => onPlanRemediation(action),
		},
		{
			key: "discuss",
			icon: <ChatCircleIcon size={15} weight="duotone" />,
			label: t("discuss"),
			onClick: () => onDiscuss(action),
		},
		{
			key: "verify",
			icon: <ArrowsClockwiseIcon size={15} weight="duotone" />,
			label: t("runVerification"),
			onClick: () => onRunVerification(action),
			disabled: verificationDisabled || isVerifying,
		},
		{
			key: "resolve",
			icon: <CheckCircleIcon size={15} weight="duotone" />,
			label: t("markResolved"),
			onClick: () => onMarkResolved(action),
			disabled: isVerifying,
		},
	];

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					onClick={(e) => e.stopPropagation()}
					className="inline-flex items-center gap-1 rounded-md border border-edge bg-surface-card px-2.5 py-1 text-xs font-medium text-content-secondary transition-colors hover:border-accent/40 hover:bg-surface-card-hover hover:text-content"
				>
					{t("label")}
					<CaretDownIcon
						size={12}
						weight="bold"
						className={`transition-transform ${open ? "rotate-180" : ""}`}
					/>
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" sideOffset={4} className="w-52 p-1">
				{items.map((item) => (
					<button
						key={item.key}
						type="button"
						disabled={item.disabled}
						onClick={(e) => {
							e.stopPropagation();
							setOpen(false);
							item.onClick();
						}}
						className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
							item.disabled
								? "cursor-not-allowed text-content-faint opacity-40"
								: "text-content-secondary hover:bg-surface-card-hover hover:text-content"
						}`}
					>
						{item.icon}
						<span>{item.label}</span>
					</button>
				))}
			</PopoverContent>
		</Popover>
	);
}
