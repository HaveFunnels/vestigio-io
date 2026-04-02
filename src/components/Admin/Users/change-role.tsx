"use client";

import {
	Dropdown,
	DropdownContent,
	DropdownTrigger,
} from "@/components/dropdown";
import { cn } from "@/libs/utils";
import { useState } from "react";

type PropsType = {
	onChange: (role: string) => void;
	roles: string[];
	currentRole: string;
};

export function ChangeRole({ currentRole, roles, onChange }: PropsType) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Dropdown isOpen={isOpen} setIsOpen={setIsOpen}>
			<DropdownTrigger className='group flex items-center gap-1.5 rounded-lg bg-dark py-2 pl-4 pr-3 font-satoshi font-medium capitalize text-white'>
				{currentRole.toLowerCase()}

				<ChevronDownIcon className='transition-transform group-data-[state=open]:rotate-180' />
			</DropdownTrigger>

			<DropdownContent
				align='end'
				className='min-w-[10.44rem] rounded-lg border border-stroke bg-white px-2.5 py-3.5 font-satoshi font-medium text-body shadow-gray-3 dark:border-stroke-dark dark:bg-gray-dark'
			>
				<ul className='space-y-1'>
					{roles.map((role) => (
						<li key={role}>
							<button
								onClick={() => {
									onChange(role);
									setIsOpen(false);
								}}
								className={cn(
									"block w-full rounded-[7px] px-3.5 py-[7px] text-left capitalize hover:bg-gray-2 dark:text-dark-4 dark:hover:bg-white/10",
									role === currentRole &&
										"bg-gray-2 text-dark dark:bg-white/10 dark:text-white"
								)}
							>
								{role.toLowerCase()}
							</button>
						</li>
					))}
				</ul>
			</DropdownContent>
		</Dropdown>
	);
}

function ChevronDownIcon(props: React.SVGProps<SVGSVGElement>) {
	return (
		<svg width='20' height='20' viewBox='0 0 16 16' fill='none' {...props}>
			<path
				fillRule='evenodd'
				clipRule='evenodd'
				d='M2.95339 5.67461C3.1331 5.46495 3.44875 5.44067 3.65841 5.62038L7.99968 9.34147L12.341 5.62038C12.5506 5.44067 12.8663 5.46495 13.046 5.67461C13.2257 5.88428 13.2014 6.19993 12.9917 6.37964L8.32508 10.3796C8.13783 10.5401 7.86153 10.5401 7.67429 10.3796L3.00762 6.37964C2.79796 6.19993 2.77368 5.88428 2.95339 5.67461Z'
				fill='white'
			/>
		</svg>
	);
}
