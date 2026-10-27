import React, { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Trash2,
  Search,
  Database,
  StickyNote,
  Tag,
  Clock,
  Sparkles,
} from "lucide-react";
import type { PluginManifest, PluginViewProps } from "./types";
import { getPluginDatabase } from "./database";

interface NoteRow {
  id: string;
  title: string;
  content: string;
  category: string;
  created_at: number;
}

interface Props {
  pluginId: string;
  manifest: PluginManifest;
  viewProps: PluginViewProps;
}

const CATEGORIES = ["全部", "灵感", "工作", "生活", "技术"];

export const GenericPluginDataView: React.FC<Props> = ({
  pluginId,
  manifest,
}) => {
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("全部");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // 新增表单项
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("灵感");

  // 加载数据
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const db = await getPluginDatabase(pluginId, manifest);
      const rows = await db.select<NoteRow>(
        "SELECT * FROM notes ORDER BY created_at DESC",
      );
      setNotes(rows || []);
    } catch (e) {
      console.warn(`[${pluginId}] Load notes error:`, e);
    } finally {
      setLoading(false);
    }
  }, [pluginId, manifest]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 新增便签记录
  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      const db = await getPluginDatabase(pluginId, manifest);
      const id = `note_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await db.execute(
        "INSERT INTO notes (id, title, content, category, created_at) VALUES (?, ?, ?, ?, ?)",
        [id, newTitle.trim(), newContent.trim(), newCategory, Date.now()],
      );

      setNewTitle("");
      setNewContent("");
      setIsAddModalOpen(false);
      await loadData();
    } catch (err) {
      console.error("Failed to insert note:", err);
    }
  };

  // 删除便签
  const handleDeleteNote = async (id: string) => {
    try {
      const db = await getPluginDatabase(pluginId, manifest);
      await db.execute("DELETE FROM notes WHERE id = ?", [id]);
      await loadData();
    } catch (err) {
      console.error("Failed to delete note:", err);
    }
  };

  // 过滤后的便签列表
  const filteredNotes = notes.filter((n) => {
    const matchCat =
      selectedCategory === "全部" || n.category === selectedCategory;
    const matchSearch =
      !searchQuery ||
      n.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.content?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="flex-1 flex flex-col h-full space-y-4 max-w-6xl mx-auto w-full animate-fade-in text-slate-800 dark:text-slate-100">
      {/* 顶部标题栏与数据库状态 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-white/70 dark:bg-[#1E2028]/70 border border-slate-200/80 dark:border-[#2D3039] shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <StickyNote className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold">{manifest.name}</h2>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#2A2D36] text-slate-600 dark:text-slate-400">
                v{manifest.version}
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <Database className="w-3 h-3" />
                独立 SQLite (plugin_{pluginId}.db)
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {manifest.description}
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-transform active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>记录闪念</span>
        </button>
      </div>

      {/* 筛选与搜索工具条 */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* 分类 Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 custom-scrollbar">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? "bg-amber-500 text-white shadow-sm"
                  : "bg-white dark:bg-[#1E2028] text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-[#2D3039] hover:bg-slate-50"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* 搜索框 */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="搜索便签内容..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-[#1E2028] border border-slate-200/80 dark:border-[#2D3039] focus:outline-none focus:ring-2 focus:ring-amber-500/30 text-slate-800 dark:text-slate-100 placeholder-slate-400"
          />
        </div>
      </div>

      {/* 便签列表内容 */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-xs text-slate-400">
            加载 SQLite 数据表中...
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-200 dark:border-[#2D3039] rounded-2xl p-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/20 text-amber-500 flex items-center justify-center mb-3">
              <Sparkles className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">
              便签库空空如也
            </h4>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              点击上方「记录闪念」写入第一条便签，数据将实时持久化到此插件独立的 SQLite 数据库中。
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredNotes.map((note) => (
              <div
                key={note.id}
                className="group p-4 rounded-2xl bg-white dark:bg-[#1E2028] border border-slate-200/80 dark:border-[#2D3039] hover:border-amber-500/40 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 line-clamp-1">
                      {note.title}
                    </h3>
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-opacity rounded-lg"
                      title="删除便签"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {note.content && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 line-clamp-4 leading-relaxed whitespace-pre-wrap">
                      {note.content}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 mt-4 pt-3 border-t border-slate-100 dark:border-[#272A34]">
                  <span className="flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md">
                    <Tag className="w-2.5 h-2.5" />
                    {note.category || "灵感"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {note.created_at
                      ? new Date(note.created_at).toLocaleDateString()
                      : "刚刚"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 新增便签弹窗 */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-[#1E2028] rounded-2xl border border-slate-200 dark:border-[#2D3039] p-5 w-full max-w-md shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <StickyNote className="w-4 h-4 text-amber-500" />
                新增灵感便签
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
              >
                关闭
              </button>
            </div>

            <form onSubmit={handleAddNote} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  标题
                </label>
                <input
                  type="text"
                  required
                  placeholder="便签标题..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#16171B] border border-slate-200 dark:border-[#2D3039] focus:outline-none focus:ring-2 focus:ring-amber-500/30 text-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  分类标签
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {CATEGORIES.filter((c) => c !== "全部").map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setNewCategory(cat)}
                      className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                        newCategory === cat
                          ? "bg-amber-500 text-white"
                          : "bg-slate-100 dark:bg-[#252830] text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  内容
                </label>
                <textarea
                  rows={4}
                  placeholder="随时记录你的思考、代码片段或备忘..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#16171B] border border-slate-200 dark:border-[#2D3039] focus:outline-none focus:ring-2 focus:ring-amber-500/30 text-slate-800 dark:text-slate-100 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 text-xs rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-[#252830]"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
                >
                  写入 SQLite
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
