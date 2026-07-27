import React, { useMemo, useState, useEffect } from "react";
import { Star, Bookmark, Trash2, Clock, Sparkles, PenLine, RefreshCw } from "lucide-react";
import type { Article, BookmarkedArticle, ReadHistoryEntry } from "./types";
import type { CustomizationConfig } from "../../types";
import { NewsItemActions } from "./NewsItemActions";
import type { NewsActions } from "./newsActions";
import { canUseAI, generateRecollection } from "../../utils/aiEngine";
import { getLocalDateString } from "../../utils/date";
import { safeJsonParse } from "../../utils/json";

interface BookmarksViewProps {
  config: CustomizationConfig;
  searchQuery: string;
  bookmarks: BookmarkedArticle[];
  readHistory: ReadHistoryEntry[];
  onOpenArticle: (article: Article) => void;
  toggleBookmark: (article: Article) => void;
  actions: NewsActions;
}

// ============ 每日缓存工具 ============
interface DailyCache<T> {
  date: string;
  locale?: string;
  data: T;
}
function readDailyCache<T>(key: string, today: string, locale: string): T | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const parsed = safeJsonParse<DailyCache<T> | null>(raw, null);
  if (!parsed) return null;
  if (parsed.date !== today) return null;
  if (parsed.locale && parsed.locale !== locale) return null;
  return parsed.data;
}
function writeDailyCache<T>(key: string, today: string, locale: string, data: T) {
  const payload: DailyCache<T> = { date: today, locale, data };
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    /* 忽略配额错误 */
  }
}

const RECOLLECT_CACHE_KEY = "tongyun_recollect_prose";

