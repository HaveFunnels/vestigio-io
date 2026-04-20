import Hero from "./Hero";
import HomeBigCard from "./HomeBigCard";
import SocialProofStrip from "./SocialProofStrip";
import ProductTour from "./ProductTour";
import ClientGallery from "./ClientGallery";
import SolutionLayers from "./SolutionLayers";
import Features from "./Features";
import FeaturesWithImage from "./FeaturesWithImage";
import Counter from "./Counter";
import VideoTestimonials from "./VideoTestimonials";
import Testimonials from "./Testimonials";
import FAQ from "./FAQ";
import MiniCalculator from "./MiniCalculator";

// ──────────────────────────────────────────────
// Home — public marketing root.
//
// Reading order matches the marketing brief in
// docs/MARKETING_COPY.md (sections 12 + 21):
//
//  1. Hero               — banner + headline + 5 pill cards + product shell
//  2. ProductTour        — interactive dashboard mock
//  3. ClientGallery      — quiet social-proof strip
//  4. FeaturesWithImage  — five product use cases (decision-first cards)
//  5. Features           — bento grid with the four product promises
//  6. SolutionLayers     — comparison-style strip
//  7. Counter / Testimonials / FAQ — supporting blocks
//  8. MiniCalculator     — gradient hero card with the auto audit
//  9. CallToAction       — final CTA
//
// The /lp variant (HomeLp) keeps the same order but rewires CTAs to
// the anonymous lead funnel.
// ──────────────────────────────────────────────

const Home = () => {
	return (
		<>
			<HomeBigCard>
				<Hero />
				<SocialProofStrip />
				<ProductTour />
				<ClientGallery />
			</HomeBigCard>
			<SolutionLayers />
			<FeaturesWithImage />
			<Features />
			<Counter />
			<VideoTestimonials />
			<Testimonials />
			<FAQ />
			<MiniCalculator />
		</>
	);
};

export default Home;
