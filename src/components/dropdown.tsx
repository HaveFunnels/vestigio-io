"use client";

import { useClickOutside } from "@/hooks/use-click-outside";
import { cn } from "@/libs/utils";
import { SetStateActionType } from "@/types/set-state-action-type";
import { getScrollBarWidth } from "@/utils/get-scrollbar-width";
import { createContext, useContext, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

type DropdownContextType = {
	isOpen: boolean;
	handleOpen: () => void;
	handleClose: () => void;
	dropdownRef: React.RefObject<HTMLDivElement | null>;
	triggerRef?: React.RefObject<HTMLButtonElement | null>;
	triggerId: string;
	contentId: string;
};

const DropdownContext = createContext<DropdownContextType | null>(null);

function useDropdownContext() {
	const context = useContext(DropdownContext);
	if (!context) {
		throw new Error("useDropdownContext must be used within a Dropdown");
	}
	return context;
}

type DropdownProps = {
	children: React.ReactNode;
	isOpen: boolean;
	setIsOpen: SetStateActionType<boolean>;
};

export function Dropdown({ children, isOpen, setIsOpen }: DropdownProps) {
	const firstRender = useRef(true);

	const triggerRef = useRef<HTMLButtonElement>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);

	const triggerId = useId();
	const contentId = useId();

	const handleKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === "Escape") {
			handleClose();
		}
	};

	useEffect(() => {
		if (firstRender.current) {
			firstRender.current = false;
			return;
		}

		if (isOpen) {
			triggerRef.current = document.activeElement as HTMLButtonElement;

			document.body.style.setProperty("pointer-events", "none");
			document.body.style.setProperty(
				"--scroll-bar-width",
				getScrollBarWidth() + "px"
			);
			document.body.setAttribute("data-scroll-locked", "1");
		} else {
			document.body.style.removeProperty("pointer-events");
			document.body.removeAttribute("data-scroll-locked");
		}
	}, [isOpen]);

	function handleClose() {
		setIsOpen(false);

		setTimeout(() => {
			triggerRef.current?.focus();
		}, 0);
	}

	function handleOpen() {
		setIsOpen(true);
	}

	return (
		<DropdownContext.Provider
			value={{
				isOpen,
				handleOpen,
				handleClose,
				dropdownRef,
				triggerRef,
				triggerId,
				contentId,
			}}
		>
			<div className='relative' ref={dropdownRef} onKeyDown={handleKeyDown}>
				{children}
			</div>
		</DropdownContext.Provider>
	);
}

type DropdownContentProps = {
	align?: "start" | "end" | "center";
	className?: string;
	children: React.ReactNode;
	sideOffset?: number; // The distance in pixels from the trigger.
};

export function DropdownContent({
	children,
	align = "center",
	className,
	sideOffset = 8,
}: DropdownContentProps) {
	const { isOpen, handleClose, dropdownRef, triggerRef, contentId, triggerId } =
		useDropdownContext();
	const contentRef = useClickOutside<HTMLDivElement>(() => {
		if (isOpen) handleClose();
	});

	useEffect(() => {
		if (!dropdownRef.current) return;

		if (isOpen) {
			const { left, top, height } = dropdownRef.current.getBoundingClientRect();

			contentRef.current?.style.setProperty(
				"top",
				`${top + height + sideOffset}px`
			);

			if (
				window.innerHeight <
				top + height + (contentRef.current?.offsetWidth || 0)
			) {
				contentRef.current?.style.setProperty(
					"transform",
					`translate(0, -${height + contentRef.current?.offsetHeight + sideOffset * 2}px)`
				);
			} else {
				contentRef.current?.style.removeProperty("transform");
			}

			// Set the left position based on the alignment
			// Default leftPosition is for align="start"
			let leftPosition = left;

			if (align === "end") {
				leftPosition =
					left -
					Number(contentRef.current?.clientWidth) +
					Number(triggerRef?.current?.clientWidth);
			}

			if (align === "center") {
				leftPosition = left - Number(triggerRef?.current!.clientWidth) / 2;
			}

			contentRef.current?.style.setProperty("left", `${leftPosition}px`);
		}
	}, [isOpen, align]);

	if (!isOpen) return null;

	return createPortal(
		<div
			ref={contentRef}
			role='menu'
			aria-orientation='vertical'
			className={cn(
				"pointer-events-auto fixed min-w-[8rem] origin-top-right rounded-lg",
				className
			)}
			data-state={isOpen ? "open" : "closed"}
			id={contentId}
			aria-labelledby={triggerId}
		>
			{children}
		</div>,
		document.body
	);
}

type DropdownTriggerProps = React.HTMLAttributes<HTMLButtonElement> & {
	children: React.ReactNode;
};

export function DropdownTrigger({ children, className }: DropdownTriggerProps) {
	const { handleOpen, isOpen, triggerRef, triggerId, contentId } =
		useDropdownContext();

	return (
		<button
			ref={triggerRef}
			className={className}
			onClick={handleOpen}
			aria-expanded={isOpen}
			aria-haspopup='menu'
			data-state={isOpen ? "open" : "closed"}
			id={triggerId}
			aria-controls={contentId}
		>
			{children}
		</button>
	);
}
