"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<ThemeProvider attribute='class' enableSystem={false} defaultTheme='dark' forcedTheme='dark'>
			<SessionProvider>{children}</SessionProvider>
		</ThemeProvider>
	);
}
