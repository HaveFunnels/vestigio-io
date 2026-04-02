import AiIntegration from "@/components/Admin/AiIntegration";
import Breadcrumb from "@/components/Common/Dashboard/Breadcrumb";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
	title: `AI Integration - ${process.env.SITE_NAME}`,
	description: `AI Integration Description`,
};

export default async function AiIntegrationPage() {
	const key = process.env.OPENAI_API_KEY as string;
	const t = await getTranslations("ai_integration_page");

	return (
		<>
			<Breadcrumb pageTitle={t("heading")} />

			<AiIntegration APIKey={key} />
		</>
	);
}
