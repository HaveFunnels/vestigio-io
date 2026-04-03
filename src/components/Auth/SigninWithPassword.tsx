"use client";
import { rateLimitByIp } from "@/libs/limiter";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";
import z from "zod";
import { integrations, messages } from "../../../integrations.config";
import FormButton from "../Common/Dashboard/FormButton";
import InputGroup from "../Common/Dashboard/InputGroup";
import Loader from "../Common/Loader";

const schema = z.object({
	email: z.string().email(),
	password: z
		.string()
		.min(8, { message: "Password must be at least 8 characters long" })
		.refine((val) => /[A-Z]/.test(val), {
			message: "Password must contain at least one uppercase letter.",
		})
		.refine((val) => /[a-z]/.test(val), {
			message: "Password must contain at least one lowercase letter.",
		})
		.refine((val) => /\d/.test(val), {
			message: "Password must contain at least one number.",
		})
		.refine((val) => /[@$!%*?&_\-#^]/.test(val), {
			message: "Password must contain at least one special character.",
		}),
});

export default function SigninWithPassword() {
	const [data, setData] = useState({
		email: "",
		password: "",
		remember: false,
	});

	const [loading, setLoading] = useState(false);

	const router = useRouter();
	const t = useTranslations("signInPage.form");

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setData({
			...data,
			[e.target.name]: e.target.value,
		});
	};

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();

		if (!integrations.isAuthEnabled) {
			return toast.error(messages.auth);
		}

		const result = schema.safeParse(data);

		if (!result.success) {
			toast.error(result.error.issues[0].message);
			return;
		}

		setLoading(true);

		try {
			// 2 requests per 20 seconds
			await rateLimitByIp(2, 20000);
		} catch (error) {
			setLoading(false);
			toast.error("Too many sign-in attempts. Please try again later.");
			return;
		}

		signIn("credentials", { ...data, redirect: false })
			.then((callback) => {
				if (callback?.error) {
					toast.error(callback.error);
				} else if (callback?.ok) {
					toast.success("Logged in successfully");
					setData({ email: "", password: "", remember: false });
					// Use window.location for a full page navigation to ensure
					// middleware runs and session cookie is sent properly
					window.location.href = "/app";
				}
			})
			.finally(() => setLoading(false));
	};

	return (
		<form className='mb-5 space-y-4' onSubmit={handleSubmit}>
			<InputGroup
				label={t("email.label")}
				placeholder={t("email.placeholder")}
				type='email'
				name='email'
				required
				height='50px'
				handleChange={handleChange}
				value={data.email}
			/>

			<InputGroup
				label={t("password.label")}
				placeholder={t("password.placeholder")}
				type='password'
				name='password'
				required
				height='50px'
				handleChange={handleChange}
				value={data.password}
			/>

			<div className='flex items-center justify-between gap-2 py-2'>
				<label
					htmlFor='remember'
					className='flex cursor-pointer select-none items-center font-satoshi text-base font-medium text-dark dark:text-white'
				>
					<input
						type='checkbox'
						name='remember'
						id='remember'
						className='peer sr-only'
						onChange={(e) =>
							setData({
								...data,
								remember: e.target.checked,
							})
						}
					/>
					<span
						className={`mr-2.5 inline-flex h-5.5 w-5.5 items-center justify-center rounded-md border border-stroke bg-white text-white text-opacity-0 peer-checked:border-primary peer-checked:bg-primary peer-checked:text-opacity-100 dark:border-stroke-dark dark:bg-white/5 ${
							data.remember ? "bg-primary" : ""
						}`}
					>
						<svg
							width='10'
							height='7'
							viewBox='0 0 10 7'
							fill='none'
							xmlns='http://www.w3.org/2000/svg'
						>
							<path
								fillRule='evenodd'
								clipRule='evenodd'
								d='M9.70692 0.292787C9.89439 0.480314 9.99971 0.734622 9.99971 0.999786C9.99971 1.26495 9.89439 1.51926 9.70692 1.70679L4.70692 6.70679C4.51939 6.89426 4.26508 6.99957 3.99992 6.99957C3.73475 6.99957 3.48045 6.89426 3.29292 6.70679L0.292919 3.70679C0.110761 3.51818 0.00996641 3.26558 0.0122448 3.00339C0.0145233 2.74119 0.119692 2.49038 0.3051 2.30497C0.490508 2.11956 0.741321 2.01439 1.00352 2.01211C1.26571 2.00983 1.51832 2.11063 1.70692 2.29279L3.99992 4.58579L8.29292 0.292787C8.48045 0.105316 8.73475 0 8.99992 0C9.26508 0 9.51939 0.105316 9.70692 0.292787Z'
								fill='currentColor'
							/>
						</svg>
					</span>
					{t("rememberMe")}
				</label>

				<Link
					href='/auth/forgot-password'
					className='select-none font-satoshi text-base font-medium text-dark duration-300 hover:text-primary dark:text-white dark:hover:text-primary'
				>
					{t("forgotPassword")}
				</Link>
			</div>

			<FormButton height='50px'>
				{t("passwordSubmit")}{" "}
				{loading && <Loader style='dark:border-primary border-white' />}
			</FormButton>
		</form>
	);
}
