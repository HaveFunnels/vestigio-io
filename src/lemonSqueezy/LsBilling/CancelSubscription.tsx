"use client";
import { getPricingData } from "@/pricing/pricingData";
import axios from "axios";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { integrations, messages } from "../../../integrations.config";

const CancelSubscription = () => {
	const { data: session, update } = useSession();
	const pricingData = getPricingData();

	if (!session) return <p>loading...</p>;
	if (!session?.user?.priceId) return <></>;

	const { user } = session;
	const currentPlan = pricingData.find((p) => p.priceId === user.priceId);

	const handleCancel = async () => {
		if (!integrations?.isPaymentsEnabled) {
			toast.error(messages?.payment);
			return;
		}

		try {
			await axios.post("/api/lemon-squeezy/cancel-subscription", {
				subscriptionId: user.subscriptionId,
			});

			update({
				...session,
				user: {
					...session?.user,
					priceId: null,
					subscriptionId: null,
					currentPeriodEnd: null,
					customerId: null,
				},
			});
			toast.success("Subscription canceled successfully");
		} catch (error: any) {
			// console.log(error.response.data.error);
			toast.error(error.response.data.error);
		}
	};

	return (
		<div className='mt-7 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-8 dark:bg-gray-dark'>
			<div className='flex gap-5'>
				<p>
					Current Plan:
					<span className='px-2 font-bold'>{currentPlan?.nickname}</span>
				</p>
				<p>
					Next Billing Date:
					<span className='px-2 font-bold'>
						{new Date(user.currentPeriodEnd!).toLocaleDateString()}
					</span>
				</p>
			</div>
			<button
				onClick={handleCancel}
				className='rounded-full border border-[#FDD8D8] bg-[#FEF3F3] px-4 py-2 text-red hover:bg-[#FEEBEB]'
			>
				Cancel Subscription
			</button>
		</div>
	);
};

export default CancelSubscription;
