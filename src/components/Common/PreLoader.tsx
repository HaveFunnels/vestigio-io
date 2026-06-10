"use client";
import { useEffect, useState } from "react";

/*
 * PreLoader — bootstrap splash that masks the initial paint while
 * Next.js hydrates. Previously rendered a giant spinning ring; now
 * renders 3 breathing dots centered on the page so the customer sees
 * "alive but waiting" without the radar-sweep.
 */

const PreLoader = () => {
	const [loading, setLoading] = useState<boolean>(true);

	useEffect(() => {
		setTimeout(() => setLoading(false), 1000);
	}, []);

	if (!loading) return null;
	return (
		<div className='fixed left-0 top-0 z-999999 flex h-screen w-screen items-center justify-center bg-white dark:bg-[#151F34]'>
			<div className='flex items-center gap-2 text-primary'>
				<span className='h-2.5 w-2.5 animate-bounce rounded-full bg-current' style={{ animationDelay: "0ms", animationDuration: "1s" }} />
				<span className='h-2.5 w-2.5 animate-bounce rounded-full bg-current' style={{ animationDelay: "150ms", animationDuration: "1s" }} />
				<span className='h-2.5 w-2.5 animate-bounce rounded-full bg-current' style={{ animationDelay: "300ms", animationDuration: "1s" }} />
			</div>
		</div>
	);
};

export default PreLoader;
