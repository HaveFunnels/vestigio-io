"use client";

import { useTranslations } from "next-intl";
import { signOut, useSession } from "next-auth/react";
import { SUPPORTED_LANGUAGES } from "@/i18n/supported-locales";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
	getSelectedLangCode,
	switchLanguage,
} from "@/components/Header/action";
import Image from "next/image";

// ──────────────���───────────────────────────────
// Settings page — shows org/env configuration
// Includes language selector for the platform.
// ────────���─────────────────────���───────────────

export default function SettingsPage() {
	const t = useTranslations("console.settings");

	return (
		<div className='p-6'>
			<div className='mb-8'>
				<h1 className='text-xl font-semibold text-content'>{t("title")}</h1>
				<p className='mt-1 text-sm text-content-muted'>{t("subtitle")}</p>
			</div>

			{/* Language */}
			<section className='mb-10'>
				<h2 className='mb-4 text-lg font-semibold text-content'>
					{t("language.title")}
				</h2>
				<p className='mb-4 text-sm text-content-muted'>
					{t("language.description")}
				</p>
				<LanguageSelector />
			</section>

			{/* Currency */}
			<section className='mb-10'>
				<h2 className='mb-4 text-lg font-semibold text-content'>
					{t("currency.title")}
				</h2>
				<p className='mb-4 text-sm text-content-muted'>
					{t("currency.description")}
				</p>
				<CurrencySelector />
			</section>

			{/* Notifications */}
			<section className='mb-10'>
				<h2 className='mb-4 text-lg font-semibold text-content'>
					{t("notifications.title")}
				</h2>
				<p className='mb-4 text-sm text-content-muted'>
					{t("notifications.description")}
				</p>
				<NotificationSettings />
			</section>

			{/* Domains — empty state until DB connected */}
			<section className='mb-10'>
				<h2 className='mb-4 text-lg font-semibold text-content'>
					{t("domains.title")}
				</h2>
				<div className='rounded-md border border-edge px-6 py-8 text-center'>
					<p className='text-sm text-content-muted'>
						{t("domains.description")}
					</p>
				</div>
			</section>

			{/* Crawl Exclusions — per-environment paths to skip */}
			<section className='mb-10'>
				<h2 className='mb-4 text-lg font-semibold text-content'>
					{t("crawl_exclusions.title")}
				</h2>
				<p className='mb-4 text-sm text-content-muted'>
					{t("crawl_exclusions.description")}
				</p>
				<CrawlExclusionsSettings />
			</section>

			{/* Data Overview — populated after first audit */}
			<section className='mb-10'>
				<h2 className='mb-4 text-lg font-semibold text-content'>
					{t("data_overview.title")}
				</h2>
				<div className='rounded-md border border-edge px-6 py-8 text-center'>
					<p className='text-sm text-content-muted'>
						{t("data_overview.description")}
					</p>
				</div>
			</section>

			{/* Subscription */}
			<section className='mb-10'>
				<h2 className='mb-4 text-lg font-semibold text-content'>
					{t("subscription.title")}
				</h2>
				<div className='rounded-md border border-edge bg-surface-card px-6 py-5'>
					<p className='mb-4 text-sm text-content-muted'>
						{t("subscription.description")}
					</p>
					<CancelSubscriptionButton />
				</div>
			</section>

			{/* Account — password change + delete. Previously this section
			    had nothing but a heading even though the underlying APIs
			    (/api/user/change-password and /api/user/delete) already
			    existed, so users couldn't self-serve either without
			    contacting support. */}
			<section>
				<h2 className='mb-4 text-lg font-semibold text-content'>
					{t("account.title")}
				</h2>
				<p className='mb-4 text-sm text-content-muted'>{t("account.description")}</p>
				<AccountSettings />
			</section>
		</div>
	);
}

// ──────────────────────────────────────────────
// Notification Settings — phone + channel + per-event toggles
// ──────────────────────────────────────────────

interface NotifPrefs {
	emailEnabled: boolean;
	smsEnabled: boolean;
	whatsappEnabled: boolean;
	alertOnPageDown: boolean;
	alertOnIncident: boolean;
	alertOnRegression: boolean;
	alertOnImprovement: boolean;
	newsletterSubscribed: boolean;
	productUpdates: boolean;
	alertOnVerifiedResolved: boolean;
	alertOnDigest: boolean;
}

