import React from "react";
import Billing from "@/components/User/Billing";
import Breadcrumb from "@/components/Common/Dashboard/Breadcrumb";
import { Metadata } from "next";

export const metadata: Metadata = {
	title: "Billing",
	description: "Manage your billing and subscription",
};

const BillingPage = () => {
	return (
		<>
			<Breadcrumb pageTitle='Billing' />
			<Billing />
		</>
	);
};

export default BillingPage;
