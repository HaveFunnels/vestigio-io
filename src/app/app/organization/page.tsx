"use client";

// ──────────────────────────────────────────────
// Organization — Wave 22 bento rewrite
//
// Replaces the prior emerald-fill, mixed-height, sectioned layout
// with the same bento grammar as the dashboard:
//   - surface-card containers with edge borders, consistent radii
//   - typographic hierarchy: text-base headings, text-sm body,
//     text-xs uppercase tracking for category labels
//   - accent tokens (accent-cta, accent-text) for primary actions;
//     no emerald fills anywhere
//   - input + button heights aligned to h-10
//
// Critical-flow fixes (vs the prior page):
//   - Reads ?action=add-env from the URL and auto-opens the Add
//     Environment panel. The sidebar "Adicionar novo domínio"
//     link now lands directly on the open panel.
//   - Add Environment panel is one field (domain). isProduction
//     was removed from the UX entirely — every env lands as
//     production by default. Per-surface criticality lives in the
//     finding engine, not on the env row.
//   - Post-create success state with "Ir para [novo]" / "Continuar
//     em [atual]" buttons, replacing the silent close that gave no
//     confirmation feedback.
//   - Custom delete confirmation panel replaces window.confirm().
//   - react-hot-toast replaces every native alert().
//   - Soft env switch via router.refresh() handled by the sidebar
//     EnvironmentSwitcher (no full-page reload).
// ──────────────────────────────────────────────

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import toast from "react-hot-toast";
import {
	XIcon as X,
	WarningIcon as Warning,
	PlusIcon as Plus,
	ArrowRightIcon as ArrowRight,
	TrashIcon as Trash,
	UsersIcon as Users,
	GlobeHemisphereWestIcon as Globe,
	BuildingsIcon as Buildings,
	CheckCircleIcon as CheckCircle,
} from "@phosphor-icons/react/dist/ssr";
import { formatDateLong } from "@/lib/format-date";
import CustomSelect from "@/components/console/CustomSelect";

interface OrgData {
	organization: {
		id: string;
		name: string;
		ownerId: string;
		plan: string;
		status: string;
		createdAt: string;
	};
	environments: {
		id: string;
		domain: string;
		landingUrl: string;
		isProduction: boolean;
		createdAt: string;
	}[];
	members: {
		id: string;
		userId: string;
		name: string | null;
		email: string | null;
		image: string | null;
		role: string;
		createdAt: string;
	}[];
	businessProfile: {
		id: string;
		businessModel: string;
		monthlyRevenue: number | null;
		averageOrderValue: number | null;
		monthlyTransactions: number | null;
		conversionRate: number | null;
		conversionModel: string;
	} | null;
	currentUserId: string;
	currentUserRole: string;
	currentEnvId?: string | null;
}

const PLAN_LABELS: Record<string, string> = {
	vestigio: "Vestigio",
	pro: "Pro",
	max: "Max",
};

const BUSINESS_MODEL_LABELS: Record<string, string> = {
	ecommerce: "E-commerce",
	lead_gen: "Lead Generation",
	saas: "SaaS",
	hybrid: "Hybrid",
};

const CONVERSION_MODEL_LABELS: Record<string, string> = {
	checkout: "Checkout",
	whatsapp: "WhatsApp",
	form: "Form",
	external: "External",
};

function formatDate(iso: string, locale: string): string {
	return formatDateLong(iso, locale);
}

function formatCurrency(v: number | null | undefined): string {
	if (v == null) return "--";
	return `$${v.toLocaleString()}`;
}

function formatNumber(v: number | null | undefined): string {
	if (v == null) return "--";
	return v.toLocaleString();
}

function formatPercent(v: number | null | undefined): string {
	if (v == null) return "--";
	return `${v}%`;
}

// ──────────────────────────────────────────────
// Card primitives
// ──────────────────────────────────────────────

function Card({
	title,
	icon,
	action,
	children,
}: {
	title: string;
	icon?: React.ReactNode;
	action?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<section className="rounded-2xl border border-edge bg-surface-card p-5">
			<header className="mb-4 flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					{icon && <span className="text-content-muted">{icon}</span>}
					<h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-content-muted">
						{title}
					</h2>
				</div>
				{action}
			</header>
			{children}
		</section>
	);
}

