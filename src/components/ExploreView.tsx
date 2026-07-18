import React, { useState, useEffect, useCallback, useRef } from "react";
import { Compass, Rss, Plus, Trash2, ExternalLink, RefreshCw, Globe, Newspaper, TrendingUp, Code2, Loader2, ChevronRight, Settings2 } from "lucide-react";
import { createId } from "../utils/id";
import { fetchWithRetry } from "../utils/cache";
import { NewsItemActions } from "./news/NewsItemActions";
import type { NewsActions } from "./news/newsActions";

interface Article {
  id: string;
  title: string;
  link: string;
  description: string;
  pubDate: string;
  sourceTitle: string;
}

interface Feed {
  id: string;
  title: string;
  url: string;
  type: "rss" | "preset";
  articles: Article[];
  error?: string;
  lastFetched?: number;
}

const CORS_PROXY_KEY = "tongyun_cors_proxy";
const FEEDS_KEY = "tongyun_explore_feeds";

const DEFAULT_PROXY = "https://api.allorigins.win/get?url=";

const PRESETS: { title: string; url: string; icon: React.ReactNode }[] = [
  { title: "V2EX 热榜", url: "https://www.v2ex.com/index.xml", icon: <Newspaper className="w-3.5 h-3.5" /> },
  { title: "Hacker News", url: "https://hnrss.org/frontpage", icon: <TrendingUp className="w-3.5 h-3.5" /> },
  { title: "GitHub Trending", url: "https://github.com/trending", icon: <Code2 className="w-3.5 h-3.5" /> },
  { title: "36氪 快讯", url: "https://36kr.com/feed", icon: <Globe className="w-3.5 h-3.5" /> },
  { title: "少数派", url: "https://sspai.com/feed", icon: <Newspaper className="w-3.5 h-3.5" /> },
];

