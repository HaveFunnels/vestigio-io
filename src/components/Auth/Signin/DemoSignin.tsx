"use client";
import Loader from "@/components/Common/Loader";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";
import { integrations, messages } from "../../../../integrations.config";

const DEMO_ENABLED = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

const DemoSignin = () => {
	const router = useRouter();
	const [loading, setLoading] = useState({ admin: false, user: false });
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const t = useTranslations("signInPage.demo");

	if (!DEMO_ENABLED) return null;

	const handleLogin = (role: string) => {
		setLoading({ ...loading, [role]: true });

		if (!integrations.isAuthEnabled) {
			setLoading({ ...loading, [role]: false });
			return toast.error(messages.auth);
		}

		signIn("credentials", {
			email,
			password,
			remember: false,
			redirect: false,
		}).then((callback) => {
			if (callback?.error) {
				toast.error(callback.error);
				setLoading({ ...loading, [role]: false });
			}

			if (callback?.ok && !callback?.error) {
				toast.success("Logged in successfully");
				router.push("/user");
				setLoading({ ...loading, [role]: true });
			}
		});
	};

	return (
		<div className='mb-12.5'>
			<p className='pb-4 text-center font-satoshi text-base font-medium text-dark dark:text-white'>
				{t("description")}
			</p>

			<div className='mb-3 space-y-2'>
				<input type='email' placeholder='Demo email' value={email} onChange={(e) => setEmail(e.target.value)}
					className='w-full rounded-md border border-stroke bg-transparent px-4 py-2 text-sm text-dark outline-none dark:border-stroke-dark dark:text-white' />
				<input type='password' placeholder='Demo password' value={password} onChange={(e) => setPassword(e.target.value)}
					className='w-full rounded-md border border-stroke bg-transparent px-4 py-2 text-sm text-dark outline-none dark:border-stroke-dark dark:text-white' />
			</div>

			<div className='flex items-center justify-center gap-3 text-center'>
				<button
					className='flex w-[120px] items-center justify-center gap-2 rounded-md bg-primary px-5 py-2 text-white hover:bg-primary-dark'
					onClick={() => handleLogin("user")}
				>
					{t("user")} {loading.user && <Loader style='border-white' />}
				</button>
				<button
					onClick={() => handleLogin("admin")}
					className='flex w-[120px] items-center justify-center gap-2 rounded-md bg-dark px-5 py-2 text-white hover:bg-dark/90 dark:bg-white dark:text-dark dark:hover:bg-slate-200'
				>
					{t("admin")}{" "}
					{loading.admin && <Loader style='border-white dark:border-dark' />}
				</button>
			</div>
		</div>
	);
};

export default DemoSignin;