function Row({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-center justify-between gap-4 py-1.5">
			<span className="text-sm text-content-muted">{label}</span>
			<div className="text-right">{children}</div>
		</div>
	);
}

function Pill({
	tone,
	children,
}: {
	tone: "neutral" | "active" | "warn" | "info";
	children: React.ReactNode;
}) {
	const TONES: Record<string, string> = {
		neutral: "bg-surface-inset text-content-secondary",
		active: "bg-accent/15 text-accent-text",
		warn: "bg-amber-500/10 text-amber-500 dark:text-amber-400",
		info: "bg-blue-500/10 text-blue-500 dark:text-blue-400",
	};
	return (
		<span
			className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${TONES[tone]}`}
		>
			{children}
		</span>
	);
}

// ──────────────────────────────────────────────
// Input primitives — consistent h-10, edge border, accent focus
// ──────────────────────────────────────────────

function Input({
	value,
	onChange,
	placeholder,
	type = "text",
	prefix,
	suffix,
	disabled,
}: {
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
	type?: string;
	prefix?: string;
	suffix?: string;
	disabled?: boolean;
}) {
	return (
		<div className="relative w-full max-w-[16rem]">
			{prefix && (
				<span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-content-muted">
					{prefix}
				</span>
			)}
			<input
				type={type}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				disabled={disabled}
				className={`h-10 w-full rounded-lg border border-edge bg-surface-input text-sm text-content placeholder-content-faint outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/30 disabled:opacity-50 ${
					prefix ? "pl-7" : "pl-3"
				} ${suffix ? "pr-7" : "pr-3"}`}
			/>
			{suffix && (
				<span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-content-muted">
					{suffix}
				</span>
			)}
		</div>
	);
}

function PrimaryButton({
	children,
	onClick,
	disabled,
	type = "button",
}: {
	children: React.ReactNode;
	onClick?: () => void;
	disabled?: boolean;
	type?: "button" | "submit";
}) {
	return (
		<button
			type={type}
			onClick={onClick}
			disabled={disabled}
			className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent-cta px-4 text-sm font-medium text-accent-text transition-colors hover:bg-accent-cta-hover disabled:opacity-50 disabled:cursor-not-allowed"
		>
			{children}
		</button>
	);
}

function SecondaryButton({
	children,
	onClick,
	disabled,
	type = "button",
}: {
	children: React.ReactNode;
	onClick?: () => void;
	disabled?: boolean;
	type?: "button" | "submit";
}) {
	return (
		<button
			type={type}
			onClick={onClick}
			disabled={disabled}
			className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-edge bg-surface-card px-4 text-sm font-medium text-content-secondary transition-colors hover:border-edge-focus hover:bg-surface-card-hover hover:text-content disabled:opacity-50"
		>
			{children}
		</button>
	);
}

function DangerButton({
	children,
	onClick,
	disabled,
}: {
	children: React.ReactNode;
	onClick?: () => void;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-red-500 px-4 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
		>
			{children}
		</button>
	);
}

function IconButton({
	icon,
	label,
	onClick,
	disabled,
	tone = "neutral",
}: {
	icon: React.ReactNode;
	label: string;
	onClick?: () => void;
	disabled?: boolean;
	tone?: "neutral" | "danger";
}) {
	const toneCls =
		tone === "danger"
			? "text-content-muted hover:bg-red-500/10 hover:text-red-500"
			: "text-content-muted hover:bg-surface-card-hover hover:text-content";
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			title={label}
			aria-label={label}
			className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:opacity-50 ${toneCls}`}
		>
			{icon}
		</button>
	);
}

// ──────────────────────────────────────────────
// Modal shell
// ──────────────────────────────────────────────

