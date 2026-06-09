import { redirect } from "next/navigation";

// Wave 22.8 IA reform — Library demoted from sidenav and folded into
// the Plan header (MonthPicker dropdown lists last 24 months inline).
// This stub keeps old bookmarks + back-button hits working by routing
// to the Plan of the current month via /app (which resolves env +
// month server-side).
//
// The old gallery rendering (Plans + Maps list) lives in git history
// at the previous commit; if a richer "all artifacts" view is needed
// again it should be reborn inside the Plan or as a sub-page of
// Workspaces, not as a tier-1 surface.
export default function LibraryLegacyRedirectPage() {
	redirect("/app");
}
