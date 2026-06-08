import { redirect } from "next/navigation";

// /app — Phase 1 UX overhaul (testers said the dashboard is "too
// complicated"). New home is the current month's Strategy Plan.
// The plan page itself handles the "not generated yet" case with a
// friendly empty state, so we don't need a server-side existence
// check here — one redirect, no double-bounce.
export default function AppRootPage() {
	const now = new Date();
	const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
	redirect(`/app/library/strategy/${month}`);
}
