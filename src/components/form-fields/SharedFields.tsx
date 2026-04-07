"use client";

import { StyledDropdown } from "./StyledDropdown";
import {
	BUSINESS_TYPE_OPTIONS,
	CONVERSION_MODEL_OPTIONS,
	type BusinessType,
	type ConversionModel,
} from "./types";

// ──────────────────────────────────────────────
// Shared Form Fields
//
// Single source of truth for the form inputs that appear on BOTH the
// /onboard form (post-signup, pre-checkout) and the /lp/audit form
// (anonymous mini-audit lead capture).
//
// Visual style is locked to the dark zinc theme used in onboard so
// the two forms feel identical. If you tweak label color, border
// radius, focus ring, etc. — do it here, both forms update in sync.
//
// Each field is "controlled": it takes value + onChange + optional
// error/disabled props. State management lives in the parent. Validation
// helpers (parseRevenue, isValidPhone, isValidDomainFormat) live in
// ./types.ts so they can be called outside React too.
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
// Generic text field — used for org name, login url, free-text inputs
// ──────────────────────────────────────────────

interface TextFieldProps {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	type?: "text" | "url" | "email" | "tel";
	placeholder?: string;
	error?: string | null;
	hint?: string;
	optional?: boolean;
	autoComplete?: string;
}

