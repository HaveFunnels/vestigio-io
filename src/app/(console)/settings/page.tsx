"use client";

import { useTranslations } from "next-intl";
import { SUPPORTED_LANGUAGES } from "@/i18n/supported-locales";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSelectedLangCode, switchLanguage } from "@/components/Header/action";
import Image from "next/image";

// ──────────────────────────────────────────────
// Settings page — shows org/env configuration
// Includes language selector for the platform.
// ──────────────────────────────────────────────

export default function SettingsPage() {
  const t = useTranslations("console.settings");

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-zinc-100">{t("title")}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t("subtitle")}</p>
      </div>

      {/* Language */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">
          {t("language.title")}
        </h2>
        <p className="mb-4 text-sm text-zinc-500">{t("language.description")}</p>
        <LanguageSelector />
      </section>

      {/* Domains — empty state until DB connected */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">
          {t("domains.title")}
        </h2>
        <div className="rounded-md border border-zinc-800 px-6 py-8 text-center">
          <p className="text-sm text-zinc-500">{t("domains.description")}</p>
        </div>
      </section>

      {/* Data Overview — populated after first audit */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">
          {t("data_overview.title")}
        </h2>
        <div className="rounded-md border border-zinc-800 px-6 py-8 text-center">
          <p className="text-sm text-zinc-500">
            {t("data_overview.description")}
          </p>
        </div>
      </section>

      {/* Account */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">
          {t("account.title")}
        </h2>
        <p className="text-sm text-zinc-500">{t("account.description")}</p>
      </section>
    </div>
  );
}

// ──────────────────────────────────────────────
// Language Selector — inline dropdown for /app/settings
// ──────────────────────────────────────────────

function LanguageSelector() {
  const t = useTranslations("console.settings.language");
  const router = useRouter();
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

  function handleSelect(code: string) {
    setSelectedCode(code);
    setIsOpen(false);
    switchLanguage(code);
    router.refresh();
  }

  return (
    <div className="relative inline-block w-full max-w-xs">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 transition-colors hover:border-zinc-600"
      >
        <span className="flex items-center gap-3">
          <Image
            src={`/images/flags/${selectedCode}.svg`}
            width={20}
            height={20}
            alt={selectedLang?.name || ""}
            className="size-5 rounded-full object-cover"
          />
          {selectedLang?.name || selectedCode}
        </span>
        <svg
          className={`h-4 w-4 text-zinc-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {isOpen && (
        <ul className="absolute z-20 mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-lg">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <li key={lang.code}>
              <button
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-zinc-800 ${
                  lang.code === selectedCode
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-400"
                }`}
                onClick={() => handleSelect(lang.code)}
              >
                <Image
                  src={`/images/flags/${lang.code}.svg`}
                  width={20}
                  height={20}
                  alt={lang.name}
                  className="size-5 rounded-full object-cover"
                />
                <span>{lang.name}</span>
                {lang.code === selectedCode && (
                  <svg className="ml-auto h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
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
