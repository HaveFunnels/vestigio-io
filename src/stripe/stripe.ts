import Stripe from "stripe";
import { requireEnv } from "@/libs/requireEnv";

export const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
	apiVersion: "2023-10-16",
	typescript: true,
});
