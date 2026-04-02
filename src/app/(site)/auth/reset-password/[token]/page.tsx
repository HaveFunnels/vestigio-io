import React from "react";
import ResetPassword from "@/components/Auth/ResetPassword";
import { Metadata } from "next";

export const metadata: Metadata = {
	title: `Reset Password - ${process.env.SITE_NAME}`,
	description: `This is Reset Password page for ${process.env.SITE_NAME}`,
};

const ResetPasswordPage = async (props: { params: Promise<{ token: string }> }) => {
    const params = await props.params;
    if (!params.token) {
		return <div>Invalid token</div>;
	}

    const token = params.token;

    return (
		<main>
			<ResetPassword token={token} />
		</main>
	);
};

export default ResetPasswordPage;
