import React, { useEffect, useState, useRef } from "react";
import { Trees, Sparkles } from "lucide-react";
import { useTranslation } from "../i18n/LanguageContext";

interface MicroBreakOverlayProps {
  onSkip: () => void;
  durationSec?: number;
}

export const MicroBreakOverlay: React.FC<MicroBreakOverlayProps> = React.memo(
  ({ onSkip, durationSec = 5 }) => {
    const { t } = useTranslation();
    const mb = t.microBreak || {};
    const [secondsLeft, setSecondsLeft] = useState(durationSec);
    const onSkipRef = useRef(onSkip);

    useEffect(() => {
      onSkipRef.current = onSkip;
    }, [onSkip]);

    useEffect(() => {
      const interval = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onSkipRef.current();
        }
      };

      window.addEventListener("keydown", handleKeyDown);

      return () => {
        clearInterval(interval);
        window.removeEventListener("keydown", handleKeyDown);
      };
    }, []);

    // SVG Circular countdown math
    const radius = 32;
    const circumference = 2 * Math.PI * radius; // ~201.06
    const strokeDashoffset = circumference - (secondsLeft / durationSec) * circumference;

    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/40 dark:bg-black/60 backdrop-blur-md animate-fade-in select-none"
        role="dialog"
        aria-modal="true"
        aria-label={mb.title || "微休息时刻"}
      >
        {/* Soft floating paper card */}
        <div className="relative max-w-sm w-full mx-auto p-7 rounded-3xl bg-[#FDFBF7] dark:bg-[#1E2024] border border-[#E5DEC9] dark:border-[#33353A] shadow-2xl flex flex-col items-center text-center overflow-hidden animate-celebration-bounce">
          {/* Subtle paper dot grid */}
          <div className="absolute inset-0 paper-dot-grid opacity-35 pointer-events-none" />

          {/* Top washi tape deco (手帐和纸胶带质感) */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-3.5 bg-[#4D7C5D]/20 dark:bg-[#4D7C5D]/30 border-b border-[#4D7C5D]/30 rounded-b-md pointer-events-none" />

          {/* Calming nature / window view visual badge */}
          <div className="relative mb-3 mt-2 flex items-center justify-center">
            {/* Ambient breathing pulses */}
            <div className="absolute w-28 h-28 rounded-full bg-[#4D7C5D]/10 dark:bg-[#4D7C5D]/20 animate-ping opacity-60 pointer-events-none" />
            <div className="absolute w-24 h-24 rounded-full bg-emerald-500/10 dark:bg-emerald-400/15 animate-pulse pointer-events-none" />

            {/* Circular window with trees & sky */}
            <div className="relative w-20 h-20 rounded-full bg-gradient-to-b from-[#EBF5EE] to-[#DCEDE1] dark:from-[#212E24] dark:to-[#17221A] border-2 border-[#4D7C5D]/35 flex items-center justify-center shadow-inner">
              <Trees className="w-10 h-10 text-[#4D7C5D] dark:text-[#78A887] drop-shadow-sm" />
              <Sparkles className="w-3.5 h-3.5 text-amber-500 absolute top-2.5 right-3 animate-pulse" />
            </div>
          </div>

          {/* Circular SVG 5-second countdown timer */}
          <div className="relative w-20 h-20 flex items-center justify-center my-1">
            <svg className="w-20 h-20 -rotate-90 transform" viewBox="0 0 76 76">
              {/* Background ring */}
              <circle
                cx="38"
                cy="38"
                r={radius}
                stroke="currentColor"
                strokeWidth="4"
                className="text-stone-200/90 dark:text-stone-700/60 fill-none"
              />
              {/* Animated countdown ring */}
              <circle
                cx="38"
                cy="38"
                r={radius}
                stroke="#4D7C5D"
                strokeWidth="4"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="fill-none transition-all duration-1000 ease-linear dark:stroke-[#78A887]"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-black text-[#2D323A] dark:text-slate-100 tabular-nums leading-none">
                {secondsLeft}
              </span>
              <span className="text-[10px] text-stone-400 dark:text-stone-500 font-bold mt-0.5">
                {mb.remainingSec || "秒"}
              </span>
            </div>
          </div>

          {/* Heading */}
          <h3 className="text-base font-bold text-[#2D323A] dark:text-slate-100 flex items-center gap-1.5 justify-center z-10">
            <span>🌿</span>
            <span>{mb.title || "微休息时刻 · 眺望窗外"}</span>
          </h3>

          {/* Subtitle / Eye care advice */}
          <p className="text-xs text-stone-600 dark:text-stone-300 mt-2 px-3 leading-relaxed z-10">
            {mb.subtitle || "将视线移向窗外 6 米远方，深呼吸，让眼球睫状肌彻底放松"}
          </p>

          {/* 20-20-20 Rule Tag */}
          <div className="mt-3.5 py-1.5 px-3 rounded-xl bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 text-[11px] text-amber-800 dark:text-amber-200 font-medium z-10">
            💡 {mb.ruleTip || "20-20-20 科学护眼：每专注 20 分钟，远眺 20 英尺（6米）20 秒"}
          </div>

          {/* Skip Action */}
          <div className="mt-5 w-full flex justify-center z-10">
            <button
              type="button"
              onClick={onSkip}
              className="px-4 py-1.5 rounded-full text-xs font-medium text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 bg-stone-100/90 hover:bg-stone-200/90 dark:bg-[#282B32] dark:hover:bg-[#343842] border border-stone-200 dark:border-stone-700 transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <span>{mb.skip || "跳过休息"}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-200 dark:bg-stone-700 text-stone-500 dark:text-stone-400 font-mono">
                Esc
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  },
);

MicroBreakOverlay.displayName = "MicroBreakOverlay";
