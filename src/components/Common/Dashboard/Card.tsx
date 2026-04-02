import { ReactNode } from "react";

export default function Card({ children }: { children: ReactNode }) {
	return (
		<div className='rounded-lg bg-white p-6 shadow-1 dark:border dark:border-zinc-800 dark:bg-zinc-900/50 dark:shadow-none'>
			{children}
		</div>
	);
}
