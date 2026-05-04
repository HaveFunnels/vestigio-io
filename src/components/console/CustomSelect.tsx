"use client";

import { useState } from "react";
import { CaretDown as CaretDownIcon, Check as CheckIcon } from "@phosphor-icons/react/dist/ssr";
import { Dropdown, DropdownTrigger, DropdownContent } from "@/components/dropdown";
import { cn } from "@/libs/utils";

// ──────────────────────────────────────────────
// CustomSelect — drop-in replacement for native <select>
//
// Uses the project's Dropdown component internally so
// styling matches the design system. API mirrors native
// <select> for easy migration: value, onChange, options.
// ──────────────────────────────────────────────

export interface SelectOption {
	value: string;
	label: string;
	disabled?: boolean;
}

interface CustomSelectProps {
	value: string;
	onChange: (value: string) => void;
	options: SelectOption[];
	placeholder?: string;
	className?: string;
	/** Compact variant for filter bars */
	size?: "sm" | "md";
	align?: "start" | "end";
	disabled?: boolean;
}

export default function CustomSelect({
	value,
	onChange,
	options,
	placeholder,
	className,
	size = "md",
	align = "start",
	disabled = false,
}: CustomSelectProps) {
	const [isOpen, setIsOpen] = useState(false);

	const selectedOption = options.find((o) => o.value === value);
	const displayLabel = selectedOption?.label ?? placeholder ?? "";

	const sizeClasses = size === "sm"
		? "h-8 px-2.5 text-xs gap-1.5"
		: "h-9 px-3 text-sm gap-2";

	return (
		<Dropdown isOpen={isOpen} setIsOpen={setIsOpen}>
			<DropdownTrigger
				className={cn(
					"inline-flex items-center justify-between rounded-md border border-edge bg-surface-inset font-medium text-content-secondary transition-colors",
					"hover:bg-surface-card-hover hover:text-content",
					"focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500",
					disabled && "pointer-events-none opacity-50",
					sizeClasses,
					className,
				)}
			>
				<span className="truncate">{displayLabel}</span>
				<CaretDownIcon
					size={size === "sm" ? 12 : 14}
					weight="bold"
					className={cn(
						"shrink-0 text-content-muted transition-transform",
						isOpen && "rotate-180",
					)}
				/>
			</DropdownTrigger>

			<DropdownContent
				align={align}
				className="z-50 max-h-60 overflow-y-auto rounded-lg border border-edge bg-surface-card py-1 shadow-xl"
			>
				{options.map((option) => {
					const isActive = option.value === value;
					return (
						<button
							key={option.value}
							onClick={() => {
								if (!option.disabled) {
									onChange(option.value);
									setIsOpen(false);
								}
							}}
							disabled={option.disabled}
							className={cn(
								"flex w-full items-center gap-2 px-3 text-left transition-colors",
								size === "sm" ? "py-1.5 text-xs" : "py-2 text-sm",
								isActive
									? "bg-surface-card-hover text-content"
									: "text-content-secondary hover:bg-surface-card-hover hover:text-content",
								option.disabled && "pointer-events-none opacity-40",
							)}
						>
							<CheckIcon
								size={14}
								weight="bold"
								className={cn(
									"shrink-0",
									isActive ? "text-emerald-400" : "invisible",
								)}
							/>
							<span className="truncate">{option.label}</span>
						</button>
					);
				})}
			</DropdownContent>
		</Dropdown>
	);
}
