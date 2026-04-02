import SendNotificationCard from "@/components/Admin/SendNotification/SendNotificationCard";
import Breadcrumb from "@/components/Common/Dashboard/Breadcrumb";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
	title: `Send Notification - ${process.env.SITE_NAME}`,
	description: `Send Notification Description`,
};

export default async function SendNotificationPage() {
	const t = await getTranslations("send_notification_page");

	return (
		<>
			<Breadcrumb pageTitle={t("heading")} />

			<SendNotificationCard />
		</>
	);
}
