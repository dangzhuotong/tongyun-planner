import React, { useEffect, useState } from "react";

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
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(onDone, 300);
      }, 3000);
      return () => clearTimeout(timer);
    }, [onDone]);

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

        {/* Message */}
        <div className="animate-celebration-bounce bg-white/90 backdrop-blur-sm border border-[#EFEBE4] rounded-2xl px-8 py-5 shadow-xl pointer-events-auto select-none">
          <p className="text-lg font-bold text-[#2D323A] text-center whitespace-nowrap">
            {message}
          </p>
        </div>
      </div>
    );
  },
);
