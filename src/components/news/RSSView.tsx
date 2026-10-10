import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Rss, RefreshCw, BookOpen, PlusCircle, Trash2, Newspaper,
  ChevronRight, Bookmark, BookmarkCheck
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { parseRSSXML } from "./rssParser";
import { safeJsonParse } from "../../utils/json";
import { getCachedData, setCachedData, fetchWithRetry } from "../../utils/cache";
import {
  DEFAULT_FEEDS, FEED_CATEGORY_LABELS, FEED_CATEGORY_COLORS,
  type RSSFeed, type Article
} from "./types";
import { NewsItemActions } from "./NewsItemActions";
import type { NewsActions } from "./newsActions";

const isTauri =
  typeof window !== "undefined" &&
  (window as any).__TAURI_INTERNALS__ !== undefined;

const RSS_CACHE_TTL = 30 * 60 * 1000;

interface RSSViewProps {
  searchQuery: string;
  onOpenArticle: (article: Article) => void;
  isBookmarked: (article: Article) => boolean;
  toggleBookmark: (article: Article) => void;
  actions: NewsActions;
}

export const RSSView: React.FC<RSSViewProps> = ({ searchQuery, onOpenArticle, isBookmarked, toggleBookmark, actions }) => {
  const [feeds, setFeeds] = useState<RSSFeed[]>(() => {
    const saved = localStorage.getItem("tongyun_rss_feeds");
    return saved ? safeJsonParse(saved, DEFAULT_FEEDS) : DEFAULT_FEEDS;
  });
  const [selectedFeed, setSelectedFeed] = useState<RSSFeed>(feeds[0] || DEFAULT_FEEDS[0]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showFeedManager, setShowFeedManager] = useState(false);
  const [newFeedName, setNewFeedName] = useState("");
  const [newFeedUrl, setNewFeedUrl] = useState("");
  const [newFeedCategory, setNewFeedCategory] = useState<RSSFeed["category"]>("custom");

  const loadFeedArticles = useCallback(async (feed: RSSFeed) => {
    const cacheKey = "rss_" + feed.url;
    const cached = getCachedData<Article[]>(cacheKey, RSS_CACHE_TTL);

    setErrorMessage(null);

    if (cached) {
      setArticles(cached);
      setLoading(false);
    } else {
      setLoading(true);
      setArticles([]);
    }

    const doFetch = async (): Promise<Article[]> => {
      let xmlText: string | null = null;
      if (isTauri) {
        try {
          xmlText = await invoke<string>("fetch_rss", { url: feed.url });
        } catch (e: any) {
          console.warn("Tauri fetch_rss failed:", e);
        }
      }
      if (!xmlText) {
        try {
          const res = await fetch(feed.url);
          if (res.ok) xmlText = await res.text();
        } catch (e: any) {
          console.warn("Direct fetch failed:", e);
        }
      }
      if (xmlText) {
        const parsed = parseRSSXML(xmlText);
        if (parsed.length > 0) {
          return parsed.map((a) => ({ ...a, feedId: feed.id, feedName: feed.name }));
        }
      }
      throw new Error("无法拉取该订阅源。请确认 URL 正确且网络通畅，或在「订阅管理」中更换源。");
    };

    try {
      const fresh = await fetchWithRetry(doFetch, 1, 1500);
      setCachedData(cacheKey, fresh);
      setArticles(fresh);
    } catch (e: any) {
      if (!cached) {
        setErrorMessage(e?.message || String(e));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 选中源切换时拉取对应 RSS 文章数据
    if (selectedFeed) loadFeedArticles(selectedFeed);
  }, [selectedFeed, loadFeedArticles]);

  const handleAddFeed = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFeedName.trim() || !newFeedUrl.trim()) return;
    const newFeed: RSSFeed = {
      id: "rss-" + Date.now().toString(36),
      name: newFeedName.trim(),
      url: newFeedUrl.trim(),
      category: newFeedCategory,
    };
    const updated = [...feeds, newFeed];
    setFeeds(updated);
    localStorage.setItem("tongyun_rss_feeds", JSON.stringify(updated));
    setSelectedFeed(newFeed);
    setNewFeedName("");
    setNewFeedUrl("");
  };

  const handleDeleteFeed = (id: string) => {
    const updated = feeds.filter((f) => f.id !== id);
    setFeeds(updated);
    localStorage.setItem("tongyun_rss_feeds", JSON.stringify(updated));
    if (selectedFeed.id === id && updated.length > 0) {
      setSelectedFeed(updated[0]);
    }
  };

  const filteredArticles = useMemo(() => {
    if (!searchQuery.trim()) return articles;
    const q = searchQuery.toLowerCase();
    return articles.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        (a.author || "").toLowerCase().includes(q)
    );
  }, [articles, searchQuery]);

  return (
    <div className="flex gap-4 flex-grow min-h-0">
      {/* Sidebar */}
      <div className="w-full md:w-[220px] flex-shrink-0 flex flex-col gap-3 self-start md:sticky md:top-4">
        <div className="bg-white/80 border border-[#E8E0D0] rounded-2xl p-3.5 ">
          <span className="text-[9px] font-extrabold text-slate-300 uppercase tracking-[0.15em] block mb-2">订阅源</span>
          <div className="flex flex-col gap-1">
            {feeds.map((feed) => (
              <button
                key={feed.id}
                onClick={() => setSelectedFeed(feed)}
                className={
                  "w-full text-left px-3 py-2 rounded-xl text-[11px] font-bold transition-all truncate flex items-center gap-2 cursor-pointer " +
                  (selectedFeed.id === feed.id
                    ? "bg-[#2D323A] dark:bg-[#4D525A] text-[#F5F1EA] shadow-sm"
                    : "text-slate-500 hover:bg-[#FAF8F5] hover:text-slate-700 dark:hover:text-slate-300")
                }
              >
                <BookOpen className={"w-3 h-3 flex-shrink-0 " + (selectedFeed.id === feed.id ? "text-[#E8E0D0]" : "text-slate-300")} />
                <span className="truncate">{feed.name}</span>
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => setShowFeedManager((v) => !v)}
          className={"text-[10px] font-bold px-3 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer border " + (showFeedManager ? "bg-[#2D323A] dark:bg-[#4D525A] text-white border-[#2D323A]" : "bg-white/60 hover:bg-white border-dashed border-[#E8E0D0] text-slate-400 hover:text-[#8B6E3C]")}
        >
          <PlusCircle className="w-3.5 h-3.5" />
          {showFeedManager ? "完成管理" : "订阅管理"}
        </button>
      </div>

      {/* Content */}
      <div className="flex-grow min-w-0 flex flex-col animate-[fadeIn_0.3s_ease-out]">
        <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-serif font-black text-[#2D323A] flex items-center gap-1.5">
              <Rss className="w-4 h-4 text-[#8B6E3C] dark:text-[#C4A05E]" />
              {selectedFeed.name}
            </h2>
            <span className="text-[9px] text-slate-300 font-medium truncate block max-w-xs">{selectedFeed.url}</span>
          </div>
          <button
            onClick={() => loadFeedArticles(selectedFeed)}
            className="bg-white hover:bg-slate-50 text-slate-500 border border-[#E8E0D0] px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            disabled={loading}
          >
            <RefreshCw className={"w-3 h-3 " + (loading ? "animate-spin" : "")} />
            刷新
          </button>
        </div>

        {showFeedManager ? (
          <div className="space-y-5 flex-grow max-w-xl mx-auto py-2 overflow-y-auto">
            <div className="bg-white/70 border border-[#EFEBE4] p-4 rounded-xl space-y-1.5">
              <span className="text-[10px] font-bold text-[#4D7C5D] dark:text-[#6DAF7E] tracking-wider">订阅管理</span>
              <p className="text-[10px] text-slate-400 leading-relaxed">添加符合 RSS 2.0 或 Atom 规范的订阅源。应用通过 Rust 后端代理拉取，无需担心跨域限制。</p>
            </div>
            <div className="space-y-3 bg-white/70 border border-[#EFEBE4] p-4 rounded-xl">
              <h3 className="text-[11px] font-bold text-slate-600">添加新订阅</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-bold text-slate-300 uppercase block mb-1">名称</label>
                  <input type="text" placeholder="如：阮一峰的网络日志" value={newFeedName} onChange={(e) => setNewFeedName(e.target.value)} className="w-full bg-white border border-[#EFEBE4] px-2.5 py-1.5 rounded-lg text-[11px] text-slate-700 focus:outline-none focus:border-[#4D7C5D]/40 transition-colors" />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-300 uppercase block mb-1">分类</label>
                  <select value={newFeedCategory} onChange={(e) => setNewFeedCategory(e.target.value as RSSFeed["category"])} className="w-full bg-white border border-[#EFEBE4] px-2 py-1.5 rounded-lg text-[11px] text-slate-600 font-medium focus:outline-none focus:border-[#4D7C5D]/40">
                    <option value="tech">科技</option>
                    <option value="reading">阅读</option>
                    <option value="daily">日常</option>
                    <option value="custom">自定义</option>
                  </select>
                </div>
              </div>
              <div>
                  <label className="text-[9px] font-bold text-slate-300 uppercase block mb-1">RSS URL</label>
                <input type="url" placeholder="https://example.com/feed" value={newFeedUrl} onChange={(e) => setNewFeedUrl(e.target.value)} className="w-full bg-white border border-[#EFEBE4] px-2.5 py-1.5 rounded-lg text-[11px] text-slate-700 focus:outline-none focus:border-[#4D7C5D]/40 transition-colors" />
              </div>
              <div className="flex justify-end">
                <button onClick={handleAddFeed as any} className="bg-[#2D323A] dark:bg-[#4D525A] hover:bg-[#1a1e24] text-white px-4 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"><PlusCircle className="w-3.5 h-3.5" />确认添加</button>
              </div>
            </div>
            <div className="space-y-2">
              <span className="text-[9px] font-bold text-slate-300 uppercase tracking-[0.15em] block">已订阅列表</span>
              <div className="space-y-1.5">
                {feeds.map((feed) => (
                  <div key={feed.id} className="bg-white/60 border border-[#EFEBE4]/60 p-3 rounded-xl flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-[11px] font-bold text-slate-600 block truncate">{feed.name}</span>
                      <span className="text-[9px] text-slate-300 font-medium truncate block max-w-sm">{feed.url}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={"text-[8px] font-extrabold px-1.5 py-0.5 rounded border " + FEED_CATEGORY_COLORS[feed.category]}>{FEED_CATEGORY_LABELS[feed.category]}</span>
                      <button onClick={() => handleDeleteFeed(feed.id)} className="p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-300 hover:text-red-400 dark:hover:text-red-400 transition-colors cursor-pointer" title="取消订阅"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : loading ? (
          <div className="flex-grow flex flex-col items-center justify-center py-16 gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-[#8B6E3C]/40 dark:text-[#C4A05E]/40" />
            <span className="text-[10px] text-slate-300 font-medium">正在加载订阅内容...</span>
          </div>
        ) : errorMessage ? (
          <div className="flex-grow flex flex-col items-center justify-center py-16 text-center gap-2">
            <Newspaper className="w-8 h-8 text-slate-200 dark:text-slate-600" />
            <p className="text-[11px] text-slate-400 font-medium max-w-xs leading-relaxed">{errorMessage}</p>
            <button onClick={() => loadFeedArticles(selectedFeed)} className="text-[10px] text-[#8B6E3C] dark:text-[#C4A05E] font-bold hover:underline cursor-pointer mt-1">重试</button>
          </div>
        ) : filteredArticles.length === 0 ? (
          <div className="flex-grow flex flex-col items-center justify-center py-16 text-center text-slate-300">
            <BookOpen className="w-8 h-8 mb-2" />
            <p className="text-[11px] font-medium">{searchQuery ? "无匹配文章" : "暂无文章"}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 pb-4">
            {filteredArticles.map((article) => (
              <div
                key={article.link + article.title}
                className="group p-4 bg-white/60 hover:bg-white border border-[#E8E0D0]/60 hover:border-[#E8E0D0] rounded-xl flex flex-col justify-between gap-3 hover:shadow-sm transition-all duration-200 cursor-pointer relative"
              >
                <button
                  onClick={(e) => { e.stopPropagation(); toggleBookmark(article); }}
                  className={
                    "absolute top-3 right-3 p-1.5 rounded-lg transition-all cursor-pointer " +
                  (isBookmarked(article)
                    ? "text-[#8B6E3C] dark:text-[#C4A05E] bg-[#FAF5ED] dark:bg-[#4D525A]"
                    : "text-slate-200 hover:text-[#8B6E3C] hover:bg-[#FAF5ED]/50")
                  }
                  title={isBookmarked(article) ? "取消收藏" : "收藏"}
                >
                  {isBookmarked(article) ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
                </button>
                <div className="space-y-2" onClick={() => onOpenArticle(article)}>
                  <div className="flex items-center gap-2 text-[10px] text-slate-300 font-medium pr-8">
                    {article.author && <span className="truncate max-w-[120px]">{article.author}</span>}
                    {article.pubDate && <><span className="w-0.5 h-0.5 rounded-full bg-slate-200 dark:bg-slate-600" /><span>{article.pubDate}</span></>}
                  </div>
                  <h3 className="text-sm font-serif font-bold text-[#2D323A] leading-snug group-hover:text-[#A34E36] transition-colors line-clamp-2 pr-6">{article.title}</h3>
                  <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">{article.description}</p>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-bold text-[#8B6E3C]/60 dark:text-[#C4A05E]/60 group-hover:text-[#8B6E3C] dark:group-hover:text-[#C4A05E] transition-colors" onClick={() => onOpenArticle(article)}>
                  <span>阅读全文</span>
                  <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </div>
                <NewsItemActions
                  className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                  newsRef={{ title: article.title, url: article.link, description: article.description, source: article.feedName }}
                  actions={actions}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
