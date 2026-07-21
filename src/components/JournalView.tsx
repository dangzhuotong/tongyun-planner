import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { BookOpen, StickyNote as NoteIcon, Trash2, Search, ListChecks, Tag as TagIcon, ChevronLeft, ChevronRight, Sparkles, Plus } from "lucide-react";
import type { JournalEntry, Task, CustomizationConfig, PomodoroLog } from "../types";
import { extractJournalTags } from "../constants";
import { createId } from "../utils/id";
import { getLocalDateString } from "../utils/date";
import { pomodoroStatsOn, taskCompletedOn } from "../utils/dailyReview";
import { useTranslation } from "../i18n/LanguageContext";
import { callAI } from "../utils/aiEngine";
import { usePersonal } from "../context/PersonalContext";

/** 日记页心情：五级，存为 emoji 字符串 */
const JOURNAL_MOODS = [
  { emoji: "😞", label: "很差" },
  { emoji: "😔", label: "不好" },
  { emoji: "😐", label: "一般" },
  { emoji: "😊", label: "不错" },
  { emoji: "😄", label: "很棒" },
] as const;

/** 「暖评」内置默认系统提示词：先深度思考，再写一段克制而真诚的温暖回应 */
export function buildDefaultCommentPrompt(lang: string): string {
  return `你是"暖评"——用户日记本里一位真正懂他的老友，兼有敏锐的洞察与克制的温柔。

请先在心里认真、慢慢地把这篇日记读两遍，做一次深度思考（不要把思考过程写出来）：
1. 事实：今天真正发生了什么？哪些是具体的行动、选择或转折点？
2. 情绪：字里行间藏着怎样的心情？有没有没说出口、却在语气里的东西？
3. 需要：此刻的他最需要被回应的是什么——是被肯定、被安慰、被陪伴，还是只想被静静听见？
4. 意义：把今天放进更长的时间里看，它说明了他怎样的努力、成长或坚持？

然后用${lang}写一段简短、温暖、真诚的回应（3-5 句，约 60-100 字）：
- 先具体地"看见"他今天某个真实的细节，而不是泛泛的安慰
- 温和地映照他的情绪，不评判、不说教、不灌鸡汤、不讲大道理
- 若有疲惫或低落，给轻轻的安慰与陪伴；若有进展，认真替他高兴
- 语气像朋友面对面说话，自然、不客套、不夸张
- 至多用 1 个 emoji，也可以不用
- 只返回回应文本本身，不要任何前缀、标题、引号或解释`;
}

interface JournalViewProps {
  tasks: Task[];
  completedTasks: Task[];
  pomodoroLogs: Pick<PomodoroLog, "id" | "timestamp" | "duration">[];
  aiConfig: CustomizationConfig;
}

