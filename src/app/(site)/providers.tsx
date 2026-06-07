"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { useEffect, useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
	// The (site) marketing surface is dark-only by design — we force it
	// so the buyer never sees a flash of light on first paint, and so
	// no rogue ThemeSwitcher in a shared component can override it.
	//
	// Exception: the mini-audit result preview (`?preview=<scenario>`)
	// needs to flip between light + dark so designers can verify both
	// themes ship correctly. When that param is present we drop the
	// forced theme and let the inline useEffect inside the preview page
	// drive `<html class="dark">`. SSR-safe: we initialize to forced=true
	// (the production behavior) and only relax after mount when we can
	// read window.location.search.
	const [forceDark, setForceDark] = useState(true);
	useEffect(() => {
		const isPreview = new URLSearchParams(window.location.search).has(
			"preview",
		);
		if (isPreview) setForceDark(false);
	}, []);

	return (
		<ThemeProvider
			attribute='class'
			enableSystem={false}
			defaultTheme='dark'
			forcedTheme={forceDark ? "dark" : undefined}
		>
			<SessionProvider>{children}</SessionProvider>
		</ThemeProvider>
	);
}
