"use client";

import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
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

			{/* Account */}
			<section>
				<h2 className='mb-4 text-lg font-semibold text-content'>
					{t("account.title")}
				</h2>
				<p className='text-sm text-content-muted'>{t("account.description")}</p>
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

	const channelDisabled = (channel: "sms" | "whatsapp") =>
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
	const { update: updateSession } = useSession();
	const [selectedCode, setSelectedCode] = useState("en");
	const [isOpen, setIsOpen] = useState(false);

	useEffect(() => {
		getSelectedLangCode().then((code) => {
			if (code && SUPPORTED_LANGUAGES.some((l) => l.code === code)) {
				setSelectedCode(code);
			}
		});
	}, []);

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
