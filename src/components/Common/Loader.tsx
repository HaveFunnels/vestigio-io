import React from "react";

const Loader = ({ style }: { style?: string }) => {
	return (
		<span
			className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-t-transparent dark:border-t-transparent ${style ?? "border-zinc-300 dark:border-zinc-600 dark:border-t-emerald-500"}`}
		></span>
	);
};

export default Loader;
