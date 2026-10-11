import { useEffect, useRef } from "react";

/**
 * 把状态变更后的 localStorage 写入做防抖合并。
 * 避免「状态一变就全量 JSON.stringify + 写磁盘」导致的大对象（如 base64 图片附件）卡顿。
 *
 * 注意：组件卸载或页面关闭（pagehide）时，若防抖窗口内仍有待写入的值，
 * 会在卸载/关闭前同步 flush，避免最后一次修改丢失。
 */
export function useDebouncedPersistence<T>(value: T, key: string, delay = 250, enabled = true) {
  const timerRef = useRef<number | null>(null);
  const valueRef = useRef<T>(value);
  const pendingRef = useRef(false);

  const flush = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingRef.current) {
      pendingRef.current = false;
      try {
        localStorage.setItem(key, JSON.stringify(valueRef.current));
      } catch (e) {
        console.error("持久化失败", key, e);
      }
    }
  };

  useEffect(() => {
    if (!enabled) return;
    valueRef.current = value;
    pendingRef.current = true;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      pendingRef.current = false;
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        console.error("持久化失败", key, e);
      }
    }, delay);
  }, [value, key, delay, enabled]);

  // 页面关闭/隐藏前 flush 待写入数据，避免丢失
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
