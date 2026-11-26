import { useEffect, useState } from "react";
import { getLocalDateString } from "../utils/date";

/** Refresh daily views across midnight and when returning from sleep. */
export function useLocalToday() {
  const [today, setToday] = useState(getLocalDateString);
  useEffect(() => {
    const refresh = () => setToday(getLocalDateString());
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return today;
}
