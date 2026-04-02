import Breadcrumb from "@/components/Common/Dashboard/Breadcrumb";
import PurchaseHistory from "@/components/User/PurchaseHistory";

import { isAuthorized } from "@/libs/isAuthorized";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
	title: `Invoice - ${process.env.SITE_NAME}`,
	description: `This is Invoice page for ${process.env.SITE_NAME}`,
	// other discriptions
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