const DEFAULT_PREFS: NotifPrefs = {
	emailEnabled: true,
	smsEnabled: false,
	whatsappEnabled: false,
	alertOnPageDown: true,
	alertOnIncident: true,
	alertOnRegression: true,
	alertOnImprovement: false,
	newsletterSubscribed: true,
	productUpdates: true,
	alertOnVerifiedResolved: true,
	alertOnDigest: true,
};

function NotificationSettings() {
	const t = useTranslations("console.settings.notifications");
	const [phone, setPhone] = useState("");
	const [phoneError, setPhoneError] = useState<string | null>(null);
	const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [savedAt, setSavedAt] = useState<number | null>(null);

	useEffect(() => {
		fetch("/api/user/notification-prefs")
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				if (data) {
					setPhone(data.phone || "");
					setPrefs({ ...DEFAULT_PREFS, ...(data.prefs || {}) });
				}
			})
			.catch(() => {})
			.finally(() => setLoading(false));
	}, []);

	function isValidPhone(p: string): boolean {
		if (!p) return true;
		const cleaned = p.replace(/[\s\-()]/g, "");
		return /^\+?[1-9]\d{6,14}$/.test(cleaned);
	}

	async function handleSavePhone() {
		setPhoneError(null);
		if (phone && !isValidPhone(phone)) {
			setPhoneError(t("phone_invalid"));
			return;
		}
		setSaving(true);
		const cleaned = phone.replace(/[\s\-()]/g, "");
		try {
			await fetch("/api/user/update", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ phone: cleaned }),
			});
			setSavedAt(Date.now());
		} finally {
			setSaving(false);
		}
	}

	async function togglePref<K extends keyof NotifPrefs>(
		key: K,
		value: boolean
	) {
		const next = { ...prefs, [key]: value };
		setPrefs(next);
		setSaving(true);
		try {
			await fetch("/api/user/notification-prefs", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ [key]: value }),
			});
			setSavedAt(Date.now());
		} finally {
			setSaving(false);
		}
	}

	if (loading) {
		return <div className='text-sm text-content-muted'>{t("loading")}</div>;
	}

	const _channelDisabled = (channel: "sms" | "whatsapp") =>
		!phone && (prefs as any)[`${channel}Enabled`] === false;

	return (
		<div className='space-y-6'>
			{/* Phone */}
			<div className='rounded-md border border-edge bg-surface-card p-5'>
				<label
					htmlFor='settings-phone'
					className='mb-1.5 block text-sm font-medium text-content'
				>
					{t("phone_label")}
				</label>
				<p className='mb-3 text-xs text-content-muted'>{t("phone_help")}</p>
				<div className='flex gap-2'>
					<input
						id='settings-phone'
						type='tel'
						value={phone}
						onChange={(e) => {
							setPhone(e.target.value);
							setPhoneError(null);
						}}
						placeholder='+5511999999999'
						className={`flex-1 rounded-md border bg-surface-input px-4 py-2 text-sm text-content outline-none placeholder:text-content-faint focus:ring-1 ${
							phoneError
								? "border-red-500 focus:border-red-500 focus:ring-red-500"
								: "border-edge focus:border-accent focus:ring-accent"
						}`}
					/>
					<button
						onClick={handleSavePhone}
						disabled={saving}
						className='hover:bg-accent-hover rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50'
					>
						{saving ? t("saving") : t("save")}
					</button>
				</div>
				{phoneError && (
					<p className='mt-1.5 text-xs text-red-600 dark:text-red-400'>
						{phoneError}
					</p>
				)}
			</div>

			{/* Channels */}
			<div className='rounded-md border border-edge bg-surface-card p-5'>
				<h3 className='mb-1 text-sm font-semibold text-content'>
					{t("channels_title")}
				</h3>
				<p className='mb-4 text-xs text-content-muted'>{t("channels_help")}</p>
				<div className='space-y-2'>
					<ToggleRow
						label={t("channel_email")}
						description={t("channel_email_desc")}
						enabled={prefs.emailEnabled}
						onChange={(v) => togglePref("emailEnabled", v)}
					/>
					<ToggleRow
						label={t("channel_sms")}
						description={
							!phone ? t("channel_needs_phone") : t("channel_sms_desc")
						}
						enabled={prefs.smsEnabled && !!phone}
						disabled={!phone}
						onChange={(v) => togglePref("smsEnabled", v)}
					/>
					<ToggleRow
						label={t("channel_whatsapp")}
						description={
							!phone ? t("channel_needs_phone") : t("channel_whatsapp_desc")
						}
						enabled={prefs.whatsappEnabled && !!phone}
						disabled={!phone}
						onChange={(v) => togglePref("whatsappEnabled", v)}
					/>
				</div>
			</div>

			{/* Events */}
			<div className='rounded-md border border-edge bg-surface-card p-5'>
				<h3 className='mb-1 text-sm font-semibold text-content'>
					{t("events_title")}
				</h3>
				<p className='mb-4 text-xs text-content-muted'>{t("events_help")}</p>
				<div className='space-y-2'>
					<ToggleRow
						label={t("event_page_down")}
						description={t("event_page_down_desc")}
						enabled={prefs.alertOnPageDown}
						onChange={(v) => togglePref("alertOnPageDown", v)}
					/>
					<ToggleRow
						label={t("event_incident")}
						description={t("event_incident_desc")}
						enabled={prefs.alertOnIncident}
						onChange={(v) => togglePref("alertOnIncident", v)}
					/>
					<ToggleRow
						label={t("event_regression")}
						description={t("event_regression_desc")}
						enabled={prefs.alertOnRegression}
						onChange={(v) => togglePref("alertOnRegression", v)}
					/>
					<ToggleRow
						label={t("event_improvement")}
						description={t("event_improvement_desc")}
						enabled={prefs.alertOnImprovement}
						onChange={(v) => togglePref("alertOnImprovement", v)}
					/>
					<ToggleRow
						label={t("event_newsletter")}
						description={t("event_newsletter_desc")}
						enabled={prefs.newsletterSubscribed}
						onChange={(v) => togglePref("newsletterSubscribed", v)}
					/>
					<ToggleRow
						label={t("event_product_updates")}
						description={t("event_product_updates_desc")}
						enabled={prefs.productUpdates}
						onChange={(v) => togglePref("productUpdates", v)}
					/>
					<ToggleRow
						label={t("event_verified_resolved")}
						description={t("event_verified_resolved_desc")}
						enabled={prefs.alertOnVerifiedResolved}
						onChange={(v) => togglePref("alertOnVerifiedResolved", v)}
					/>
					<ToggleRow
						label={t("event_digest")}
						description={t("event_digest_desc")}
						enabled={prefs.alertOnDigest}
						onChange={(v) => togglePref("alertOnDigest", v)}
					/>
				</div>
			</div>

			{savedAt && <p className='text-xs text-content-faint'>{t("saved")}</p>}
		</div>
	);
}

