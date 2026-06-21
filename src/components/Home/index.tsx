import dynamic from "next/dynamic";
import Hero from "./Hero";
import HomeBigCard from "./HomeBigCard";
import SocialProofStrip from "./SocialProofStrip";
import DemoSurface from "./DemoSurface";
import ClientGallery from "./ClientGallery";
import MiniCalculator from "./MiniCalculator";
import ScrollReveal from "./ScrollReveal";
import StickyCTA from "./StickyCTA";

// ── Below-the-fold: lazy-load JS chunks, keep SSR HTML ──
// next/dynamic with ssr: true (default) renders full HTML on the
// server for SEO, but defers the JS hydration bundle until the
// browser needs it. This cuts the initial JS payload by ~60%.

const SolutionLayers = dynamic(() => import("./SolutionLayers"));
const Features = dynamic(() => import("./Features"));
const Counter = dynamic(() => import("./Counter"));
const VideoTestimonials = dynamic(() => import("./VideoTestimonials"));
const SocialProof = dynamic(() => import("@/components/shared/SocialProof"));
const FAQ = dynamic(() => import("./FAQ"));
const CallToAction = dynamic(() => import("./CallToAction"));

// ──────────────────────────────────────────────
// Home — public marketing root.
//
// Above the fold (eager): Hero, SocialProofStrip, DemoSurface
// (video → product tour reveal), ClientGallery, MiniCalculator.
//
// Below the fold (lazy JS, full SSR): everything after
// MiniCalculator. HTML is in the initial response for SEO;
// JS chunks load as the user scrolls.
// ──────────────────────────────────────────────

const Home = () => {
	return (
		<>
			{/* Top-of-fold sections wrapped in HomeBigCard — gradient
			    canvas (dark → white) that gives the hero + ProductTour +
			    ClientGallery a contained "lit page" feel against the
			    surrounding dark body. Restored 2026-06-20 (was briefly
			    removed; the gradient ending in white was the deliberate
			    transition signature, not slop). */}
			<HomeBigCard>
				<Hero />
				<SocialProofStrip />
				<DemoSurface />
				<ClientGallery />
			</HomeBigCard>
			<ScrollReveal>
				<MiniCalculator />
			</ScrollReveal>
			<ScrollReveal>
				<SocialProof rows="row1" />
			</ScrollReveal>
			<ScrollReveal>
				<SolutionLayers />
			</ScrollReveal>
			<ScrollReveal>
				<VideoTestimonials />
			</ScrollReveal>
			<ScrollReveal>
				<Counter />
			</ScrollReveal>
			<ScrollReveal>
				<Features />
			</ScrollReveal>
			<ScrollReveal>
				<SocialProof rows="row2" />
			</ScrollReveal>
			<ScrollReveal>
				<FAQ />
			</ScrollReveal>
			<ScrollReveal>
				<CallToAction />
			</ScrollReveal>
			{/* Sticky CTA bar — slides in after hero, hides near the final
			    CallToAction section. Dismissible. */}
			<StickyCTA />
		</>
	);
};

export default Home;
