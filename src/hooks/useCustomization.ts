import { useState, useCallback, useEffect, useMemo } from "react";
import type { CustomizationConfig } from "../types";
import { useSync } from "./useSync";

const DEFAULT_CUSTOMIZATION_CONFIG: CustomizationConfig = {
  qColors: {
    "urgent-important": "rose",
    "important-not-urgent": "mint",
    "urgent-not-important": "sky",
    "not-urgent-not-important": "yellow",
  },
  cardBackground: "white",
  pinType: "pin",
  interfaceGlass: "matte",
  watercolorStyle: "oasis",
  fontFamily: "sans",
  enableSunsetMode: true,
  sunsetStartHour: 18,
  sunsetEndHour: 6,
  sunsetWarmth: 50,
  weatherCity: "",
  darkMode: "light",
  aiApiKey: "",
  aiEndpoint: "https://api.openai.com/v1",
  aiModel: "gpt-4o",
  aiAutoCategorize: false,
  enableAutoBackup: true,
  enableCelebration: true,
      locale: (localStorage.getItem("tongyun_locale") === "en" ? "en" : "zh-CN") as "zh-CN" | "en",
};

export function useCustomization() {
  const { syncState } = useSync();
  const [customizationConfig, setCustomizationConfig] = useState<CustomizationConfig>(DEFAULT_CUSTOMIZATION_CONFIG);

  const handleConfigChange = useCallback((newConfig: CustomizationConfig) => {
    setCustomizationConfig(newConfig);
    // aero_customization_config 由 App.tsx 的 useDebouncedPersistence 统一落盘
    if (newConfig.locale) {
      localStorage.setItem("tongyun_locale", newConfig.locale);
    }
    syncState("settings", "settings_sync", JSON.stringify(newConfig));
  }, [syncState]);

  // Sunset mode auto-detection
  useEffect(() => {
    const checkSunsetTheme = () => {
      const enabled = customizationConfig.enableSunsetMode !== false;
      if (!enabled) {
        document.documentElement.classList.remove("theme-sunset");
        return;
      }
      const currentHour = new Date().getHours();
      const start = customizationConfig.sunsetStartHour ?? 18;
      const end = customizationConfig.sunsetEndHour ?? 6;

      let isSunset = false;
      if (start > end) {
        isSunset = currentHour >= start || currentHour < end;
      } else {
        isSunset = currentHour >= start && currentHour < end;
      }

      if (isSunset) {
        document.documentElement.classList.add("theme-sunset");
        document.documentElement.style.setProperty("--sunset-warmth", `${customizationConfig.sunsetWarmth ?? 50}%`);
      } else {
        document.documentElement.classList.remove("theme-sunset");
      }
    };

    checkSunsetTheme();
    const interval = setInterval(checkSunsetTheme, 60000);
    return () => clearInterval(interval);
  }, [customizationConfig.enableSunsetMode, customizationConfig.sunsetStartHour, customizationConfig.sunsetEndHour, customizationConfig.sunsetWarmth]);

  // Dark mode auto-detection
  useEffect(() => {
    const mode = customizationConfig.darkMode || "light";
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const updateTheme = () => {
      if (mode === "dark") {
        document.documentElement.classList.add("dark");
      } else if (mode === "light") {
        document.documentElement.classList.remove("dark");
      } else {
        if (mediaQuery.matches) {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
      }
    };

    updateTheme();

    if (mode === "auto") {
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener("change", updateTheme);
        return () => mediaQuery.removeEventListener("change", updateTheme);
      } else {
        mediaQuery.addListener(updateTheme);
        return () => mediaQuery.removeListener(updateTheme);
      }
    }
  }, [customizationConfig.darkMode]);

  return useMemo(() => ({
    customizationConfig,
    setCustomizationConfig,
    handleConfigChange,
    DEFAULT_CUSTOMIZATION_CONFIG,
  }), [customizationConfig, handleConfigChange]);
}
