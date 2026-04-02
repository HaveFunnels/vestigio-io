import { redirect } from "next/navigation";

// /app → redirect to /app/analysis (default product surface)
export default function AppRootPage() {
  redirect("/app/analysis");
}
