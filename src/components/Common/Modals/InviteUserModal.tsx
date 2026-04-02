import axios from "axios";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import FormButton from "../Dashboard/FormButton";
import InputGroup from "../Dashboard/InputGroup";
import InputSelect from "../InputSelect";
import Loader from "../Loader";
import ModalCloseButton from "./ModalCloseButton";

type PropsType = {
	isOpen: boolean;
	setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function InviteUserModal({ isOpen, setIsOpen }: PropsType) {
	const t = useTranslations("manage_users_page.top_bar.add_new_user");

	const [data, setData] = useState({
		email: "",
		role: "",
	});

	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e: any) => {
		e.preventDefault();
		setLoading(true);

		if (!data.email || !data.role) {
			setLoading(false);
			return toast.error(t("form.missing_field_error"));
		}

		try {
			const invite = await axios.post("/api/user/invite/send", data);
			toast.success(invite.data);
			setLoading(false);
		} catch (error: any) {
			toast.error(error?.response.data);
			setLoading(false);
		}

		setIsOpen(false);
	};

	// ===== click outside of dropdown =====
	const divRef = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		if (typeof window !== "undefined") {
			const handleClickOutside = (event: MouseEvent) => {
				if (divRef.current && !divRef.current.contains(event.target as Node)) {
					setIsOpen(false);
				}
			};

			document.addEventListener("mousedown", handleClickOutside);
			return () => {
				document.removeEventListener("mousedown", handleClickOutside);
			};
		}
	});

	if (!isOpen) return null;

	return (
		<div className='py-7.6 fixed left-0 top-0 z-99999 flex h-screen w-full items-center justify-center bg-black/90 px-4 dark:bg-dark/70 sm:px-8'>
			<div
				ref={divRef}
				className='shadow-7 relative h-auto max-h-[calc(100vh-60px)] w-full max-w-[600px] scale-100 transform overflow-y-auto rounded-[25px] bg-white transition-all dark:bg-black'
			>
				<ModalCloseButton closeModal={setIsOpen} />

				<div className='flex flex-wrap gap-5.5 border-b border-stroke p-4 dark:border-stroke-dark sm:p-7.5 xl:p-10'>
					<h3 className='mb-1.5 font-satoshi text-custom-2xl font-bold tracking-[-.5px] text-dark dark:text-white'>
						{t("title")}
					</h3>

					<form className='w-full space-y-4' onSubmit={handleSubmit}>
						<InputGroup
							label={t("form.email.label")}
							placeholder={t("form.email.placeholder")}
							type='email'
							name='email'
							value={data.email}
							required={true}
							handleChange={(e: any) =>
								setData({ ...data, email: e.target.value })
							}
						/>

						<InputSelect
							name='role'
							label={t("form.role.label")}
							options={[
								{
									label: "User",
									value: "USER",
								},
								{
									label: "Admin",
									value: "ADMIN",
								},
							]}
							placeholder={t("form.role.placeholder")}
							value={data.role}
							required={true}
							onChange={(e: any) => setData({ ...data, role: e.target.value })}
						/>

						<FormButton>
							{t("form.submit")}

							{loading && <Loader style='border-white dark:border-white' />}
						</FormButton>
					</form>
				</div>
			</div>
		</div>
	);
}
