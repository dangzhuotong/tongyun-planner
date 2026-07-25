import React, { memo, useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Pin, Search, X, Maximize2, StickyNote as StickyNoteIcon } from "lucide-react";
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
  handleEditNoteTitle: (id: string, title: string) => void;
  handleChangeNoteColor: (id: string, color: string) => void;
  handleDeleteNote: (id: string) => void;
  pinType?: "pin" | "tape" | "clip" | "heart" | "smiley";
  onPinNoteToDesktop?: (id: string) => void;
}

export const StickyNotesView: React.FC<StickyNotesViewProps> = memo(({
  stickyNotes,
  handleAddNote,
  handleEditNoteText,
  handleEditNoteTitle,
  handleChangeNoteColor,
  handleDeleteNote,
  pinType,
  onPinNoteToDesktop,
}) => {
  const { t } = useTranslation();
  const sn = t.stickyNotes;
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedNote, setExpandedNote] = useState<StickyNoteType | null>(null);
  const filteredNotes = stickyNotes.filter((n) =>
    (n.title || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    n.text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const closeExpanded = useCallback(() => setExpandedNote(null), []);
  useEffect(() => {
    if (!expandedNote) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeExpanded();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expandedNote, closeExpanded]);

  return (
    <div className="flex flex-col gap-3 flex-grow z-10 relative min-h-0 h-full">
      {/* ── 工具条：悬浮在软木板上方 ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 bg-white/95 dark:bg-[#26221c]/95 border border-[#E8DFCE] dark:border-[#4a4033] pl-3.5 pr-4 py-2 rounded-xl shadow-[0_3px_10px_-4px_rgba(90,60,20,0.3)]">
          <StickyNoteIcon className="w-4 h-4 text-[#4D7C5D] dark:text-[#6FAD84]" />
          <span className="text-xs font-bold text-[#3d4a40] dark:text-[#c8d4ca] tracking-wide">
            {t.header.notes}
          </span>
          <span className="text-[10px] font-bold text-white bg-[#4D7C5D] dark:bg-[#3F684C] rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center tabular-nums">
            {stickyNotes.length}
          </span>
        </div>

        <button
          onClick={handleAddNote}
          className="group bg-[#4D7C5D] hover:bg-[#3F684C] text-white pl-3 pr-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-[0_3px_10px_-3px_rgba(77,124,93,0.5)] cursor-pointer hover:-translate-y-0.5 active:translate-y-0"
        >
          <Plus className="w-3.5 h-3.5 transition-transform duration-300 group-hover:rotate-90" />
          {sn.add}
        </button>

        {stickyNotes.length > 0 && (
          <div className="relative flex-1 min-w-[140px] max-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#a08a63]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={sn.search}
              className="w-full bg-white/95 dark:bg-[#26221c]/95 border border-[#E8DFCE] dark:border-[#4a4033] rounded-xl pl-9 pr-3 py-2 text-xs text-[#5f4a2a] dark:text-[#d8c3a0] placeholder-[#b5a17c] focus:outline-none focus:border-[#C4A265] focus:shadow-[0_0_0_3px_rgba(196,162,101,0.15)] transition-all"
            />
          </div>
        )}
      </div>

      {/* ── 手账稿纸页 + 和纸胶带 ── */}
      <div className="board-frame relative flex-1 min-h-0 rounded-[14px] p-[7px]">
        {/* 左上 / 右下 和纸胶带贴角 */}
        <div className="board-tape absolute -top-2 -left-3 w-20 h-6 -rotate-[8deg] rounded-[2px] z-10 pointer-events-none" />
        <div className="board-tape absolute -bottom-2 -right-3 w-20 h-6 -rotate-[5deg] rounded-[2px] z-10 pointer-events-none" />
        <div className="paperboard-bg w-full h-full rounded-[8px] shadow-[inset_0_1px_8px_rgba(120,95,50,0.15)] overflow-y-auto overflow-x-hidden custom-scrollbar">
          {filteredNotes.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-8 p-6 pt-8 content-start items-start">
              {filteredNotes.map((note, i) => {
                const theme = NOTE_COLORS[note.color as keyof typeof NOTE_COLORS] || NOTE_COLORS.tea;
                const hasText = note.text.trim().length > 0;
                return (
                  <div
                    key={note.id}
                    style={{
                      transform: `rotate(${note.rotate}deg)`,
                      animationDelay: `${Math.min(i * 45, 400)}ms`,
                    }}
                    onClick={() => setExpandedNote(note)}
                    className={`note-drop-in group relative ${theme.bg} ${theme.border} note-fold rounded-[3px] px-5 pt-7 pb-4 min-h-[150px] flex flex-col cursor-pointer select-none
                      shadow-[2px_4px_10px_-2px_rgba(110,85,45,0.28),0_1px_2px_rgba(110,85,45,0.18)]
                      hover:shadow-[5px_12px_24px_-4px_rgba(110,85,45,0.4),0_2px_4px_rgba(110,85,45,0.22)]
                      hover:!rotate-0 hover:-translate-y-1.5 hover:scale-[1.02]
                      transition-[transform,box-shadow] duration-300 ease-out`}
                  >
                    <StickyPin type={pinType || "pin"} />

                    {/* 放大提示 */}
                    <div className="absolute top-2.5 right-8 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <Maximize2 className={`w-3 h-3 ${theme.text} opacity-40`} />
                    </div>

                    {/* 标题（手写体） */}
                    {note.title && (
                      <div className={`note-hand text-[15px] font-bold mb-1.5 truncate ${theme.text}`}>
                        {note.title}
                      </div>
                    )}

                    {/* 正文预览 */}
                    <div className="flex-grow overflow-hidden relative">
                      <div
                        className={`text-xs leading-6 whitespace-pre-wrap break-words ${theme.text} ${!hasText ? "opacity-40 italic" : "opacity-80"}`}
                        style={{
                          display: "-webkit-box",
                          WebkitLineClamp: note.title ? 4 : 5,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {hasText ? note.text : sn.add}
                      </div>
                      {/* 底部渐隐 */}
                      <div
                        className={`absolute bottom-0 left-0 right-0 h-6 pointer-events-none ${theme.bg}`}
                        style={{ maskImage: "linear-gradient(to bottom, transparent, black)", WebkitMaskImage: "linear-gradient(to bottom, transparent, black)" }}
                      />
                    </div>

                    {/* 底部操作栏 */}
                    <div className="flex items-center justify-between pt-2.5 border-t border-dashed border-black/10 mt-2 opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-300">
                      <div className="flex items-center gap-1.5">
                        {Object.entries(NOTE_COLORS).map(([colorKey, c]) => (
                          <button
                            key={colorKey}
                            onClick={(e) => { e.stopPropagation(); handleChangeNoteColor(note.id, colorKey); }}
                            className={`w-3.5 h-3.5 rounded-full ${c.bg} border ${c.border} shadow-sm transition-all hover:scale-125 cursor-pointer ${
                              note.color === colorKey ? "ring-1 ring-black/25 scale-110" : ""
                            }`}
                            title={colorKey}
                          />
                        ))}
                      </div>

                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); if (onPinNoteToDesktop) onPinNoteToDesktop(note.id); }}
                          className="p-1 rounded-md hover:bg-black/8 text-[#8a7350] hover:text-[#4D7C5D] transition-all cursor-pointer"
                          title={t.floatingNote.expand}
                        >
                          <Pin className="w-3.5 h-3.5 rotate-45" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.id); }}
                          className="p-1 rounded-md hover:bg-black/8 text-[#8a7350] hover:text-red-500 transition-all cursor-pointer"
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
            /* 搜索无结果 */
            <div className="h-full flex flex-col items-center justify-center gap-3 py-16">
              <div className="w-14 h-14 rounded-full bg-[#EFE5D0] dark:bg-[#2c2d2a] flex items-center justify-center">
                <Search className="w-6 h-6 text-[#B5A17C] dark:text-[#8a8577]" />
              </div>
              <p className="text-xs font-bold text-[#9A8866] dark:text-[#8a8577]">{sn.searchEmpty}</p>
            </div>
          ) : (
            /* 空板：虚线便签占位 */
            <div className="h-full flex items-center justify-center p-8">
              <button
                onClick={handleAddNote}
                className="group relative w-56 min-h-[150px] rounded-[3px] border-2 border-dashed border-[#C9B896]/70 dark:border-white/15 bg-white/40 dark:bg-white/5 hover:bg-white/70 dark:hover:bg-white/10 hover:border-[#B5A17C] dark:hover:border-white/25 transition-all duration-300 cursor-pointer flex flex-col items-center justify-center gap-2.5 -rotate-1 hover:rotate-0"
              >
                <div className="w-9 h-9 rounded-full bg-[#4D7C5D]/10 dark:bg-white/10 flex items-center justify-center group-hover:scale-110 group-hover:bg-[#4D7C5D]/20 transition-all duration-300">
                  <Plus className="w-4.5 h-4.5 text-[#4D7C5D] dark:text-[#6FAD84]" />
                </div>
                <span className="text-xs font-bold text-[#9A8866] dark:text-[#8a8577]">{sn.empty}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── 放大编辑弹窗 ── */}
      {expandedNote && (() => {
        const theme = NOTE_COLORS[expandedNote.color as keyof typeof NOTE_COLORS] || NOTE_COLORS.tea;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#4a3d28]/35 dark:bg-black/55 backdrop-blur-[3px]"
            onClick={closeExpanded}
          >
            <div
              className={`note-unpin-in relative ${theme.bg} ${theme.border} note-fold rounded-[4px] shadow-[6px_18px_40px_-8px_rgba(90,70,35,0.45)] w-full max-w-lg mx-4 flex flex-col`}
              style={{ maxHeight: "78vh" }}
              onClick={(e) => e.stopPropagation()}
            >
              <StickyPin type={pinType || "pin"} />

              {/* 顶部操作栏 */}
              <div className="flex items-center justify-between px-6 pt-7 pb-2">
                <div className="flex items-center gap-2">
                  {Object.entries(NOTE_COLORS).map(([colorKey, c]) => (
                    <button
                      key={colorKey}
                      onClick={() => {
                        handleChangeNoteColor(expandedNote.id, colorKey);
                        setExpandedNote({ ...expandedNote, color: colorKey });
                      }}
                      className={`w-4 h-4 rounded-full ${c.bg} border ${c.border} shadow-sm transition-all hover:scale-125 cursor-pointer ${
                        expandedNote.color === colorKey ? "ring-2 ring-black/20 scale-110" : ""
                      }`}
                      title={colorKey}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { if (onPinNoteToDesktop) onPinNoteToDesktop(expandedNote.id); }}
                    className={`p-1.5 rounded-lg hover:bg-black/8 ${theme.text} opacity-50 hover:opacity-100 transition-all cursor-pointer`}
                    title={t.floatingNote.expand}
                  >
                    <Pin className="w-4 h-4 rotate-45" />
                  </button>
                  <button
                    onClick={() => { handleDeleteNote(expandedNote.id); closeExpanded(); }}
                    className={`p-1.5 rounded-lg hover:bg-black/8 ${theme.text} opacity-50 hover:opacity-100 hover:!text-red-500 transition-all cursor-pointer`}
                    title={t.common.delete}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={closeExpanded}
                    className={`p-1.5 rounded-lg hover:bg-black/8 ${theme.text} opacity-50 hover:opacity-100 transition-all cursor-pointer`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 编辑区域 */}
              <div className="flex-1 px-6 pb-6 min-h-0 flex flex-col">
                <input
                  value={expandedNote.title || ""}
                  onChange={(e) => {
                    const newTitle = e.target.value;
                    setExpandedNote({ ...expandedNote, title: newTitle });
                    handleEditNoteTitle(expandedNote.id, newTitle);
                  }}
                  placeholder={sn.titlePlaceholder || "标题（可选）"}
                  className={`note-hand w-full bg-transparent border-b-2 border-dashed focus:outline-none text-lg font-bold pb-2 mb-3 placeholder:opacity-35 transition-colors ${theme.text}`}
                  style={{ borderColor: theme.accent + "40" }}
                />
                <textarea
                  autoFocus={!expandedNote.title}
                  value={expandedNote.text}
                  onChange={(e) => {
                    const newText = e.target.value;
                    setExpandedNote({ ...expandedNote, text: newText });
                    handleEditNoteText(expandedNote.id, newText);
                  }}
                  placeholder={sn.add}
                  className={`note-ruled w-full flex-1 min-h-[220px] bg-transparent resize-none focus:outline-none text-sm leading-6 font-medium placeholder:opacity-35 custom-scrollbar ${theme.text}`}
                />
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
});
