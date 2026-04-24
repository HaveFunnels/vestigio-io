import Hero from "@/components/Home/Hero";
import HomeBigCard from "@/components/Home/HomeBigCard";
import SocialProofStrip from "@/components/Home/SocialProofStrip";
import VSL from "@/components/Home/VSL";
import ProductTour from "@/components/Home/ProductTour";
import ClientGallery from "@/components/Home/ClientGallery";
import SolutionLayers from "@/components/Home/SolutionLayers";
import Features from "@/components/Home/Features";
import FeaturesWithImage from "@/components/Home/FeaturesWithImage";
import Counter from "@/components/Home/Counter";
import Testimonials from "@/components/Home/Testimonials";
import FAQ from "@/components/Home/FAQ";
import MiniCalculator from "@/components/Home/MiniCalculator";
import CallToAction from "@/components/Home/CallToAction";

// ──────────────────────────────────────────────
// HomeLp — landing page variant for /lp commercial funnel.
//
// Same section order as the main Home, but every primary CTA points
// at the anonymous lead funnel (/lp/audit) instead of the signup
// form. This is the dual-funnel split discussed in the product brief:
// signup-led funnel at /, product-qualified-lead funnel at /lp.
//
// When the design diverges later (different copy, different sections,
// different layout), this is the file to fork — the main Home stays
// stable for existing /vestigio.io traffic.
//
// Sub-components accept an optional `primaryCtaHref` prop with a safe
// default, so this wrapper is the only place that knows about the
// CTA divergence. No conditional logic inside the sub-components.
// ──────────────────────────────────────────────

const LP_CTA_HREF = "/lp/audit";

const HomeLp = () => {
	return (
		<>
			<HomeBigCard>
				<Hero i18nNamespace="homepage.hero_lp" primaryCtaHref={LP_CTA_HREF} />
				<SocialProofStrip />
				<VSL />
				<ProductTour primaryCtaHref={LP_CTA_HREF} />
				<ClientGallery />
			</HomeBigCard>
			<MiniCalculator primaryCtaHref={LP_CTA_HREF} />
			<SolutionLayers />
			<FeaturesWithImage />
			<Features />
			<Counter />
			<Testimonials />
			<FAQ />
			<MiniCalculator primaryCtaHref={LP_CTA_HREF} />
			<CallToAction primaryCtaHref={LP_CTA_HREF} />
		</>
	);
};

export default HomeLp;
