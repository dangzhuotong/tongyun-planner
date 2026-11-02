import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GripVertical, Link2, Plus, Radio, Trash2, X } from "lucide-react";
import { useTranslation } from "../i18n/LanguageContext";
import {
  appendCustomNoiseLink,
  clampWindowPosition,
  loadCustomNoiseLinks,
  loadCustomNoiseWindowPosition,
  removeCustomNoiseLink,
  saveCustomNoiseLinks,
  saveCustomNoiseWindowPosition,
  type CustomNoiseError,
  type CustomNoiseKind,
  type CustomNoiseLink,
  type WindowPosition,
} from "../utils/customNoise";

const PANEL_SIZE = { width: 320, height: 300 };
const EDGE_GAP = 24;

function viewportSize() {
  return { width: window.innerWidth, height: window.innerHeight };
}

function defaultPosition(): WindowPosition {
  const viewport = viewportSize();
  return clampWindowPosition(
    {
      x: viewport.width - PANEL_SIZE.width - EDGE_GAP,
      y: viewport.height - PANEL_SIZE.height - 96,
    },
    viewport,
    PANEL_SIZE,
  );
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `cn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const KIND_LABEL: Record<CustomNoiseKind, string> = {
  youtube: "YouTube",
  bilibili: "Bilibili",
  media: "Audio",
};

interface CustomNoiseWindowProps {
  onClose: () => void;
  /** 每次递增表示内置白噪音开始播放，外部播放器需要停下。 */
  stopSignal: number;
  /** 外部音源开始播放时，让侧边栏停掉内置白噪音。 */
  onStartExternal?: () => void;
}

export const CustomNoiseWindow: React.FC<CustomNoiseWindowProps> = ({
  onClose,
  stopSignal,
  onStartExternal,
}) => {
  const { t } = useTranslation();
  const s = t.sidebar;

  const [links, setLinks] = useState<CustomNoiseLink[]>(() => loadCustomNoiseLinks());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<CustomNoiseError | null>(null);
  const [dragging, setDragging] = useState(false);
  const [position, setPosition] = useState<WindowPosition>(() => {
    const stored = loadCustomNoiseWindowPosition();
    return clampWindowPosition(stored ?? defaultPosition(), viewportSize(), PANEL_SIZE);
  });

  const positionRef = useRef(position);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);

  const moveTo = useCallback((next: WindowPosition) => {
    positionRef.current = next;
    setPosition(next);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      moveTo(clampWindowPosition(positionRef.current, viewportSize(), PANEL_SIZE));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [moveTo]);

  // 关闭窗口或组件卸载时记住最后位置，重开时由本地存储恢复。
  useEffect(() => {
    return () => saveCustomNoiseWindowPosition(positionRef.current);
  }, []);

  // 内置白噪音开始播放时收起外部播放器（渲染期对齐，避免额外一次 effect 提交）。
  const [lastStopSignal, setLastStopSignal] = useState(stopSignal);
  if (lastStopSignal !== stopSignal) {
    setLastStopSignal(stopSignal);
    if (activeId !== null) setActiveId(null);
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, input, a, iframe, audio, video")) return;
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - positionRef.current.x,
      offsetY: event.clientY - positionRef.current.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    moveTo(
      clampWindowPosition(
        { x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY },
        viewportSize(),
        PANEL_SIZE,
      ),
    );
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    saveCustomNoiseWindowPosition(positionRef.current);
  };

  const handleAdd = (event: React.FormEvent) => {
    event.preventDefault();
    const result = appendCustomNoiseLink(links, input, createId());
    if (result.error) {
      setError(result.error);
      return;
    }
    saveCustomNoiseLinks(result.links);
    setLinks(result.links);
    setInput("");
    setError(null);
    setActiveId(result.link!.id);
    onStartExternal?.();
  };

  const handlePlay = (id: string) => {
    setActiveId(id);
    onStartExternal?.();
  };

  const handleRemove = (id: string) => {
    const next = removeCustomNoiseLink(links, id);
    saveCustomNoiseLinks(next);
    setLinks(next);
    if (activeId === id) setActiveId(null);
  };

  const errorText = useMemo(() => {
    if (!error) return "";
    const messages: Record<CustomNoiseError, string> = {
      empty: s.customNoiseErrEmpty,
      invalid: s.customNoiseErrInvalid,
      unsupported: s.customNoiseErrUnsupported,
      short: s.customNoiseErrShort,
      duplicate: s.customNoiseErrDuplicate,
    };
    return messages[error];
  }, [error, s]);

  const activeLink = links.find((link) => link.id === activeId) ?? null;

  return createPortal(
    <div
      data-testid="custom-noise-window"
      role="dialog"
      aria-label={s.customNoiseTitle}
      className="fixed z-[120] w-[320px] rounded-2xl border border-slate-200/80 dark:border-[#33353A] bg-white/95 dark:bg-[#1E2026]/95 backdrop-blur shadow-xl overflow-hidden text-slate-600 dark:text-slate-200"
      style={{ left: position.x, top: position.y }}
    >
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-[#2A2D35] bg-[#F6F5F0]/80 dark:bg-[#202228]/80 select-none ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        title={s.customNoiseDragHint}
      >
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-200">
          <GripVertical className="w-3.5 h-3.5 text-slate-400" />
          <Radio className="w-3.5 h-3.5 text-[#4D7C5D] dark:text-[#78C496]" />
          {s.customNoiseTitle}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="w-5 h-5 rounded-full bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center text-slate-500 dark:text-slate-300 transition-colors cursor-pointer"
          title={s.customNoiseClose}
          aria-label={s.customNoiseClose}
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      <div className="p-3 space-y-2">
        <form onSubmit={handleAdd} className="flex items-center gap-1.5">
          <div className="relative flex-grow">
            <Link2 className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                if (error) setError(null);
              }}
              placeholder={s.customNoisePlaceholder}
              aria-label={s.customNoisePlaceholder}
              spellCheck={false}
              className="w-full pl-6 pr-2 py-1.5 rounded-lg border border-slate-200 dark:border-[#33353A] bg-white dark:bg-[#252830] text-[10px] text-slate-600 dark:text-slate-200 outline-none focus:border-[#4D7C5D]/50 placeholder:text-slate-400"
            />
          </div>
          <button
            type="submit"
            className="shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[#4D7C5D]/10 dark:bg-[#4D7C5D]/20 hover:bg-[#4D7C5D]/20 dark:hover:bg-[#4D7C5D]/30 border border-[#4D7C5D]/20 dark:border-[#4D7C5D]/40 text-[#4D7C5D] dark:text-[#78C496] text-[10px] font-semibold transition-colors cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            {s.customNoiseAdd}
          </button>
        </form>

        {errorText && (
          <p role="alert" className="text-[10px] text-red-500 dark:text-red-400 leading-tight">
            {errorText}
          </p>
        )}

        {links.length === 0 ? (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 py-1">
            {s.customNoiseEmpty}
          </p>
        ) : (
          <ul className="space-y-1 max-h-[92px] overflow-y-auto custom-scrollbar">
            {links.map((link) => (
              <li key={link.id}>
                <div
                  className={`group flex items-center gap-1.5 rounded-lg border px-2 py-1 transition-colors ${
                    link.id === activeId
                      ? "border-[#4D7C5D]/30 dark:border-[#4D7C5D]/50 bg-[#4D7C5D]/10 dark:bg-[#4D7C5D]/20"
                      : "border-transparent hover:bg-slate-50 dark:hover:bg-[#252830]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handlePlay(link.id)}
                    className="flex-grow min-w-0 flex items-center gap-1.5 text-left cursor-pointer"
                    title={link.url}
                  >
                    <span className="shrink-0 px-1 py-0.5 rounded text-[8px] font-bold uppercase bg-slate-100 dark:bg-[#2E313A] text-slate-500 dark:text-slate-300">
                      {KIND_LABEL[link.kind]}
                    </span>
                    <span className="truncate text-[10px] font-medium">{link.title}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(link.id)}
                    className="shrink-0 w-4 h-4 rounded flex items-center justify-center text-slate-300 hover:text-red-400 dark:text-slate-500 dark:hover:text-red-400 transition-colors cursor-pointer"
                    title={s.customNoiseRemove}
                    aria-label={`${s.customNoiseRemove} ${link.title}`}
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {activeLink && (
          <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-[#33353A] bg-black/5 dark:bg-black/20">
            {activeLink.kind === "media" ? (
              /\.(mp4|webm|m3u8)$/i.test(activeLink.embedUrl.split(/[?#]/)[0]) ? (
                <video
                  key={activeLink.id}
                  src={activeLink.embedUrl}
                  controls
                  autoPlay
                  className="w-full h-[150px] bg-black"
                  data-testid="custom-noise-media"
                />
              ) : (
                <audio
                  key={activeLink.id}
                  src={activeLink.embedUrl}
                  controls
                  autoPlay
                  className="w-full h-8"
                  data-testid="custom-noise-media"
                />
              )
            ) : (
              <iframe
                key={activeLink.id}
                src={activeLink.embedUrl}
                title={activeLink.title}
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                referrerPolicy="no-referrer"
                seamless
                className="w-full h-[150px] bg-black"
                data-testid="custom-noise-embed"
              />
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};
