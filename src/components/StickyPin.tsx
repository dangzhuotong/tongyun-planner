import React from "react";
import { Heart } from "lucide-react";

interface StickyPinProps {
  type: "pin" | "tape" | "clip" | "heart" | "smiley";
}

export const StickyPin: React.FC<StickyPinProps> = ({ type }) => {
  switch (type) {
    case "tape":
      // 和纸胶带 Washi Tape: 半透明温润质感、微撕裂边缘与暖纸纤维
      return (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-10 w-16 h-4.5 bg-[#F5E6C8]/80 dark:bg-[#6E5D42]/75 border-y border-[#D6C29E]/50 dark:border-[#968262]/50 backdrop-blur-[0.5px] shadow-[0_1px_3px_rgba(70,50,20,0.14)] -rotate-1 select-none pointer-events-none rounded-[1px] flex items-center justify-between px-1">
          <span className="text-[7px] text-[#A68F6B]/50 dark:text-[#D1BEA0]/40 select-none tracking-tighter">
            ⁞
          </span>
          <div className="w-8 h-[1px] bg-[#C4AC82]/35 dark:bg-[#A38E6A]/35" />
          <span className="text-[7px] text-[#A68F6B]/50 dark:text-[#D1BEA0]/40 select-none tracking-tighter">
            ⁞
          </span>
        </div>
      );
    case "clip":
      // 复古木质长尾夹/原木夹
      return (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10 w-3.5 h-8 bg-[#C8A26A] dark:bg-[#8A6A3F] border border-[#A67E48] shadow-[0_2px_4px_rgba(0,0,0,0.18)] rounded-xs flex flex-col justify-between py-1.5 items-center pointer-events-none select-none">
          <div className="w-2 h-0.5 bg-slate-600/80 rounded-full" />
          <div className="w-2.5 h-[1px] bg-slate-500/80" />
          <div className="w-2 h-0.5 bg-slate-600/80 rounded-full" />
        </div>
      );
    case "heart":
      // Heart Button Pin
      return (
        <div className="absolute top-[-10px] left-1/2 transform -translate-x-1/2 z-10 text-pink-400 drop-shadow-sm scale-110 pointer-events-none select-none animate-pulse">
          <Heart className="w-4.5 h-4.5 fill-pink-300 stroke-pink-400" />
        </div>
      );
    case "smiley":
      // Smiley Face Badge Magnet
      return (
        <div className="absolute top-[-10px] left-1/2 transform -translate-x-1/2 z-10 w-5 h-5 rounded-full bg-yellow-300 border border-yellow-400 shadow-sm flex items-center justify-center text-[10px] select-none pointer-events-none hover:scale-110 transition-transform">
          😊
        </div>
      );
    case "pin":
    default:
      // Classic Red Pushpin
      return (
        <div className="absolute top-[-11px] left-1/2 transform -translate-x-1/2 z-10 opacity-85 group-hover:opacity-100 transition-opacity pointer-events-none select-none">
          <div className="w-4.5 h-4.5 rounded-full bg-red-400 border-2 border-white shadow-sm flex items-center justify-center relative">
            <div className="w-1.5 h-1.5 rounded-full bg-red-600 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]" />
            {/* Pin needle body */}
            <div className="absolute w-0.5 h-3 bg-slate-400/90 rotate-12 origin-top top-3" />
          </div>
        </div>
      );
  }
};
