import Signup from "@/components/Auth/Signup";

import { Metadata } from "next";

export const metadata: Metadata = {
	title: "Sign Up",
};

const SignupPage = () => {
	return (
		<main className='pt-[150px]'>
			<Signup />
		</main>
	);
};

export default SignupPage;
