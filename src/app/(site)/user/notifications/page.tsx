import Breadcrumb from "@/components/Common/Dashboard/Breadcrumb";
import React from "react";
import { Metadata } from "next";
import Notification from "@/components/Common/Notification";

export const metadata: Metadata = {
	title: "Notifications",
	description: "View your notifications",
};

const NotificationPage = () => {
	const data = [1, 2, 3, 4, 5, 6, 7];

	return (
		<div className='md:px-20'>
			<Breadcrumb pageTitle='Notifications' />
			{data?.map((data) => <Notification key={data} />)}
		</div>
	);
};

export default NotificationPage;