function Modal({
	title,
	onClose,
	children,
}: {
	title: string;
	onClose: () => void;
	children: React.ReactNode;
}) {
	useEffect(() => {
		function handleKey(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
		}
		document.addEventListener("keydown", handleKey);
		return () => document.removeEventListener("keydown", handleKey);
	}, [onClose]);

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
			onClick={onClose}
		>
			<div
				className="w-full max-w-md rounded-2xl border border-edge bg-surface-card shadow-2xl"
				onClick={(e) => e.stopPropagation()}
			>
				<header className="flex items-center justify-between border-b border-edge px-5 py-4">
					<h3 className="text-base font-semibold text-content">{title}</h3>
					<button
						type="button"
						onClick={onClose}
						aria-label="Fechar"
						className="inline-flex h-8 w-8 items-center justify-center rounded-md text-content-muted transition-colors hover:bg-surface-card-hover hover:text-content"
					>
						<X size={16} weight="bold" />
					</button>
				</header>
				<div className="px-5 py-5">{children}</div>
			</div>
		</div>
	);
}

// ──────────────────────────────────────────────
// Add Environment panel
// ──────────────────────────────────────────────

interface AddEnvironmentPanelProps {
	onClose: () => void;
	onCreated: (env: { id: string; domain: string }) => void;
	currentEnvDomain?: string;
}

function AddEnvironmentPanel({
	onClose,
	onCreated,
	currentEnvDomain,
}: AddEnvironmentPanelProps) {
	const t = useTranslations("console.organization");
	const router = useRouter();
	const [domain, setDomain] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [created, setCreated] = useState<{ id: string; domain: string } | null>(null);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setSaving(true);
		setError("");

		try {
			const res = await fetch("/api/organization/environments", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: domain.trim() }),
			});

			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				setError(body.message || t("error_create_env"));
				return;
			}

			const body = await res.json();
			const env = body.environment;
			setCreated({ id: env.id, domain: env.domain });
			onCreated({ id: env.id, domain: env.domain });
		} catch {
			setError(t("error_network"));
		} finally {
			setSaving(false);
		}
	}

	function handleGoTo() {
		if (!created) return;
		document.cookie = `active_env=${created.id};path=/;max-age=${60 * 60 * 24 * 365}`;
		// Land the user on the dashboard for the new env. First audit
		// auto-triggers from /app per Wave 22 — the dashboard sees an
		// activated env with zero cycles and dispatches one.
		router.push("/app");
	}

	function handleStay() {
		onClose();
	}

	// Post-create success state — replaces the silent close from the
	// prior panel. User sees confirmation + chooses where to go next.
	if (created) {
		return (
			<Modal title={t("add_env_success_title")} onClose={onClose}>
				<div className="flex flex-col items-center gap-4 py-2 text-center">
					<div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15">
						<CheckCircle size={24} weight="duotone" className="text-accent-text" />
					</div>
					<div className="space-y-1">
						<p className="text-sm text-content">
							{t("add_env_success_body", { domain: created.domain })}
						</p>
						<p className="text-xs text-content-muted">
							{t("add_env_success_hint")}
						</p>
					</div>
					<div className="mt-2 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
						<SecondaryButton onClick={handleStay}>
							{currentEnvDomain
								? t("stay_in", { domain: currentEnvDomain })
								: t("stay_here")}
						</SecondaryButton>
						<PrimaryButton onClick={handleGoTo}>
							<span className="truncate">
								{t("go_to", { domain: created.domain })}
							</span>
							<ArrowRight size={14} weight="bold" />
						</PrimaryButton>
					</div>
				</div>
			</Modal>
		);
	}

	return (
		<Modal title={t("add_env_title")} onClose={onClose}>
			<form onSubmit={handleSubmit} className="space-y-4">
				<div className="space-y-1.5">
					<label className="block text-xs font-medium uppercase tracking-wider text-content-muted">
						{t("domain_label")}
					</label>
					<div className="w-full">
						<input
							type="text"
							value={domain}
							onChange={(e) => setDomain(e.target.value)}
							placeholder={t("domain_placeholder")}
							required
							minLength={3}
							autoFocus
							className="h-10 w-full rounded-lg border border-edge bg-surface-input px-3 text-sm text-content placeholder-content-faint outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/30"
						/>
					</div>
					<p className="text-xs text-content-muted">
						{t("domain_help")}
					</p>
				</div>

				{error && (
					<div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
						<Warning size={14} weight="bold" className="mt-0.5 shrink-0 text-red-500" />
						<p className="text-xs text-red-500 dark:text-red-400">{error}</p>
					</div>
				)}

				<div className="flex items-center justify-end gap-2 pt-1">
					<SecondaryButton onClick={onClose}>{t("cancel")}</SecondaryButton>
					<PrimaryButton type="submit" disabled={saving || !domain.trim()}>
						{saving ? t("creating") : t("create")}
					</PrimaryButton>
				</div>
			</form>
		</Modal>
	);
}

