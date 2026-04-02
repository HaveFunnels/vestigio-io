"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import FormButton from "@/components/Common/Dashboard/FormButton";
import InputGroup from "@/components/Common/Dashboard/InputGroup";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import axios from "axios";
import { integrations, messages } from "../../../../integrations.config";
import z from "zod";

const schema = z
	.object({
		newPassword: z
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

		ReNewPassword: z
			.string()
			.min(8, {
				message: "Password must be at least 8 characters long",
			})
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
	})
	.refine((data) => data.newPassword === data.ReNewPassword, {
		message: "Passwords do not match.",
		path: ["ReNewPassword"], // Set the path to show the error under ReNewPassword
	});
export default function ResetPassword({ token }: { token: string }) {
	const [data, setData] = useState({
		newPassword: "",
		ReNewPassword: "",
	});

	const [user, setUser] = useState({
		email: "",
	});

	const router = useRouter();

	useEffect(() => {
		const verifyToken = async () => {
			try {
				const res = await axios.post(`/api/forgot-password/verify-token`, {
					token,
				});

				if (res.status === 200) {
					setUser({
						email: res.data.email,
					});
				}
			} catch (error: any) {
				toast.error(error.response.data);
				router.push("/auth/forgot-password");
			}
		};

		if (integrations.isAuthEnabled) {
			verifyToken();
		}

		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [token]);

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

		try {
			const res = await axios.post(`/api/forgot-password/update`, {
				email: user?.email,
				password: data.newPassword,
				token,
			});

			if (res.status === 200) {
				toast.success(res.data);
				setData({ newPassword: "", ReNewPassword: "" });
				router.push("/auth/signin");
			}
		} catch (error: any) {
			toast.error(error.response.data);
		}
	};

	return (
		<>
			<div className='mx-auto w-full max-w-[400px] pb-20 pt-40'>
				<div className='mb-7.5 text-center'>
					<h3 className='mb-4 font-satoshi text-heading-5 font-bold text-dark dark:text-white'>
						Create New Password
					</h3>
					<p className='text-base dark:text-gray-5'>
						Create new password to save your account
					</p>
				</div>

				<form onSubmit={handleSubmit}>
					<div className='mb-5 space-y-4.5'>
						<InputGroup
							label='New password'
							placeholder='Password'
							type='password'
							name='newPassword'
							height='50px'
							handleChange={handleChange}
							value={data.newPassword}
						/>
						<InputGroup
							label='Re-type new password'
							placeholder='Password'
							type='password'
							name='ReNewPassword'
							height='50px'
							handleChange={handleChange}
							value={data.ReNewPassword}
						/>

						<FormButton height='50px'>Create Password</FormButton>
					</div>

					<p className='text-center font-satoshi text-base font-medium text-dark dark:text-white'>
						Already have an account?{" "}
						<Link
							href='/auth/signin'
							className='ml-1 inline-block text-primary'
						>
							Sign In →
						</Link>
					</p>
				</form>
			</div>
		</>
	);
}
