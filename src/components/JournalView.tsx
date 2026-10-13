import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Trash2,
  Search,
  ListChecks,
  Tag as TagIcon,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Plus,
  Camera,
  X,
} from "lucide-react";
import type {
  JournalEntry,
  Task,
  CustomizationConfig,
  PomodoroLog,
  Attachment,
  HabitItem,
} from "../types";
import { extractJournalTags } from "../constants";
import { createId } from "../utils/id";
import { getLocalDateString } from "../utils/date";
import { pomodoroStatsOn, taskCompletedOn } from "../utils/dailyReview";
import { useTranslation } from "../i18n/LanguageContext";
import { callAI } from "../utils/aiEngine";
import { usePersonal } from "../context/PersonalContext";
import { matchesSearch } from "../utils/textSearch";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import {
  deleteJournalAttachment,
  journalAttachmentSrc,
  saveJournalAttachment,
} from "../utils/journalAttachmentStorage";

/** 日记页心情：五级，存为 emoji 字符串 */
const JOURNAL_MOODS = [
  { emoji: "😞", label: "很差" },
  { emoji: "😔", label: "不好" },
  { emoji: "😐", label: "一般" },
  { emoji: "😊", label: "不错" },
  { emoji: "😄", label: "很棒" },
] as const;

import { buildDefaultCommentPrompt } from "../utils/aiPrompts";

interface JournalViewProps {
  tasks: Task[];
  completedTasks: Task[];
  pomodoroLogs: Pick<PomodoroLog, "id" | "timestamp" | "duration">[];
  aiConfig: CustomizationConfig;
  habitsHook: { habits: HabitItem[]; toggleHabit: (id: string) => void };
}

