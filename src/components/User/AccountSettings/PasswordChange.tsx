"use client";
import Card from "@/components/Common/Dashboard/Card";
import FormButton from "@/components/Common/Dashboard/FormButton";
import InputGroup from "@/components/Common/Dashboard/InputGroup";
import Loader from "@/components/Common/Loader";
import axios from "axios";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import toast from "react-hot-toast";

export default function PasswordChange() {
	const [data, setData] = useState({
		currentPassword: "",
		newPassword: "",
		reTypeNewPassword: "",
	});
	const [loading, setLoading] = useState(false);
	const { currentPassword, newPassword } = data;

	const t = useTranslations("account_settings_page.change_password");

	const { data: session } = useSession();

	const handleChange = (e: any) => {
		setData({
			...data,
			[e.target.name]: e.target.value,
		});
	};

	const handleSubmit = async (e: any) => {
		e.preventDefault();

		setLoading(true);

		if (!session?.user) {
			toast.error("Please login first!");
			return;
		}

		try {
			await axios.post("/api/user/change-password", {
				password: newPassword,
				currentPassword: currentPassword,
			});

			toast.success("Password changed successfully");
			setData({
				currentPassword: "",
				newPassword: "",
				reTypeNewPassword: "",
			});
			setLoading(false);
		} catch (error: any) {
			setLoading(false);
			toast.error(error?.response?.data);
		}
	};

	return (
		<div className='w-full max-w-[525px]'>
			<Card>
				<h3 className='mb-9 font-satoshi text-custom-2xl font-bold tracking-[-.5px] text-dark dark:text-white'>
					{t("title")}
				</h3>

				<form onSubmit={handleSubmit} className='space-y-5.5'>
					<InputGroup
						name='currentPassword'
						label={t("form.current_password.label")}
						placeholder={t("form.current_password.placeholder")}
						type='password'
						value={data.currentPassword}
						handleChange={handleChange}
						required={true}
					/>

					<InputGroup
						name='newPassword'
						label={t("form.new_password.label")}
						placeholder={t("form.new_password.placeholder")}
						type='password'
						value={data.newPassword}
						handleChange={handleChange}
						required={true}
					/>

					<InputGroup
						name='reTypeNewPassword'
						label={t("form.confirm_password.label")}
						placeholder={t("form.confirm_password.placeholder")}
						type='password'
						value={data.reTypeNewPassword}
						handleChange={handleChange}
						required={true}
					/>

					<FormButton>
						{loading ? (
							<>
								{t("form.submit:loading")} <Loader style='border-white' />
							</>
						) : (
							t("form.submit")
						)}
					</FormButton>
				</form>
			</Card>
		</div>
	);
}