// ──────────────────────────────────────────────
// Confirm delete (env / member)
// ──────────────────────────────────────────────

interface ConfirmPanelProps {
	title: string;
	description: string;
	confirmLabel: string;
	loading?: boolean;
	onConfirm: () => void;
	onClose: () => void;
}

function ConfirmPanel({
	title,
	description,
	confirmLabel,
	loading,
	onConfirm,
	onClose,
}: ConfirmPanelProps) {
	const t = useTranslations("console.organization");
	return (
		<Modal title={title} onClose={onClose}>
			<div className="space-y-4">
				<div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5">
					<Warning size={16} weight="bold" className="mt-0.5 shrink-0 text-red-500" />
					<p className="text-sm text-content-secondary">{description}</p>
				</div>
				<div className="flex items-center justify-end gap-2">
					<SecondaryButton onClick={onClose} disabled={loading}>
						{t("cancel")}
					</SecondaryButton>
					<DangerButton onClick={onConfirm} disabled={loading}>
						{loading ? "..." : confirmLabel}
					</DangerButton>
				</div>
			</div>
		</Modal>
	);
}

// ──────────────────────────────────────────────
// Environment row
// ──────────────────────────────────────────────

function EnvironmentRow({
	env,
	isCurrent,
	isOwner,
	onDelete,
	onSaveLandingUrl,
	onSwitch,
}: {
	env: {
		id: string;
		domain: string;
		landingUrl: string;
		createdAt: string;
	};
	isCurrent: boolean;
	isOwner: boolean;
	onDelete: () => void;
	onSaveLandingUrl: (url: string) => Promise<boolean>;
	onSwitch: () => void;
}) {
	const t = useTranslations("console.organization");
	const locale = useLocale();
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(env.landingUrl);
	const [saving, setSaving] = useState(false);

	async function commit() {
		const next = draft.trim();
		if (!next || next === env.landingUrl) {
			setEditing(false);
			setDraft(env.landingUrl);
			return;
		}
		try {
			new URL(next);
		} catch {
			toast.error("Landing URL precisa ser uma URL http(s) válida.");
			return;
		}
		setSaving(true);
		const ok = await onSaveLandingUrl(next);
		setSaving(false);
		if (ok) setEditing(false);
	}

	return (
		<div
			className={`rounded-xl border bg-surface-inset px-4 py-3 transition-colors ${
				isCurrent ? "border-accent/40" : "border-edge"
			}`}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0 flex-1 space-y-1">
					<div className="flex items-center gap-2">
						<Globe size={14} weight="duotone" className="shrink-0 text-content-muted" />
						<span className="truncate text-sm font-medium text-content">{env.domain}</span>
						{isCurrent && <Pill tone="active">{t("current")}</Pill>}
					</div>
					<p className="truncate text-xs text-content-muted">
						<span className="opacity-60">URL: </span>
						<code className="font-mono text-[11px]">{env.landingUrl}</code>
					</p>
					<p className="text-[11px] text-content-faint">
						{t("added_date", { date: formatDate(env.createdAt, locale) })}
					</p>
				</div>
				<div className="flex shrink-0 items-center gap-1">
					{!isCurrent && (
						<button
							onClick={onSwitch}
							className="rounded-md px-2 py-1 text-[11px] font-medium text-content-muted transition-colors hover:bg-surface-card-hover hover:text-content"
						>
							{t("switch_to")}
						</button>
					)}
					{isOwner && !editing && (
						<IconButton
							icon={<ArrowRight size={14} />}
							label={t("edit_url")}
							onClick={() => {
								setDraft(env.landingUrl);
								setEditing(true);
							}}
						/>
					)}
					{isOwner && (
						<IconButton
							icon={<Trash size={14} />}
							label={t("remove")}
							onClick={onDelete}
							tone="danger"
						/>
					)}
				</div>
			</div>
			{editing && (
				<div className="mt-3 flex items-center gap-2">
					<input
						type="url"
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						placeholder="https://example.com/br"
						disabled={saving}
						className="h-9 flex-1 rounded-lg border border-edge bg-surface-card px-3 text-xs text-content placeholder-content-faint outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/30 disabled:opacity-50"
					/>
					<button
						type="button"
						onClick={commit}
						disabled={saving}
						className="inline-flex h-9 items-center rounded-lg bg-accent-cta px-3 text-xs font-medium text-accent-text transition-colors hover:bg-accent-cta-hover disabled:opacity-50"
					>
						{saving ? "..." : t("save")}
					</button>
					<button
						type="button"
						onClick={() => {
							setEditing(false);
							setDraft(env.landingUrl);
						}}
						disabled={saving}
						className="inline-flex h-9 items-center rounded-lg px-3 text-xs text-content-muted transition-colors hover:bg-surface-card-hover hover:text-content disabled:opacity-50"
					>
						{t("cancel")}
					</button>
				</div>
			)}
		</div>
	);
}

