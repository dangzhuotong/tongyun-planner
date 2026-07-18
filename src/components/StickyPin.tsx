import React from "react";
import { Heart } from "lucide-react";

interface StickyPinProps {
  type: "pin" | "tape" | "clip" | "heart" | "smiley";
}

export const StickyPin: React.FC<StickyPinProps> = ({ type }) => {
  switch (type) {
    case "tape":
      // Washi Tape: semi-transparent, rotated, soft washi paper texture
      return (
        <div className="absolute top-[-8px] left-1/2 transform -translate-x-1/2 z-10 w-14 h-4.5 bg-yellow-250/45 border border-yellow-300/20 shadow-xs -rotate-2 select-none pointer-events-none">
          {/* Subtle lines or jagged edges effect */}
          <div className="absolute inset-0 flex justify-between px-0.5 text-yellow-500/20 text-[6px] font-mono select-none">
            <span>|||</span>
            <span>|||</span>
          </div>
        </div>
      );
    case "clip":
      // Wooden Clothespin Peg Clip
      return (
        <div className="absolute top-[-15px] left-1/2 transform -translate-x-1/2 z-10 w-3 h-8 bg-[#D2B48C]/90 border border-[#C5A059]/40 shadow-xs rounded-xs flex flex-col justify-between py-1.5 items-center pointer-events-none select-none">
          <div className="w-1.5 h-0.5 bg-slate-500/80 rounded-full" />
          <div className="w-2 h-[1px] bg-slate-400" />
          <div className="w-1.5 h-0.5 bg-slate-500/80 rounded-full" />
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
