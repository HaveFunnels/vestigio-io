"use client";

import { usePathname } from "next/navigation";
import { SuspendedShell } from "./SuspendedShell";

// ──────────────────────────────────────────────
// SuspendedGate — runs inside the app layout. When org.status is
// `suspended`, replaces the children with SuspendedShell EXCEPT on
// the billing route (so the user can pay to reactivate) and the
// admin route (admins can still investigate).
//
// We do this client-side because Next.js App Router layouts don't
// receive the request URL directly — usePathname() gives us the route
// without a middleware roundtrip. The brief flash of the normal shell
// before the gate kicks in is acceptable; the alternative (middleware
// DB lookup on every request) costs a DB roundtrip per page.
// ──────────────────────────────────────────────

interface Props {
	status: string;
	orgName: string;
	children: React.ReactNode;
}

const ALLOWED_PATHS = ["/app/billing", "/app/admin"];

export function SuspendedGate({ status, orgName, children }: Props) {
	const pathname = usePathname();
	if (status !== "suspended") return <>{children}</>;
	if (ALLOWED_PATHS.some((p) => pathname.startsWith(p))) return <>{children}</>;
	return <SuspendedShell orgName={orgName} />;
}
