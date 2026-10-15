import React, { useEffect, useState, useRef } from "react";
import { audioEngine } from "../utils/audioEngine";
import { VintageStamp } from "./journal/JournalStickers";

const CONFETTI_COLORS = [
  "#E8A0BF",
  "#C4D7B2",
  "#B2C8DF",
  "#F5DFDB",
  "#EFE5D3",
  "#A34E36",
  "#4D7C5D",
  "#8B6E3C",
  "#FCF2F0",
  "#5C528B",
];

interface ConfettiPiece {
  id: number;
  x: number;
  color: string;
  size: number;
  rotation: number;
  delay: number;
  duration: number;
}

interface CelebrationOverlayProps {
  message: string;
  onDone: () => void;
  task?: { id: string; title: string };
  onCompleteTask?: (taskId: string) => void;
}

export const CelebrationOverlay: React.FC<CelebrationOverlayProps> = React.memo(
  ({ message, onDone, task, onCompleteTask }) => {
    const [visible, setVisible] = useState(true);
    const onDoneRef = useRef(onDone);
    useEffect(() => {
      onDoneRef.current = onDone;
    }, [onDone]);

    const [pieces] = useState<ConfettiPiece[]>(() =>
      Array.from({ length: 60 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        size: 4 + Math.random() * 8,
        rotation: Math.random() * 360,
        delay: Math.random() * 0.5,
        duration: 1.5 + Math.random() * 2,
      })),
    );

    useEffect(() => {
      audioEngine.playStampSound();
      let innerTimer: ReturnType<typeof setTimeout> | null = null;
      const dismissDelay = task ? 4500 : 3000;
      const timer = setTimeout(() => {
        setVisible(false);
        innerTimer = setTimeout(() => {
          onDoneRef.current();
        }, 300);
      }, dismissDelay);

      return () => {
        clearTimeout(timer);
        if (innerTimer) clearTimeout(innerTimer);
      };
    }, [task]);

    if (!visible) return null;

    return (
      <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center">
        {/* Confetti */}
        {pieces.map((p) => (
          <div
            key={p.id}
            className="absolute top-0 animate-celebration-confetti"
            style={{
              left: `${p.x}%`,
              width: p.size,
              height: p.size * 0.6,
              backgroundColor: p.color,
              borderRadius: "2px",
              transform: `rotate(${p.rotation}deg)`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              opacity: 0,
            }}
          />
        ))}

        {/* Message & Stamp Seal */}
        <div className="animate-celebration-bounce bg-white/95 dark:bg-[#1C1D21]/95 backdrop-blur-md border border-[#EFEBE4] dark:border-[#383A42] rounded-2xl px-8 py-5 shadow-2xl pointer-events-auto select-none flex flex-col items-center gap-3 relative overflow-hidden">
          <div className="absolute inset-0 paper-dot-grid opacity-40 pointer-events-none" />

          {/* 朱砂红手帐复古印章 */}
          <div className="pt-1 pb-1 z-10">
            <VintageStamp type="done" size="lg" animated={true} />
          </div>

          <p className="text-base font-bold text-[#2D323A] dark:text-slate-100 text-center whitespace-nowrap z-10">
            {message}
          </p>

          {task && onCompleteTask && (
            <div className="z-10 flex flex-col items-center gap-2 mt-1">
              <div className="text-xs text-slate-500 dark:text-slate-400 bg-[#FAF8F5] dark:bg-[#26282E] px-3 py-1 rounded-lg border border-[#EFEBE4] dark:border-[#383A42] max-w-xs truncate">
                🎯 关联任务：
                <span className="font-bold text-slate-700 dark:text-slate-200">{task.title}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    onCompleteTask(task.id);
                    setVisible(false);
                    onDoneRef.current();
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-[#4D7C5D] hover:bg-[#3D634A] text-white text-xs font-bold shadow-sm transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                >
                  ✓ 顺便完成任务
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVisible(false);
                    onDoneRef.current();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-transparent hover:bg-slate-100 dark:hover:bg-[#26282E] text-slate-500 dark:text-slate-400 text-xs font-medium transition-colors cursor-pointer"
                >
                  稍后继续
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  },
);
