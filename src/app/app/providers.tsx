"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { ProductTrackProvider } from "@/hooks/useProductTrack";
import { CopilotProvider } from "@/components/app/CopilotProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
	return (
		<ThemeProvider attribute="class" enableSystem={false} defaultTheme="dark">
			<SessionProvider>
				<ProductTrackProvider>
					<CopilotProvider>{children}</CopilotProvider>
				</ProductTrackProvider>
			</SessionProvider>
		</ThemeProvider>
	);
}