function ToggleRow(props: {
	label: string;
	description: string;
	enabled: boolean;
	disabled?: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<button
			type='button'
			disabled={props.disabled}
			onClick={() => props.onChange(!props.enabled)}
			className={`flex w-full items-center justify-between rounded-md border border-edge bg-surface-input px-4 py-3 text-left transition-colors hover:border-accent/40 ${
				props.disabled ? "cursor-not-allowed opacity-50" : ""
			}`}
		>
			<div>
				<div className='text-sm font-medium text-content'>{props.label}</div>
				<div className='text-xs text-content-muted'>{props.description}</div>
			</div>
			<div
				className={`h-5 w-9 rounded-full p-0.5 transition-colors ${props.enabled ? "bg-accent" : "bg-surface-inset"}`}
			>
				<div
					className={`h-4 w-4 rounded-full bg-white transition-transform ${props.enabled ? "translate-x-4" : ""}`}
				/>
			</div>
		</button>
	);
}

// ──────────────────────────────────────────────
// Currency Selector — org-level currency override
// ──────────────────────────────────────────────

const CURRENCY_OPTIONS = [
	{ value: "", label: "auto" }, // auto = null in DB
	{ value: "BRL", label: "BRL (R$)" },
	{ value: "USD", label: "USD ($)" },
	{ value: "EUR", label: "EUR (\u20AC)" },
] as const;

function CurrencySelector() {
	const t = useTranslations("console.settings.currency");
	const [selected, setSelected] = useState<string>("");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [savedAt, setSavedAt] = useState<number | null>(null);

	useEffect(() => {
		fetch("/api/organization")
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				if (data?.organization?.currency) {
					setSelected(data.organization.currency);
				}
			})
			.catch(() => {})
			.finally(() => setLoading(false));
	}, []);

	async function handleChange(value: string) {
		setSelected(value);
		setSaving(true);
		try {
			await fetch("/api/organization", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ currency: value || null }),
			});
			setSavedAt(Date.now());
		} finally {
			setSaving(false);
		}
	}

	if (loading) {
		return <div className='text-sm text-content-muted'>...</div>;
	}

	return (
		<div className='space-y-3'>
			<div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
				{CURRENCY_OPTIONS.map((opt) => (
					<button
						key={opt.value}
						type='button'
						disabled={saving}
						onClick={() => handleChange(opt.value)}
						className={`rounded-md border px-4 py-2.5 text-sm font-medium transition-colors ${
							selected === opt.value
								? "border-accent bg-accent/10 text-accent"
								: "border-edge bg-surface-input text-content-muted hover:border-accent/40"
						} disabled:opacity-50`}
					>
						{opt.value === "" ? t("auto") : opt.label}
					</button>
				))}
			</div>
			{savedAt && <p className='text-xs text-content-faint'>{t("saved")}</p>}
		</div>
	);
}

