import UsersListContainer from "@/components/Admin/Users";
import Breadcrumb from "@/components/Common/Dashboard/Breadcrumb";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
	title: `Users - ${process.env.SITE_NAME}`,
	description: "Users Description",
};

export default async function UsersPage(props: {
	searchParams: Promise<{ filter: string; search: string }>;
}) {
	const searchParams = await props.searchParams;
	const { filter, search } = searchParams;
	const validFilter =
		filter === "USER" || filter === "ADMIN" ? filter : undefined;

	const t = await getTranslations("manage_users_page");

	return (
		<>
			<Breadcrumb pageTitle={t("heading")} />

			<UsersListContainer filter={validFilter} search={search} />
		</>
	);
}
