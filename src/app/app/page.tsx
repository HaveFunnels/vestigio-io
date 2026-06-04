import { redirect } from "next/navigation";

// /app → redirect to /app/pulse (Pulse is the daily briefing surface)
export default function AppRootPage() {
  redirect("/app/pulse");
}
