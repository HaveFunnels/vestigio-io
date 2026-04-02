"use client";

import { isAuthorized } from "@/libs/isAuthorized";
import { getPricingData } from "@/pricing/pricingData";
import PurchaseEmptyState from "./PurchaseEmptyState";
import PurchaseTable from "./PurchaseTable";

type PropsType = {
	user: Awaited<ReturnType<typeof isAuthorized>>;
};

export default function PurchaseHistory({ user }: PropsType) {
	const pricingData = getPricingData();

	const purchasedPlan = pricingData.find(
		(plan) => plan.priceId === user?.priceId
	);

	if (!user) return null;

	const isSubscribed =
		user.priceId &&
		user.currentPeriodEnd &&
		new Date(user.currentPeriodEnd).getTime() + 86_400_000 > Date.now();

	const data = {
		unit_amount: purchasedPlan?.unit_amount,
		currentPeriodEnd: user?.currentPeriodEnd,
		subscriptionId: user?.subscriptionId,
		nickname: purchasedPlan?.nickname,
	};

	return isSubscribed ? <PurchaseTable data={data} /> : <PurchaseEmptyState />;
};