export const BookmarksView: React.FC<BookmarksViewProps> = ({
  config, searchQuery, bookmarks, readHistory, onOpenArticle, toggleBookmark, actions
}) => {
  const [subTab, setSubTab] = useState<"list" | "recollect">("list");

  const filteredBookmarks = useMemo(() => {
    if (!searchQuery.trim()) return bookmarks;
    const q = searchQuery.toLowerCase();
    return bookmarks.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q)
    );
  }, [bookmarks, searchQuery]);

  // ===== 朝花夕拾：温故散文 =====
  const today = getLocalDateString();
  const localeKey = config.locale || "zh-CN";
  const [recollect, setRecollect] = useState<string | null>(() =>
    readDailyCache<string>(RECOLLECT_CACHE_KEY, today, localeKey)
  );
  const [recollectLoading, setRecollectLoading] = useState(false);
  const [recollectError, setRecollectError] = useState(false);

  const sampled = useMemo(
    () => [...bookmarks].sort((a, b) => a.bookmarkedAt - b.bookmarkedAt).slice(0, 6),
    [bookmarks]
  );
  const promptItems = useMemo(() => {
    const fromBookmarks = bookmarks
      .slice(0, 8)
      .map((a) => ({ title: a.title, source: a.feedName, date: new Date(a.bookmarkedAt).toLocaleDateString("zh-CN") }));
    const fromHistory = readHistory
      .slice(0, 6)
      .map((h) => ({ title: h.title, source: h.feedName }));
    return [...fromBookmarks, ...fromHistory].slice(0, 12);
  }, [bookmarks, readHistory]);

  const generateRecollect = async (force = false) => {
    if (!canUseAI(config)) {
      setRecollectError(true);
      return;
    }
    if (!force) {
      const cached = readDailyCache<string>(RECOLLECT_CACHE_KEY, today, localeKey);
      if (cached) {
        setRecollect(cached);
        return;
      }
    }
    setRecollectLoading(true);
    setRecollectError(false);
    try {
      const result = await generateRecollection(config, localeKey, promptItems);
      if (result) {
        setRecollect(result);
        writeDailyCache(RECOLLECT_CACHE_KEY, today, localeKey, result);
      } else {
        setRecollectError(true);
      }
    } catch {
      setRecollectError(true);
    } finally {
      setRecollectLoading(false);
    }
  };

  useEffect(() => {
    if (subTab === "recollect" && canUseAI(config) && !recollect && !recollectLoading) {
      generateRecollect(false);
    }
  }, [subTab, canUseAI(config), recollect, recollectLoading]);

  const hasAi = canUseAI(config);

  return (
    <div className="space-y-4 flex-grow animate-[fadeIn_0.3s_ease-out]">
      <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
        <h2 className="text-lg font-serif font-black text-[#2D323A] flex items-center gap-1.5">
          <Star className="w-4 h-4 text-[#8B6E3C]" />
          收藏夹
          <span className="text-sm font-sans font-normal text-slate-300 ml-1">({filteredBookmarks.length})</span>
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSubTab("list")}
            className={
              "px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer " +
              (subTab === "list"
                ? "bg-[#2D323A] text-[#F5F1EA] shadow-sm"
                : "text-slate-500 hover:bg-white/60 hover:text-slate-700")
            }
          >
            <Bookmark className="w-3 h-3" />
            收藏
          </button>
          <button
            onClick={() => setSubTab("recollect")}
            className={
              "px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer " +
              (subTab === "recollect"
                ? "bg-[#2D323A] text-[#F5F1EA] shadow-sm"
                : "text-slate-500 hover:bg-white/60 hover:text-slate-700")
            }
          >
            <PenLine className="w-3 h-3" />
            朝花夕拾
          </button>
        </div>
      </div>

      {subTab === "list" ? (
        <>
          {filteredBookmarks.length === 0 ? (
            <div className="flex-grow flex flex-col items-center justify-center py-16 text-center text-slate-300">
              <Bookmark className="w-8 h-8 mb-2" />
              <p className="text-[11px] font-medium">
                {searchQuery ? "无匹配收藏" : "还没有收藏文章，在阅读时点击书签图标即可收藏"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredBookmarks.map((article) => (
                <div
                  key={article.link + article.title}
                  className="group flex items-center gap-3 p-3 rounded-xl hover:bg-white/60 border border-transparent hover:border-[#E8E0D0] cursor-pointer transition-all"
                >
                  <div className="flex-grow min-w-0" onClick={() => onOpenArticle(article)}>
                    <h4 className="text-sm font-serif font-bold text-[#2D323A] group-hover:text-[#A34E36] transition-colors truncate">
                      {article.title}
                    </h4>
                    <div className="flex items-center gap-2 text-[10px] text-slate-300 font-medium mt-0.5">
                      {article.feedName && <span>{article.feedName}</span>}
                      <span>收藏于 {new Date(article.bookmarkedAt).toLocaleDateString("zh-CN")}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleBookmark(article)}
                    className="p-1.5 rounded-lg text-[#8B6E3C] hover:bg-red-50 hover:text-red-400 transition-colors cursor-pointer flex-shrink-0"
                    title="取消收藏"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <NewsItemActions
                    className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                    newsRef={{ title: article.title, url: article.link, description: article.description, source: article.feedName }}
                    actions={actions}
                  />
                </div>
              ))}
            </div>
          )}

          {readHistory.length > 0 && (
            <div className="mt-6 pt-4 border-t border-dashed border-slate-200">
              <div className="flex items-center gap-1.5 mb-3">
                <Clock className="w-3.5 h-3.5 text-slate-300" />
                <span className="text-[9px] font-bold text-slate-300 uppercase tracking-[0.15em]">最近阅读</span>
              </div>
              <div className="space-y-1">
                {readHistory.slice(0, 10).map((entry) => (
                  <div key={entry.title + entry.readAt} className="flex items-center gap-2 py-1.5 text-[11px] text-slate-400">
                    <span className="w-1 h-1 rounded-full bg-slate-200 flex-shrink-0" />
                    <span className="truncate font-medium">{entry.title}</span>
                    <span className="text-slate-200 text-[9px] ml-auto flex-shrink-0">
                      {new Date(entry.readAt).toLocaleDateString("zh-CN")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex-grow flex flex-col">
          {!hasAi ? (
            <>
              <p className="text-[11px] text-slate-400 mb-3">未配置 AI 密钥，为你随机拾起几朵旧朝花：</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {sampled.length === 0 ? (
                  <p className="text-[11px] text-slate-300">还没有收藏，先去别处拾一朵吧。</p>
                ) : (
                  sampled.map((article) => (
                    <div
                      key={article.link + article.title}
                      onClick={() => onOpenArticle(article)}
                      className="p-3 rounded-xl bg-white/60 border border-[#E8E0D0]/60 hover:border-[#E8E0D0] hover:shadow-sm cursor-pointer transition-all"
                    >
                      <h4 className="text-[12px] font-serif font-bold text-[#2D323A] group-hover:text-[#A34E36] line-clamp-2">{article.title}</h4>
                      <div className="text-[9px] text-slate-300 mt-1">收藏于 {new Date(article.bookmarkedAt).toLocaleDateString("zh-CN")}</div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : recollectLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-300">
              <RefreshCw className="w-6 h-6 animate-spin text-[#8B6E3C]/40" />
              <span className="text-[10px] font-medium">正在拾起旧时光...</span>
            </div>
          ) : recollectError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
              <PenLine className="w-8 h-8 text-slate-200" />
              <p className="text-[11px] text-slate-400 font-medium">生成失败，请检查 AI 配置后重试</p>
              <button onClick={() => generateRecollect(true)} className="text-[10px] text-[#8B6E3C] font-bold hover:underline cursor-pointer mt-1">重试</button>
            </div>
          ) : recollect ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[9px] font-bold text-slate-300 uppercase tracking-[0.15em] flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-[#8B6E3C]" />
                  朝花夕拾 · 今日温故
                </span>
                <button
                  onClick={() => generateRecollect(true)}
                  disabled={recollectLoading}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-bold text-slate-400 hover:text-slate-600 bg-white/70 hover:bg-white border border-[#EFEBE4] transition-all cursor-pointer"
                >
                  <RefreshCw className={"w-2.5 h-2.5 " + (recollectLoading ? "animate-spin" : "")} />
                  重写散文
                </button>
              </div>
              <RecollectProse text={recollect} />
              {sampled.length > 0 && (
                <div className="mt-6 pt-4 border-t border-dashed border-slate-200">
                  <div className="text-[9px] font-bold text-slate-300 uppercase tracking-[0.15em] mb-3">今日拾起的朝花</div>
                  <div className="space-y-2">
                    {sampled.map((article) => (
                      <div
                        key={article.link + article.title}
                        onClick={() => onOpenArticle(article)}
                        className="group flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/60 border border-transparent hover:border-[#E8E0D0] cursor-pointer transition-all"
                      >
                        <div className="flex-grow min-w-0">
                          <h4 className="text-[12px] font-serif font-bold text-[#2D323A] group-hover:text-[#A34E36] transition-colors truncate">{article.title}</h4>
                          <div className="text-[9px] text-slate-300 mt-0.5">
                            {article.feedName ? article.feedName + " · " : ""}收藏于 {new Date(article.bookmarkedAt).toLocaleDateString("zh-CN")}
                          </div>
                        </div>
                        <NewsItemActions
                          className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                          newsRef={{ title: article.title, url: article.link, description: article.description, source: article.feedName }}
                          actions={actions}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-300">
              <PenLine className="w-8 h-8" />
              <button onClick={() => generateRecollect(true)} className="text-[10px] text-[#8B6E3C] font-bold hover:underline cursor-pointer">生成朝花夕拾</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function RecollectProse({ text }: { text: string }) {
  const titleMatch = text.match(/^(.+?)\n\n([\s\S]*)$/);
  const proseTitle = titleMatch?.[1]?.trim() ?? null;
  const proseBody = titleMatch?.[2] ?? text;
  return (
    <div className="bg-white/60 border border-[#E8E0D0]/60 rounded-2xl p-5">
      {proseTitle && (
        <h3 className="text-[15px] font-serif font-black text-[#2D323A] mb-3">{proseTitle}</h3>
      )}
      <div className="prose-body space-y-3 text-[13px] leading-relaxed text-slate-700 whitespace-pre-wrap">
        {proseBody.split(/\n{2,}/).map((paragraph, idx) => (
          <p key={idx} className={idx === 0 && !proseTitle ? "first-letter:text-[#8B6E3C] first-letter:text-[22px] first-letter:font-bold first-letter:mr-0.5 first-letter:float-left" : ""}>
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  );
}
