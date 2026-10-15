import React from "react";
import { motion } from "framer-motion";
import { Camera, Calendar } from "lucide-react";

interface PolaroidCardProps {
  imageSrc: string;
  caption?: string;
  date?: string;
  rotateDeg?: number;
  className?: string;
  onClick?: () => void;
}

export const PolaroidCard: React.FC<PolaroidCardProps> = ({
  imageSrc,
  caption,
  date,
  rotateDeg = -1.5,
  className = "",
  onClick,
}) => {
  return (
    <motion.div
      whileHover={{ scale: 1.02, rotate: 0 }}
      transition={{ type: "spring", stiffness: 350, damping: 25 }}
      onClick={onClick}
      className={`inline-block bg-[#FFFDF9] dark:bg-[#252830] p-3 pb-4 rounded-xl border border-[#E8E2D5] dark:border-[#383A42] shadow-[0_4px_16px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.3)] select-none cursor-pointer overflow-hidden ${className}`}
      style={{
        transform: `rotate(${rotateDeg}deg)`,
      }}
    >
      {/* 照片成像区 */}
      <div className="w-full aspect-[4/3] bg-slate-100 dark:bg-[#1E2026] rounded-md overflow-hidden relative shadow-inner flex items-center justify-center">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={caption || "今日拍立得"}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="text-slate-400 flex flex-col items-center gap-1">
            <Camera className="w-6 h-6 stroke-1" />
            <span className="text-[10px]">今日无照片</span>
          </div>
        )}
      </div>

      {/* 拍立得底部留白与手写手帐签名区 */}
      <div className="pt-2.5 px-1 flex items-center justify-between text-slate-500 dark:text-slate-400">
        <span className="text-xs font-serif italic truncate max-w-[180px]">
          {caption || "今日记影 · 橦云"}
        </span>
        {date && (
          <span className="text-[10px] font-mono tracking-tighter opacity-70 flex items-center gap-0.5">
            <Calendar className="w-2.5 h-2.5" />
            {date}
          </span>
        )}
      </div>
    </motion.div>
  );
};