export function JournalView({
  tasks,
  completedTasks,
  pomodoroLogs,
  aiConfig,
  habitsHook,
}: JournalViewProps) {
  const {
    journal,
    handleUpsertJournal: onUpsert,
    handleDeleteJournal: onDelete,
    journalAddTodo: addTodoEnabled,
    handleToggleJournalAddTodo: onToggleAddTodo,
  } = usePersonal();
  const { t, locale } = useTranslation();
  const j = t.journal as Record<string, string>;
  const today = getLocalDateString();

  const [currentDate, setCurrentDate] = useState<string>(today);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [tagOpen, setTagOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const activeDateRef = useRef<HTMLButtonElement>(null);

  const dailyEntryMap = useMemo(() => {
    const m = new Map<string, JournalEntry>();
    journal.forEach((e) => {
      if (e.isDaily) m.set(e.date, e);
    });
    return m;
  }, [journal]);

  const selected = useMemo(
    () => dailyEntryMap.get(currentDate) || null,
    [currentDate, dailyEntryMap],
  );
  const viewDate = currentDate;

  // 本地草稿，避免每次按键都触发父级重渲染造成的光标跳动
  const [draftContent, setDraftContent] = useState(() => selected?.content || "");
  const [prevSelected, setPrevSelected] = useState(selected);
  if (selected !== prevSelected) {
    setPrevSelected(selected);
    setDraftContent(selected?.content || "");
    setConfirmDelete(false);
  }

  const draftDirtyRef = useRef(false);
  const draftContentRef = useRef(draftContent);
  const selectedRef = useRef<JournalEntry | null>(selected);
  const viewDateRef = useRef(viewDate);
  const onUpsertRef = useRef(onUpsert);

  useEffect(() => {
    draftContentRef.current = draftContent;
    selectedRef.current = selected;
    viewDateRef.current = viewDate;
    onUpsertRef.current = onUpsert;
  });

  const flushDraft = useCallback(() => {
    if (!draftDirtyRef.current) return;
    draftDirtyRef.current = false;
    const date = viewDateRef.current;
    const base =
      selectedRef.current ||
      ({
        id: createId("journal"),
        linkKey: date,
        title: date,
        content: "",
        date,
        isDaily: true,
        createdAt: Date.now(),
      } as JournalEntry);
    onUpsertRef.current({
      ...base,
      content: draftContentRef.current,
      updatedAt: Date.now(),
    });
  }, []);

  useEffect(() => {
    if (!draftDirtyRef.current) return;
    const timer = window.setTimeout(flushDraft, 600);
    return () => window.clearTimeout(timer);
  }, [draftContent, flushDraft]);

  useEffect(() => () => flushDraft(), [flushDraft]);

  const commit = useCallback(
    (patch: Partial<JournalEntry>) => {
      const base =
        selected ||
        ({
          id: createId("journal"),
          linkKey: viewDate,
          title: viewDate,
          content: "",
          date: viewDate,
          isDaily: true,
          createdAt: Date.now(),
        } as JournalEntry);
      const pendingContent = draftDirtyRef.current ? draftContentRef.current : base.content;
      draftDirtyRef.current = false;
      const next: JournalEntry = {
        ...base,
        content: pendingContent,
        ...patch,
        updatedAt: Date.now(),
      };
      if (next.mood === undefined) {
        delete next.mood;
      }
      onUpsert(next);
    },
    [selected, onUpsert, viewDate],
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const handlePickImage = useCallback(() => fileInputRef.current?.click(), []);

  const handleFileChosen = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";
      if (!file.type.startsWith("image/")) return;
      const storedPath = await saveJournalAttachment(file, createId("att-file"));
      const att: Attachment = {
        id: createId("att"),
        name: file.name,
        path: storedPath,
        type: file.type,
        size: file.size,
        createdAt: new Date().toISOString(),
      };
      commit({ attachments: [...(selected?.attachments || []), att] });
    },
    [commit, selected?.attachments],
  );

  const handleImagePaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          e.preventDefault();
          const file = items[i].getAsFile();
          if (!file) continue;
          const storedPath = await saveJournalAttachment(file, createId("att-file"));
          const att: Attachment = {
            id: createId("att"),
            name: file.name || `pasted-${Date.now()}.png`,
            path: storedPath,
            type: file.type,
            size: file.size,
            createdAt: new Date().toISOString(),
          };
          commit({ attachments: [...(selected?.attachments || []), att] });
          break;
        }
      }
    },
    [commit, selected?.attachments],
  );

  const handleRemoveImage = useCallback(
    (attId: string) => {
      const existing = selected?.attachments || [];
      const removed = existing.find((attachment) => attachment.id === attId);
      commit({ attachments: existing.filter((a) => a.id !== attId) });
      if (removed) void deleteJournalAttachment(removed.path);
    },
    [commit, selected?.attachments],
  );

  const handleContentChange = (v: string) => {
    draftDirtyRef.current = true;
    draftContentRef.current = v;
    setDraftContent(v);
  };

  const navigateToDate = useCallback(
    (date: string) => {
      flushDraft();
      setCurrentDate(date);
    },
    [flushDraft],
  );

  const handleMoodPick = useCallback(
    (emoji: string) => {
      commit({ mood: selected?.mood === emoji ? undefined : emoji });
    },
    [commit, selected?.mood],
  );

  const shiftDate = (delta: number) => {
    const [y, m, d] = currentDate.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + delta);
    navigateToDate(getLocalDateString(dt));
  };
  const goToday = () => navigateToDate(today);

  const insertLine = (text: string) => {
    const next = draftContent ? `${draftContent}\n${text}` : text;
    handleContentChange(next);
  };

  const viewFocus = useMemo(
    () => pomodoroStatsOn(pomodoroLogs, viewDate),
    [pomodoroLogs, viewDate],
  );

  const viewDone = useMemo(
    () => completedTasks.filter((task) => taskCompletedOn(task, viewDate)),
    [completedTasks, viewDate],
  );

  // 温柔的 AI 评语
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const generateAiComment = useCallback(async () => {
    if (!aiConfig?.aiApiKey) {
      setAiError(j.needApiKey || "请先在设置中配置 AI API Key");
      return;
    }
    if (!draftContent.trim()) {
      setAiError(j.emptyContent || "先写点什么，AI 才好回应你～");
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const lang = locale === "zh-CN" ? "简体中文" : "English";
      const custom = aiConfig?.journalCommentPrompt?.trim();
      const system = custom ? custom.replace(/\$\{lang\}/g, lang) : buildDefaultCommentPrompt(lang);
      const result = await callAI(aiConfig, system, `这是用户今天的日记：\n${draftContent}`);
      if (result) commit({ aiComment: result });
    } catch (e: any) {
      setAiError(
        e?.message === "API_KEY_MISSING"
          ? j.needApiKey || "请先配置 AI Key"
          : j.aiError || "AI 回应失败，请稍后再试",
      );
    } finally {
      setAiLoading(false);
    }
  }, [aiConfig, draftContent, commit, locale, j]);

  // 导出
  const entryToMarkdown = useCallback((entry: JournalEntry): string => {
    const lines: string[] = [];
    lines.push(`# ${entry.title}`);
    lines.push(`日期：${entry.date}`);
    if (entry.mood) lines.push(`心情：${entry.mood}`);
    lines.push("");
    if (entry.content.trim()) lines.push(entry.content);
    if ((entry.attachments?.length ?? 0) > 0) {
      lines.push("");
      for (const att of entry.attachments!) {
        lines.push(`![${att.name}](${att.path})`);
      }
    }
    if (entry.aiComment) {
      lines.push("");
      lines.push("---");
      lines.push(entry.aiComment);
    }
    return lines.join("\n");
  }, []);

  const downloadMarkdown = useCallback((filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const handleExportCurrent = useCallback(() => {
    const entry = selected || dailyEntryMap.get(currentDate);
    if (!entry) return;
    const md = entryToMarkdown(entry);
    downloadMarkdown(`journal-${currentDate}.md`, md);
  }, [selected, currentDate, dailyEntryMap, entryToMarkdown, downloadMarkdown]);

  const handleExportAll = useCallback(() => {
    const dailies = journal
      .filter((e) => e.isDaily)
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
    const parts = dailies.map(entryToMarkdown);
    const md = parts.join("\n\n---\n\n");
    downloadMarkdown(`tongyun-journal-all-${today}.md`, md);
  }, [journal, entryToMarkdown, downloadMarkdown, today]);

  const [flipTick, setFlipTick] = useState(0);
  const prevFlipDate = useRef(currentDate);
  useEffect(() => {
    if (prevFlipDate.current === currentDate) return;
    prevFlipDate.current = currentDate;
    setFlipTick((n) => n + 1);
  }, [currentDate]);

  // 顶部日期滑条：过去 60 天 ~ 未来 7 天
  const dateStrip = useMemo(() => {
    const days: string[] = [];
    const start = new Date(today + "T00:00:00");
    start.setDate(start.getDate() - 60);
    const end = new Date(today + "T00:00:00");
    end.setDate(end.getDate() + 7);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push(getLocalDateString(d));
    }
    return days;
  }, [today]);

  const stripStart = dateStrip[0];
  const stripEnd = dateStrip[dateStrip.length - 1];

  // 搜索过滤：匹配日记正文或标签
  const debouncedSearch = useDebouncedValue(search, 200);
  const searchMatchedDates = useMemo(() => {
    if (!debouncedSearch.trim()) return null;
    const matched = new Set<string>();
    journal.forEach((e) => {
      if (!e.isDaily) return;
      const haystack = [e.content || "", ...extractJournalTags(e.content)].join(" ");
      if (matchesSearch(haystack, debouncedSearch)) matched.add(e.date);
    });
    return matched;
  }, [journal, debouncedSearch]);

  const searchMatchCount = searchMatchedDates?.size ?? 0;

  const visibleDateStrip = useMemo(() => {
    if (!searchMatchedDates) return dateStrip;
    return dateStrip.filter((ds) => searchMatchedDates.has(ds));
  }, [dateStrip, searchMatchedDates]);

  const earliestDaily = useMemo(() => {
    let min: string | null = null;
    for (const e of journal) {
      if (!e.isDaily) continue;
      if (!min || e.date < min) min = e.date;
    }
    return min;
  }, [journal]);

  const jumpEarlier = () => {
    if (earliestDaily && earliestDaily < stripStart) {
      navigateToDate(earliestDaily);
      return;
    }
    const base = currentDate < stripStart ? currentDate : stripStart;
    const [y, m, d] = base.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - 1);
    navigateToDate(getLocalDateString(dt));
  };

  const jumpLater = () => {
    const base = currentDate > stripEnd ? currentDate : stripEnd;
    const [y, m, d] = base.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + 1);
    navigateToDate(getLocalDateString(dt));
  };

  // 日期滑条自动居中定位到当前选中日期
  useEffect(() => {
    activeDateRef.current?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [currentDate]);

  // 全部日记中出现过的标签（去重排序），用于标签筛选
  const allTags = useMemo(() => {
    const set = new Set<string>();
    journal.forEach((e) => {
      if (e.isDaily) extractJournalTags(e.content).forEach((tag) => set.add(tag));
    });
    return [...set].sort((a, b) => a.localeCompare(b, locale === "zh-CN" ? "zh" : "en"));
  }, [journal, locale]);

  const viewTasks = useMemo(
    () => tasks.filter((task) => task.dueDate === viewDate),
    [tasks, viewDate],
  );

  const tags = useMemo(() => extractJournalTags(draftContent), [draftContent]);

  // 农历（装饰，动态加载 lunar-javascript，失败则忽略）
  const [lunarText, setLunarText] = useState("");
  useEffect(() => {
    let cancelled = false;
    import("lunar-javascript")
      .then((mod: any) => {
        try {
          const Solar = mod.Solar || (mod.default && mod.default.Solar);
          if (!Solar) return;
          const d = new Date(currentDate + "T00:00:00");
          const lunar = Solar.fromDate(d).getLunar();
          if (!cancelled) setLunarText(`${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`);
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [currentDate]);

  const weekdayNames =
    locale === "zh-CN"
      ? ["日", "一", "二", "三", "四", "五", "六"]
      : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const fmtDate = (ds: string) => {
    const [y, m, d] = ds.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const wd = weekdayNames[dt.getDay()];
    return locale === "zh-CN"
      ? { big: `${m}月${d}日`, small: `星期${wd}${lunarText ? " · 农历" + lunarText : ""}` }
      : { big: `${m}/${d}`, small: `${wd}${lunarText ? " · " + lunarText : ""}` };
  };
  const headerDate = fmtDate(currentDate);
  const isFuture = currentDate > today;
  const isToday = currentDate === today;

  // 编辑器主体（纯文字书写，无 Markdown 噪声）
  const editorInner = (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {selected &&
          (confirmDelete ? (
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-[10px] text-[#A34E36]">{j.confirmDelete || "确定删除？"}</span>
              <button
                onClick={() => {
                  onDelete(selected.id);
                  setConfirmDelete(false);
                }}
                className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-[#A34E36] text-white hover:bg-[#8A4029] cursor-pointer transition-colors"
              >
                {j.delete}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-[10px] px-2 py-1 rounded-lg border border-[#EFEBE4] text-slate-500 hover:bg-[#FAF8F5] cursor-pointer transition-colors"
              >
                {j.cancel || "取消"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="ml-auto p-1.5 rounded-lg text-slate-300 hover:text-[#A34E36] hover:bg-[#FCF2F0] cursor-pointer transition-colors"
              title={j.delete}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          ))}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] text-[#8B6E3C] bg-[#8B6E3C]/10 rounded-full px-2 py-0.5 font-medium"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChosen}
        />
        <button
          onClick={handlePickImage}
          className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border border-[#EFEBE4] text-slate-500 hover:text-[#4D7C5D] hover:border-[#4D7C5D] hover:bg-[#F0F5F1] cursor-pointer transition-colors dark:border-[#3A3A3A] dark:text-slate-400 dark:hover:text-[#6FAD84] dark:hover:border-[#6FAD84] dark:hover:bg-[#232924]"
          title={j.addImage}
        >
          <Camera className="w-3 h-3" />
          {j.addImage}
        </button>
      </div>

      <textarea
        ref={textareaRef}
        value={draftContent}
        onChange={(e) => handleContentChange(e.target.value)}
        onBlur={flushDraft}
        onPaste={handleImagePaste}
        placeholder={j.diaryPlaceholder || "写点什么，记下今天…"}
        className="flex-grow min-h-0 w-full resize-none rounded-xl text-[15px] text-slate-700 dark:text-slate-200 font-serif focus:outline-none custom-scrollbar bg-transparent border-transparent"
        style={{
          padding: "6px 16px 16px 16px",
          lineHeight: "32px",
          backgroundImage: "linear-gradient(transparent 31px, #EADFC9 31px)",
          backgroundSize: "100% 32px",
          backgroundPosition: "0 0",
          backgroundAttachment: "local",
        }}
        spellCheck={false}
      />

      {(selected?.attachments?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-3">
          {selected!.attachments!.map((att) => (
            <div key={att.id} className="relative group">
              <img
                src={journalAttachmentSrc(att.path)}
                alt={att.name}
                className="w-28 h-28 object-cover rounded-xl border border-[#EFEBE4] dark:border-[#3A3A3A] shadow-sm"
              />
              <button
                onClick={() => handleRemoveImage(att.id)}
                className="absolute -top-2 -right-2 w-5 h-5 flex items-center justify-center rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-md hover:bg-red-600"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl bg-gradient-to-br from-[#F0F5F1] to-[#FCEFF4] dark:from-[#232924] dark:to-[#2B2125] border border-[#E4EEE6] dark:border-[#33353A] p-4">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#E8A0BF] dark:text-[#E8A0BF]/80 mb-2">
          <Sparkles className="w-3.5 h-3.5" />
          {j.aiCommentTitle || "暖评"}
        </div>
        {selected?.aiComment ? (
          <>
            <p className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
              {selected.aiComment}
            </p>
            <button
              onClick={generateAiComment}
              disabled={aiLoading}
              className="mt-2 text-[10px] text-[#4D7C5D] dark:text-[#6FAD84] hover:underline disabled:opacity-40 cursor-pointer"
            >
              {aiLoading ? "..." : j.regenerate || "重新生成"}
            </button>
          </>
        ) : (
          <button
            onClick={generateAiComment}
            disabled={aiLoading}
            className="text-[11px] font-semibold px-3 py-2 rounded-lg bg-white dark:bg-[#1C1D21] border border-[#E4EEE6] dark:border-[#383A42] text-[#4D7C5D] dark:text-[#6FAD84] hover:bg-[#EAF1EC] dark:hover:bg-[#232924] transition-colors cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {aiLoading
              ? j.aiThinking || "正在写暖评..."
              : j.aiGenerate || "完成今天，收下今天的暖评"}
          </button>
        )}
        {aiError && <p className="text-[10px] text-red-500 mt-2">{aiError}</p>}
      </div>
      {selected && (
        <div className="text-[10px] text-slate-400 text-right">
          {j.updatedAt}{" "}
          {new Date(selected.updatedAt).toLocaleString([], {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* 顶部：日期滑条 + 工具 */}
      <header className="flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => onToggleAddTodo(!addTodoEnabled)}
          className={`flex items-center gap-1.5 text-[11px] font-bold rounded-xl px-3 py-1.5 cursor-pointer transition-colors border ${
            addTodoEnabled
              ? "text-white bg-[#4D7C5D] hover:bg-[#3F684C] border-[#4D7C5D]"
              : "text-[#4D7C5D] bg-[#F0F5F1] hover:bg-[#E4EEE6] border border-[#C4D7B2]"
          }`}
          title={j.addTodoHint || "开启后，每一天的日记都会加入当日待办"}
        >
          <ListChecks className="w-3.5 h-3.5" />
          {addTodoEnabled ? "✓ " : ""}
          {j.addTodo}
        </button>

        <div
          ref={stripRef}
          className="flex-1 overflow-x-auto custom-scrollbar flex items-center gap-1.5 pb-1"
        >
          <button
            type="button"
            onClick={jumpEarlier}
            className="flex-shrink-0 px-2 py-1 rounded-xl text-[10px] font-bold text-slate-400 dark:text-slate-400 border border-[#EFEBE4] dark:border-[#282A30] bg-white dark:bg-[#16171B] hover:bg-[#FAF8F5] dark:hover:bg-[#202228] hover:text-[#4D7C5D] dark:hover:text-[#78C496] cursor-pointer"
            title={j.jumpEarlier || "更早"}
          >
            ‹ {j.jumpEarlier || "更早"}
          </button>
          {(currentDate < stripStart || currentDate > stripEnd) && (
            <button
              type="button"
              ref={activeDateRef}
              onClick={() => {}}
              className="flex-shrink-0 flex flex-col items-center px-2.5 py-1 rounded-xl bg-[#4D7C5D] text-white border border-[#4D7C5D]"
              title={currentDate}
            >
              <span className="text-[11px] font-bold leading-none">
                {(() => {
                  const [, m, d] = currentDate.split("-");
                  return `${Number(m)}/${Number(d)}`;
                })()}
              </span>
              <span className="text-[9px] mt-0.5 leading-none">{j.outsideStrip || "滑条外"}</span>
            </button>
          )}
          {visibleDateStrip.map((ds) => {
            const [y, m, d] = ds.split("-").map(Number);
            const wd = weekdayNames[new Date(y, m - 1, d).getDay()];
            const entry = dailyEntryMap.get(ds);
            const has = !!entry && !!(entry.content?.trim() || entry.mood);
            const active = ds === currentDate;
            return (
              <button
                key={ds}
                ref={active ? activeDateRef : undefined}
                onClick={() => navigateToDate(ds)}
                className={`flex-shrink-0 flex flex-col items-center px-2.5 py-1 rounded-xl transition-colors cursor-pointer border ${
                  active
                    ? "bg-[#4D7C5D] text-white border-[#4D7C5D]"
                    : has
                      ? "bg-[#F0F5F1] dark:bg-[#1F2C23] text-[#4D7C5D] dark:text-[#78C496] border-[#C4D7B2] dark:border-[#2D4534] hover:bg-[#E4EEE6] dark:hover:bg-[#26372B]"
                      : "bg-white dark:bg-[#16171B] text-slate-400 dark:text-slate-400 border-[#EFEBE4] dark:border-[#282A30] hover:bg-[#FAF8F5] dark:hover:bg-[#202228]"
                }`}
                title={ds}
              >
                <span className="text-[11px] font-bold leading-none">
                  {m}/{d}
                </span>
                <span className="text-[9px] mt-0.5 leading-none">{wd}</span>
                {entry?.mood ? (
                  <span className="text-[10px] mt-0.5 leading-none">{entry.mood}</span>
                ) : has ? (
                  <span
                    className={`w-1 h-1 rounded-full mt-1 ${active ? "bg-white" : "bg-[#C4D7B2] dark:bg-[#78C496]"}`}
                  />
                ) : null}
              </button>
            );
          })}
          <button
            type="button"
            onClick={jumpLater}
            className="flex-shrink-0 px-2 py-1 rounded-xl text-[10px] font-bold text-slate-400 dark:text-slate-400 border border-[#EFEBE4] dark:border-[#282A30] bg-white dark:bg-[#16171B] hover:bg-[#FAF8F5] dark:hover:bg-[#202228] hover:text-[#4D7C5D] dark:hover:text-[#78C496] cursor-pointer"
            title={j.jumpLater || "更晚"}
          >
            {j.jumpLater || "更晚"} ›
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2 flex-shrink-0 relative">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={j.search}
              className="w-36 bg-white dark:bg-[#16171B] border border-[#EFEBE4] dark:border-[#282A30] pl-8 pr-10 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-[#4D7C5D] dark:focus:border-[#78C496]"
            />
            {search.trim() && (
              <>
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-8 top-1/2 -translate-y-1/2 text-[10px] text-slate-300 hover:text-slate-500 cursor-pointer"
                >
                  ×
                </button>
                <span
                  className={`absolute right-1 top-1/2 -translate-y-1/2 text-[9px] font-bold rounded-full px-1.5 py-0.5 ${
                    searchMatchCount > 0
                      ? "bg-[#F0F5F1] dark:bg-[#1F2C23] text-[#4D7C5D] dark:text-[#78C496]"
                      : "bg-red-50 dark:bg-[#381E20] text-red-400 dark:text-red-300"
                  }`}
                >
                  {searchMatchCount}
                </span>
              </>
            )}
          </div>
          {allTags.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setTagOpen((v) => !v)}
                className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                  tagOpen || activeTag
                    ? "border-[#8B6E3C] dark:border-[#CBB182] text-[#8B6E3C] dark:text-[#CBB182] bg-[#8B6E3C]/10 dark:bg-[#CBB182]/10"
                    : "border-[#EFEBE4] dark:border-[#282A30] text-slate-500 dark:text-slate-400 hover:bg-[#FAF8F5] dark:hover:bg-[#202228]"
                }`}
                title={j.tags}
              >
                <TagIcon className="w-3.5 h-3.5" />
              </button>
              {tagOpen && (
                <div className="absolute right-0 top-10 z-20 w-56 bg-white dark:bg-[#1C1D21] border border-[#EFEBE4] dark:border-[#282A30] rounded-xl shadow-lg p-3 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {allTags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => setActiveTag((prev) => (prev === tag ? null : tag))}
                        className={`text-[10px] rounded-full px-2 py-0.5 font-medium transition-colors cursor-pointer border ${
                          activeTag === tag
                            ? "bg-[#8B6E3C] text-white border-[#8B6E3C]"
                            : "text-[#8B6E3C] dark:text-[#CBB182] bg-[#8B6E3C]/10 dark:bg-[#CBB182]/10 border-transparent hover:bg-[#8B6E3C]/20"
                        }`}
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                  {activeTag && (
                    <button
                      onClick={() => setActiveTag(null)}
                      className="text-[10px] text-slate-400 hover:text-slate-600"
                    >
                      {j.clearTag} ✕
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <button
            onClick={handleExportCurrent}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#EFEBE4] dark:border-[#282A30] text-slate-500 dark:text-slate-400 hover:bg-[#FAF8F5] dark:hover:bg-[#202228] hover:text-[#4D7C5D] dark:hover:text-[#78C496] cursor-pointer transition-colors"
            title={j.exportCurrent}
          >
            <span className="text-[10px] font-bold">↓1</span>
          </button>
          <button
            onClick={handleExportAll}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#EFEBE4] dark:border-[#282A30] text-slate-500 dark:text-slate-400 hover:bg-[#FAF8F5] dark:hover:bg-[#202228] hover:text-[#4D7C5D] dark:hover:text-[#78C496] cursor-pointer transition-colors"
            title={j.exportAll}
          >
            <span className="text-[10px] font-bold">↓*</span>
          </button>
          <button
            onClick={goToday}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#4D7C5D] hover:bg-[#3F684C] text-white cursor-pointer transition-colors"
            title={j.goToday || "今天"}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 主体：日记本 + 右侧关联 */}
      <div className="flex flex-grow min-h-0 gap-4">
        <section className="flex-grow min-w-0 flex flex-col gap-3">
          <div className="flex-grow min-h-0 flex flex-col rounded-2xl overflow-hidden bg-[#FCFBF7] dark:bg-[#1C1D21] shadow-[0_2px_14px_rgba(120,100,70,0.10)] dark:shadow-none border border-[#ECE3D2] dark:border-[#383A42] relative">
            {/* 书脊 */}
            <div className="absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-b from-[#EFE7D6] via-[#E7DCC6] to-[#EFE7D6] dark:from-[#25272D] dark:via-[#1F2025] dark:to-[#25272D]" />
            <div className="absolute left-2 top-0 bottom-0 w-px bg-[#D9CDB4]/70 dark:bg-[#383A42]" />
            <div
              key={`page-${currentDate}-${flipTick}`}
              className="pl-6 pr-5 py-4 flex flex-col gap-3 h-full min-h-0 animate-fade-in-up"
            >
              {/* 页眉：大日期 + 翻页 */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => shiftDate(-1)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#E5D9C2] dark:border-[#383A42] text-[#8B6E3C] dark:text-[#CBB182] hover:bg-[#F3ECDF] dark:hover:bg-[#282A30] cursor-pointer transition-colors"
                  title={j.prevDay || "前一天"}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex-grow text-center">
                  <div className="text-2xl font-bold text-[#5A4A33] dark:text-[#EADFC9] font-serif tracking-tight">
                    {headerDate.big}
                  </div>
                  <div className="text-[10px] text-[#9A8866] dark:text-[#A89878] mt-0.5">
                    {headerDate.small}
                  </div>
                </div>
                <button
                  onClick={() => shiftDate(1)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#E5D9C2] dark:border-[#383A42] text-[#8B6E3C] dark:text-[#CBB182] hover:bg-[#F3ECDF] dark:hover:bg-[#282A30] cursor-pointer transition-colors"
                  title={j.prevDay || "后一天"}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center justify-center gap-2 -mt-1">
                {!isToday && (
                  <button
                    onClick={goToday}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-[#F0F5F1] dark:bg-[#1F2C23] text-[#4D7C5D] dark:text-[#78C496] hover:bg-[#E4EEE6] dark:hover:bg-[#283C2D] cursor-pointer border border-[#C4D7B2] dark:border-[#2D4534]"
                  >
                    {j.goToday}
                  </button>
                )}
                {isFuture && <span className="text-[10px] text-slate-400">· {j.futureDay}</span>}
                {/* 今日心情：与「回到今天」同行，省一行 */}
                <span className="mx-1 text-[#E5D9C2] dark:text-[#383A42]">|</span>
                {JOURNAL_MOODS.map((m) => {
                  const active = selected?.mood === m.emoji;
                  return (
                    <button
                      key={m.emoji}
                      type="button"
                      onClick={() => handleMoodPick(m.emoji)}
                      title={m.label}
                      className={`w-7 h-7 flex items-center justify-center rounded-full text-sm transition-all cursor-pointer border ${
                        active
                          ? "bg-[#F0F5F1] dark:bg-[#1F2C23] border-[#4D7C5D] dark:border-[#78C496] scale-110 shadow-sm"
                          : "bg-transparent border-transparent hover:bg-[#F3ECDF]/80 dark:hover:bg-[#282A30] opacity-60 hover:opacity-100"
                      }`}
                    >
                      {m.emoji}
                    </button>
                  );
                })}
              </div>

              {editorInner}
            </div>
          </div>
        </section>

        {/* 右：今日关联 */}
        <aside className="w-56 flex-shrink-0 flex flex-col gap-4 border-l border-[#EFEBE4] dark:border-[#282A30] pl-3 overflow-y-auto custom-scrollbar">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#4D7C5D] dark:text-[#78C496] mb-2">
              <ListChecks className="w-3.5 h-3.5" />
              {j.todayLinks}
            </div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
              {j.todayTasks}
            </div>
            <div className="space-y-1 mb-3">
              {viewTasks.length === 0 && (
                <div className="text-[11px] text-slate-300 dark:text-slate-600">{j.noTasks}</div>
              )}
              {viewTasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => insertLine(task.title)}
                  className="w-full text-left text-[11px] text-slate-600 dark:text-slate-300 bg-white dark:bg-[#16171B] border border-[#EFEBE4] dark:border-[#282A30] hover:border-[#4D7C5D] dark:hover:border-[#78C496] rounded-lg px-2 py-1.5 cursor-pointer transition-colors truncate"
                  title={task.title}
                >
                  {task.title}
                </button>
              ))}
            </div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
              {j.todayDone || "今日完成"}
            </div>
            <div className="space-y-1 mb-3">
              {viewDone.length === 0 && (
                <div className="text-[11px] text-slate-300 dark:text-slate-600">
                  {j.noDone || "今天还没有完成任务"}
                </div>
              )}
              {viewDone.slice(0, 8).map((task) => (
                <button
                  key={task.id}
                  onClick={() => insertLine(`✓ ${task.title}`)}
                  className="w-full text-left text-[11px] text-[#4D7C5D] dark:text-[#78C496] bg-[#F0F5F1] dark:bg-[#1F2C23] border border-[#C4D7B2]/60 dark:border-[#2D4534] hover:border-[#4D7C5D] dark:hover:border-[#78C496] rounded-lg px-2 py-1.5 cursor-pointer transition-colors truncate"
                  title={task.title}
                >
                  ✓ {task.title}
                </button>
              ))}
            </div>
            {viewFocus.count > 0 && (
              <button
                onClick={() =>
                  insertLine(`🍅 专注 ${viewFocus.minutes} 分钟（${viewFocus.count} 个番茄）`)
                }
                className="w-full text-left text-[11px] text-[#A64424] dark:text-[#E07A5F] bg-[#FBECE5] dark:bg-[#2D1F1C] border border-[#F6DCD2] dark:border-[#472E27] hover:border-[#E57C58] dark:hover:border-[#E07A5F] rounded-lg px-2 py-1.5 cursor-pointer transition-colors mt-2"
                title={j.insertFocus || "插入到日记"}
              >
                🍅 {j.todayFocus || "今日专注"}：{viewFocus.minutes} 分钟 · {viewFocus.count} 个番茄
              </button>
            )}
          </div>

          {/* 今日习惯 */}
          {habitsHook.habits.length > 0 && (
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                {(t.habits as Record<string, string>)?.todayHabits || "今日习惯"}
              </div>
              <div className="space-y-1">
                {habitsHook.habits.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => habitsHook.toggleHabit(h.id)}
                    className={`w-full text-left text-[11px] font-bold px-2 py-1.5 rounded-lg cursor-pointer transition-colors border flex items-center gap-1.5 ${
                      h.doneToday
                        ? "text-[#A34434] bg-[#FCF2F0] border-[#F5DFDB] dark:bg-[#3D2325] dark:border-[#422D30] dark:text-[#E06D53] line-through"
                        : "text-slate-600 bg-[#FAF8F5] hover:bg-white border-transparent dark:bg-[#24262B] dark:text-slate-300 dark:hover:bg-[#282A30]"
                    }`}
                  >
                    <span>{h.emoji}</span>
                    <span>{h.name}</span>
                    {h.doneToday && <span className="ml-auto text-[9px]">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
