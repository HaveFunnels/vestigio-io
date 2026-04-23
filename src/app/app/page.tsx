import { redirect } from "next/navigation";

// /app → redirect to /app/dashboard (Dashboard is the daily briefing surface)
export default function AppRootPage() {
  redirect("/app/dashboard");
}