export function TextField({
	id,
	label,
	value,
	onChange,
	type = "text",
	placeholder,
	error,
	hint,
	optional = false,
	autoComplete,
}: TextFieldProps) {
	return (
		<div>
			<label htmlFor={id} className="mb-1.5 block text-sm font-medium text-zinc-300">
				{label}{" "}
				{optional && <span className="text-zinc-500">(optional)</span>}
			</label>
			<input
				id={id}
				type={type}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				autoComplete={autoComplete}
				className={`w-full rounded-md border bg-zinc-900 px-4 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:ring-1 ${
					error
						? "border-red-600 focus:border-red-600 focus:ring-red-600"
						: "border-zinc-700 focus:border-emerald-600 focus:ring-emerald-600"
				}`}
			/>
			{error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
			{hint && !error && <p className="mt-1.5 text-xs text-zinc-500">{hint}</p>}
		</div>
	);
}

// ──────────────────────────────────────────────
// Domain field — text input + ownership checkbox bundled together
//
// The two are coupled because the audit can't run without ownership
// confirmation, so making them visually adjacent enforces the
// relationship. Both forms (/onboard and /lp/audit) need the same
// guarantee.
// ──────────────────────────────────────────────

interface DomainFieldProps {
	domain: string;
	onDomainChange: (value: string) => void;
	ownershipConfirmed: boolean;
	onOwnershipChange: (value: boolean) => void;
	error?: string | null;
	warning?: string | null;
}

export function DomainField({
	domain,
	onDomainChange,
	ownershipConfirmed,
	onOwnershipChange,
	error,
	warning,
}: DomainFieldProps) {
	return (
		<div className="space-y-4">
			<TextField
				id="domain"
				label="Domain"
				type="url"
				value={domain}
				onChange={onDomainChange}
				placeholder="https://example.com"
				error={error}
				autoComplete="url"
			/>
			{warning && !error && (
				<div className="rounded-md border border-amber-800/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
					{warning} — you can still proceed.
				</div>
			)}
			<OwnershipCheckbox
				checked={ownershipConfirmed}
				onChange={onOwnershipChange}
			/>
		</div>
	);
}

// ──────────────────────────────────────────────
// Ownership confirmation checkbox
// ──────────────────────────────────────────────

interface OwnershipCheckboxProps {
	checked: boolean;
	onChange: (checked: boolean) => void;
}

export function OwnershipCheckbox({ checked, onChange }: OwnershipCheckboxProps) {
	return (
		<label className="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-700 bg-zinc-900 px-4 py-3 transition-colors hover:border-zinc-600">
			<input
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
				className="mt-0.5 h-4 w-4 cursor-pointer rounded border-zinc-600 bg-zinc-800 accent-emerald-500"
			/>
			<div className="text-xs leading-relaxed text-zinc-400">
				<span className="block font-medium text-zinc-200">
					I own this domain or have authorization to audit it
				</span>
				<span className="mt-0.5 block text-zinc-500">
					Vestigio will only crawl public pages. By checking this you confirm you have the right to analyze this site.
				</span>
			</div>
		</label>
	);
}

// ──────────────────────────────────────────────
// Business type dropdown — uses the styled dropdown
// (per product brief: "use our styled dropdown, not system")
// ──────────────────────────────────────────────

interface BusinessTypeFieldProps {
	value: BusinessType;
	onChange: (value: BusinessType) => void;
}

export function BusinessTypeField({ value, onChange }: BusinessTypeFieldProps) {
	return (
		<div>
			<label className="mb-1.5 block text-sm font-medium text-zinc-300">
				Business type
			</label>
			<StyledDropdown
				value={value}
				options={BUSINESS_TYPE_OPTIONS}
				onChange={onChange}
				placeholder="Choose a business type"
			/>
		</div>
	);
}

// ──────────────────────────────────────────────
// Conversion model dropdown
// ──────────────────────────────────────────────

interface ConversionModelFieldProps {
	value: ConversionModel;
	onChange: (value: ConversionModel) => void;
}

export function ConversionModelField({ value, onChange }: ConversionModelFieldProps) {
	return (
		<div>
			<label className="mb-1.5 block text-sm font-medium text-zinc-300">
				Conversion model
			</label>
			<StyledDropdown
				value={value}
				options={CONVERSION_MODEL_OPTIONS}
				onChange={onChange}
				placeholder="Choose a conversion model"
			/>
		</div>
	);
}

// ──────────────────────────────────────────────
// Revenue field — text input that accepts "$50k", "1.5m", etc.
// Parsing happens at submit time via parseRevenue() from ./types.
// ──────────────────────────────────────────────

interface RevenueFieldProps {
	value: string;
	onChange: (value: string) => void;
	label?: string;
	placeholder?: string;
	optional?: boolean;
	error?: string | null;
}

export function RevenueField({
	value,
	onChange,
	label = "Monthly revenue",
	placeholder = "e.g. $50k",
	optional = true,
	error,
}: RevenueFieldProps) {
	return (
		<TextField
			id="monthlyRevenue"
			label={label}
			type="text"
			value={value}
			onChange={onChange}
			placeholder={placeholder}
			optional={optional}
			error={error}
		/>
	);
}

// ──────────────────────────────────────────────
// Average ticket field — same shape as revenue, different label.
// ──────────────────────────────────────────────

interface AverageTicketFieldProps {
	value: string;
	onChange: (value: string) => void;
	error?: string | null;
}

export function AverageTicketField({ value, onChange, error }: AverageTicketFieldProps) {
	return (
		<TextField
			id="averageTicket"
			label="Average order value"
			type="text"
			value={value}
			onChange={onChange}
			placeholder="e.g. $120"
			optional
			error={error}
		/>
	);
}

// ──────────────────────────────────────────────
// Phone field
// ──────────────────────────────────────────────

interface PhoneFieldProps {
	value: string;
	onChange: (value: string) => void;
	error?: string | null;
	optional?: boolean;
}

export function PhoneField({ value, onChange, error, optional = true }: PhoneFieldProps) {
	return (
		<TextField
			id="phone"
			label="Phone number"
			type="tel"
			value={value}
			onChange={onChange}
			placeholder="+5511999999999"
			error={error}
			hint="International format. Required only if you enable SMS or WhatsApp."
			optional={optional}
			autoComplete="tel"
		/>
	);
}

// ──────────────────────────────────────────────
// Email field — used by /lp/audit step 4 ("insert to see results")
// ──────────────────────────────────────────────

interface EmailFieldProps {
	value: string;
	onChange: (value: string) => void;
	error?: string | null;
	label?: string;
	placeholder?: string;
}

export function EmailField({
	value,
	onChange,
	error,
	label = "Email",
	placeholder = "you@company.com",
}: EmailFieldProps) {
	return (
		<TextField
			id="email"
			label={label}
			type="email"
			value={value}
			onChange={onChange}
			placeholder={placeholder}
			error={error}
			autoComplete="email"
		/>
	);
}
