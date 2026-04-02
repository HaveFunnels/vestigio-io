import { rateLimitByIp } from "@/libs/limiter";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import toast from "react-hot-toast";
import z from "zod";
import { integrations, messages } from "../../../integrations.config";
import FormButton from "../Common/Dashboard/FormButton";
import InputGroup from "../Common/Dashboard/InputGroup";
import Loader from "../Common/Loader";

const schema = z.object({
	email: z.string().email(),
});

export default function SigninWithMagicLink() {
	const [email, setEmail] = useState("");
	const [loading, setLoading] = useState(false);

	const t = useTranslations("signInPage.form");

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setEmail(e.target.value);
	};

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();

		if (!integrations.isAuthEnabled) {
			return toast.error(messages.auth);
		}

		setLoading(true);

		const result = schema.safeParse({ email });

		if (!result.success) {
			setLoading(false);
			return toast.error("Please enter a valid email address.");
		}

		try {
			// 2 requests per 20 seconds
			await rateLimitByIp(2, 20000);
		} catch (error) {
			setLoading(false);
			toast.error("Too many sign-in attempts. Please try again later.");
			return;
		}

		try {
			const callback = await signIn("email", {
				redirect: false,
				email,
				callbackUrl: "/app",
			});

			if (callback?.ok) {
				toast.success("Email sent");
				// setEmail("");
			}
		} catch (error) {
			toast.error("Something went wrong");
		} finally {
			setLoading(false);
		}
	};

	return (
		<form onSubmit={handleSubmit}>
			<div className='mb-5 space-y-4'>
				<InputGroup
					label={t("email.label")}
					placeholder={t("email.placeholder")}
					type='email'
					name='email'
					required
					height='50px'
					value={email}
					handleChange={handleChange}
				/>

				<FormButton height='50px'>
					{loading ? (
						<>
							Sending <Loader style='border-white dark:border-dark' />
						</>
					) : (
						<>{t("magicLinkSubmit")}</>
					)}
				</FormButton>
			</div>
		</form>
	);
}
