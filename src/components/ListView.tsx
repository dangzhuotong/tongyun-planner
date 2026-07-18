import React, { useMemo, useState, useRef } from "react";
import { Search, Check, Trash2, FileEdit, Clock, Heart, Calendar, Pin, Repeat, ListTodo } from "lucide-react";
import type { Task } from "../types";
import { FILTER_OPTIONS, getDueDateCountdown, PRIORITY_META } from "../constants";
import { CustomSelect } from "./CustomSelect";
import { QuickAddTask } from "./QuickAddTask";
import { useTranslation } from "../i18n/LanguageContext";

interface ListViewProps {
  tasks: Task[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  categoryFilter: string;
  setCategoryFilter: (c: string) => void;
  tagFilter: string;
  setTagFilter: (t: string) => void;
  handleComplete: (id: string) => void;
  handleDeleteTask: (id: string) => void;
  expandedNoteId: string | null;
  setExpandedNoteId: (id: string | null) => void;
  editingNotes: string;
  setEditingNotes: (notes: string) => void;
  handleSaveNotes: (id: string, notes: string) => void;
  handleStartFocus: (taskId: string, taskTitle: string) => void;
  handleAddTask: (taskData: {
    title: string;
    description: string;
    notes: string;
    category: Task["category"];
    dueDate: string;
    dueTime?: string;
    isExplicit?: boolean;
  }) => void;
  handleToggleFavorite: (id: string) => void;
  handleTogglePin: (id: string) => void;
  onTaskClick?: (task: Task) => void;
}

export const ListView: React.FC<ListViewProps> = React.memo(({
  tasks,
  searchQuery,
  setSearchQuery,
  categoryFilter,
  setCategoryFilter,
  tagFilter,
  setTagFilter,
  handleComplete,
  handleDeleteTask,
  expandedNoteId,
  setExpandedNoteId,
  editingNotes,
  setEditingNotes,
  handleSaveNotes,
  handleStartFocus,
  handleAddTask,
  handleToggleFavorite,
  handleTogglePin,
  onTaskClick,
}) => {
  const { t } = useTranslation();
  const lv = t.listView;
  const tc = t.taskCard;
  // Local state to filter only starred tasks
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // 依赖未完成时的轻提示（handleComplete 内部对 dependsOn 是静默拦截，这里补上反馈）
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  };

  const tagOptions = useMemo(() => {
    const allTags = [...new Set(tasks.flatMap((t) => t.tags || []))];
    return [{ value: "all", label: lv.allTags }, ...allTags.map((t) => ({ value: t, label: t }))];
  }, [lv.allTags, tasks]);

  // Filter tasks matching search query, category, and favorite filter
  // then sort so pinned tasks float to the top
  const filteredTasks = useMemo(() => {
    const query = searchQuery.toLowerCase();

    return tasks
      .filter((task) => {
        const matchesSearch =
          task.title.toLowerCase().includes(query) ||
          (task.description || "").toLowerCase().includes(query) ||
          (task.notes || "").toLowerCase().includes(query);

        const matchesCategory = categoryFilter === "all" || task.category === categoryFilter;
        const matchesTag = tagFilter === "all" || (task.tags || []).includes(tagFilter);
        const matchesFavorite = !showFavoritesOnly || task.isFavorite;

        return matchesSearch && matchesCategory && matchesTag && matchesFavorite;
      })
      .sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return 0;
      });
  }, [categoryFilter, searchQuery, showFavoritesOnly, tagFilter, tasks]);

  return (
    <div className="animate-fade-in-up rounded-2xl bg-white/90 border border-[#EFEBE4] p-6 flex flex-col gap-4 flex-grow overflow-y-auto max-h-[600px] custom-scrollbar select-none shadow-sm relative">
      
      {/* 筛选与搜索 */}
      <div className="flex gap-3 pb-2 border-b border-[#EFEBE4] items-center">
        <div className="relative flex-grow">
          <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={lv.search}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#FAF8F5]/80 border border-[#EFEBE4] pl-10 pr-4 py-2.5 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#4D7C5D] transition-colors font-semibold"
          />
        </div>
        <CustomSelect
          value={categoryFilter}
          onChange={setCategoryFilter}
          options={FILTER_OPTIONS}
          className="w-48"
        />
        {/* Tag Filter */}
        <CustomSelect
          value={tagFilter}
          onChange={setTagFilter}
          options={tagOptions}
          className="w-32"
        />
        {/* Star Filter Button */}
        <button
          onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
          className={`px-3.5 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 shadow-xs ${
            showFavoritesOnly
              ? "bg-[#FCF2F0] text-[#A34E36] border-[#F5DFDB]"
              : "bg-white text-slate-500 border-[#EFEBE4] hover:bg-[#FAF8F5]"
          }`}
          title={lv.search}
        >
          <Heart className={`w-3.5 h-3.5 ${showFavoritesOnly ? "fill-[#A34E36] text-[#A34E36]" : "text-slate-400"}`} />
          <span>{lv.starred}</span>
        </button>
      </div>

      {/* Inline Quick Add Component */}
      <div className="w-full">
        <QuickAddTask
          handleAddTask={handleAddTask}
          defaultCategory={categoryFilter !== "all" ? (categoryFilter as Task["category"]) : "urgent-important"}
          placeholder={lv.addPlaceholder}
        />
      </div>

      {/* 列表渲染 */}
      {filteredTasks.length > 0 ? (
        <div className="space-y-2 pr-1 custom-scrollbar overflow-y-auto">
          {filteredTasks.map((task) => {
            const countdown = getDueDateCountdown(task.dueDate, task.dueTime);
            
            return (
              <div
                key={task.id}
                className="rounded-xl bg-white/80 border border-[#EFEBE4]/80 hover:border-[#C4D7B2] hover:bg-white hover:shadow-xs transition-all duration-200 group relative"
              >
                <div className="px-4 py-2.5 flex justify-between items-center gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-grow">
                    <button
                      onClick={() => {
                        if (task.dependsOn && task.dependsOn.length > 0) {
                          const pending = task.dependsOn.filter((depId) => tasks.some((t) => t.id === depId));
                          if (pending.length > 0) {
                            const names = pending
                              .map((id) => tasks.find((t) => t.id === id)?.title)
                              .filter(Boolean)
                              .join("、");
                            showToast(`${tc.dependsBlocked}${names ? "：" + names : ""}`);
                            return;
                          }
                        }
                        handleComplete(task.id);
                      }}
                      title={tc.complete}
                      className="w-5 h-5 rounded-full border border-slate-300 hover:border-[#4D7C5D] hover:bg-[#F0F5F1] flex items-center justify-center transition-all flex-shrink-0 group/btn cursor-pointer"
                    >
                      <Check className="w-3 h-3 text-[#4D7C5D] opacity-60 group-hover/btn:opacity-100 transition-opacity" />
                    </button>
                    <div className="min-w-0 flex-grow">
                      <div className="flex items-center gap-2 min-w-0">
                        {task.isPinned && (
                          <span title={lv.pinned} className="flex-shrink-0 flex items-center"><Pin className="w-3 h-3 text-[#8B6E3C] fill-[#8B6E3C]" /></span>
                        )}
                        <h4
                          className="text-xs font-bold text-slate-800 truncate leading-snug cursor-pointer hover:underline"
                          onClick={() => onTaskClick?.(task)}
                        >{task.title}</h4>
                        {task.isFavorite && (
                          <span title={lv.starred} className="flex-shrink-0 flex items-center"><Heart className="w-3 h-3 text-[#E8A0BF] fill-[#E8A0BF]" /></span>
                        )}
                        {task.priority && PRIORITY_META[task.priority] && (
                          <span
                            title={`${tc.priority}: ${t.taskCard["priority" + (task.priority.charAt(0).toUpperCase() + task.priority.slice(1)) as "priorityHigh"]}`}
                            className={`text-[8.5px] px-1.5 py-0.5 rounded-lg border border-[#EFEBE4] font-bold flex items-center gap-1 flex-shrink-0 whitespace-nowrap ${PRIORITY_META[task.priority].text}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_META[task.priority].dot}`} />
                            {PRIORITY_META[task.priority].label}
                          </span>
                        )}
                        <span
                          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            task.category === "urgent-important"
                              ? "bg-[#E8A0BF]"
                              : task.category === "important-not-urgent"
                              ? "bg-[#C4D7B2]"
                              : task.category === "urgent-not-important"
                              ? "bg-[#B2C8DF]"
                              : "bg-[#FAF5ED] border border-[#EFE5D3]"
                          }`}
                        />
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400 font-medium min-w-0">
                        {task.description && (
                          <p className="truncate max-w-[200px] flex-grow min-w-0">{task.description}</p>
                        )}
                        
                        {/* Beautiful non-wrapping Pill Badge for Due Date */}
                        {countdown && (
                          (() => {
                            const badgeStyle = countdown.isOverdue
                              ? "bg-[#FCF2F0] border-[#F5DFDB] text-[#A34E36] font-extrabold"
                              : countdown.isToday
                              ? "bg-[#FBECE5] border-[#F6DCD2] text-[#A64424] font-extrabold"
                              : "bg-[#FAF8F5] border-[#EFEBE4] text-slate-500 font-semibold";
                            return (
                              <span className={`text-[8.5px] px-1.5 py-0.5 rounded-lg border flex items-center gap-1 flex-shrink-0 whitespace-nowrap ${badgeStyle}`}>
                                <Calendar className="w-2.5 h-2.5 text-slate-400" />
                                <span>{task.dueDate?.split("-").slice(1).join("/")}{task.dueTime ? ` ${task.dueTime}` : ""} ({countdown.text})</span>
                              </span>
                            );
                          })()
                        )}

                        {task.repeat && task.repeat !== "none" && (
                          <span className="text-[8.5px] px-1.5 py-0.5 rounded-lg border bg-[#F0F5F1] border-[#DEEAE2] text-[#4D7C5D] font-bold flex items-center gap-1 flex-shrink-0 whitespace-nowrap">
                            <Repeat className="w-2.5 h-2.5" />
                            <span>{tc["repeat" + task.repeat.charAt(0).toUpperCase() + task.repeat.slice(1)]}</span>
                          </span>
                        )}

                        {task.subtasks && task.subtasks.length > 0 && (
                          <span className="text-[8.5px] px-1.5 py-0.5 rounded-lg border bg-[#FAF5ED] border-[#EFE5D3] text-[#8B6E3C] font-bold flex items-center gap-1 flex-shrink-0 whitespace-nowrap">
                            <ListTodo className="w-2.5 h-2.5" />
                            <span>{task.subtasks.filter(s => s.completed).length}/{task.subtasks.length}</span>
                          </span>
                        )}
                        
                        {task.tags && task.tags.length > 0 && task.tags.map((tag) => (
                          <span key={tag} className="text-[8.5px] px-1.5 py-0.5 rounded-md bg-[#F0F5F1] border border-[#DEEAE2] text-[#4D7C5D] font-bold flex-shrink-0">
                            {tag}
                          </span>
                        ))}
                        {task.notes && (
                          <span className="text-[#8B6E3C] italic font-semibold truncate max-w-[150px] flex-shrink-0">
                            {t.taskCard.notes}: {task.notes}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Hover-reveal actions panel */}
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 flex-shrink-0">
                    {/* Pin button */}
                    <button
                      onClick={() => handleTogglePin(task.id)}
                      className="p-1 rounded hover:bg-slate-100 flex-shrink-0 cursor-pointer text-slate-400 hover:text-slate-600 transition-colors"
                      title={task.isPinned ? lv.unpin : lv.pin}
                    >
                      <svg className={`w-3.5 h-3.5 ${task.isPinned ? "text-[#8B6E3C] fill-[#8B6E3C]" : "text-slate-300"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                    </button>

                    {/* Favorite button */}
                    <button
                      onClick={() => handleToggleFavorite(task.id)}
                      className="p-1 rounded hover:bg-slate-100 flex-shrink-0 cursor-pointer text-slate-400"
                      title={task.isFavorite ? lv.unfavorite : lv.favorite}
                    >
                      <Heart className={`w-3.5 h-3.5 text-[#E8A0BF] transition-all ${task.isFavorite ? "fill-[#E8A0BF]" : "text-slate-300"}`} />
                    </button>

                    <button
                      onClick={() => handleStartFocus(task.id, task.title)}
                      className="p-1 rounded hover:bg-slate-100 flex-shrink-0 cursor-pointer text-slate-400 hover:text-slate-600 transition-colors"
                      title={lv.startFocus}
                    >
                      <Clock className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        setExpandedNoteId(expandedNoteId === task.id ? null : task.id);
                        setEditingNotes(task.notes || "");
                      }}
                      className={`text-[10px] px-2.5 py-1 rounded-lg border transition-all cursor-pointer font-extrabold flex items-center gap-1 shadow-xs ${
                        expandedNoteId === task.id
                          ? "bg-[#FAF5ED] text-[#8B6E3C] border-[#EFE5D3]"
                          : "bg-white text-slate-400 border-[#EFEBE4] hover:bg-[#FAF8F5] hover:text-slate-600"
                      }`}
                    >
                      <FileEdit className="w-2.5 h-2.5" />
                      {t.taskCard.notes}
                    </button>
                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="text-[10px] hover:text-red-600 border border-[#EFEBE4] hover:border-red-100 hover:bg-red-50 p-1 rounded-lg bg-white text-slate-400 transition-all cursor-pointer shadow-xs"
                      title={lv.deleteTask}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* 展开的备注编辑区 */}
                {expandedNoteId === task.id && (
                  <div className="px-4 pb-3.5 pt-1 border-t border-[#EFEBE4] bg-[#FAF8F5]/30 rounded-b-xl animate-fade-in-up">
                    <label className="text-[9px] font-bold text-[#8B6E3C] uppercase tracking-wider block mb-1">
                      {lv.notesDetail}
                    </label>
                    <textarea
                      value={editingNotes}
                      onChange={(e) => setEditingNotes(e.target.value)}
                      placeholder={lv.notesPlaceholder}
                      className="w-full bg-[#FAF8F5]/60 border border-[#EFEBE4] px-3 py-2 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#4D7C5D] transition-all resize-none h-20 custom-scrollbar font-medium"
                      autoFocus
                    />
                    <div className="flex gap-2 mt-2 justify-end">
                      <button
                        onClick={() => setExpandedNoteId(null)}
                        className="text-[10px] text-slate-500 hover:text-slate-700 px-3 py-1 rounded-lg border border-[#EFEBE4] transition-colors cursor-pointer"
                      >
                        {t.common.cancel}
                      </button>
                      <button
                        onClick={() => handleSaveNotes(task.id, editingNotes)}
                        className="text-[10px] text-white bg-[#4D7C5D] hover:bg-[#3F684C] px-3.5 py-1 rounded-lg transition-colors font-bold cursor-pointer"
                      >
                        {lv.saveNotes}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 flex flex-col items-center gap-3">
          <Check className="w-10 h-10 text-[#EFEBE4]" />
          <p className="text-xs text-slate-400 font-bold">{lv.noTasks}</p>
        </div>
      )}

      {toast && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-xl bg-[#3F684C] text-white text-xs font-bold shadow-lg animate-fade-in-up whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  );
});
