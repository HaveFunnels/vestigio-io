import Breadcrumb from "@/components/Common/Dashboard/Breadcrumb";
import PurchaseHistory from "@/components/User/PurchaseHistory";

import { isAuthorized } from "@/libs/isAuthorized";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
	title: "Invoice",
	description: "View your purchase history and invoices",
};

const InvoicePage = async () => {
	const user = await isAuthorized();
	const t = await getTranslations("common");

	return (
		<>
			<Breadcrumb pageTitle={t('invoice')} />
			{user && <PurchaseHistory user={user} />}
		</>
	);
};

export default InvoicePage;
