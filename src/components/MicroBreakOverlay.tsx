import React, { useEffect, useState, useRef } from "react";
import { Trees, Sparkles, CupSoda, Wind, Eye, RotateCw } from "lucide-react";
import { useTranslation } from "../i18n/LanguageContext";
import { type MicroBreakContent, getRandomMicroBreakTheme } from "../utils/microBreak";

interface MicroBreakOverlayProps {
  onSkip: () => void;
  durationSec?: number;
  initialTheme?: MicroBreakContent;
}

export const MicroBreakOverlay: React.FC<MicroBreakOverlayProps> = React.memo(
  ({ onSkip, durationSec = 5, initialTheme }) => {
    const { t } = useTranslation();
    const mb = t.microBreak || {};
    const [secondsLeft, setSecondsLeft] = useState(durationSec);
    const [currentTheme, setCurrentTheme] = useState<MicroBreakContent>(() => {
      return initialTheme || getRandomMicroBreakTheme();
    });
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
          e.stopPropagation();
          onSkipRef.current();
        }
      };

      window.addEventListener("keydown", handleKeyDown);

      return () => {
        clearInterval(interval);
        window.removeEventListener("keydown", handleKeyDown);
      };
    }, []);

    // 切换下一个随机动作
    const handleSwitchTheme = (e: React.MouseEvent) => {
      e.stopPropagation();
      setCurrentTheme((prev) => getRandomMicroBreakTheme(prev.id));
    };

    // SVG Circular countdown math
    const radius = 32;
    const circumference = 2 * Math.PI * radius; // ~201.06
    const strokeDashoffset = circumference - (secondsLeft / durationSec) * circumference;

    const renderIcon = () => {
      switch (currentTheme.id) {
        case "water":
          return <CupSoda className="w-10 h-10 drop-shadow-sm" />;
        case "stretch":
          return <Sparkles className="w-10 h-10 drop-shadow-sm" />;
        case "breathe":
          return <Wind className="w-10 h-10 drop-shadow-sm" />;
        case "eyes":
          return <Eye className="w-10 h-10 drop-shadow-sm" />;
        case "look-away":
        default:
          return <Trees className="w-10 h-10 drop-shadow-sm" />;
      }
    };

    return (
      <div
        className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-stone-900/45 dark:bg-black/65 backdrop-blur-md animate-fade-in select-none cursor-pointer"
        role="dialog"
        aria-modal="true"
        aria-label={currentTheme.title}
        onClick={onSkip}
      >
        {/* Soft floating paper card (手帐质感暖纸卡片) */}
        <div
          className="relative max-w-sm w-full mx-auto p-7 rounded-3xl bg-[#FDFBF7] dark:bg-[#1E2024] border border-[#E5DEC9] dark:border-[#33353A] shadow-2xl flex flex-col items-center text-center overflow-hidden animate-celebration-bounce cursor-default"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Subtle paper dot grid */}
          <div className="absolute inset-0 paper-dot-grid opacity-35 pointer-events-none" />

          {/* Top washi tape deco (手帐和纸胶带质感) */}
          <div
            className={`absolute top-0 left-1/2 -translate-x-1/2 w-32 h-3.5 border-b rounded-b-md pointer-events-none transition-colors duration-300 ${currentTheme.tapeColor}`}
          />

          {/* Theme visual badge */}
          <div className="relative mb-2.5 mt-2 flex items-center justify-center">
            {/* Ambient breathing pulses */}
            <div className="absolute w-28 h-28 rounded-full bg-emerald-500/10 dark:bg-emerald-400/10 animate-ping opacity-60 pointer-events-none" />
            <div className="absolute w-24 h-24 rounded-full bg-stone-500/10 dark:bg-stone-400/10 animate-pulse pointer-events-none" />

            {/* Circular badge window */}
            <div
              className={`relative w-20 h-20 rounded-full bg-gradient-to-b ${currentTheme.badgeFrom} border-2 ${currentTheme.borderColor} ${currentTheme.iconColor} flex items-center justify-center shadow-inner transition-all duration-300`}
            >
              {renderIcon()}
              <span className="absolute -top-1 -right-1 text-base">{currentTheme.emoji}</span>
            </div>
          </div>

          {/* Circular SVG 5-second countdown timer */}
          <div className="relative w-16 h-16 flex items-center justify-center my-1">
            <svg className="w-16 h-16 -rotate-90 transform" viewBox="0 0 76 76">
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
              <span className="text-xl font-black text-[#2D323A] dark:text-slate-100 tabular-nums leading-none">
                {secondsLeft}
              </span>
              <span className="text-[9px] text-stone-400 dark:text-stone-500 font-bold mt-0.5">
                {mb.remainingSec || "秒"}
              </span>
            </div>
          </div>

          {/* Heading */}
          <h3 className="text-base font-bold text-[#2D323A] dark:text-slate-100 flex items-center gap-1.5 justify-center z-10">
            <span>{currentTheme.emoji}</span>
            <span>{currentTheme.title}</span>
          </h3>

          {/* Action Callout (关键行动指导) */}
          <div className="mt-2 px-3 py-1.5 rounded-xl bg-stone-100 dark:bg-[#282B32] border border-stone-200 dark:border-stone-700/80 text-xs font-semibold text-stone-800 dark:text-stone-200 z-10">
            👉 {currentTheme.actionText}
          </div>

          {/* Description */}
          <p className="text-xs text-stone-600 dark:text-stone-400 mt-2 px-2 leading-relaxed z-10">
            {currentTheme.description}
          </p>

          {/* Science Tip Tag */}
          <div className="mt-3 py-1 px-3 rounded-xl bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 text-[10px] text-amber-800 dark:text-amber-200 font-medium z-10 leading-snug">
            💡 {currentTheme.tip}
          </div>

          {/* Action Buttons: 换个动作 + 跳过 */}
          <div className="mt-4 w-full flex items-center justify-center gap-2 z-10">
            <button
              type="button"
              onClick={handleSwitchTheme}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-stone-100 bg-stone-100 hover:bg-stone-200 dark:bg-[#282B32] dark:hover:bg-[#343842] border border-stone-200 dark:border-stone-700 transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
              title="随机换一个微休息动作（喝水、眺望、拉伸、深呼吸）"
            >
              <RotateCw className="w-3 h-3 text-stone-400" />
              <span>换个动作</span>
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="px-3.5 py-1 rounded-full text-[11px] font-medium text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 bg-stone-100/90 hover:bg-stone-200/90 dark:bg-[#282B32] dark:hover:bg-[#343842] border border-stone-200 dark:border-stone-700 transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <span>{mb.skip || "跳过休息"}</span>
              <span className="text-[9px] px-1 py-0.2 rounded bg-stone-200 dark:bg-stone-700 text-stone-500 dark:text-stone-400 font-mono">
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
