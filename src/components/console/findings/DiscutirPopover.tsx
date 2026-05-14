"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
	Popover,
	PopoverTrigger,
	PopoverContent,
} from "@/components/ui/popover";
import {
	ArrowsClockwise as ArrowsClockwiseIcon,
	ChatCircle as ChatCircleIcon,
	Plus as PlusIcon,
	CaretDown as CaretDownIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { FindingProjection } from "@/../../packages/projections/types";

interface DiscutirPopoverProps {
	finding: FindingProjection;
	onVerify: (finding: FindingProjection) => void;
	onUnderstand: (finding: FindingProjection) => void;
	onCreateAction: (finding: FindingProjection) => void;
	creating?: boolean;
}

export default function DiscutirPopover({
	finding,
	onVerify,
	onUnderstand,
	onCreateAction,
	creating,
}: DiscutirPopoverProps) {
	const t = useTranslations("console.findings.discutir");
	const [open, setOpen] = useState(false);

	// Verification only makes sense when the projection actually carries a
	// strategy. Without one we'd send the user to chat with no plan to
	// confirm a fix.
	const verifyDisabled = !finding.verification_strategy;
	// Already-actioned findings shouldn't be turned into a second user
	// action — the existing one is what the user should track.
	const createDisabled = (finding.action_refs?.length ?? 0) > 0 || !!creating;

	const items: {
		key: string;
		icon: React.ReactNode;
		label: string;
		onClick: () => void;
		disabled?: boolean;
	}[] = [
		{
			key: "verify",
			icon: <ArrowsClockwiseIcon size={15} weight="duotone" />,
			label: t("verifyFinding"),
			onClick: () => onVerify(finding),
			disabled: verifyDisabled,
		},
		{
			key: "understand",
			icon: <ChatCircleIcon size={15} weight="duotone" />,
			label: t("understand"),
			onClick: () => onUnderstand(finding),
		},
		{
			key: "create",
			icon: <PlusIcon size={15} weight="duotone" />,
			label: creating ? t("creating") : t("createAction"),
			onClick: () => onCreateAction(finding),
			disabled: createDisabled,
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
			<PopoverContent align="end" sideOffset={4} className="w-56 p-1">
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
