import { useTranslations } from "next-intl";

export function getPricingData() {
	const t = useTranslations("homepage.pricing_section");
	const pricingPlans = t.raw("plans");

	return [
		{
			priceId: "price_1ObHbkLtGdPVhGLem0CLA5iT",
			// priceId: "pri_01hzmcag0dnd53x9kn78bs5vz0",
			// priceId: "375601",
			unit_amount: 99 * 100,
			nickname: pricingPlans[0].name,
			description: pricingPlans[0].description,
			subtitle: pricingPlans[0].for,
			includes: pricingPlans[0].included.items,
			icon: `/images/pricing/pricing-icon-01.svg`,
		},
		{
			priceId: "price_1ObHcJLtGdPVhGLeBp9hB4nv",
			// priceId: "pri_01hzmkbh0ya1zaw2g8cyr3r90f",
			// priceId: "376599",
			unit_amount: 199 * 100,
			nickname: pricingPlans[1].name,
			description: pricingPlans[1].description,
			subtitle: pricingPlans[1].for,
			includes: pricingPlans[1].included.items,
			icon: `/images/pricing/pricing-icon-02.svg`,
			icon2: `/images/pricing/pricing-icon-02-2.svg`,
			active: true,
		},
		{
			priceId: "price_1ObHcXLtGdPVhGLejTMpdiT8",
			// priceId: "pri_01hzmkcdbb3kdvvqjgt259nds1",
			// priceId: "376601",
			unit_amount: 399 * 100,
			nickname: pricingPlans[2].name,
			description: pricingPlans[2].description,
			subtitle: pricingPlans[2].for,
			includes: pricingPlans[2].included.items,
			icon: `/images/pricing/pricing-icon-03.svg`,
		},
	];
}
