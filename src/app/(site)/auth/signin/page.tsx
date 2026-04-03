import React from "react";
import Signin from "@/components/Auth/Signin";
import { Metadata } from "next";

export const metadata: Metadata = {
	title: "Sign In",
};

const SigninPage = () => {
	return (
		<main>
			<Signin />
		</main>
	);
};

export default SigninPage;
