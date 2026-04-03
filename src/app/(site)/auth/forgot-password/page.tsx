import React from "react";
import ForgotPassword from "@/components/Auth/ForgotPassword";
import { Metadata } from "next";

export const metadata: Metadata = {
	title: "Forgot Password",
};

const ForgotPasswordPage = () => {
	return (
		<main className='pt-[150px]'>
			<ForgotPassword />
		</main>
	);
};

export default ForgotPasswordPage;
