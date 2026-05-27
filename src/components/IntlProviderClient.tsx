"use client";

import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

/*
 * Client-side wrapper for NextIntlClientProvider so we can pass it
 * function props (onError + getMessageFallback) without crossing the
 * server→client boundary.
 *
 * Why this exists: the root server layout in src/app/layout.tsx
 * resolves messages via getMessages() and renders <NextIntlClientProvider
 * messages={...}>. Initially the provider was instantiated inline in
 * that server layout. Adding non-fatal i18n callbacks
 * (onError + getMessageFallback) introduced functions as props, which
 * Next.js refuses to serialize across the RSC boundary —
 * "Event handlers cannot be passed to Client Component props" (digest
 * 369007819 in prod). Moving the provider into this "use client"
 * component lets the functions live alongside the provider on the
 * client tree where they're allowed.
 *
 * The non-fatal MISSING_MESSAGE handling is intentional:
 * out-of-sync nav labels (or any single missing key) shouldn't bring
 * down /app/* routes. Dev surfaces them as a console.warn; prod
 * renders the bare key as fallback.
 */

interface Props {
	locale?: string;
	messages: any;
	children: ReactNode;
}

export default function IntlProviderClient({ locale, messages, children }: Props) {
	return (
		<NextIntlClientProvider
			locale={locale}
			messages={messages}
			onError={(error) => {
				if (error.code === "MISSING_MESSAGE") {
					if (process.env.NODE_ENV !== "production") {
						console.warn("next-intl MISSING_MESSAGE:", error.message);
					}
					return;
				}
				throw error;
			}}
			getMessageFallback={({ key, namespace }) => {
				const path = namespace ? `${namespace}.${key}` : key;
				return process.env.NODE_ENV === "production" ? key : `[${path}]`;
			}}
		>
			{children}
		</NextIntlClientProvider>
	);
}
