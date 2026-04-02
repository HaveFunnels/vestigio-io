"use client";
import { createApiKey } from "@/actions/api-key";
import Card from "@/components/Common/Dashboard/Card";
import FormButton from "@/components/Common/Dashboard/FormButton";
import InputGroup from "@/components/Common/Dashboard/InputGroup";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import toast from "react-hot-toast";

export default function CreateToken() {
	const ref = useRef<HTMLFormElement>(null);
	const t = useTranslations("api_page.create_token");

	return (
		<div className='lg:w-2/6'>
			<Card>
				<div className='mb-6'>
					<h3 className='mb-2.5 font-satoshi text-custom-2xl font-bold tracking-[-.5px] text-dark dark:text-white'>
						{t("title")}
					</h3>
					<p className='text-body'>{t("description")}</p>
				</div>

				<form
					ref={ref}
					action={async (formData) => {
						try {
							await createApiKey(formData.get("token") as string);
							toast.success(t("form.success_toast_message"));
						} catch (error) {
							toast.error(t("form.error_toast_message"));
						}

						ref.current?.reset();
					}}
					className='space-y-5.5'
				>
					<InputGroup
						label={t("form.token_name.label")}
						placeholder={t("form.token_name.placeholder")}
						name='token'
						type='text'
						required
					/>

					<FormButton>{t("form.submit")}</FormButton>
				</form>
			</Card>
		</div>
	);
}
