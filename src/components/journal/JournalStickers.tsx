import React from "react";
import { motion } from "framer-motion";

export type StampType = "done" | "great" | "pass" | "fast" | "super";

export const STAMP_PRESETS: Record<
  StampType,
  { label: string; sub: string; rotate: number; color: string }
> = {
  done: { label: "完工", sub: "DONE", rotate: -8, color: "#A33A2C" },
  great: { label: "大吉", sub: "GREAT", rotate: 6, color: "#C0392B" },
  pass: { label: "及格", sub: "PASS", rotate: -12, color: "#962D22" },
  fast: { label: "神速", sub: "FAST", rotate: 10, color: "#B03A2E" },
  super: { label: "行云", sub: "FLOW", rotate: -5, color: "#78281F" },
};

export const VintageStamp: React.FC<{
  type?: StampType | string;
  size?: "sm" | "md" | "lg";
  className?: string;
  animated?: boolean;
}> = ({ type = "done", size = "md", className = "", animated = false }) => {
  const preset = STAMP_PRESETS[type as StampType] || STAMP_PRESETS.done;

  const sizeClasses = {
    sm: "px-2 py-0.5 text-[9px] border-1.5 rounded-md",
    md: "px-3 py-1 text-xs border-2 rounded-lg",
    lg: "px-4.5 py-1.5 text-sm border-2.5 rounded-xl",
  };

  const content = (
    <div
      className={`inline-flex items-center gap-1 font-serif font-black tracking-widest border border-dashed select-none shadow-sm ${sizeClasses[size]} ${className}`}
      style={{
        borderColor: preset.color,
        color: preset.color,
        backgroundColor: `${preset.color}08`,
        transform: `rotate(${preset.rotate}deg)`,
        textShadow: `0 0 1px ${preset.color}60`,
      }}
    >
      <span className="text-[9px] opacity-70">印</span>
      <span>{preset.label}</span>
      <span className="text-[8px] font-mono tracking-tighter opacity-80 uppercase">
        {preset.sub}
      </span>
    </div>
  );

  if (animated) {
    return (
      <motion.div
        initial={{ scale: 2.2, opacity: 0, rotate: preset.rotate - 15 }}
        animate={{ scale: 1, opacity: 1, rotate: preset.rotate }}
        transition={{ type: "spring", stiffness: 450, damping: 20 }}
      >
        {content}
      </motion.div>
    );
  }

  return content;
};

export type WashiTapeType = "bamboo" | "sakura" | "kraft" | "cloud";

export const WASHI_TAPE_PRESETS: Record<WashiTapeType, { name: string; style: React.CSSProperties }> = {
  bamboo: {
    name: "青竹格纹",
    style: {
      backgroundColor: "rgba(120, 168, 135, 0.4)",
      backgroundImage:
        "repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(255,255,255,0.4) 6px, rgba(255,255,255,0.4) 12px)",
    },
  },
  sakura: {
    name: "和风落樱",
    style: {
      backgroundColor: "rgba(235, 140, 155, 0.35)",
      backgroundImage:
        "radial-gradient(circle, rgba(255,255,255,0.6) 1.5px, transparent 1.5px)",
      backgroundSize: "10px 10px",
    },
  },
  kraft: {
    name: "复古牛皮",
    style: {
      backgroundColor: "rgba(196, 154, 108, 0.45)",
      backgroundImage:
        "linear-gradient(90deg, rgba(255,255,255,0.2) 0%, transparent 50%, rgba(0,0,0,0.05) 100%)",
    },
  },
  cloud: {
    name: "暮云青灰",
    style: {
      backgroundColor: "rgba(140, 155, 175, 0.35)",
      backgroundImage:
        "repeating-linear-gradient(-45deg, transparent, transparent 8px, rgba(255,255,255,0.3) 8px, rgba(255,255,255,0.3) 14px)",
    },
  },
};

export const WashiTape: React.FC<{
  type?: WashiTapeType | string;
  width?: string;
  className?: string;
}> = ({ type = "bamboo", width = "96px", className = "" }) => {
  const preset = WASHI_TAPE_PRESETS[type as WashiTapeType] || WASHI_TAPE_PRESETS.bamboo;

  return (
    <div
      className={`h-4 shadow-sm select-none pointer-events-none relative ${className}`}
      style={{
        width,
        ...preset.style,
        clipPath:
          "polygon(0% 15%, 4% 0%, 96% 0%, 100% 20%, 98% 85%, 94% 100%, 6% 100%, 0% 80%)",
        opacity: 0.85,
      }}
    />
  );
};

export const JOURNAL_STICKER_EMOJIS = ["☕", "🌱", "🌧️", "🏮", "✨", "🐱", "🌸", "🏆", "💡", "🍵", "🌙", "🌊"];
