"use client";

import type { User } from "@prisma/client";
import { useTranslations } from "next-intl";
import UserAction from "./UserAction";

export default function UserListTable({ users }: { users: User[] }) {
	const t = useTranslations("manage_users_page.table_header");

	return (
		<>
			<div className='max-w-full overflow-x-auto rounded-10 bg-white shadow-1 dark:bg-gray-dark'>
				<table className='w-full'>
					<thead>
						<tr className='border-b border-stroke dark:border-stroke-dark'>
							<th className='min-w-[200px] px-4 py-5 text-left font-satoshi text-base font-medium tracking-[-.2px] text-body dark:text-gray-5 sm:pl-7.5'>
								{t("name")}
							</th>
							<th className='px-4 py-5 text-left font-satoshi text-base font-medium tracking-[-.2px] text-body dark:text-gray-5'>
								{t("email")}
							</th>
							<th className='px-4 py-5 text-left font-satoshi text-base font-medium tracking-[-.2px] text-body dark:text-gray-5'>
								{t("role")}
							</th>
							<th className='truncate px-4 py-5 text-left font-satoshi text-base font-medium tracking-[-.2px] text-body dark:text-gray-5'>
								{t("registered_on")}
							</th>
							<th className='min-w-[300px] px-4 py-5 text-right font-satoshi text-base font-medium tracking-[-.2px] text-body dark:text-gray-5 sm:pr-7.5'>
								{t("action")}
							</th>
						</tr>
					</thead>

					<tbody>
						{users?.map((user) => (
							<tr
								key={user?.id}
								className='border-b border-stroke last-of-type:border-b-0 dark:border-stroke-dark'
							>
								<td className='p-4 text-left text-base tracking-[-.16px] text-body dark:text-gray-5 sm:pl-7.5'>
									{user?.name}
								</td>

								<td className='p-4 text-left text-base tracking-[-.16px] text-body dark:text-gray-5'>
									{user?.email}
								</td>
								<td className='p-4 text-left text-base capitalize tracking-[-.16px] text-body dark:text-gray-5'>
									{user?.role?.toLowerCase()}
								</td>
								<td className='p-4 text-left text-base tracking-[-.16px] text-body dark:text-gray-5'>
									{user?.createdAt?.toLocaleDateString()}
								</td>
								<td className='p-4 text-right text-base tracking-[-.16px] text-body dark:text-gray-5 sm:pr-7.5'>
									<UserAction user={user} />
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</>
	);
}
