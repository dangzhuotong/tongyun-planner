import React, { createContext, useContext, useState, useCallback } from "react";
import type { Locale } from "../types";
import type { Translations } from "./types";
import zhCN from "./zh-CN";
import en from "./en";

const TRANSLATIONS: Record<Locale, Translations> = {
  "zh-CN": zhCN,
  en: en,
};

interface LanguageContextType {
  locale: Locale;
  t: Translations;
  setLocale: (locale: Locale) => void;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export const LanguageProvider: React.FC<{ children: React.ReactNode; initialLocale?: Locale }> = ({
  children,
  initialLocale = "zh-CN",
}) => {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem("tongyun_locale", newLocale);
  }, []);

  const value: LanguageContextType = {
    locale,
    t: TRANSLATIONS[locale],
    setLocale,
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export function useTranslation(): LanguageContextType {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useTranslation must be used within a LanguageProvider");
  }
  return ctx;
}
