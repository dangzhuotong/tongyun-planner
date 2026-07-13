import React, { memo, useState } from "react";
import { StickyNote, Plus, Trash2, Pin, Search } from "lucide-react";
import type { StickyNote as StickyNoteType } from "../types";
import { StickyPin } from "./StickyPin";
import { useTranslation } from "../i18n/LanguageContext";

export const NOTE_COLORS = {
  tea: {
    bg: "bg-[#FAF5ED]",
    border: "border-[#EFE5D3]",
    text: "text-[#8B6E3C]",
    shadow: "shadow-[#FAF5ED]/30",
    accent: "#8B6E3C",
    dot: "bg-[#8B6E3C]",
  },
  rose: {
    bg: "bg-[#FCF2F0]",
    border: "border-[#F5DFDB]",
    text: "text-[#A34E36]",
    shadow: "shadow-[#FCF2F0]/30",
    accent: "#A34E36",
    dot: "bg-[#A34E36]",
  },
  mint: {
    bg: "bg-[#F0F5F1]",
    border: "border-[#DEEAE2]",
    text: "text-[#4D7C5D]",
    shadow: "shadow-[#F0F5F1]/30",
    accent: "#4D7C5D",
    dot: "bg-[#4D7C5D]",
  },
  lavender: {
    bg: "bg-[#F3F2F7]",
    border: "border-[#E5E2EE]",
    text: "text-[#5C528B]",
    shadow: "shadow-[#F3F2F7]/30",
    accent: "#5C528B",
    dot: "bg-[#5C528B]",
  },
  sky: {
    bg: "bg-[#EBF3F6]",
    border: "border-[#D0E2E8]",
    text: "text-[#366B80]",
    shadow: "shadow-[#EBF3F6]/30",
    accent: "#366B80",
    dot: "bg-[#366B80]",
  },
} as const;

interface StickyNotesViewProps {
  stickyNotes: StickyNoteType[];
  handleAddNote: () => void;
  handleEditNoteText: (id: string, text: string) => void;
  handleChangeNoteColor: (id: string, color: string) => void;
  handleDeleteNote: (id: string) => void;
  pinType?: "pin" | "tape" | "clip" | "heart" | "smiley";
  onPinNoteToDesktop?: (id: string) => void;
}

export const StickyNotesView: React.FC<StickyNotesViewProps> = memo(({
  stickyNotes,
  handleAddNote,
  handleEditNoteText,
  handleChangeNoteColor,
  handleDeleteNote,
  pinType,
  onPinNoteToDesktop,
}) => {
  const { t } = useTranslation();
  const sn = t.stickyNotes;
  const [searchQuery, setSearchQuery] = useState("");
  const filteredNotes = stickyNotes.filter((n) =>
    n.text.toLowerCase().includes(searchQuery.toLowerCase())
  );
  return (
    <div className="flex flex-col gap-4 flex-grow z-10 relative select-none min-h-0">
      <div className="flex justify-between items-center bg-white/90 border border-[#EFEBE4] px-5 py-3 rounded-2xl shadow-sm ">
        <div>
          <h3 className="text-xs font-bold text-[#8B6E3C] tracking-wide flex items-center gap-1.5">
            <StickyNote className="w-4 h-4 text-[#8B6E3C]" />
            <span>{t.header.notes} ({stickyNotes.length})</span>
          </h3>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {t.header.notes}
          </p>
        </div>
        <button
          onClick={handleAddNote}
          className="bg-[#4D7C5D] hover:bg-[#3F684C] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-[0_2px_4px_rgba(77,124,93,0.1)] cursor-pointer hover:scale-105"
        >
          <Plus className="w-3.5 h-3.5" />
          {sn.add}
        </button>
      </div>

      {stickyNotes.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={sn.search}
            className="w-full bg-white/60 border border-[#EFEBE4] rounded-xl pl-9 pr-3 py-2 text-xs text-slate-700 placeholder-slate-400/60 focus:outline-none focus:border-[#C4B5A0] transition-colors"
          />
        </div>
      )}

      {filteredNotes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 overflow-y-auto overflow-x-hidden flex-1 min-h-0 content-start items-start px-2 py-2 -mx-2 -my-2 custom-scrollbar">
          {filteredNotes.map((note) => {
            const theme = NOTE_COLORS[note.color as keyof typeof NOTE_COLORS] || NOTE_COLORS.tea;
            return (
              <div
                key={note.id}
                style={{ transform: `rotate(${note.rotate}deg)` }}
                className={`group relative rounded-2xl border ${theme.bg} ${theme.border} ${theme.shadow} p-5 flex flex-col justify-between shadow-md transition-all duration-300 hover:scale-105 hover:shadow-lg min-h-[160px]`}
              >
                <StickyPin type={pinType || "pin"} />

                <textarea
                  value={note.text}
                  onChange={(e) => handleEditNoteText(note.id, e.target.value)}
                  placeholder={sn.add}
                  className={`w-full bg-transparent resize-none focus:outline-none text-xs font-semibold leading-relaxed placeholder-slate-400/60 custom-scrollbar flex-grow ${theme.text}`}
                  style={{ height: "100px" }}
                />

                <div className="flex items-center justify-between pt-3 border-t border-dashed border-slate-200/50 mt-2 opacity-0 group-hover:opacity-100 transition-all duration-300">
                  <div className="flex items-center gap-1.5">
                    {Object.entries(NOTE_COLORS).map(([colorKey, t]) => (
                      <button
                        key={colorKey}
                        onClick={() => handleChangeNoteColor(note.id, colorKey)}
                        className={`w-3.5 h-3.5 rounded-full ${t.bg} border ${t.border} transition-all hover:scale-110 cursor-pointer ${
                          note.color === colorKey ? "ring-1 ring-slate-400 scale-110" : ""
                        }`}
                        title={colorKey}
                      />
                    ))}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onPinNoteToDesktop && onPinNoteToDesktop(note.id)}
                      className="p-1 rounded hover:bg-black/5 text-slate-400 hover:text-[#4D7C5D] transition-all cursor-pointer"
                      title={t.floatingNote.delete}
                    >
                      <Pin className="w-3.5 h-3.5 rotate-45" />
                    </button>
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      className="p-1 rounded hover:bg-black/5 text-slate-400 hover:text-red-500 transition-all cursor-pointer"
                      title={t.common.delete}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : stickyNotes.length > 0 ? (
        <div className="text-center py-16 bg-white/80 border border-[#EFEBE4] rounded-2xl flex flex-col items-center gap-3">
          <Search className="w-10 h-10 text-slate-300" />
          <p className="text-xs text-slate-400 font-bold">{sn.searchEmpty}</p>
        </div>
      ) : (
        <div className="text-center py-20 bg-white/80 border border-[#EFEBE4] rounded-2xl flex flex-col items-center gap-3">
          <StickyNote className="w-12 h-12 text-[#EFEBE4]" />
          <p className="text-xs text-slate-400 font-bold">{sn.empty}</p>
          <button
            onClick={handleAddNote}
            className="mt-2 text-[10px] text-[#4D7C5D] hover:bg-[#F0F5F1] border border-[#DEEAE2] px-3.5 py-1.5 rounded-lg transition-all font-bold uppercase tracking-wider bg-transparent cursor-pointer"
          >
            {sn.add}
          </button>
        </div>
      )}
    </div>
  );
});
