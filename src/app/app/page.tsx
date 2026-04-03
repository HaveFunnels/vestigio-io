import { redirect } from "next/navigation";

// /app → redirect to /app/actions (Actions is the primary operating surface)
export default function AppRootPage() {
  redirect("/app/actions");
}
