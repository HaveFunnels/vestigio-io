"use client";

import { SUPPORTED_LANGUAGES } from "@/i18n/supported-locales";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Dropdown, DropdownContent, DropdownTrigger } from "../dropdown";
import { getSelectedLangCode, switchLanguage } from "./action";
import { ChevronUpIcon } from "./icons";

export function LanguageSwitcher() {
	const [isOpen, setIsOpen] = useState(false);
	const router = useRouter();

	const [selectedLangCode, setSelectedLangCode] = useState("en");

	const selectedLanguage = SUPPORTED_LANGUAGES.find(
		(lang) => lang.code === selectedLangCode
	);

	const language = {
		name: selectedLanguage?.name || "English",
		code: selectedLanguage?.code || selectedLangCode,
	};

	function onSelect(code: string) {
		setIsOpen(false);
		setSelectedLangCode(code);
		switchLanguage(code);
		router.refresh();
	}

	useEffect(() => {
		getSelectedLangCode().then((code) => {
			const isValidCode = SUPPORTED_LANGUAGES.some(
				(lang) => lang.code === code
			);

			if (code && isValidCode) {
				setSelectedLangCode(code);
			}
		});
	}, []);

	return (
		<Dropdown isOpen={isOpen} setIsOpen={setIsOpen}>
			<DropdownTrigger className='group flex items-center py-[5px] pl-3 pr-2.5 text-black dark:text-white'>
				<Image
					src={`/images/flags/${language.code}.svg`}
					width={18}
					height={18}
					alt={language.name}
					className='mr-[7px] size-4.5 rounded-full object-cover max-sm:hidden'
				/>

				<span className='min-[200px]:hidden'>{language.code}</span>

				<span className='max-[200px]:hidden'>{language.name}</span>

				<ChevronUpIcon className='ml-1 shrink-0 rotate-180 transition-transform group-data-[state=open]:rotate-0' />
			</DropdownTrigger>

			<DropdownContent
				sideOffset={4}
				className='w-full max-w-[163px]'
				align='end'
			>
				<ul className=' space-y-1 rounded-xl border border-stroke bg-white p-2 shadow-gray-3 dark:border-stroke-dark dark:bg-gray-dark'>
					{SUPPORTED_LANGUAGES.map((lang) => (
						<li
							key={lang.code}
							className={`rounded-[7px] hover:bg-gray-2 dark:text-dark-4 dark:hover:bg-white/10 ${lang.code === language.code ? "bg-gray-2 text-black dark:bg-white/10 dark:text-white" : ""}`}
						>
							<button
								className='flex w-full items-center gap-[9px] px-3.5 py-[7px]'
								onClick={() => onSelect(lang.code)}
							>
								<Image
									src={`/images/flags/${lang.code}.svg`}
									width={18}
									height={18}
									alt={lang.name}
									className='mr-[7px] size-4.5 rounded-full object-cover'
								/>

								<span>{lang.name}</span>
							</button>
						</li>
					))}
				</ul>
			</DropdownContent>
		</Dropdown>
	);
}
