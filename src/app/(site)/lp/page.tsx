import HomeLp from "@/components/HomeLp";
import { Metadata } from "next";

// ──────────────────────────────────────────────
// /lp — Commercial Landing Page Variant
//
// Sister page to "/" (home). Identical sections for now (per product
// brief: "it's just an exact copy of the home for now"), but every
// primary CTA points to the anonymous lead funnel /lp/audit instead
// of /auth/signup.
//
// SEO: noindex on purpose. We don't want this page competing with
// the main home in search results — it's exclusively for paid traffic
// and ad campaigns. The visitor lands here from a paid source, sees
// an interest-free CTA ("Run free audit"), and self-qualifies through
// the 4-step form before paying.
// ──────────────────────────────────────────────

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "Vestigio — Free Site Audit",
	description:
		"Get a free audit of your website. Vestigio crawls your landing in seconds and surfaces the conversion blockers, friction points, and trust gaps costing you revenue.",
	robots: {
		index: false,
		follow: false,
	},
	openGraph: {
		type: "website",
		title: "Vestigio — Free Site Audit",
		description:
			"Get a free audit of your website. Vestigio crawls your landing in seconds and surfaces the conversion blockers, friction points, and trust gaps costing you revenue.",
	},
	twitter: {
		card: "summary_large_image",
		title: "Vestigio — Free Site Audit",
		description:
			"Get a free audit of your website. Vestigio crawls your landing in seconds and surfaces the conversion blockers, friction points, and trust gaps costing you revenue.",
	},
};

export default function LpPage() {
	return (
		<main>
			<HomeLp />
		</main>
	);
}
