import React from "react";

/*
 * Loader — 3-dot breathing indicator used for inline button-state and
 * other in-flight actions. Replaces the previous spinning ring per the
 * standing skeleton-over-spinner preference; the 3-dot pattern still
 * communicates "something is happening" without the radar-sweep that
 * the user dislikes.
 *
 * API preserved: optional `style` prop overrides the default zinc/
 * emerald color so existing callers keep working. The prop now drives
 * the dot color via `text-current` since the dots inherit color from
 * the parent text-color when no override is set.
 */

const Loader = ({ style }: { style?: string }) => {
	return (
		<span
			role="status"
			aria-label="Loading"
			className={`inline-flex items-center gap-1 ${style ?? "text-emerald-500 dark:text-emerald-400"}`}
		>
			<span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-current" style={{ animationDelay: "0ms", animationDuration: "1s" }} />
			<span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-current" style={{ animationDelay: "150ms", animationDuration: "1s" }} />
			<span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-current" style={{ animationDelay: "300ms", animationDuration: "1s" }} />
		</span>
	);
};

export default Loader;
