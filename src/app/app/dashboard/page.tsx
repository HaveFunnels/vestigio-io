import { redirect } from "next/navigation";

// Wave-22.6 review fix P3.3 — /app/dashboard was renamed to /app/pulse
// so the URL matches the "Vestigio Pulse" name shown on the marketing
// site + product UI. This stub keeps old bookmarks + back-button hits
// working with a permanent redirect.

export default function DashboardLegacyRedirect() {
	redirect("/app/pulse");
}