async function fetchRSS(url: string, proxy: string): Promise<{ title: string; articles: Article[] }> {
  const proxyUrl = `${proxy}${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const xmlText = data.contents || data;
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, "text/xml");

  const feedTitle = xml.querySelector("channel > title")?.textContent || xml.querySelector("feed > title")?.textContent || url;

  const items = xml.querySelectorAll("item, entry");
  const articles: Article[] = Array.from(items).slice(0, 50).map((item) => {
    const title = item.querySelector("title")?.textContent || "(无标题)";
    const link = item.querySelector("link")?.textContent || item.querySelector("link")?.getAttribute("href") || "";
    const description = item.querySelector("description")?.textContent || item.querySelector("summary")?.textContent || "";
    const pubDate = item.querySelector("pubDate")?.textContent || item.querySelector("published")?.textContent || item.querySelector("updated")?.textContent || "";
    const descClean = description.replace(/<[^>]*>/g, "").slice(0, 200);
    return {
      id: createId(),
      title: title.trim(),
      link,
      description: descClean,
      pubDate,
      sourceTitle: feedTitle,
    };
  });

  return { title: feedTitle, articles };
}

export const ExploreView: React.FC<{ actions: NewsActions }> = React.memo(({ actions }) => {
  const [feeds, setFeeds] = useState<Feed[]>(() => {
    try {
      const saved = localStorage.getItem(FEEDS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [proxy, setProxy] = useState(() => localStorage.getItem(CORS_PROXY_KEY) || DEFAULT_PROXY);
  const [showProxyInput, setShowProxyInput] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [fetching, setFetching] = useState<Record<string, boolean>>({});
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const feedInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem(FEEDS_KEY, JSON.stringify(feeds));
  }, [feeds]);

  useEffect(() => {
    localStorage.setItem(CORS_PROXY_KEY, proxy);
  }, [proxy]);

  const addFeed = useCallback(async (url: string, type: Feed["type"] = "rss") => {
    const id = createId();
    const feed: Feed = { id, title: url, url, type, articles: [] };
    setFeeds((prev) => [...prev, { ...feed, articles: [] }]);
    setSelectedFeedId(id);
    setAddUrl("");
    setFetching((prev) => ({ ...prev, [id]: true }));
    try {
      const result = await fetchWithRetry(() => fetchRSS(url, proxy), 1, 1500);
      setFeeds((prev) => prev.map((f) => f.id === id ? { ...f, title: result.title, articles: result.articles, lastFetched: Date.now(), error: undefined } : f));
    } catch (e) {
      setFeeds((prev) => prev.map((f) => f.id === id ? { ...f, error: String(e) } : f));
    } finally {
      setFetching((prev) => ({ ...prev, [id]: false }));
    }
  }, [proxy]);

  const refreshFeed = useCallback(async (feed: Feed) => {
    if (feed.type === "preset" && feed.url === "https://github.com/trending") return;
    setFetching((prev) => ({ ...prev, [feed.id]: true }));
    try {
      const result = await fetchWithRetry(() => fetchRSS(feed.url, proxy), 1, 1500);
      setFeeds((prev) => prev.map((f) => f.id === feed.id ? { ...f, title: result.title, articles: result.articles, lastFetched: Date.now(), error: undefined } : f));
    } catch (e) {
      setFeeds((prev) => prev.map((f) => f.id === feed.id ? { ...f, error: String(e) } : f));
    } finally {
      setFetching((prev) => ({ ...prev, [feed.id]: false }));
    }
  }, [proxy]);

  const deleteFeed = useCallback((id: string) => {
    setFeeds((prev) => prev.filter((f) => f.id !== id));
    setSelectedFeedId((prev) => prev === id ? null : prev);
  }, []);

  const addPreset = useCallback((preset: typeof PRESETS[0]) => {
    const exists = feeds.some((f) => f.url === preset.url);
    if (!exists) addFeed(preset.url, "preset");
  }, [feeds, addFeed]);

  const selectedFeed = feeds.find((f) => f.id === selectedFeedId);

  // Format date relative
  const fmtDate = (dateStr: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const openLink = (url: string) => {
    if (url) {
      import("../utils/openExternal").then((m) => m.openExternal(url));
    }
  };

  return (
    <div className="animate-fade-in-up flex gap-5 h-full flex-grow z-10 relative select-none">
      {/* Left panel: feed list */}
      <div className="w-64 shrink-0 flex flex-col gap-3">
        {/* Add feed */}
        <div className="rounded-2xl bg-white/90 border border-[#EFEBE4] p-4 shadow-sm ">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] font-extrabold text-[#4D7C5D] dark:text-[#6DAF7E] uppercase tracking-wider flex items-center gap-1">
              <Rss className="w-3 h-3" /> 订阅源
            </h3>
            <button onClick={() => setShowProxyInput(!showProxyInput)} className="p-1 rounded-md hover:bg-slate-100 cursor-pointer text-slate-400" title="CORS 代理设置">
              <Settings2 className="w-3 h-3" />
            </button>
          </div>
          {showProxyInput && (
            <div className="mb-2 p-2 rounded-lg bg-[#FAF8F5] border border-[#EFEBE4]">
              <label className="text-[8px] font-bold text-slate-500 block mb-1">CORS 代理地址</label>
              <input
                value={proxy}
                onChange={(e) => setProxy(e.target.value)}
                className="w-full text-[10px] px-2 py-1 rounded-md border border-[#EFEBE4] bg-white outline-none focus:border-[#C4D7B2]"
                placeholder="https://api.allorigins.win/get?url="
              />
            </div>
          )}
          <div className="flex gap-1">
            <input
              ref={feedInputRef}
              value={addUrl}
              onChange={(e) => setAddUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addUrl && addFeed(addUrl)}
              className="flex-grow text-[10px] px-2 py-1.5 rounded-lg border border-[#EFEBE4] bg-white outline-none focus:border-[#C4D7B2] text-slate-700"
              placeholder="输入 RSS 链接..."
            />
            <button
              onClick={() => addUrl && addFeed(addUrl)}
              disabled={!addUrl}
              className="p-1.5 rounded-lg bg-[#4D7C5D] text-white hover:bg-[#3F684C] disabled:opacity-30 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Feed list */}
        <div className="flex-grow rounded-2xl bg-white/90 border border-[#EFEBE4] p-3 shadow-sm overflow-y-auto custom-scrollbar">
          {/* Presets */}
          <div className="mb-2">
            <h4 className="text-[8px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5 px-1">推荐源</h4>
            <div className="space-y-0.5">
              {PRESETS.map((preset) => {
                const added = feeds.some((f) => f.url === preset.url);
                return (
                  <button
                    key={preset.url}
                    onClick={() => added ? setSelectedFeedId(feeds.find((f) => f.url === preset.url)?.id || null) : addPreset(preset)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                      added ? "bg-[#F0F5F1] text-[#4D7C5D] dark:text-[#6DAF7E]" : "text-slate-500 hover:bg-[#FAF8F5]"
                    }`}
                  >
                    {preset.icon}
                    <span className="flex-grow text-left">{preset.title}</span>
                    {added && <ChevronRight className="w-2.5 h-2.5 text-[#C4D7B2] dark:text-[#6DAF7E]" />}
                    {!added && <Plus className="w-2.5 h-2.5 text-slate-300" />}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="border-t border-dashed border-[#EFEBE4] my-2" />
          {/* Custom feeds */}
          <div>
            <h4 className="text-[8px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5 px-1">我的订阅</h4>
            {feeds.filter((f) => f.type !== "preset" || !PRESETS.some((p) => p.url === f.url)).length === 0 ? (
              <p className="text-center py-4 text-[9px] text-slate-400 font-medium">点击上方推荐源或输入 RSS 链接添加</p>
            ) : (
              <div className="space-y-0.5">
                {feeds.filter((f) => f.type !== "preset" || !PRESETS.some((p) => p.url === f.url)).map((feed) => (
                  <div
                    key={feed.id}
                    className={`flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer transition-all ${
                      selectedFeedId === feed.id ? "bg-[#F0F5F1] text-[#4D7C5D] dark:text-[#6DAF7E]" : "hover:bg-[#FAF8F5] text-slate-600"
                    }`}
                    onClick={() => setSelectedFeedId(feed.id)}
                  >
                    <Rss className="w-3 h-3 shrink-0" />
                    <span className="flex-grow text-[10px] font-bold truncate">{feed.title}</span>
                    {fetching[feed.id] ? (
                      <Loader2 className="w-2.5 h-2.5 animate-spin text-slate-400" />
                    ) : (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); refreshFeed(feed); }} className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600 cursor-pointer text-slate-400" title="刷新">
                          <RefreshCw className="w-2.5 h-2.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); deleteFeed(feed.id); }} className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/20 cursor-pointer text-red-300 hover:text-red-500" title="删除">
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right panel: articles */}
      <div className="flex-grow min-w-0 rounded-2xl bg-white/90 border border-[#EFEBE4] p-4 shadow-sm overflow-y-auto custom-scrollbar">
        {selectedFeed ? (
          <>
            <div className="flex items-center justify-between pb-3 border-b border-[#EFEBE4] mb-3">
              <div>
                <h2 className="text-[13px] font-bold text-[#2D323A]">{selectedFeed.title}</h2>
                {selectedFeed.error && <p className="text-[9px] text-red-400 font-medium mt-0.5">加载失败: {selectedFeed.error}</p>}
                {selectedFeed.lastFetched && (
                  <p className="text-[8px] text-slate-400 font-medium mt-0.5">更新于 {new Date(selectedFeed.lastFetched).toLocaleString()}</p>
                )}
              </div>
              <button
                onClick={() => refreshFeed(selectedFeed)}
                disabled={fetching[selectedFeed.id]}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#F0F5F1] text-[#4D7C5D] dark:text-[#6DAF7E] text-[10px] font-bold hover:bg-[#DEEAE2] disabled:opacity-40 transition-all cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${fetching[selectedFeed.id] ? "animate-spin" : ""}`} />
                刷新
              </button>
            </div>
            <div className="space-y-2">
              {selectedFeed.articles.length === 0 && !selectedFeed.error && (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                  <Rss className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-[11px] font-semibold">暂无文章，点击刷新获取</p>
                </div>
              )}
              {selectedFeed.articles.map((article) => (
                <div
                  key={article.id}
                  onClick={() => openLink(article.link)}
                  className="p-3 rounded-xl bg-[#FAF8F5]/50 border border-[#EFEBE4] hover:bg-[#F0F5F1] hover:border-[#C4D7B2] transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[11px] font-bold text-[#2D323A] leading-snug line-clamp-2 flex-grow">{article.title}</h3>
                    <ExternalLink className="w-3 h-3 text-slate-300 shrink-0 mt-0.5" />
                  </div>
                  {article.description && (
                    <p className="text-[9px] text-slate-500 mt-1 leading-relaxed line-clamp-2">{article.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[8px] text-slate-400 font-medium">{article.sourceTitle}</span>
                    {article.pubDate && (
                      <>
                        <span className="text-[8px] text-slate-300">·</span>
                        <span className="text-[8px] text-slate-400 font-medium">{fmtDate(article.pubDate)}</span>
                      </>
                    )}
                  </div>
                  <NewsItemActions
                    className="mt-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                    newsRef={{ title: article.title, url: article.link, description: article.description, source: article.sourceTitle }}
                    actions={actions}
                  />
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-slate-400">
            <Compass className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-xs font-bold mb-1">视野</p>
            <p className="text-[10px] font-medium opacity-60">选择一个订阅源或添加 RSS 链接以查看内容</p>
          </div>
        )}
      </div>
    </div>
  );
});