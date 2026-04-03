"use client";

import { useEffect, useState, FormEvent } from "react";
import { useSession } from "next-auth/react";
import Breadcrumb from "@/components/Common/Dashboard/Breadcrumb";
import Link from "next/link";

// ── Types ──

interface Ticket {
	id: string;
	name: string;
	email: string;
	subject: string;
	message: string;
	status: "open" | "in_progress" | "resolved" | "closed";
	priority: string;
	category: string;
	replyCount: number;
	createdAt: string;
	updatedAt: string;
}

// ── Helpers ──

const statusConfig: Record<
	string,
	{ label: string; bg: string; text: string }
> = {
	open: { label: "Open", bg: "bg-blue-500/10", text: "text-blue-400" },
	in_progress: {
		label: "In Progress",
		bg: "bg-amber-500/10",
		text: "text-amber-400",
	},
	resolved: {
		label: "Resolved",
		bg: "bg-emerald-500/10",
		text: "text-emerald-400",
	},
	closed: { label: "Closed", bg: "bg-zinc-500/10", text: "text-zinc-400" },
};

const categoryLabels: Record<string, string> = {
	general: "General",
	bug: "Bug Report",
	feature: "Feature Request",
	billing: "Billing",
	security: "Security",
};

function formatDate(iso: string) {
	return new Date(iso).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

// ── Component ──

export default function UserSupportPage() {
	const { data: session } = useSession();

	// Ticket list state
	const [tickets, setTickets] = useState<Ticket[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [fetchError, setFetchError] = useState("");

	// Expand state
	const [expandedId, setExpandedId] = useState<string | null>(null);

	// New ticket form state
	const [showForm, setShowForm] = useState(false);
	const [formSubject, setFormSubject] = useState("");
	const [formCategory, setFormCategory] = useState("general");
	const [formMessage, setFormMessage] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState("");
	const [submitSuccess, setSubmitSuccess] = useState(false);

	// ── Fetch tickets ──

	const fetchTickets = async () => {
		setLoading(true);
		setFetchError("");
		try {
			const res = await fetch("/api/support-tickets");
			if (!res.ok) throw new Error("Failed to load tickets");
			const data = await res.json();
			setTickets(data.tickets || []);
			setTotal(data.total || 0);
		} catch (err: any) {
			setFetchError(err.message || "Failed to load tickets");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchTickets();
	}, []);

	// ── Submit new ticket ──

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setSubmitError("");
		setSubmitSuccess(false);
		setSubmitting(true);

		try {
			const res = await fetch("/api/support-tickets", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: session?.user?.name || "User",
					email: session?.user?.email || "",
					subject: formSubject,
					message: formMessage,
					category: formCategory,
				}),
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.message || "Failed to create ticket");
			}

			setSubmitSuccess(true);
			setFormSubject("");
			setFormCategory("general");
			setFormMessage("");

			// Refresh list after a short delay
			setTimeout(() => {
				setSubmitSuccess(false);
				setShowForm(false);
				fetchTickets();
			}, 1500);
		} catch (err: any) {
			setSubmitError(err.message || "Failed to create ticket");
		} finally {
			setSubmitting(false);
		}
	};

	// ── Render ──

	return (
		<>
			<Breadcrumb pageTitle='Support Tickets' />

			<div className='mx-auto max-w-[900px]'>
				{/* Header row */}
				<div className='mb-6 flex items-center justify-between'>
					<p className='text-sm text-gray-400'>
						{total} ticket{total !== 1 ? "s" : ""}
					</p>
					<button
						onClick={() => {
							setShowForm(!showForm);
							setSubmitSuccess(false);
							setSubmitError("");
						}}
						className='rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90'
					>
						{showForm ? "Cancel" : "New Ticket"}
					</button>
				</div>

				{/* Inline new-ticket form */}
				{showForm && (
					<div className='mb-6 rounded-[1rem] border border-white/[0.06] bg-white/[0.03] p-6'>
						<h3 className='mb-4 text-base font-semibold text-white'>
							Create a New Ticket
						</h3>

						{submitSuccess ? (
							<div className='rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300'>
								Ticket created successfully!
							</div>
						) : (
							<form onSubmit={handleSubmit} className='space-y-4'>
								{submitError && (
									<div className='rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300'>
										{submitError}
									</div>
								)}

								{/* Name + Email (auto-filled, read-only) */}
								<div className='grid gap-4 sm:grid-cols-2'>
									<div>
										<label className='mb-1.5 block text-sm font-medium text-gray-300'>
											Name
										</label>
										<input
											type='text'
											readOnly
											value={session?.user?.name || ""}
											className='w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm text-white/60 outline-none'
										/>
									</div>
									<div>
										<label className='mb-1.5 block text-sm font-medium text-gray-300'>
											Email
										</label>
										<input
											type='email'
											readOnly
											value={session?.user?.email || ""}
											className='w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm text-white/60 outline-none'
										/>
									</div>
								</div>

								{/* Subject */}
								<div>
									<label
										htmlFor='ticketSubject'
										className='mb-1.5 block text-sm font-medium text-gray-300'
									>
										Subject
									</label>
									<input
										type='text'
										id='ticketSubject'
										required
										placeholder='Briefly describe your issue'
										value={formSubject}
										onChange={(e) => setFormSubject(e.target.value)}
										className='w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm text-white outline-none placeholder:text-gray-600 focus:border-emerald-500/30 focus:ring-1 focus:ring-emerald-500/20'
									/>
								</div>

								{/* Category */}
								<div>
									<label
										htmlFor='ticketCategory'
										className='mb-1.5 block text-sm font-medium text-gray-300'
									>
										Category
									</label>
									<select
										id='ticketCategory'
										value={formCategory}
										onChange={(e) => setFormCategory(e.target.value)}
										className='w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm text-white outline-none focus:border-emerald-500/30 focus:ring-1 focus:ring-emerald-500/20'
									>
										<option value='general' className='bg-[#090911]'>
											General
										</option>
										<option value='bug' className='bg-[#090911]'>
											Bug Report
										</option>
										<option value='feature' className='bg-[#090911]'>
											Feature Request
										</option>
										<option value='billing' className='bg-[#090911]'>
											Billing
										</option>
										<option value='security' className='bg-[#090911]'>
											Security
										</option>
									</select>
								</div>

								{/* Message */}
								<div>
									<label
										htmlFor='ticketMessage'
										className='mb-1.5 block text-sm font-medium text-gray-300'
									>
										Message
									</label>
									<textarea
										id='ticketMessage'
										rows={5}
										required
										placeholder='Describe your issue in detail...'
										value={formMessage}
										onChange={(e) => setFormMessage(e.target.value)}
										className='w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm text-white outline-none placeholder:text-gray-600 focus:border-emerald-500/30 focus:ring-1 focus:ring-emerald-500/20'
									/>
								</div>

								<button
									type='submit'
									disabled={submitting}
									className='rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50'
								>
									{submitting ? "Submitting..." : "Submit Ticket"}
								</button>
							</form>
						)}
					</div>
				)}

				{/* Loading state */}
				{loading && (
					<div className='py-20 text-center text-sm text-gray-400'>
						Loading tickets...
					</div>
				)}

				{/* Error state */}
				{fetchError && !loading && (
					<div className='rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300'>
						{fetchError}
					</div>
				)}

				{/* Empty state */}
				{!loading && !fetchError && tickets.length === 0 && (
					<div className='rounded-[1rem] border border-white/[0.06] bg-white/[0.03] px-6 py-16 text-center'>
						<svg
							className='mx-auto mb-4 h-12 w-12 text-gray-600'
							fill='none'
							viewBox='0 0 24 24'
							strokeWidth={1}
							stroke='currentColor'
						>
							<path
								strokeLinecap='round'
								strokeLinejoin='round'
								d='M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155'
							/>
						</svg>
						<p className='mb-2 text-base font-medium text-white'>
							No support tickets yet
						</p>
						<p className='mb-6 text-sm text-gray-400'>
							Need help? Submit your first ticket from our support page.
						</p>
						<Link
							href='/support'
							className='inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90'
						>
							Go to Support Page
						</Link>
					</div>
				)}

				{/* Ticket list */}
				{!loading && tickets.length > 0 && (
					<div className='space-y-3'>
						{tickets.map((ticket) => {
							const status =
								statusConfig[ticket.status] || statusConfig.open;
							const isExpanded = expandedId === ticket.id;

							return (
								<div
									key={ticket.id}
									className='rounded-[1rem] border border-white/[0.06] bg-white/[0.03] transition-colors hover:border-white/[0.1]'
								>
									{/* Collapsed row */}
									<button
										type='button'
										onClick={() =>
											setExpandedId(isExpanded ? null : ticket.id)
										}
										className='flex w-full items-center gap-4 px-6 py-4 text-left'
									>
										{/* Subject + category */}
										<div className='min-w-0 flex-1'>
											<p className='truncate text-sm font-medium text-white'>
												{ticket.subject}
											</p>
											<p className='mt-0.5 text-xs text-gray-500'>
												{categoryLabels[ticket.category] ||
													ticket.category}{" "}
												&middot; {formatDate(ticket.createdAt)}
											</p>
										</div>

										{/* Status badge */}
										<span
											className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${status.bg} ${status.text}`}
										>
											{status.label}
										</span>

										{/* Reply count */}
										{ticket.replyCount > 0 && (
											<span className='shrink-0 text-xs text-gray-500'>
												{ticket.replyCount} repl
												{ticket.replyCount === 1 ? "y" : "ies"}
											</span>
										)}

										{/* Chevron */}
										<svg
											className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${
												isExpanded ? "rotate-180" : ""
											}`}
											fill='none'
											viewBox='0 0 24 24'
											strokeWidth={2}
											stroke='currentColor'
										>
											<path
												strokeLinecap='round'
												strokeLinejoin='round'
												d='M19.5 8.25l-7.5 7.5-7.5-7.5'
											/>
										</svg>
									</button>

									{/* Expanded detail */}
									{isExpanded && (
										<div className='border-t border-white/[0.06] px-6 py-5'>
											<div className='mb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500'>
												<span>
													Created: {formatDate(ticket.createdAt)}
												</span>
												<span>
													Last updated:{" "}
													{formatDate(ticket.updatedAt)}
												</span>
												<span>
													Priority: {ticket.priority}
												</span>
											</div>
											<div className='rounded-lg border border-white/[0.04] bg-white/[0.02] p-4'>
												<p className='whitespace-pre-wrap text-sm leading-relaxed text-gray-300'>
													{ticket.message}
												</p>
											</div>

											{ticket.replyCount > 0 && (
												<p className='mt-3 text-xs text-gray-500'>
													{ticket.replyCount} staff repl
													{ticket.replyCount === 1
														? "y"
														: "ies"}{" "}
													&mdash; view full thread in the admin
													panel.
												</p>
											)}
										</div>
									)}
								</div>
							);
						})}
					</div>
				)}
			</div>
		</>
	);
}
