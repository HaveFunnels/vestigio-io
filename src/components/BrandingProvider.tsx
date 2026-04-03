"use client";

import { createContext, useContext, useEffect, useState } from "react";

interface ImageValue {
  dataUrl: string;
  filename: string;
  size: number;
}

interface BrandingData {
  logo_light: ImageValue | null;
  logo_dark: ImageValue | null;
  favicon: ImageValue | null;
  og_image: ImageValue | null;
}

const DEFAULT: BrandingData = {
  logo_light: null,
  logo_dark: null,
  favicon: null,
  og_image: null,
};

const BrandingContext = createContext<BrandingData>(DEFAULT);

export function useBranding() {
  return useContext(BrandingContext);
}

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<BrandingData>(DEFAULT);

  useEffect(() => {
    fetch("/api/branding")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.branding) setBranding({ ...DEFAULT, ...json.branding });
      })
      .catch(() => {});
  }, []);

  return (
    <BrandingContext.Provider value={branding}>
      {children}
    </BrandingContext.Provider>
  );
}
