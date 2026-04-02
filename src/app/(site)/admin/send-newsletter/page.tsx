import SendNewsletterCard from "@/components/Admin/SendNewsletter/SendNewsletterCard";
import Breadcrumb from "@/components/Common/Dashboard/Breadcrumb";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
	title: `Send Newsletter - ${process.env.SITE_NAME}`,
	description: "Send Newsletter Description",
};

export default async function SendNewsletterPage() {
	const t = await getTranslations("send_newsletter_page");

	return (
		<>
			<Breadcrumb pageTitle={t("heading")} />

			<SendNewsletterCard />
		</>
	);
}
