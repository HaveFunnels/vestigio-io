import Hero from "./Hero";
import SolutionLayers from "./SolutionLayers";
import Features from "./Features";
import FeaturesWithImage from "./FeaturesWithImage";
import Counter from "./Counter";
import CallToAction from "./CallToAction";
import Testimonials from "./Testimonials";
import Pricing from "./Pricing";
import FAQ from "./FAQ";

const Home = () => {
	return (
		<>
			<Hero />
			<SolutionLayers />
			<Features />
			<FeaturesWithImage />
			<Counter />
			<Testimonials />
			<Pricing />
			<FAQ />
			<CallToAction />
		</>
	);
};

export default Home;
