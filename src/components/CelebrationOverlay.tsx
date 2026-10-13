import React, { useEffect, useState, useRef } from "react";
import { audioEngine } from "../utils/audioEngine";

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
}

export const CelebrationOverlay: React.FC<CelebrationOverlayProps> = React.memo(
  ({ message, onDone }) => {
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
      const timer = setTimeout(() => {
        setVisible(false);
        innerTimer = setTimeout(() => {
          onDoneRef.current();
        }, 300);
      }, 3000);

      return () => {
        clearTimeout(timer);
        if (innerTimer) clearTimeout(innerTimer);
      };
    }, []);

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

          {/* 朱砂红手帐印章 */}
          <div className="seal-stamp w-13 h-13 rounded-xl border-2 border-[#C0392B] dark:border-[#E74C3C] bg-red-50/60 dark:bg-red-950/40 flex items-center justify-center shadow-xs">
            <div className="w-10 h-10 rounded-lg border border-dashed border-[#C0392B]/80 dark:border-[#E74C3C]/80 flex flex-col items-center justify-center">
              <span className="text-[14px] font-black tracking-widest text-[#C0392B] dark:text-[#FF6B6B] leading-none">
                達成
              </span>
              <span className="text-[6.5px] font-bold text-[#C0392B]/75 dark:text-[#FF6B6B]/75 tracking-tighter scale-90">
                TONGYUN
              </span>
            </div>
          </div>

          <p className="text-base font-bold text-[#2D323A] dark:text-slate-100 text-center whitespace-nowrap z-10">
            {message}
          </p>
        </div>
      </div>
    );
  },
);