export function JournalView({ tasks, completedTasks, pomodoroLogs, aiConfig }: JournalViewProps) {
  const {
    journal, handleUpsertJournal: onUpsert, handleDeleteJournal: onDelete,
    journalAddTodo: addTodoEnabled, handleToggleJournalAddTodo: onToggleAddTodo,
  } = usePersonal();
  const { t, locale } = useTranslation();
  const j = t.journal as Record<string, string>;
  const today = getLocalDateString();

  const [mode, setMode] = useState<"diary" | "note">("diary");
  const [currentDate, setCurrentDate] = useState<string>(today);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [tagOpen, setTagOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const activeDateRef = useRef<HTMLButtonElement>(null);

  const dailyEntryMap = useMemo(() => {
    const m = new Map<string, JournalEntry>();
    journal.forEach((e) => { if (e.isDaily) m.set(e.date, e); });
    return m;
  }, [journal]);

  const notes = useMemo(
    () => journal.filter((e) => !e.isDaily).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    [journal]
  );

  const selected = useMemo(() => {
    if (mode === "diary") return dailyEntryMap.get(currentDate) || null;
    return notes.find((n) => n.id === selectedNoteId) || null;
  }, [mode, currentDate, dailyEntryMap, notes, selectedNoteId]);

  const viewDate = mode === "diary" ? currentDate : (selected?.date || today);

  // 本地草稿，避免每次按键都触发父级重渲染造成的光标跳动
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");

  useEffect(() => {
    setDraftTitle(selected?.title || "");
    setDraftContent(selected?.content || "");
    setConfirmDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const commit = useCallback((patch: Partial<JournalEntry>) => {
    const base = selected || ({
      id: createId("journal"),
      linkKey: viewDate,
      title: viewDate,
      content: "",
      date: viewDate,
      isDaily: mode === "diary",
      createdAt: Date.now(),
    } as JournalEntry);
    const next: JournalEntry = {
      ...base,
      ...patch,
      updatedAt: Date.now(),
    };
    onUpsert(next);
  }, [selected, onUpsert, viewDate, mode]);

  const handleContentChange = (v: string) => {
    setDraftContent(v);
    commit({ content: v });
  };
  const handleTitleChange = (v: string) => {
    setDraftTitle(v);
    const linkKey = selected?.isDaily ? selected.linkKey : v.trim() || createId("journal");
    commit({ title: v, linkKey });
  };
  const handleMoodPick = (emoji: string) => {
    if (mode !== "diary") return;
    const base = selected || ({
      id: createId("journal"),
      linkKey: viewDate,
      title: viewDate,
      content: "",
      date: viewDate,
      isDaily: true,
      createdAt: Date.now(),
    } as JournalEntry);
    const next: JournalEntry = { ...base, updatedAt: Date.now() };
    if (selected?.mood === emoji) {
      delete next.mood;
    } else {
      next.mood = emoji;
    }
    onUpsert(next);
  };

  const newDaily = () => { setMode("diary"); setCurrentDate(today); };
  const newNote = () => {
    const title = window.prompt(j.newNoteTitle || "笔记标题", "")?.trim();
    if (!title) return;
    const entry: JournalEntry = {
      id: createId("journal"),
      linkKey: title,
      title,
      content: "",
      date: today,
      isDaily: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    onUpsert(entry);
    setMode("note");
    setSelectedNoteId(entry.id);
  };

  const shiftDate = (delta: number) => {
    const [y, m, d] = currentDate.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + delta);
    setCurrentDate(getLocalDateString(dt));
  };
  const goToday = () => setCurrentDate(today);

  const insertLine = (text: string) => {
    const next = draftContent ? `${draftContent}\n${text}` : text;
    handleContentChange(next);
  };

  const viewFocus = useMemo(
    () => pomodoroStatsOn(pomodoroLogs, viewDate),
    [pomodoroLogs, viewDate]
  );

  const viewDone = useMemo(
    () => completedTasks.filter((task) => taskCompletedOn(task, viewDate)),
    [completedTasks, viewDate]
  );

  // 温柔的 AI 评语
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const generateAiComment = useCallback(async () => {
    if (!aiConfig?.aiApiKey) { setAiError(j.needApiKey || "请先在设置中配置 AI API Key"); return; }
    if (!draftContent.trim()) { setAiError(j.emptyContent || "先写点什么，AI 才好回应你～"); return; }
    setAiLoading(true); setAiError(null);
    try {
      const lang = locale === "zh-CN" ? "简体中文" : "English";
      const custom = aiConfig?.journalCommentPrompt?.trim();
      const system = custom
        ? custom.replace(/\$\{lang\}/g, lang)
        : buildDefaultCommentPrompt(lang);
      const result = await callAI(aiConfig, system, `这是用户今天的日记：\n${draftContent}`);
      if (result) commit({ aiComment: result });
    } catch (e: any) {
      setAiError(e?.message === "API_KEY_MISSING" ? (j.needApiKey || "请先配置 AI Key") : (j.aiError || "AI 回应失败，请稍后再试"));
    } finally {
      setAiLoading(false);
    }
  }, [aiConfig, draftContent, commit, locale, j]);

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
      setCurrentDate(earliestDaily);
      return;
    }
    const base = currentDate < stripStart ? currentDate : stripStart;
    const [y, m, d] = base.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - 1);
    setCurrentDate(getLocalDateString(dt));
  };

  const jumpLater = () => {
    const base = currentDate > stripEnd ? currentDate : stripEnd;
    const [y, m, d] = base.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + 1);
    setCurrentDate(getLocalDateString(dt));
  };

  // 日期滑条自动居中定位到当前选中日期
  useEffect(() => {
    if (mode !== "diary") return;
    activeDateRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [currentDate, mode]);

  const filteredNotes = useMemo(() => {
    let list = notes;
    if (activeTag) list = list.filter((e) => extractJournalTags(e.content).includes(activeTag));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((e) => e.content.toLowerCase().includes(q) || e.title.toLowerCase().includes(q));
    }
    return list;
  }, [notes, search, activeTag]);

  // 全部日记/笔记中出现过的标签（去重排序），用于侧栏标签筛选
  const allTags = useMemo(() => {
    const set = new Set<string>();
    journal.forEach((e) => extractJournalTags(e.content).forEach((tag) => set.add(tag)));
    return [...set].sort((a, b) => a.localeCompare(b, locale === "zh-CN" ? "zh" : "en"));
  }, [journal, locale]);

  const viewTasks = useMemo(
    () => tasks.filter((task) => task.dueDate === viewDate),
    [tasks, viewDate]
  );

  const tags = useMemo(() => extractJournalTags(draftContent), [draftContent]);

  // 农历（装饰，动态加载 lunar-javascript，失败则忽略）
  const [lunarText, setLunarText] = useState("");
  useEffect(() => {
    if (mode !== "diary") { setLunarText(""); return; }
    let cancelled = false;
    import("lunar-javascript").then((mod: any) => {
      try {
        const Solar = mod.Solar || (mod.default && mod.default.Solar);
        if (!Solar) return;
        const d = new Date(currentDate + "T00:00:00");
        const lunar = Solar.fromDate(d).getLunar();
        if (!cancelled) setLunarText(`${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`);
      } catch { /* ignore */ }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [currentDate, mode]);

  const weekdayNames = locale === "zh-CN" ? ["日", "一", "二", "三", "四", "五", "六"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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
        {mode === "note" && (
          <input
            value={draftTitle}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder={j.titlePlaceholder}
            className="flex-grow min-w-[160px] bg-transparent text-lg font-bold text-[#2D323A] focus:outline-none placeholder-slate-300 border-b border-transparent focus:border-[#EFEBE4] transition-colors"
          />
        )}
        {selected && (
          confirmDelete ? (
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-[10px] text-[#A34E36]">{j.confirmDelete || "确定删除？"}</span>
              <button
                onClick={() => { onDelete(selected.id); setConfirmDelete(false); if (mode === "diary") setCurrentDate(currentDate); else setSelectedNoteId(null); }}
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
          )
        )}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className="text-[10px] text-[#8B6E3C] bg-[#8B6E3C]/10 rounded-full px-2 py-0.5 font-medium">#{tag}</span>
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={draftContent}
        onChange={(e) => handleContentChange(e.target.value)}
        placeholder={mode === "diary" ? (j.diaryPlaceholder || "写点什么，记下今天…") : "写点什么…"}
        className="flex-grow min-h-0 w-full resize-none rounded-xl p-4 text-[14px] leading-relaxed text-slate-700 dark:text-slate-200 font-serif focus:outline-none focus:border-[#4D7C5D] custom-scrollbar bg-transparent border-transparent"
        style={mode === "diary" ? { lineHeight: "32px", backgroundImage: "repeating-linear-gradient(transparent, transparent 31px, #ECE4D2 32px)", backgroundAttachment: "local" } : undefined}
        spellCheck={false}
      />

      <div className="rounded-xl bg-gradient-to-br from-[#F0F5F1] to-[#FCEFF4] dark:from-[#232924] dark:to-[#2B2125] border border-[#E4EEE6] dark:border-[#33353A] p-4">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#E8A0BF] dark:text-[#E8A0BF]/80 mb-2">
          <Sparkles className="w-3.5 h-3.5" />{j.aiCommentTitle || "暖评"}
        </div>
        {selected?.aiComment ? (
          <>
            <p className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{selected.aiComment}</p>
            <button onClick={generateAiComment} disabled={aiLoading} className="mt-2 text-[10px] text-[#4D7C5D] dark:text-[#6FAD84] hover:underline disabled:opacity-40 cursor-pointer">
              {aiLoading ? "..." : (j.regenerate || "重新生成")}
            </button>
          </>
        ) : (
          <button onClick={generateAiComment} disabled={aiLoading} className="text-[11px] font-semibold px-3 py-2 rounded-lg bg-white dark:bg-[#1C1D21] border border-[#E4EEE6] dark:border-[#383A42] text-[#4D7C5D] dark:text-[#6FAD84] hover:bg-[#EAF1EC] dark:hover:bg-[#232924] transition-colors cursor-pointer disabled:opacity-40 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />{aiLoading ? (j.aiThinking || "正在写暖评...") : (j.aiGenerate || "完成今天，收下今天的暖评")}
          </button>
        )}
        {aiError && <p className="text-[10px] text-red-500 mt-2">{aiError}</p>}
      </div>
      {selected && (
        <div className="text-[10px] text-slate-400 text-right">
          {j.updatedAt} {new Date(selected.updatedAt).toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
        </div>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* 顶部：模式 + 日期滑条 + 工具 */}
      <header className="flex items-center gap-3 flex-shrink-0">
        <div className="flex gap-1.5">
          <button
            onClick={newDaily}
            className={`flex items-center gap-1 text-[11px] font-bold rounded-xl px-3 py-1.5 cursor-pointer transition-colors ${
              mode === "diary" ? "text-white bg-[#4D7C5D] hover:bg-[#3F684C]" : "text-[#4D7C5D] bg-[#F0F5F1] hover:bg-[#E4EEE6] border border-[#C4D7B2]"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />{j.dailyNotes}
          </button>
          <button
            onClick={newNote}
            className={`flex items-center gap-1 text-[11px] font-bold rounded-xl px-3 py-1.5 cursor-pointer transition-colors ${
              mode === "note" ? "text-white bg-[#4D7C5D] hover:bg-[#3F684C]" : "text-[#4D7C5D] bg-[#F0F5F1] hover:bg-[#E4EEE6] border border-[#C4D7B2]"
            }`}
          >
            <NoteIcon className="w-3.5 h-3.5" />{j.notes}
          </button>
        </div>

        <button
          onClick={() => onToggleAddTodo(!addTodoEnabled)}
          className={`flex items-center gap-1.5 text-[11px] font-bold rounded-xl px-3 py-1.5 cursor-pointer transition-colors border ${
            addTodoEnabled
              ? "text-white bg-[#4D7C5D] hover:bg-[#3F684C] border-[#4D7C5D]"
              : "text-[#4D7C5D] bg-[#F0F5F1] hover:bg-[#E4EEE6] border-[#C4D7B2]"
          }`}
          title={j.addTodoHint || "开启后，每一天的日记都会加入当日待办"}
        >
          <ListChecks className="w-3.5 h-3.5" />
          {addTodoEnabled ? "✓ " : ""}{j.addTodo}
        </button>

        {mode === "diary" && (
          <div ref={stripRef} className="flex-1 overflow-x-auto custom-scrollbar flex items-center gap-1.5 pb-1">
            <button
              type="button"
              onClick={jumpEarlier}
              className="flex-shrink-0 px-2 py-1 rounded-xl text-[10px] font-bold text-slate-400 border border-[#EFEBE4] bg-white hover:bg-[#FAF8F5] hover:text-[#4D7C5D] cursor-pointer"
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
                  {(() => { const [, m, d] = currentDate.split("-"); return `${Number(m)}/${Number(d)}`; })()}
                </span>
                <span className="text-[9px] mt-0.5 leading-none">{j.outsideStrip || "滑条外"}</span>
              </button>
            )}
            {dateStrip.map((ds) => {
              const [y, m, d] = ds.split("-").map(Number);
              const wd = weekdayNames[new Date(y, m - 1, d).getDay()];
              const entry = dailyEntryMap.get(ds);
              const has = !!entry && !!(entry.content?.trim() || entry.mood);
              const active = ds === currentDate;
              return (
                <button
                  key={ds}
                  ref={active ? activeDateRef : undefined}
                  onClick={() => setCurrentDate(ds)}
                  className={`flex-shrink-0 flex flex-col items-center px-2.5 py-1 rounded-xl transition-colors cursor-pointer border ${
                    active
                      ? "bg-[#4D7C5D] text-white border-[#4D7C5D]"
                      : has
                        ? "bg-[#F0F5F1] text-[#4D7C5D] border-[#C4D7B2] hover:bg-[#E4EEE6]"
                        : "bg-white text-slate-400 border-[#EFEBE4] hover:bg-[#FAF8F5]"
                  }`}
                  title={ds}
                >
                  <span className="text-[11px] font-bold leading-none">{m}/{d}</span>
                  <span className="text-[9px] mt-0.5 leading-none">{wd}</span>
                  {entry?.mood ? (
                    <span className="text-[10px] mt-0.5 leading-none">{entry.mood}</span>
                  ) : has ? (
                    <span className={`w-1 h-1 rounded-full mt-1 ${active ? "bg-white" : "bg-[#C4D7B2]"}`} />
                  ) : null}
                </button>
              );
            })}
            <button
              type="button"
              onClick={jumpLater}
              className="flex-shrink-0 px-2 py-1 rounded-xl text-[10px] font-bold text-slate-400 border border-[#EFEBE4] bg-white hover:bg-[#FAF8F5] hover:text-[#4D7C5D] cursor-pointer"
              title={j.jumpLater || "更晚"}
            >
              {j.jumpLater || "更晚"} ›
            </button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2 flex-shrink-0 relative">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={j.search}
              className="w-36 bg-white border border-[#EFEBE4] pl-8 pr-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 placeholder-slate-400 focus:outline-none focus:border-[#4D7C5D]"
            />
          </div>
          {allTags.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setTagOpen((v) => !v)}
                className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                  tagOpen || activeTag ? "border-[#8B6E3C] text-[#8B6E3C] bg-[#8B6E3C]/10" : "border-[#EFEBE4] text-slate-500 hover:bg-[#FAF8F5]"
                }`}
                title={j.tags}
              >
                <TagIcon className="w-3.5 h-3.5" />
              </button>
              {tagOpen && (
                <div className="absolute right-0 top-10 z-20 w-56 bg-white border border-[#EFEBE4] rounded-xl shadow-lg p-3 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {allTags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => setActiveTag((prev) => (prev === tag ? null : tag))}
                        className={`text-[10px] rounded-full px-2 py-0.5 font-medium transition-colors cursor-pointer border ${
                          activeTag === tag ? "bg-[#8B6E3C] text-white border-[#8B6E3C]" : "text-[#8B6E3C] bg-[#8B6E3C]/10 border-transparent hover:bg-[#8B6E3C]/20"
                        }`}
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                  {activeTag && (
                    <button onClick={() => setActiveTag(null)} className="text-[10px] text-slate-400 hover:text-slate-600">{j.clearTag} ✕</button>
                  )}
                </div>
              )}
            </div>
          )}
          <button
            onClick={mode === "diary" ? newDaily : newNote}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#4D7C5D] hover:bg-[#3F684C] text-white cursor-pointer transition-colors"
            title={mode === "diary" ? j.newDaily : j.newNote}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 主体：日记本 + 右侧关联 */}
      <div className="flex flex-grow min-h-0 gap-4">
        <section className="flex-grow min-w-0 flex flex-col gap-3">
          {mode === "diary" ? (
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
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#E5D9C2] text-[#8B6E3C] hover:bg-[#F3ECDF] cursor-pointer transition-colors"
                    title={j.prevDay || "前一天"}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="flex-grow text-center">
                    <div className="text-2xl font-bold text-[#5A4A33] font-serif tracking-tight">{headerDate.big}</div>
                    <div className="text-[10px] text-[#9A8866] mt-0.5">{headerDate.small}</div>
                  </div>
                  <button
                    onClick={() => shiftDate(1)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#E5D9C2] text-[#8B6E3C] hover:bg-[#F3ECDF] cursor-pointer transition-colors"
                    title={j.prevDay || "后一天"}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center justify-center gap-2 -mt-1">
                  {!isToday && (
                    <button
                      onClick={goToday}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-[#F0F5F1] text-[#4D7C5D] hover:bg-[#E4EEE6] cursor-pointer border border-[#C4D7B2]"
                    >
                      {j.goToday}
                    </button>
                  )}
                  {isFuture && <span className="text-[10px] text-slate-400">· {j.futureDay}</span>}
                </div>

                {/* 今日心情 */}
                <div className="flex flex-col items-center gap-1.5">
                  <span className="text-[9px] font-bold text-[#9A8866] tracking-wider">
                    {j.moodTitle || "今日心情"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {JOURNAL_MOODS.map((m) => {
                      const active = selected?.mood === m.emoji;
                      return (
                        <button
                          key={m.emoji}
                          type="button"
                          onClick={() => handleMoodPick(m.emoji)}
                          title={m.label}
                          className={`w-8 h-8 flex items-center justify-center rounded-full text-base transition-all cursor-pointer border ${
                            active
                              ? "bg-[#F0F5F1] border-[#4D7C5D] scale-110 shadow-sm"
                              : "bg-transparent border-transparent hover:bg-[#F3ECDF]/80 opacity-70 hover:opacity-100"
                          }`}
                        >
                          {m.emoji}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {editorInner}
              </div>
            </div>
          ) : (
            <div className="flex-grow min-h-0 flex flex-col gap-3">
              {!selected ? (
                <div className="flex-grow min-h-0 overflow-y-auto custom-scrollbar grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {filteredNotes.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => { setSelectedNoteId(e.id); }}
                      className="text-left p-3 rounded-xl bg-[#FCFBF7] dark:bg-[#1C1D21] border border-[#ECE3D2] dark:border-[#383A42] hover:border-[#4D7C5D] dark:hover:border-[#4D7C5D] shadow-[0_2px_10px_rgba(120,100,70,0.08)] dark:shadow-none cursor-pointer transition-colors min-h-[88px] flex flex-col"
                    >
                      <span className="text-[13px] font-bold text-[#2D323A] truncate">{e.title || "(无标题)"}</span>
                      <span className="text-[10px] text-slate-400 mt-1 line-clamp-3 flex-grow overflow-hidden">{e.content.replace(/[#*`\[\]]/g, "").slice(0, 80)}</span>
                    </button>
                  ))}
                  {filteredNotes.length === 0 && (
                    <div className="col-span-full flex flex-col items-center justify-center text-slate-400 gap-3 select-none h-full">
                      <BookOpen className="w-12 h-12 opacity-40" />
                      <p className="text-sm font-medium">{j.noEntry}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-grow min-h-0 flex flex-col rounded-2xl overflow-hidden bg-[#FCFBF7] dark:bg-[#1C1D21] shadow-[0_2px_14px_rgba(120,100,70,0.10)] dark:shadow-none border border-[#ECE3D2] dark:border-[#383A42] relative">
                  <div className="absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-b from-[#EFE7D6] via-[#E7DCC6] to-[#EFE7D6] dark:from-[#25272D] dark:via-[#1F2025] dark:to-[#25272D]" />
                  <div className="absolute left-2 top-0 bottom-0 w-px bg-[#D9CDB4]/70 dark:bg-[#383A42]" />
                  <div className="pl-6 pr-5 py-4 flex flex-col gap-3 h-full min-h-0">
                    {editorInner}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* 右：今日关联 */}
        <aside className="w-56 flex-shrink-0 flex flex-col gap-4 border-l border-[#EFEBE4] pl-3 overflow-y-auto custom-scrollbar">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#4D7C5D] mb-2">
              <ListChecks className="w-3.5 h-3.5" />{j.todayLinks}
            </div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{j.todayTasks}</div>
            <div className="space-y-1 mb-3">
              {viewTasks.length === 0 && <div className="text-[11px] text-slate-300">{j.noTasks}</div>}
              {viewTasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => insertLine(task.title)}
                  className="w-full text-left text-[11px] text-slate-600 bg-white border border-[#EFEBE4] hover:border-[#4D7C5D] rounded-lg px-2 py-1.5 cursor-pointer transition-colors truncate"
                  title={task.title}
                >
                  {task.title}
                </button>
              ))}
            </div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{j.todayDone || "今日完成"}</div>
            <div className="space-y-1 mb-3">
              {viewDone.length === 0 && <div className="text-[11px] text-slate-300">{j.noDone || "今天还没有完成任务"}</div>}
              {viewDone.slice(0, 8).map((task) => (
                <button
                  key={task.id}
                  onClick={() => insertLine(`✓ ${task.title}`)}
                  className="w-full text-left text-[11px] text-[#4D7C5D] bg-[#F0F5F1] border border-[#C4D7B2]/60 hover:border-[#4D7C5D] rounded-lg px-2 py-1.5 cursor-pointer transition-colors truncate"
                  title={task.title}
                >
                  ✓ {task.title}
                </button>
              ))}
            </div>
            {viewFocus.count > 0 && (
              <button
                onClick={() => insertLine(`🍅 专注 ${viewFocus.minutes} 分钟（${viewFocus.count} 个番茄）`)}
                className="w-full text-left text-[11px] text-[#A64424] bg-[#FBECE5] border border-[#F6DCD2] hover:border-[#E57C58] rounded-lg px-2 py-1.5 cursor-pointer transition-colors mt-2"
                title={j.insertFocus || "插入到日记"}
              >
                🍅 {j.todayFocus || "今日专注"}：{viewFocus.minutes} 分钟 · {viewFocus.count} 个番茄
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
