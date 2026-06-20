import dynamic from "next/dynamic";
import Hero from "@/components/Home/Hero";
import HomeBigCard from "@/components/Home/HomeBigCard";
import SocialProofStrip from "@/components/Home/SocialProofStrip";
import VSL from "@/components/Home/VSL";
import ProductTour from "@/components/Home/ProductTour";
import ClientGallery from "@/components/Home/ClientGallery";
import MiniCalculator from "@/components/Home/MiniCalculator";

const SolutionLayers = dynamic(() => import("@/components/Home/SolutionLayers"));
const Features = dynamic(() => import("@/components/Home/Features"));
const Counter = dynamic(() => import("@/components/Home/Counter"));
const VideoTestimonials = dynamic(() => import("@/components/Home/VideoTestimonials"));
const SocialProof = dynamic(() => import("@/components/shared/SocialProof"));
const FAQ = dynamic(() => import("@/components/Home/FAQ"));
const CallToAction = dynamic(() => import("@/components/Home/CallToAction"));

// ──────────────────────────────────────────────
// HomeLp — landing page variant for /lp funnel.
//
// Identical to Home except:
// 1. Hero uses `homepage.hero_lp` i18n namespace
// 2. All CTAs point to `/audit` instead of `/auth/signup`
// ──────────────────────────────────────────────

const LP_CTA_HREF = "/audit";

const HomeLp = () => {
	return (
		<>
			{/* HomeBigCard gradient wrapper restored 2026-06-20. */}
			<HomeBigCard>
				<Hero i18nNamespace="homepage.hero_lp" primaryCtaHref={LP_CTA_HREF} />
				<SocialProofStrip />
				<VSL />
				<ProductTour primaryCtaHref={LP_CTA_HREF} />
				<ClientGallery />
			</HomeBigCard>
			<MiniCalculator primaryCtaHref={LP_CTA_HREF} />
			<SocialProof rows="row1" />
			<SolutionLayers />
			<VideoTestimonials />
			<Counter />
			<Features />
			<SocialProof rows="row2" />
			<FAQ />
			<CallToAction primaryCtaHref={LP_CTA_HREF} />
		</>
	);
};

export default HomeLp;
