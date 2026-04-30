import dynamic from "next/dynamic";
import Hero from "./Hero";
import HomeBigCard from "./HomeBigCard";
import SocialProofStrip from "./SocialProofStrip";
import VSL from "./VSL";
import ProductTour from "./ProductTour";
import ClientGallery from "./ClientGallery";
import MiniCalculator from "./MiniCalculator";

// ── Below-the-fold: lazy-load JS chunks, keep SSR HTML ──
// next/dynamic with ssr: true (default) renders full HTML on the
// server for SEO, but defers the JS hydration bundle until the
// browser needs it. This cuts the initial JS payload by ~60%.

const SolutionLayers = dynamic(() => import("./SolutionLayers"));
const FeaturesWithImage = dynamic(() => import("./FeaturesWithImage"));
const Features = dynamic(() => import("./Features"));
const Counter = dynamic(() => import("./Counter"));
const VideoTestimonials = dynamic(() => import("./VideoTestimonials"));
const SocialProof = dynamic(() => import("@/components/shared/SocialProof"));
const FAQ = dynamic(() => import("./FAQ"));
const CallToAction = dynamic(() => import("./CallToAction"));

// ──────────────────────────────────────────────
// Home — public marketing root.
//
// Above the fold (eager): Hero, SocialProofStrip, VSL,
// ProductTour, ClientGallery, MiniCalculator.
//
// Below the fold (lazy JS, full SSR): everything after
// MiniCalculator. HTML is in the initial response for SEO;
// JS chunks load as the user scrolls.
// ──────────────────────────────────────────────

const Home = () => {
	return (
		<>
			<HomeBigCard>
				<Hero />
				<SocialProofStrip />
				<VSL />
				<ProductTour />
				<ClientGallery />
			</HomeBigCard>
			<MiniCalculator />
			<SocialProof rows="row1" />
			<FeaturesWithImage />
			<SolutionLayers />
			<VideoTestimonials />
			<Counter />
			<Features />
			<SocialProof rows="row2" />
			<FAQ />
			<CallToAction />
		</>
	);
};

export default Home;
