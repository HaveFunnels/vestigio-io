import FormButton from "@/components/Common/Dashboard/FormButton";
import InputGroup from "@/components/Common/Dashboard/InputGroup";
import { rateLimitByIp } from "@/libs/limiter";
import axios, { AxiosError } from "axios";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import toast from "react-hot-toast";
import z from "zod";
import { integrations, messages } from "../../../integrations.config";
import Loader from "../Common/Loader";

const schema = z.object({
	name: z
		.string()
		.min(3, { message: "Name must be at least 3 characters long" }),
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
		.refine((val) => /[@$!%*?&]/.test(val), {
			message: "Password must contain at least one special character.",
		}),
});

const SignupWithPassword = () => {
	const [data, setData] = useState({
		name: "",
		email: "",
		password: "",
	});

	const [loading, setLoading] = useState(false);
	const { name, email, password } = data;

	const router = useRouter();
	const t = useTranslations("signUpPage.form");

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

		try {
			await axios.post("/api/user/register", {
				name,
				email,
				password,
			});

			setData({
				name: "",
				email: "",
				password: "",
			});

			const res = await signIn("credentials", {
				...data,
				redirect: false,
			});

			if (res?.error) {
				toast.error(res.error);
				setLoading(false);
			} else if (res?.ok) {
				toast.success("User registration successful.");
				window.location.href = "/app";
			}
		} catch (error) {
			if (error instanceof AxiosError) {
				toast.error(error.response?.data.message);
			}
		} finally {
			setLoading(false);
		}
	};

	return (
		<form onSubmit={handleSubmit}>
			<div className='mb-5 space-y-4'>
				<InputGroup
					label={t("name.label")}
					placeholder={t("name.placeholder")}
					maxlength='10'
					type='text'
					name='name'
					required
					height='50px'
					handleChange={handleChange}
					value={name}
				/>

				<InputGroup
					label={t("email.label")}
					placeholder={t("email.placeholder")}
					type='email'
					name='email'
					required
					height='50px'
					handleChange={handleChange}
					value={email}
				/>

				<InputGroup
					label={t("password.label")}
					placeholder={t("password.placeholder")}
					type='password'
					name='password'
					required
					height='50px'
					handleChange={handleChange}
					value={password}
				/>

				<FormButton height='50px'>
					{t("submit")}{" "}
					{loading && <Loader style='border-white dark:border-dark' />}
				</FormButton>
			</div>
		</form>
	);
};

export default SignupWithPassword;
