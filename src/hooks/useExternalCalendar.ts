import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { storage } from "../utils/unifiedStorage";
import { CALENDAR_LIMIT, parseCalendarEvents } from "../utils/calendar/externalCalendar";

const SOURCE = "tongyun_external_calendar_source";
const REFRESHED = "tongyun_external_calendar_refreshed";
const REFRESH_INTERVAL = 30 * 60_000;
const CONTENT = "tongyun_external_calendar_content";
const UPDATED = "tongyun-external-calendar-updated";

export function useExternalCalendar(date: string) {
  const [source, setSource] = useState("");
  const [text, setText] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const load = () => {
      const url = localStorage.getItem(SOURCE) ?? "";
      setSource(url);
      setDraft(url);
      setText(localStorage.getItem(CONTENT) ?? "");
    };
    void storage.init().then(() => {
      if (active) load();
    });
    const onUpdated = () => load();
    window.addEventListener(UPDATED, onUpdated);
    return () => {
      active = false;
      window.removeEventListener(UPDATED, onUpdated);
    };
  }, []);

  const range = useMemo(() => {
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }, [date]);
  const events = useMemo(() => {
    if (!text) return [];
    try {
      return parseCalendarEvents(text, range.start, range.end);
    } catch {
      return [];
    }
  }, [text, range]);

  useEffect(() => {
    if (!source) return;
    let active = true;
    let refreshing = false;
    const update = async () => {
      if (refreshing || Date.now() - Number(localStorage.getItem(REFRESHED)) < REFRESH_INTERVAL)
        return;
      refreshing = true;
      try {
        const content = await invoke<string>("fetch_calendar_feed", { url: source });
        if (!active || localStorage.getItem(SOURCE) !== source) return;
        parseCalendarEvents(content, range.start, range.end);
        localStorage.setItem(CONTENT, content);
        localStorage.setItem(REFRESHED, String(Date.now()));
        setText(content);
      } catch {
        // Keep the last valid copy when the subscription is unavailable.
      } finally {
        refreshing = false;
      }
    };
    void update();
    const timer = setInterval(update, REFRESH_INTERVAL);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [source, range]);

  function store(content: string, url: string) {
    parseCalendarEvents(content, range.start, range.end);
    localStorage.setItem(CONTENT, content);
    if (url) {
      localStorage.setItem(SOURCE, url);
      localStorage.setItem(REFRESHED, String(Date.now()));
    } else localStorage.removeItem(SOURCE);
    setText(content);
    setSource(url);
    setDraft(url);
    window.dispatchEvent(new Event(UPDATED));
  }

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  function importFile(file: File) {
    return run(async () => {
      if (file.size > CALENDAR_LIMIT) throw new Error("日历文件最大 2 MB");
      store(await file.text(), "");
    });
  }
  function refresh() {
    return run(async () => {
      const url = new URL(draft.trim().replace(/^webcal:/i, "https:"));
      if (url.protocol !== "https:" || url.username || url.password)
        throw new Error("请输入 HTTPS 日历订阅地址");
      const content = await invoke<string>("fetch_calendar_feed", { url: url.href });
      store(content, url.href);
    });
  }
  function clear() {
    localStorage.removeItem(SOURCE);
    localStorage.removeItem(CONTENT);
    localStorage.removeItem(REFRESHED);
    setSource("");
    setDraft("");
    setText("");
    setError("");
    window.dispatchEvent(new Event(UPDATED));
  }
  return {
    source,
    draft,
    setDraft,
    events,
    error,
    busy,
    importFile,
    refresh,
    clear,
    hasCalendar: Boolean(text),
  };
}
