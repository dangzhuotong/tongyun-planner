import { useState, useEffect } from "react";

export const MOBILE_BREAKPOINT = 768; // px

/**
 * Pure evaluation function for mobile viewport
 */
export function checkIsMobile(
  width: number = typeof window !== "undefined" ? window.innerWidth : 1024,
  forced?: boolean,
): boolean {
  if (forced !== undefined) return forced;
  if (typeof window !== "undefined" && localStorage.getItem("tongyun_force_mobile") === "true") {
    return true;
  }
  return width < MOBILE_BREAKPOINT;
}

/**
 * Hook to detect whether current viewport is mobile screen size (< 768px).
 * Also respects `tongyun_force_mobile` flag in localStorage for responsive preview.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => checkIsMobile());

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!window.matchMedia) {
      const handleResize = () => {
        setIsMobile(checkIsMobile(window.innerWidth));
      };
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }

    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const update = (e: MediaQueryListEvent | MediaQueryList) => {
      if (localStorage.getItem("tongyun_force_mobile") === "true") {
        setIsMobile(true);
      } else {
        setIsMobile(e.matches);
      }
    };

    if (mql.addEventListener) {
      mql.addEventListener("change", update);
      return () => mql.removeEventListener("change", update);
    } else {
      // Compatibility for legacy browser APIs
      const legacyMql = mql as unknown as {
        addListener: (fn: (e: MediaQueryList) => void) => void;
        removeListener: (fn: (e: MediaQueryList) => void) => void;
      };
      legacyMql.addListener(update);
      return () => legacyMql.removeListener(update);
    }
  }, []);

  return isMobile;
}
