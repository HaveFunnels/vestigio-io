import { redirect } from "next/navigation";

// Redirect legacy SaaS Access page to Data Sources
export default function SaasAccessRedirect() {
	redirect("/app/settings/data-sources");
}
