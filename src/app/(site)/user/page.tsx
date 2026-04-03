import Breadcrumb from "@/components/Common/Dashboard/Breadcrumb";
import AccountSettings from "@/components/User/AccountSettings";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
	title: "User Dashboard",
	description: "Manage your account settings and preferences",
};

export default async function Page() {
	const t = await getTranslations("account_settings_page");

	return (
		<>
			<Breadcrumb pageTitle={t("heading")} />
			<AccountSettings />
		</>
	);
}
