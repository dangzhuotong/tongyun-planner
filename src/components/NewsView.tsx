import React, { useState, useEffect, useCallback, useRef } from "react";
import { TrendingUp, GitFork, Rss, Bookmark, Search, Compass } from "lucide-react";
import { callAI, getEffectiveApiKey } from "../utils/aiEngine";
import type { CustomizationConfig } from "../types";
import { safeJsonParse } from "../utils/json";
import type { Article, BookmarkedArticle, ReadHistoryEntry } from "./news/types";
import { TrendingView } from "./news/TrendingView";
import { GitHubView } from "./news/GitHubView";
import { RSSView } from "./news/RSSView";
import { BookmarksView } from "./news/BookmarksView";
import { ExploreView } from "./ExploreView";
import { ReadingOverlay } from "./news/ReadingOverlay";
import type { NewsActions } from "./news/newsActions";

interface NewsViewProps {
  config: CustomizationConfig;
  onSaveTask: (ref: { title: string; url: string }) => void;
  onSaveJournal: (ref: { title: string; url: string; description?: string }) => void;
}

export const NewsView: React.FC<NewsViewProps> = React.memo(({ config, onSaveTask, onSaveJournal }) => {
  const [activeSubTab, setActiveSubTab] = useState<"trending" | "rss" | "bookmarks" | "github" | "explore">("trending");
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const [bookmarks, setBookmarks] = useState<BookmarkedArticle[]>(() =>
    safeJsonParse(localStorage.getItem("tongyun_news_bookmarks") || "[]", [])
  );
  const [readHistory, setReadHistory] = useState<ReadHistoryEntry[]>(() =>
    safeJsonParse(localStorage.getItem("tongyun_news_history") || "[]", [])
  );

  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const [readerFontSize, setReaderFontSize] = useState<"sm" | "md" | "lg" | "xl">(
    () => (localStorage.getItem("tongyun_news_font_size") as any) || "md"
  );
  const [readerFontFamily, setReaderFontFamily] = useState<"serif" | "sans">(
    () => (localStorage.getItem("tongyun_news_font_family") as any) || "serif"
  );
  const [readerColumns, setReaderColumns] = useState<"single" | "double">(
    () => (localStorage.getItem("tongyun_news_columns") as any) || "single"
  );

  useEffect(() => {
    localStorage.setItem("tongyun_news_bookmarks", JSON.stringify(bookmarks));
  }, [bookmarks]);

  useEffect(() => {
    localStorage.setItem("tongyun_news_history", JSON.stringify(readHistory.slice(0, 100)));
  }, [readHistory]);

  const handleFontSizeChange = (size: "sm" | "md" | "lg" | "xl") => {
    setReaderFontSize(size);
    localStorage.setItem("tongyun_news_font_size", size);
  };
  const handleFontFamilyChange = (family: "serif" | "sans") => {
    setReaderFontFamily(family);
    localStorage.setItem("tongyun_news_font_family", family);
  };
  const handleColumnsChange = (cols: "single" | "double") => {
    setReaderColumns(cols);
    localStorage.setItem("tongyun_news_columns", cols);
  };

  const isBookmarked = useCallback(
    (article: Article) => bookmarks.some((b) => b.title === article.title && b.link === article.link),
    [bookmarks]
  );

  const toggleBookmark = useCallback((article: Article) => {
    setBookmarks((prev) => {
      const exists = prev.some((b) => b.title === article.title && b.link === article.link);
      if (exists) return prev.filter((b) => !(b.title === article.title && b.link === article.link));
      return [{ ...article, bookmarkedAt: Date.now() }, ...prev];
    });
  }, []);

  const addToHistory = useCallback((article: Article) => {
    setReadHistory((prev) => {
      const filtered = prev.filter((h) => !(h.title === article.title && h.link === article.link));
      return [{ title: article.title, link: article.link, feedName: article.feedName, readAt: Date.now() }, ...filtered];
    });
  }, []);

  const openArticle = useCallback((article: Article) => {
    setSelectedArticle(article);
    setAiSummary(null);
    addToHistory(article);
  }, [addToHistory]);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  }, []);

  const actions: NewsActions = {
    readLater: (ref) => {
      toggleBookmark({ title: ref.title, link: ref.url, description: ref.description || "", pubDate: "", content: "", feedName: ref.source } as Article);
      showToast("已加入稍后读");
    },
    saveTask: (ref) => {
      onSaveTask({ title: ref.title, url: ref.url });
      showToast("已存为任务");
    },
    saveJournal: (ref) => {
      onSaveJournal({ title: ref.title, url: ref.url, description: ref.description });
      showToast("已收藏到日记");
    },
  };

  const handleGenerateAISummary = async (article: Article) => {
    if (!getEffectiveApiKey(config)) {
      setAiLoading(true);
      setTimeout(() => { setAiSummary("【演示模式】请在设置中配置 AI API 密钥以启用智能摘要功能。"); setAiLoading(false); }, 600);
      return;
    }
    setAiLoading(true);
    setAiSummary(null);
    try {
      const summary = await callAI(
        config,
        "你是一位严谨而学识渊博的报纸社论主笔。请阅读以下文章，用编者按的风格，撰写一段 150 字以内极富洞察力的导读摘要。使用优雅、克制的中文。",
        "文章标题: " + article.title + "\n作者: " + (article.author || "未知") + "\n文章内容: " + article.content.slice(0, 1800)
      );
      setAiSummary(summary);
    } catch (e: any) {
      setAiSummary("摘要生成失败: " + (e.message || e));
    } finally {
      setAiLoading(false);
    }
  };

  const tabs = [
    { key: "trending" as const, icon: TrendingUp, label: "今日热议" },
    { key: "github" as const, icon: GitFork, label: "GitHub 趋势" },
    { key: "rss" as const, icon: Rss, label: "RSS 阅览室" },
    { key: "explore" as const, icon: Compass, label: "视野" },
    { key: "bookmarks" as const, icon: Bookmark, label: "收藏夹" },
  ];

  return (
    <div className="flex flex-col gap-4 flex-grow z-10 relative">
      {/* Tab bar with search */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveSubTab(tab.key)}
            className={
              "px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer " +
              (activeSubTab === tab.key
                ? "bg-[#2D323A] text-[#F5F1EA] shadow-sm"
                : "text-slate-500 hover:bg-white/60 hover:text-slate-700")
            }
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
            {tab.key === "bookmarks" && bookmarks.length > 0 && (
              <span className="bg-[#8B6E3C] text-white text-[8px] px-1.5 py-0.5 rounded-full ml-0.5 font-extrabold">
                {bookmarks.length}
              </span>
            )}
          </button>
        ))}
        <div className="ml-auto relative">
          <Search className="w-3 h-3 text-slate-300 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            placeholder="搜索文章..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-36 bg-white/60 border border-[#E8E0D0] pl-7 pr-2.5 py-1.5 rounded-lg text-[10px] text-slate-700 placeholder-slate-300 focus:outline-none focus:border-[#8B6E3C]/40 focus:bg-white transition-all font-medium"
          />
        </div>
      </div>

      {/* Content area */}
      <div className="flex-grow bg-[#FCFAF4] border border-[#E8E0D0] rounded-2xl p-6 shadow-sm relative flex flex-col min-h-[400px]">
        {activeSubTab === "trending" && <TrendingView actions={actions} />}
        {activeSubTab === "github" && <GitHubView config={config} actions={actions} />}
        {activeSubTab === "rss" && (
          <RSSView
            searchQuery={searchQuery}
            onOpenArticle={openArticle}
            isBookmarked={isBookmarked}
            toggleBookmark={toggleBookmark}
            actions={actions}
          />
        )}
        {activeSubTab === "bookmarks" && (
          <BookmarksView
            config={config}
            searchQuery={searchQuery}
            bookmarks={bookmarks}
            readHistory={readHistory}
            onOpenArticle={openArticle}
            toggleBookmark={toggleBookmark}
            actions={actions}
          />
        )}
        {activeSubTab === "explore" && <ExploreView actions={actions} />}
      </div>

      {/* Reading Overlay */}
      {selectedArticle && (
        <ReadingOverlay
          article={selectedArticle}
          onClose={() => { setSelectedArticle(null); setAiSummary(null); }}
          isBookmarked={isBookmarked}
          toggleBookmark={toggleBookmark}
          readerFontSize={readerFontSize}
          readerFontFamily={readerFontFamily}
          readerColumns={readerColumns}
          onFontSizeChange={handleFontSizeChange}
          onFontFamilyChange={handleFontFamilyChange}
          onColumnsChange={handleColumnsChange}
          aiSummary={aiSummary}
          aiLoading={aiLoading}
          onGenerateAISummary={handleGenerateAISummary}
          onDismissSummary={() => setAiSummary(null)}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[120] px-4 py-2 rounded-xl bg-[#2D323A] text-[#F5F1EA] text-[11px] font-bold shadow-lg animate-[fadeIn_0.2s_ease-out]">
          {toast}
        </div>
      )}
    </div>
  );
});
