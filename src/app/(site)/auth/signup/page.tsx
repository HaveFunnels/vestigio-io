import Signup from "@/components/Auth/Signup";

import { Metadata } from "next";

export const metadata: Metadata = {
	title: "Sign Up",
};

const SignupPage = () => {
	return (
		<main>
			<Signup />
		</main>
	);
};

export default SignupPage;
