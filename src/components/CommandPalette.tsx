import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Search,
  ListTodo,
  Grid3x3,
  Calendar,
  StickyNote,
  BookOpen,
  BarChart3,
  CheckCircle2,
  Timer,
  Home,
  Settings,
  Plus,
  Play,
  Lock,
  Layout,
  Sparkles,
} from "lucide-react";
import type { Task, StickyNote as StickyNoteType, AppTab, JournalEntry } from "../types";

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  section: "navigation" | "tasks" | "notes" | "journal" | "actions";
  icon: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
  keywords?: string;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  tasks: Task[];
  stickyNotes: StickyNoteType[];
  journal?: JournalEntry[];
  onTaskClick: (task: Task) => void;
  onNavigate: (tab: AppTab) => void;
  onCreateTask: () => void;
  onStartFocus: (taskId: string, taskTitle: string) => void;
  onToggleWidget: () => void;
  onToggleWidgetLock: () => void;
  onEnterFlowMode: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
  tasks,
  stickyNotes,
  journal,
  onTaskClick,
  onNavigate,
  onCreateTask,
  onStartFocus,
  onToggleWidget,
  onToggleWidgetLock,
  onEnterFlowMode,
}) => {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 每次打开时清空 query、聚焦、重置高亮
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // 构建候选项池
  const allItems = useMemo<CommandItem[]>(() => {
    const navigation: CommandItem[] = [
      {
        id: "nav-home",
        label: "首页 Dashboard",
        section: "navigation",
        icon: Home,
        onSelect: () => onNavigate("home"),
        keywords: "home dashboard 首页 主页",
      },
      {
        id: "nav-matrix",
        label: "四象限矩阵",
        section: "navigation",
        icon: Grid3x3,
        onSelect: () => onNavigate("matrix"),
        keywords: "matrix 矩阵 象限 艾森豪威尔",
      },
      {
        id: "nav-list",
        label: "任务列表",
        section: "navigation",
        icon: ListTodo,
        onSelect: () => onNavigate("list"),
        keywords: "list 列表 任务",
      },
      {
        id: "nav-calendar",
        label: "日历视图",
        section: "navigation",
        icon: Calendar,
        onSelect: () => onNavigate("calendar"),
        keywords: "calendar 日历",
      },
      {
        id: "nav-notes",
        label: "便签墙",
        section: "navigation",
        icon: StickyNote,
        onSelect: () => onNavigate("notes"),
        keywords: "notes 便签 sticky",
      },
      {
        id: "nav-journal",
        label: "日记手账",
        section: "navigation",
        icon: BookOpen,
        onSelect: () => onNavigate("journal"),
        keywords: "journal 日记 手账 双链 笔记",
      },
      {
        id: "nav-[#memory]",
        label: "时光长廊",
        section: "navigation",
        icon: Sparkles,
        onSelect: () => onNavigate("memory"),
        keywords: "memory 时光长廊 记忆 回顾 画廊",
      },
      {
        id: "nav-analytics",
        label: "数据分析",
        section: "navigation",
        icon: BarChart3,
        onSelect: () => onNavigate("analytics"),
        keywords: "analytics 分析 统计 数据",
      },
      {
        id: "nav-completed",
        label: "已完成",
        section: "navigation",
        icon: CheckCircle2,
        onSelect: () => onNavigate("completed"),
        keywords: "completed done 完成",
      },
      {
        id: "nav-countdown",
        label: "倒计时",
        section: "navigation",
        icon: Timer,
        onSelect: () => onNavigate("countdown"),
        keywords: "countdown 倒计时",
      },
      {
        id: "nav-settings",
        label: "设置",
        section: "navigation",
        icon: Settings,
        onSelect: () => onNavigate("settings"),
        keywords: "settings 设置 setting",
      },
    ];

    const actions: CommandItem[] = [
      {
        id: "act-new-task",
        label: "新建任务",
        hint: "打开列表并新建",
        section: "actions",
        icon: Plus,
        onSelect: () => {
          onNavigate("list");
          setTimeout(onCreateTask, 100);
        },
        keywords: "new create 新建 添加 任务",
      },
      {
        id: "act-new-journal",
        label: "写一篇新日记手帐",
        section: "actions",
        icon: BookOpen,
        onSelect: () => onNavigate("journal"),
        keywords: "journal write 新建 日记 随记 手账",
      },
      {
        id: "act-flow",
        label: "进入专注流模式",
        section: "actions",
        icon: Layout,
        onSelect: onEnterFlowMode,
        keywords: "flow focus 流 专注 全屏",
      },
      {
        id: "act-widget",
        label: "显示/隐藏挂件",
        section: "actions",
        icon: Layout,
        onSelect: onToggleWidget,
        keywords: "widget 挂件 悬浮",
      },
      {
        id: "act-widget-lock",
        label: "锁定/解锁挂件",
        section: "actions",
        icon: Lock,
        onSelect: onToggleWidgetLock,
        keywords: "lock unlock 锁定 解锁 挂件",
      },
    ];

    const journalItems: CommandItem[] = (journal || []).slice(0, 50).map((j) => ({
      id: `journal-${j.id}`,
      label: j.title || `日记 ${j.date}`,
      hint: j.content.slice(0, 50),
      section: "journal",
      icon: BookOpen,
      onSelect: () => onNavigate("journal"),
      keywords: `${j.title} ${j.content} ${j.date} ${(j.mood || "")}`,
    }));

    const taskItems: CommandItem[] = tasks.slice(0, 100).map((t) => ({
      id: `task-${t.id}`,
      label: t.title,
      hint: t.description || (t.dueDate ? `截止 ${t.dueDate}` : undefined),
      section: "tasks",
      icon: ListTodo,
      onSelect: () => onTaskClick(t),
      keywords: `${t.title} ${t.description || ""} ${(t.tags || []).join(" ")}`,
    }));

    // 每个任务额外提供“开始专注”动作项
    const focusItems: CommandItem[] = tasks.slice(0, 20).map((t) => ({
      id: `focus-${t.id}`,
      label: `开始专注：${t.title}`,
      section: "actions",
      icon: Play,
      onSelect: () => onStartFocus(t.id, t.title),
      keywords: `focus start pomodoro 专注 番茄 ${t.title}`,
    }));

    const noteItems: CommandItem[] = stickyNotes.slice(0, 50).map((n) => ({
      id: `note-${n.id}`,
      label: (n.text || "（空便签）").slice(0, 60),
      hint: n.text.length > 60 ? "…" : undefined,
      section: "notes",
      icon: StickyNote,
      onSelect: () => onNavigate("notes"),
      keywords: n.text,
    }));

    return [
      ...navigation,
      ...actions,
      ...focusItems,
      ...journalItems,
      ...taskItems,
      ...noteItems,
    ];
  }, [
    tasks,
    stickyNotes,
    journal,
    onNavigate,
    onTaskClick,
    onCreateTask,
    onStartFocus,
    onToggleWidget,
    onToggleWidgetLock,
    onEnterFlowMode,
  ]);

  // 简易 fuzzy：所有字符按顺序出现即算命中；同时对完全 includes 优先加分
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return allItems
        .filter((it) => it.section === "navigation" || it.section === "actions")
        .slice(0, 12);
    }
    const scored: { item: CommandItem; score: number }[] = [];
    for (const item of allItems) {
      const hay = `${item.label} ${item.keywords || ""}`.toLowerCase();
      if (hay.includes(q)) {
        const startBonus = hay.startsWith(q) ? 50 : 0;
        scored.push({ item, score: 100 + startBonus });
        continue;
      }
      let i = 0;
      for (const ch of hay) {
        if (ch === q[i]) i++;
        if (i >= q.length) break;
      }
      if (i >= q.length) {
        scored.push({ item, score: 30 });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 50).map((s) => s.item);
  }, [query, allItems]);

  const sectionLabel: Record<CommandItem["section"], string> = {
    navigation: "页面导航",
    actions: "快捷操作",
    journal: "日记手帐",
    tasks: "待办任务",
    notes: "随手便签",
  };

  const { grouped, flatOrder } = useMemo(() => {
    const grouped: {
      section: CommandItem["section"];
      items: CommandItem[];
      startIdx: number;
    }[] = [];
    let cursor = 0;
    for (const section of [
      "actions",
      "navigation",
      "journal",
      "tasks",
      "notes",
    ] as CommandItem["section"][]) {
      const items = filtered.filter((it) => it.section === section);
      if (items.length > 0) {
        grouped.push({ section, items, startIdx: cursor });
        cursor += items.length;
      }
    }
    const flatOrder: CommandItem[] = grouped.flatMap((g) => g.items);
    return { grouped, flatOrder };
  }, [filtered]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, flatOrder.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = flatOrder[activeIdx];
        if (item) {
          item.onSelect();
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, flatOrder, activeIdx, onClose]);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-idx="${activeIdx}"]`
    );
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/25 backdrop-blur-xs animate-fade-in-up"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl mx-4 bg-white/95 border border-[#EFEBE4] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* 输入框 */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#EFEBE4]">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            placeholder="搜索任务、日记正文、便签，或输入命令..."
            className="flex-grow bg-transparent focus:outline-none text-sm font-medium text-slate-800 placeholder-slate-400"
          />
          <kbd className="text-[9px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded shrink-0">
            ESC
          </kbd>
        </div>

        {/* 结果列表 */}
        <div
          ref={listRef}
          className="max-h-[50vh] overflow-y-auto custom-scrollbar py-1"
        >
          {flatOrder.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-400 font-medium">
              没有找到匹配项
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.section} className="px-1">
                <div className="px-3 pt-2 pb-1 text-[9px] font-black text-slate-400 tracking-widest uppercase">
                  {sectionLabel[group.section]}
                </div>
                {group.items.map((item, idxInGroup) => {
                  const flatIdx = group.startIdx + idxInGroup;
                  const isActive = flatIdx === activeIdx;
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.id}
                      data-idx={flatIdx}
                      onMouseEnter={() => setActiveIdx(flatIdx)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        item.onSelect();
                        onClose();
                      }}
                      className={`flex items-center gap-3 px-3 py-2 mx-1 rounded-xl cursor-pointer transition-colors ${
                        isActive
                          ? "bg-[#FCF2F0] text-[#A34E36]"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <Icon
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isActive ? "text-[#A34E36]" : "text-slate-400"
                        }`}
                      />
                      <span className="text-xs font-bold flex-grow truncate">
                        {item.label}
                      </span>
                      {item.hint && (
                        <span className="text-[10px] text-slate-400 font-medium truncate max-w-[180px]">
                          {item.hint}
                        </span>
                      )}
                      {isActive && (
                        <kbd className="text-[8px] font-bold text-[#A34E36]/70 bg-white border border-[#F5DFDB] px-1 py-0.5 rounded shrink-0">
                          ↵
                        </kbd>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* 底部提示 */}
        <div className="px-4 py-2 border-t border-[#EFEBE4] bg-[#FAF8F5]/60 flex items-center justify-between text-[9px] text-slate-400 font-bold">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="bg-white border border-slate-200 px-1 py-0.5 rounded">
                ↑↓
              </kbd>
              选择
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-white border border-slate-200 px-1 py-0.5 rounded">
                ↵
              </kbd>
              确认
            </span>
          </div>
          <span>Cmd/Ctrl + K 唤起</span>
        </div>
      </div>
    </div>
  );
};
