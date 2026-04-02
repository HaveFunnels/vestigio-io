"use client";
import { useState } from "react";
import InputGroup from "@/components/Common/Dashboard/InputGroup";
import FormButton from "@/components/Common/Dashboard/FormButton";
import Loader from "@/components/Common/Loader";
import toast from "react-hot-toast";
import axios from "axios";
import { useSearchParams, useRouter } from "next/navigation";
import z from "zod";

const schema = z.object({
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

const InvitedSignin = () => {
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);

	const router = useRouter();
	const searchParams = useSearchParams();
	const token = searchParams.get("token");

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setPassword(e.target.value);
	};

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();

		setLoading(true);

		const result = schema.safeParse({ password });

		if (!result.success) {
			toast.error(result.error.issues[0].message);
			setLoading(false);
			return;
		}

		try {
			const res = await axios.post(`/api/user/invite/signin`, {
				password,
				token,
			});

			if (res.status === 200) {
				toast.success("Account created successfully");
				setPassword("");
				setLoading(false);
				router.push("/auth/signin");
			}
		} catch (error: any) {
			toast.error(error.response.data);
			setPassword("");
			setLoading(false);
			router.push("/auth/signin");
		}
	};

	return (
		<div className='mx-auto w-full max-w-[400px] px-4 py-10'>
			<div className='mb-7.5 text-center'>
				<h3 className='mb-4 font-satoshi text-heading-5 font-bold text-dark dark:text-white'>
					Invited Signin
				</h3>
				<p className='text-base dark:text-gray-5'>
					Enter your password to sign in
				</p>
			</div>

			<form onSubmit={handleSubmit}>
				<div className='mb-5 space-y-4'>
					<InputGroup
						label='Password'
						placeholder='Enter your password'
						type='password'
						name='password'
						required
						height='50px'
						value={password}
						handleChange={handleChange}
					/>

					<FormButton height='50px'>
						{loading ? (
							<>
								Sign in <Loader style='border-white dark:border-dark' />
							</>
						) : (
							"Sign in"
						)}
					</FormButton>
				</div>
			</form>
		</div>
	);
};

export default InvitedSignin;