// ──────────────────────────────────────────────
// Cancel Subscription Button — routes to /app/settings/cancel
// ──────────────────────────────────────────────

function CancelSubscriptionButton() {
	const t = useTranslations("console.settings.subscription");
	const router = useRouter();

	return (
		<button
			onClick={() => router.push("/app/settings/cancel")}
			className='rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20'
		>
			{t("cancel_button")}
		</button>
	);
}

// ──────────────────────────────────────────────
// Language Selector — inline dropdown for /app/settings
// ──────────────────────────────────────────────

function LanguageSelector() {
	const t = useTranslations("console.settings.language");
	const router = useRouter();
	const { data: session, update: updateSession } = useSession();
	const [selectedCode, setSelectedCode] = useState("en");
	const [isOpen, setIsOpen] = useState(false);

	// Source-of-truth ordering matches src/i18n/request.ts: prefer the
	// authenticated user's DB locale (carried on the JWT) so the chip
	// reflects the user's profile, not a stale "en" cookie left over
	// from sign-up. Cookie is the anonymous-visitor fallback.
	useEffect(() => {
		const sessionLocale = (session?.user as { locale?: string } | undefined)?.locale;
		if (sessionLocale && SUPPORTED_LANGUAGES.some((l) => l.code === sessionLocale)) {
			setSelectedCode(sessionLocale);
			return;
		}
		getSelectedLangCode().then((code) => {
			if (code && SUPPORTED_LANGUAGES.some((l) => l.code === code)) {
				setSelectedCode(code);
			}
		});
	}, [session?.user]);

	const selectedLang = SUPPORTED_LANGUAGES.find((l) => l.code === selectedCode);

	async function handleSelect(code: string) {
		setSelectedCode(code);
		setIsOpen(false);
		switchLanguage(code);
		try {
			await fetch("/api/user/update", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ locale: code }),
			});
			await updateSession({ user: { locale: code } });
		} catch {
			// Cookie is already set — DB save is best-effort
		}
		router.refresh();
	}

	return (
		<div className='relative inline-block w-full max-w-xs'>
			<button
				onClick={() => setIsOpen(!isOpen)}
				className='flex w-full items-center justify-between rounded-lg border border-edge bg-surface-input px-4 py-2.5 text-sm text-content transition-colors hover:border-accent/40'
			>
				<span className='flex items-center gap-3'>
					<Image
						src={`/images/flags/${selectedCode}.svg`}
						width={20}
						height={20}
						alt={selectedLang?.name || ""}
						className='size-5 rounded-full object-cover'
					/>
					{selectedLang?.name || selectedCode}
				</span>
				<svg
					className={`h-4 w-4 text-content-faint transition-transform ${isOpen ? "rotate-180" : ""}`}
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

			{isOpen && (
				<ul className='absolute z-20 mt-1 w-full rounded-lg border border-edge bg-surface-card py-1 shadow-lg'>
					{SUPPORTED_LANGUAGES.map((lang) => (
						<li key={lang.code}>
							<button
								className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-surface-card-hover ${
									lang.code === selectedCode
										? "bg-surface-card-hover text-content"
										: "text-content-muted"
								}`}
								onClick={() => handleSelect(lang.code)}
							>
								<Image
									src={`/images/flags/${lang.code}.svg`}
									width={20}
									height={20}
									alt={lang.name}
									className='size-5 rounded-full object-cover'
								/>
								<span>{lang.name}</span>
								{lang.code === selectedCode && (
									<svg
										className='ml-auto h-4 w-4 text-accent'
										fill='none'
										viewBox='0 0 24 24'
										strokeWidth={2}
										stroke='currentColor'
									>
										<path
											strokeLinecap='round'
											strokeLinejoin='round'
											d='M4.5 12.75l6 6 9-13.5'
										/>
									</svg>
								)}
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

// ──────────────────────────────────────────────
// Crawl Exclusions — per-environment glob patterns
// (e.g. "/admin/*", "/staging/*", "*.pdf")
// ──────────────────────────────────────────────

function getEnvironmentIdFromBrowser(): string | null {
	if (typeof window === "undefined") return null;
	const params = new URLSearchParams(window.location.search);
	const fromUrl = params.get("env");
	if (fromUrl) return fromUrl;
	const match = document.cookie.match(/(?:^|;\s*)active_env=([^;]*)/);
	return match?.[1] ?? null;
}

function CrawlExclusionsSettings() {
	const t = useTranslations("console.settings.crawl_exclusions");
	const [text, setText] = useState("");
	const [initial, setInitial] = useState("");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [savedAt, setSavedAt] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [envId, setEnvId] = useState<string | null>(null);

	useEffect(() => {
		const id = getEnvironmentIdFromBrowser();
		setEnvId(id);
		if (!id) {
			setLoading(false);
			return;
		}
		fetch(`/api/organization/environments/crawl-exclusions?environmentId=${encodeURIComponent(id)}`)
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				if (data?.patterns) {
					const joined = (data.patterns as string[]).join("\n");
					setText(joined);
					setInitial(joined);
				}
			})
			.catch(() => {})
			.finally(() => setLoading(false));
	}, []);

	async function handleSave() {
		if (!envId) return;
		setSaving(true);
		setError(null);
		try {
			const patterns = text
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line.length > 0);
			const res = await fetch("/api/organization/environments/crawl-exclusions", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ environmentId: envId, patterns }),
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				setError(body?.message || t("save_error"));
				return;
			}
			const data = await res.json();
			const joined = (data.patterns as string[]).join("\n");
			setText(joined);
			setInitial(joined);
			setSavedAt(Date.now());
		} catch {
			setError(t("save_error"));
		} finally {
			setSaving(false);
		}
	}

	if (loading) {
		return <div className='text-sm text-content-muted'>{t("loading")}</div>;
	}

	if (!envId) {
		return (
			<div className='rounded-md border border-edge bg-surface-card p-5 text-sm text-content-muted'>
				{t("no_env")}
			</div>
		);
	}

	const dirty = text !== initial;

	return (
		<div className='rounded-md border border-edge bg-surface-card p-5'>
			<label
				htmlFor='crawl-exclusions'
				className='mb-1.5 block text-sm font-medium text-content'
			>
				{t("label")}
			</label>
			<p className='mb-3 text-xs text-content-muted'>{t("help")}</p>
			<textarea
				id='crawl-exclusions'
				value={text}
				onChange={(e) => setText(e.target.value)}
				placeholder={"/admin/*\n/staging/*\n*.pdf"}
				rows={6}
				className='block w-full resize-y rounded-md border border-edge bg-surface-input px-3 py-2 font-mono text-xs text-content outline-none placeholder:text-content-faint focus:border-accent focus:ring-1 focus:ring-accent'
			/>
			<div className='mt-3 flex items-center justify-between'>
				<p className='text-xs text-content-muted'>{t("syntax_hint")}</p>
				<button
					onClick={handleSave}
					disabled={saving || !dirty}
					className='hover:bg-accent-hover rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50'
				>
					{saving ? t("saving") : t("save")}
				</button>
			</div>
			{error && (
				<p className='mt-2 text-xs text-red-600 dark:text-red-400'>{error}</p>
			)}
			{savedAt && !dirty && !error && (
				<p className='mt-2 text-xs text-emerald-600 dark:text-emerald-400'>
					{t("saved")}
				</p>
			)}
		</div>
	);
}

// ──────────────────────────────────────────────
// Account Settings — change password + delete account.
//
// Both endpoints already existed (/api/user/change-password,
// /api/user/delete); the section just had no UI on top of them.
// ──────────────────────────────────────────────

function AccountSettings() {
	const { data: session } = useSession();
	const email = session?.user?.email ?? "";
	return (
		<div className="space-y-6">
			<ChangePasswordForm />
			<DeleteAccountSection email={email} />
		</div>
	);
}

function ChangePasswordForm() {
	const [currentPassword, setCurrentPassword] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState(false);
	const [saving, setSaving] = useState(false);

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setSuccess(false);
		if (password !== confirmPassword) {
			setError("New password and confirmation do not match.");
			return;
		}
		setSaving(true);
		try {
			const res = await fetch("/api/user/change-password", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ currentPassword, password }),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				setError(data.message || "Failed to change password.");
				return;
			}
			setSuccess(true);
			setCurrentPassword("");
			setPassword("");
			setConfirmPassword("");
		} catch {
			setError("Network error.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<form
			onSubmit={submit}
			className="space-y-3 rounded-md border border-edge bg-surface-card px-6 py-5"
		>
			<h3 className="text-sm font-semibold text-content">Change password</h3>
			<div className="grid gap-3 sm:grid-cols-3">
				<input
					type="password"
					placeholder="Current password"
					value={currentPassword}
					onChange={(e) => setCurrentPassword(e.target.value)}
					autoComplete="current-password"
					required
					className="rounded-md border border-edge bg-surface-inset px-3 py-2 text-sm text-content placeholder-content-faint outline-none transition-colors focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
				/>
				<input
					type="password"
					placeholder="New password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					autoComplete="new-password"
					required
					className="rounded-md border border-edge bg-surface-inset px-3 py-2 text-sm text-content placeholder-content-faint outline-none transition-colors focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
				/>
				<input
					type="password"
					placeholder="Confirm new password"
					value={confirmPassword}
					onChange={(e) => setConfirmPassword(e.target.value)}
					autoComplete="new-password"
					required
					className="rounded-md border border-edge bg-surface-inset px-3 py-2 text-sm text-content placeholder-content-faint outline-none transition-colors focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
				/>
			</div>
			{error && (
				<p className="text-xs text-red-400">{error}</p>
			)}
			{success && (
				<p className="text-xs text-emerald-400">Password updated.</p>
			)}
			<div className="flex justify-end">
				<button
					type="submit"
					disabled={saving}
					className="rounded-md border border-emerald-500/40 px-4 py-1.5 text-sm font-medium text-content-secondary transition-colors hover:border-emerald-500 hover:bg-emerald-500/5 disabled:opacity-50"
				>
					{saving ? "Saving…" : "Update password"}
				</button>
			</div>
		</form>
	);
}

function DeleteAccountSection({ email }: { email: string }) {
	const [confirm, setConfirm] = useState(false);
	const [typedEmail, setTypedEmail] = useState("");
	const [deleting, setDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleDelete() {
		if (typedEmail !== email) {
			setError("Email confirmation must match exactly.");
			return;
		}
		setError(null);
		setDeleting(true);
		try {
			const res = await fetch("/api/user/delete", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email }),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				setError(data.message || "Failed to delete account.");
				return;
			}
			// Sign the user out — the JWT now references a non-existent user.
			signOut({ callbackUrl: "/" });
		} catch {
			setError("Network error.");
		} finally {
			setDeleting(false);
		}
	}

	return (
		<div className="space-y-3 rounded-md border border-red-500/30 bg-red-500/5 px-6 py-5">
			<h3 className="text-sm font-semibold text-red-400">Delete account</h3>
			<p className="text-xs text-content-muted">
				Permanently deletes your user, memberships, and any orgs you own. This cannot be undone.
			</p>
			{!confirm && (
				<button
					type="button"
					onClick={() => setConfirm(true)}
					className="rounded-md border border-red-500/40 px-4 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
				>
					Delete my account
				</button>
			)}
			{confirm && (
				<div className="space-y-2">
					<p className="text-xs text-content-muted">
						Type <code className="rounded bg-surface-inset px-1 py-0.5 font-mono text-[10px] text-content">{email}</code> to confirm.
					</p>
					<input
						type="email"
						value={typedEmail}
						onChange={(e) => setTypedEmail(e.target.value)}
						placeholder={email}
						className="w-full rounded-md border border-edge bg-surface-inset px-3 py-2 text-sm text-content placeholder-content-faint outline-none transition-colors focus:border-red-500/40 focus:ring-1 focus:ring-red-500/20"
					/>
					{error && <p className="text-xs text-red-400">{error}</p>}
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={handleDelete}
							disabled={deleting || typedEmail !== email}
							className="rounded-md border border-red-500/60 bg-red-500/10 px-4 py-1.5 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
						>
							{deleting ? "Deleting…" : "Permanently delete"}
						</button>
						<button
							type="button"
							onClick={() => {
								setConfirm(false);
								setTypedEmail("");
								setError(null);
							}}
							disabled={deleting}
							className="rounded-md px-3 py-1.5 text-xs text-content-muted transition-colors hover:bg-surface-card-hover hover:text-content disabled:opacity-50"
						>
							Cancel
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