// ──────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────

function OrganizationPageInner() {
	const t = useTranslations("console.organization");
	const locale = useLocale();
	const router = useRouter();
	const searchParams = useSearchParams();

	const [data, setData] = useState<OrgData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	// Editable state
	const [editName, setEditName] = useState("");
	const [editBusinessModel, setEditBusinessModel] = useState("");
	const [editMonthlyRevenue, setEditMonthlyRevenue] = useState("");
	const [editAov, setEditAov] = useState("");
	const [editMonthlyTxns, setEditMonthlyTxns] = useState("");
	const [editConversionRate, setEditConversionRate] = useState("");
	const [editConversionModel, setEditConversionModel] = useState("");

	const [saving, setSaving] = useState(false);

	const [showAddEnv, setShowAddEnv] = useState(false);
	const [envToDelete, setEnvToDelete] = useState<{ id: string; domain: string } | null>(null);
	const [memberToRemove, setMemberToRemove] = useState<{ id: string; label: string } | null>(null);
	const [deleting, setDeleting] = useState(false);

	const isOwnerOrAdmin = data?.currentUserRole === "owner" || data?.currentUserRole === "admin";
	const isOwner = data?.currentUserRole === "owner";

	const fetchData = useCallback(async () => {
		try {
			setError("");
			const res = await fetch("/api/organization");
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				setError(body.message || t("error_load"));
				return;
			}
			const json: OrgData = await res.json();
			setData(json);

			setEditName(json.organization.name);
			setEditBusinessModel(json.businessProfile?.businessModel || "ecommerce");
			setEditMonthlyRevenue(json.businessProfile?.monthlyRevenue?.toString() || "");
			setEditAov(json.businessProfile?.averageOrderValue?.toString() || "");
			setEditMonthlyTxns(json.businessProfile?.monthlyTransactions?.toString() || "");
			setEditConversionRate(json.businessProfile?.conversionRate?.toString() || "");
			setEditConversionModel(json.businessProfile?.conversionModel || "checkout");
		} catch {
			setError(t("error_network"));
		} finally {
			setLoading(false);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	// Wave 22 — auto-open the Add Environment panel when the sidebar
	// link drops us here with ?action=add-env. The query param is
	// stripped from the URL after opening so a refresh doesn't re-open.
	useEffect(() => {
		if (searchParams.get("action") === "add-env") {
			setShowAddEnv(true);
			const params = new URLSearchParams(searchParams.toString());
			params.delete("action");
			const newUrl = params.toString()
				? `/app/organization?${params.toString()}`
				: "/app/organization";
			router.replace(newUrl, { scroll: false });
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [searchParams]);

	async function handleSave() {
		if (!data) return;
		setSaving(true);

		const payload: Record<string, any> = {};

		if (editName !== data.organization.name) payload.name = editName;

		const bp = data.businessProfile;
		if (editBusinessModel !== (bp?.businessModel || "ecommerce"))
			payload.businessModel = editBusinessModel;
		if (editMonthlyRevenue !== (bp?.monthlyRevenue?.toString() || "")) {
			payload.monthlyRevenue = editMonthlyRevenue ? parseFloat(editMonthlyRevenue) : null;
		}
		if (editAov !== (bp?.averageOrderValue?.toString() || "")) {
			payload.averageOrderValue = editAov ? parseFloat(editAov) : null;
		}
		if (editMonthlyTxns !== (bp?.monthlyTransactions?.toString() || "")) {
			payload.monthlyTransactions = editMonthlyTxns ? parseInt(editMonthlyTxns, 10) : null;
		}
		if (editConversionRate !== (bp?.conversionRate?.toString() || "")) {
			payload.conversionRate = editConversionRate ? parseFloat(editConversionRate) : null;
		}
		if (editConversionModel !== (bp?.conversionModel || "checkout"))
			payload.conversionModel = editConversionModel;

		if (Object.keys(payload).length === 0) {
			setSaving(false);
			toast.success(t("saved"));
			return;
		}

		try {
			const res = await fetch("/api/organization", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				toast.error(body.message || t("error_save"));
				return;
			}

			toast.success(t("saved"));
			await fetchData();
		} catch {
			toast.error(t("error_network"));
		} finally {
			setSaving(false);
		}
	}

	async function confirmDeleteEnv() {
		if (!envToDelete) return;
		setDeleting(true);
		try {
			const res = await fetch("/api/organization/environments", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ environmentId: envToDelete.id }),
			});

			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				toast.error(body.message || t("error_delete_env"));
				return;
			}

			toast.success(t("env_deleted", { domain: envToDelete.domain }));
			setEnvToDelete(null);
			await fetchData();
		} catch {
			toast.error(t("error_network"));
		} finally {
			setDeleting(false);
		}
	}

	async function handleSaveLandingUrl(envId: string, landingUrl: string) {
		try {
			const res = await fetch("/api/organization/environments", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ environmentId: envId, landingUrl }),
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				toast.error(body.message || "Falha ao atualizar URL.");
				return false;
			}
			toast.success(t("url_saved"));
			await fetchData();
			return true;
		} catch {
			toast.error(t("error_network"));
			return false;
		}
	}

	async function confirmRemoveMember() {
		if (!memberToRemove) return;
		setDeleting(true);
		try {
			const res = await fetch("/api/organization/members", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ membershipId: memberToRemove.id }),
			});

			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				toast.error(body.message || t("error_remove_member"));
				return;
			}

			toast.success(t("member_removed"));
			setMemberToRemove(null);
			await fetchData();
		} catch {
			toast.error(t("error_network"));
		} finally {
			setDeleting(false);
		}
	}

	function handleSwitchEnv(envId: string) {
		document.cookie = `active_env=${envId};path=/;max-age=${60 * 60 * 24 * 365}`;
		router.refresh();
		toast.success(t("env_switched"));
	}

	if (loading) {
		return (
			<main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
				<div className="flex h-64 items-center justify-center text-content-muted">
					<span className="text-sm">{t("loading")}</span>
				</div>
			</main>
		);
	}

	if (error || !data) {
		return (
			<main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
				<Card title={t("title")}>
					<div className="space-y-3 py-6 text-center">
						<p className="text-sm text-content-muted">{error || t("error_load")}</p>
						<PrimaryButton
							onClick={() => {
								setLoading(true);
								fetchData();
							}}
						>
							{t("retry")}
						</PrimaryButton>
					</div>
				</Card>
			</main>
		);
	}

	const { organization, environments, members, businessProfile } = data;
	const currentEnvId = data.currentEnvId || environments[0]?.id;
	const currentEnv = environments.find((e) => e.id === currentEnvId);

	return (
		<main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
			{/* Header */}
			<header className="mb-6 flex items-start justify-between gap-4">
				<div>
					<h1 className="text-xl font-semibold text-content">{t("title")}</h1>
					<p className="mt-1 text-sm text-content-muted">{t("subtitle")}</p>
				</div>
				{isOwnerOrAdmin && (
					<PrimaryButton onClick={handleSave} disabled={saving}>
						{saving ? t("saving") : t("save_changes")}
					</PrimaryButton>
				)}
			</header>

			{/* Bento grid */}
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{/* Organization details — spans 1 column */}
				<Card title={t("details")} icon={<Buildings size={14} weight="duotone" />}>
					<div className="space-y-1">
						<Row label={t("org_name")}>
							{isOwnerOrAdmin ? (
								<Input value={editName} onChange={setEditName} />
							) : (
								<span className="text-sm text-content">{organization.name}</span>
							)}
						</Row>
						<Row label={t("plan")}>
							<Pill tone="active">{PLAN_LABELS[organization.plan] || organization.plan}</Pill>
						</Row>
						<Row label={t("status")}>
							<Pill tone={organization.status === "active" ? "active" : "warn"}>
								{organization.status}
							</Pill>
						</Row>
						<Row label={t("created")}>
							<span className="text-sm text-content-secondary">
								{formatDate(organization.createdAt, locale)}
							</span>
						</Row>
					</div>
				</Card>

				{/* Environments — spans 2 columns on xl */}
				<div className="xl:col-span-2">
					<Card
						title={t("environments")}
						icon={<Globe size={14} weight="duotone" />}
						action={
							isOwnerOrAdmin && (
								<button
									type="button"
									onClick={() => setShowAddEnv(true)}
									className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-edge bg-surface-card px-3 text-xs font-medium text-content-secondary transition-colors hover:border-edge-focus hover:bg-surface-card-hover hover:text-content"
								>
									<Plus size={12} weight="bold" />
									{t("add")}
								</button>
							)
						}
					>
						{environments.length === 0 ? (
							<div className="rounded-xl border border-dashed border-edge py-8 text-center">
								<p className="text-sm text-content-muted">{t("no_environments")}</p>
								{isOwnerOrAdmin && (
									<button
										type="button"
										onClick={() => setShowAddEnv(true)}
										className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent-cta px-3 text-xs font-medium text-accent-text transition-colors hover:bg-accent-cta-hover"
									>
										<Plus size={12} weight="bold" />
										{t("add_first")}
									</button>
								)}
							</div>
						) : (
							<div className="space-y-2">
								{environments.map((env) => (
									<EnvironmentRow
										key={env.id}
										env={env}
										isCurrent={env.id === currentEnvId}
										isOwner={isOwner}
										onDelete={() => setEnvToDelete({ id: env.id, domain: env.domain })}
										onSaveLandingUrl={(url) => handleSaveLandingUrl(env.id, url)}
										onSwitch={() => handleSwitchEnv(env.id)}
									/>
								))}
							</div>
						)}
					</Card>
				</div>

				{/* Business profile — spans 2 columns on xl */}
				<div className="xl:col-span-2">
					<Card title={t("business_profile")}>
						{isOwnerOrAdmin ? (
							<div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
								<Row label={t("business_model")}>
									<CustomSelect
										value={editBusinessModel}
										onChange={setEditBusinessModel}
										options={Object.entries(BUSINESS_MODEL_LABELS).map(([k, v]) => ({
											value: k,
											label: v,
										}))}
										className="w-full max-w-[16rem]"
									/>
								</Row>
								<Row label={t("monthly_revenue")}>
									<Input
										value={editMonthlyRevenue}
										onChange={setEditMonthlyRevenue}
										type="number"
										prefix="$"
										placeholder="0"
									/>
								</Row>
								<Row label={t("avg_order_value")}>
									<Input
										value={editAov}
										onChange={setEditAov}
										type="number"
										prefix="$"
										placeholder="0"
									/>
								</Row>
								<Row label={t("monthly_transactions")}>
									<Input
										value={editMonthlyTxns}
										onChange={setEditMonthlyTxns}
										type="number"
										placeholder="0"
									/>
								</Row>
								<Row label={t("conversion_rate")}>
									<Input
										value={editConversionRate}
										onChange={setEditConversionRate}
										type="number"
										suffix="%"
										placeholder="0"
									/>
								</Row>
								<Row label={t("conversion_model")}>
									<CustomSelect
										value={editConversionModel}
										onChange={setEditConversionModel}
										options={Object.entries(CONVERSION_MODEL_LABELS).map(([k, v]) => ({
											value: k,
											label: v,
										}))}
										className="w-full max-w-[16rem]"
									/>
								</Row>
							</div>
						) : (
							<div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
								<Row label={t("business_model")}>
									<span className="text-sm text-content-secondary">
										{BUSINESS_MODEL_LABELS[businessProfile?.businessModel || ""] || "--"}
									</span>
								</Row>
								<Row label={t("monthly_revenue")}>
									<span className="text-sm text-content-secondary">
										{formatCurrency(businessProfile?.monthlyRevenue)}
									</span>
								</Row>
								<Row label={t("avg_order_value")}>
									<span className="text-sm text-content-secondary">
										{formatCurrency(businessProfile?.averageOrderValue)}
									</span>
								</Row>
								<Row label={t("monthly_transactions")}>
									<span className="text-sm text-content-secondary">
										{formatNumber(businessProfile?.monthlyTransactions)}
									</span>
								</Row>
								<Row label={t("conversion_rate")}>
									<span className="text-sm text-content-secondary">
										{formatPercent(businessProfile?.conversionRate)}
									</span>
								</Row>
								<Row label={t("conversion_model")}>
									<span className="text-sm text-content-secondary">
										{CONVERSION_MODEL_LABELS[businessProfile?.conversionModel || ""] || "--"}
									</span>
								</Row>
							</div>
						)}
					</Card>
				</div>

				{/* Members — spans full row */}
				<div className="md:col-span-2 xl:col-span-3">
					<Card
						title={t("members")}
						icon={<Users size={14} weight="duotone" />}
						action={
							<span className="text-[11px] text-content-muted">
								{t("member_count", { count: members.length })}
							</span>
						}
					>
						{members.length === 0 ? (
							<div className="rounded-xl border border-dashed border-edge py-6 text-center">
								<p className="text-sm text-content-muted">{t("no_members")}</p>
							</div>
						) : (
							<div className="overflow-x-auto">
								<table className="w-full text-left text-sm">
									<thead>
										<tr className="border-b border-edge">
											<th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-content-muted">
												{t("col_member")}
											</th>
											<th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-content-muted">
												{t("col_role")}
											</th>
											<th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-content-muted">
												{t("col_joined")}
											</th>
											{isOwner && (
												<th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-content-muted">
													{t("col_actions")}
												</th>
											)}
										</tr>
									</thead>
									<tbody>
										{members.map((member) => (
											<tr key={member.id} className="border-b border-edge/40 last:border-b-0">
												<td className="px-3 py-3">
													<div className="text-sm text-content">
														{member.name || t("unnamed")}
													</div>
													<div className="text-xs text-content-muted">{member.email}</div>
												</td>
												<td className="px-3 py-3">
													<Pill
														tone={
															member.role === "owner"
																? "active"
																: member.role === "admin"
																	? "info"
																	: "neutral"
														}
													>
														{member.role}
													</Pill>
												</td>
												<td className="px-3 py-3 text-xs text-content-muted">
													{formatDate(member.createdAt, locale)}
												</td>
												{isOwner && (
													<td className="px-3 py-3 text-right">
														{member.role !== "owner" ? (
															<IconButton
																icon={<Trash size={14} />}
																label={t("remove")}
																onClick={() =>
																	setMemberToRemove({
																		id: member.id,
																		label: member.name || member.email || t("unnamed"),
																	})
																}
																tone="danger"
															/>
														) : (
															<span className="text-xs text-content-faint">—</span>
														)}
													</td>
												)}
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</Card>
				</div>
			</div>

			{/* Modals */}
			{showAddEnv && (
				<AddEnvironmentPanel
					onClose={() => setShowAddEnv(false)}
					onCreated={() => fetchData()}
					currentEnvDomain={currentEnv?.domain}
				/>
			)}
			{envToDelete && (
				<ConfirmPanel
					title={t("delete_env_title")}
					description={t("delete_env_body", { domain: envToDelete.domain })}
					confirmLabel={t("delete_env_confirm")}
					loading={deleting}
					onConfirm={confirmDeleteEnv}
					onClose={() => setEnvToDelete(null)}
				/>
			)}
			{memberToRemove && (
				<ConfirmPanel
					title={t("remove_member_title")}
					description={t("remove_member_body", { name: memberToRemove.label })}
					confirmLabel={t("remove_member_confirm")}
					loading={deleting}
					onConfirm={confirmRemoveMember}
					onClose={() => setMemberToRemove(null)}
				/>
			)}
		</main>
	);
}

export default function OrganizationPage() {
	return (
		<Suspense fallback={null}>
			<OrganizationPageInner />
		</Suspense>
	);
}
