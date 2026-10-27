import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  X,
  ExternalLink,
  Sparkles,
  RefreshCw,
  Bookmark,
  BookmarkCheck,
  Globe,
  FileText,
  AlertCircle,
} from "lucide-react";
import { openExternal } from "../../utils/openExternal";
import type { Article } from "./types";
import {
  sanitizeArticleHtml,
  isTeaserArticle,
  fetchFullArticle,
  stripHtml,
} from "./rssParser";

interface ReadingOverlayProps {
  article: Article;
  onClose: () => void;
  isBookmarked: (article: Article) => boolean;
  toggleBookmark: (article: Article) => void;
  readerFontSize: "sm" | "md" | "lg" | "xl";
  readerFontFamily: "serif" | "sans";
  readerColumns: "single" | "double";
  onFontSizeChange: (size: "sm" | "md" | "lg" | "xl") => void;
  onFontFamilyChange: (family: "serif" | "sans") => void;
  onColumnsChange: (cols: "single" | "double") => void;
  aiSummary: string | null;
  aiLoading: boolean;
  onGenerateAISummary: (article: Article) => void;
  onDismissSummary: () => void;
}

export const ReadingOverlay: React.FC<ReadingOverlayProps> = ({
  article,
  onClose,
  isBookmarked,
  toggleBookmark,
  readerFontSize,
  readerFontFamily,
  readerColumns,
  onFontSizeChange,
  onFontFamilyChange,
  onColumnsChange,
  aiSummary,
  aiLoading,
  onGenerateAISummary,
  onDismissSummary,
}) => {
  const [fullContent, setFullContent] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"full" | "teaser">("full");

  const sizeMap = {
    sm: { title: "text-lg md:text-xl", body: "text-xs md:text-sm leading-relaxed" },
    md: { title: "text-xl md:text-2xl", body: "text-sm md:text-base leading-relaxed" },
    lg: { title: "text-2xl md:text-3xl", body: "text-base md:text-lg leading-loose" },
    xl: { title: "text-3xl md:text-4xl", body: "text-lg md:text-xl leading-loose" },
  };
  const { title: titleCls, body: bodyCls } = sizeMap[readerFontSize];
  const fontCls = readerFontFamily === "serif" ? "font-serif" : "font-sans";
  const colCls = readerColumns === "double" ? "lg:columns-2 lg:gap-8" : "";

  // 抓取并解析网页长文正文
  const loadFullText = useCallback(async (link: string) => {
    setIsExtracting(true);
    setExtractError(null);
    try {
      const extracted = await fetchFullArticle(link);
      if (extracted && stripHtml(extracted).length >= 150) {
        setFullContent(extracted);
        setViewMode("full");
      } else {
        setExtractError("源网页未能解析出长文正文");
      }
    } catch (e: any) {
      setExtractError(e?.message || "提取正文失败");
    } finally {
      setIsExtracting(false);
    }
  }, []);

  // 切换文章时自动初始化并针对导读源尝试抓取
  useEffect(() => {
    setFullContent(null);
    setExtractError(null);
    setViewMode("full");

    const isTeaser = isTeaserArticle(article);
    if (isTeaser && article.link) {
      void loadFullText(article.link);
    }
  }, [article.link, article.title, loadFullText]);

  // 键盘快捷键（Escape 关闭）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // 背景页面滚动锁定
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const isTeaser = isTeaserArticle(article);
  const hasExtractedFull = Boolean(fullContent && fullContent.trim().length > 0);

  // 计算当前呈现的正文 HTML
  let displayHtml = "";
  if (viewMode === "full" && hasExtractedFull) {
    displayHtml = sanitizeArticleHtml(fullContent!);
  } else if (article.content && article.content.trim()) {
    displayHtml = sanitizeArticleHtml(article.content);
  } else if (article.description && article.description.trim()) {
    displayHtml = `<p>${sanitizeArticleHtml(article.description)}</p>`;
  }

  // 触发 AI 速览：若已提取全文则把全文喂给 AI，大幅提升洞察质量
  const handleAISummaryClick = () => {
    const targetArticle: Article =
      hasExtractedFull && fullContent
        ? { ...article, content: fullContent }
        : article;
    onGenerateAISummary(targetArticle);
  };

  const overlayElement = (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-3 sm:p-6 select-text animate-[fadeIn_0.15s_ease-out]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={
          "bg-white/95 dark:bg-[#1A1C22] backdrop-blur-md border border-[#EFEBE4] dark:border-[#2C2E38] rounded-2xl w-full max-w-3xl h-[88vh] flex flex-col shadow-2xl relative text-[#2D323A] dark:text-slate-100 " +
          fontCls
        }
      >
        {/* 顶部控制栏 */}
        <div className="flex items-center gap-2 px-5 pt-3.5 pb-3 border-b border-[#EFEBE4] dark:border-[#2C2E38] shrink-0">
          <button
            onClick={onClose}
            title="返回 (Esc)"
            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium truncate max-w-[200px]">
            {article.feedName || "文章阅读"}
          </span>

          <div className="flex items-center gap-1.5 ml-auto">
            {/* 字号选择 */}
            <div className="flex items-center bg-white dark:bg-[#252831] border border-[#EFEBE4] dark:border-[#2C2E38] rounded-lg p-0.5 gap-0.5 shadow-2xs">
              {(["sm", "md", "lg", "xl"] as const).map((sz) => (
                <button
                  key={sz}
                  onClick={() => onFontSizeChange(sz)}
                  className={
                    "w-5 h-5 rounded flex items-center justify-center transition-all cursor-pointer " +
                    (readerFontSize === sz
                      ? "bg-[#2D323A] dark:bg-[#3D4452] text-white"
                      : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5")
                  }
                >
                  <span
                    className={
                      sz === "sm"
                        ? "text-[9px]"
                        : sz === "md"
                          ? "text-[10px]"
                          : sz === "lg"
                            ? "text-[11px]"
                            : "text-[12px]"
                    }
                  >
                    A
                  </span>
                </button>
              ))}
            </div>

            {/* 字体切换 */}
            <button
              onClick={() => onFontFamilyChange(readerFontFamily === "serif" ? "sans" : "serif")}
              className={
                "px-2 py-1 rounded text-[9px] font-bold transition-all cursor-pointer border " +
                (readerFontFamily === "serif"
                  ? "bg-[#2D323A] dark:bg-[#3D4452] text-white border-[#2D323A] dark:border-[#3D4452]"
                  : "bg-white dark:bg-[#252831] text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 border-[#EFEBE4] dark:border-[#2C2E38]")
              }
            >
              {readerFontFamily === "serif" ? "宋" : "黑"}
            </button>

            {/* 排版分栏 */}
            <button
              onClick={() => onColumnsChange(readerColumns === "double" ? "single" : "double")}
              className={
                "px-2 py-1 rounded text-[9px] font-bold transition-all cursor-pointer border " +
                (readerColumns === "double"
                  ? "bg-[#2D323A] dark:bg-[#3D4452] text-white border-[#2D323A] dark:border-[#3D4452]"
                  : "bg-white dark:bg-[#252831] text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 border-[#EFEBE4] dark:border-[#2C2E38]")
              }
            >
              {readerColumns === "double" ? "双栏" : "单栏"}
            </button>
          </div>

          <button
            onClick={onClose}
            title="关闭 (Esc)"
            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 滚动文章正文区 */}
        <div className="flex-grow overflow-y-auto px-6 md:px-12 py-6 custom-scrollbar">
          <div className="max-w-2xl mx-auto">
            {/* 文章标题 */}
            <h2 className={titleCls + " font-black text-[#2D323A] dark:text-slate-100 mb-4 leading-snug"}>
              {article.title}
            </h2>

            {/* 元信息 */}
            <div className="flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500 font-medium mb-5 border-b border-[#EFEBE4] dark:border-[#2C2E38] pb-4 flex-wrap">
              <span className="font-bold text-[#4D7C5D] dark:text-[#76B087]">
                {article.feedName || "未知来源"}
              </span>
              {article.author && <span>作者：{article.author}</span>}
              <span>{article.pubDate}</span>

              {article.link && (
                <button
                  onClick={() => openExternal(article.link!)}
                  className="flex items-center gap-1 text-[#4D7C5D] dark:text-[#76B087] hover:underline ml-auto cursor-pointer font-bold"
                >
                  <Globe className="w-3 h-3" /> 原网阅读 <ExternalLink className="w-2.5 h-2.5" />
                </button>
              )}
            </div>

            {/* 智能全文解析状态提示 */}
            {isExtracting && (
              <div className="flex items-center gap-2.5 px-4 py-2.5 mb-5 bg-[#F0F5F1] dark:bg-[#1C2620] border border-[#DEEAE2] dark:border-[#2A3E30] rounded-xl text-xs text-[#3E654B] dark:text-[#76B087] animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#4D7C5D] shrink-0" />
                <span>正在智能解析并抓取原网页完整正文与配图...</span>
              </div>
            )}

            {hasExtractedFull && (
              <div className="flex items-center justify-between px-3.5 py-1.5 mb-5 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 rounded-xl text-[11px] text-[#3E654B] dark:text-[#76B087]">
                <span className="flex items-center gap-1.5 font-medium">
                  <Sparkles className="w-3.5 h-3.5 text-[#4D7C5D] dark:text-[#76B087]" />
                  已智能提取原网页完整长文与图文排版
                </span>
                <button
                  onClick={() => setViewMode(viewMode === "full" ? "teaser" : "full")}
                  className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:underline cursor-pointer text-[10px]"
                >
                  {viewMode === "full" ? "查看 RSS 摘要" : "查看完整长文"}
                </button>
              </div>
            )}

            {/* AI 速览摘要框 */}
            {aiSummary && (
              <div className="bg-[#F0F5F1] dark:bg-[#1A2520] border border-[#DEEAE2] dark:border-[#2B3E32] rounded-xl p-4 mb-5 flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-[#4D7C5D]/10 dark:bg-[#76B087]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#4D7C5D] dark:text-[#76B087]" />
                </div>
                <div className="min-w-0 flex-grow">
                  <span className="text-[9px] font-bold text-[#4D7C5D]/70 dark:text-[#76B087]/70 uppercase tracking-[0.1em] block mb-1">
                    AI 深度速览
                  </span>
                  <p className="text-[11px] text-slate-700 dark:text-slate-200 leading-relaxed font-normal">
                    {aiSummary}
                  </p>
                </div>
                <button
                  onClick={onDismissSummary}
                  className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* 正文内容渲染 */}
            {displayHtml ? (
              <div
                className={`${colCls} ${bodyCls} prose prose-slate dark:prose-invert max-w-none text-slate-700 dark:text-slate-200 leading-relaxed font-normal [&_p]:mb-4 [&_img]:rounded-xl [&_img]:max-w-full [&_img]:h-auto [&_img]:my-4 [&_img]:mx-auto [&_a]:text-[#4D7C5D] dark:[&_a]:text-[#76B087] [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-[#4D7C5D]/40 [&_blockquote]:pl-4 [&_blockquote]:my-3 [&_blockquote]:italic [&_pre]:bg-slate-100 [&_pre]:dark:bg-[#252830] [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_h1]:text-xl [&_h1]:font-black [&_h1]:mt-6 [&_h1]:mb-3 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-3 [&_h3]:text-base [&_h3]:font-bold [&_h3]:mt-4 [&_h3]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-3`}
                dangerouslySetInnerHTML={{ __html: displayHtml }}
              />
            ) : null}

            {/* 若为导读源且未能提取到长文正文，展示专用卡片与直达按钮，避免大片留白 */}
            {isTeaser && !hasExtractedFull && !isExtracting && (
              <div className="bg-[#FAF8F5] dark:bg-[#1E2026] border border-[#EFEBE4] dark:border-[#2C2E38] rounded-xl p-5 my-6 flex flex-col gap-3">
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-bold text-xs">
                  <AlertCircle className="w-4 h-4 text-[#8B6E3C] shrink-0" />
                  <span>当前源站仅输出导读摘要</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  少数派等订阅源为引导用户访问官网，在 RSS 中通常只包含一两句话简介。您可直接在浏览器中打开完整图文，或尝试重新解析。
                </p>
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  {article.link && (
                    <button
                      onClick={() => openExternal(article.link!)}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#4D7C5D] hover:bg-[#3E654B] text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                    >
                      在浏览器中阅读全文 <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {article.link && (
                    <button
                      onClick={() => void loadFullText(article.link!)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white dark:bg-[#252831] border border-[#EFEBE4] dark:border-[#2C2E38] text-slate-700 dark:text-slate-200 text-xs font-medium hover:bg-slate-50 dark:hover:bg-white/5 transition-all cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-slate-400" /> 重新智能抓取
                    </button>
                  )}
                </div>
                {extractError && (
                  <span className="text-[10px] text-amber-600 dark:text-amber-400">
                    抓取提示：{extractError}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 底部功能条 */}
        <div className="border-t border-[#EFEBE4] dark:border-[#2C2E38] px-5 py-3 flex items-center gap-2 shrink-0">
          <button
            onClick={() => toggleBookmark(article)}
            className={
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer border " +
              (isBookmarked(article)
                ? "bg-[#F0F5F1] dark:bg-[#1C2620] text-[#4D7C5D] dark:text-[#76B087] border-[#4D7C5D]/20 dark:border-[#76B087]/30"
                : "text-slate-500 dark:text-slate-400 hover:text-[#4D7C5D] dark:hover:text-[#76B087] bg-white/70 dark:bg-[#252831] hover:bg-white border-[#EFEBE4] dark:border-[#2C2E38] hover:border-[#4D7C5D]/30")
            }
          >
            {isBookmarked(article) ? (
              <BookmarkCheck className="w-3.5 h-3.5" />
            ) : (
              <Bookmark className="w-3.5 h-3.5" />
            )}
            {isBookmarked(article) ? "已收藏" : "收藏"}
          </button>

          {article.link && (
            <button
              onClick={() => {
                if (hasExtractedFull && viewMode === "teaser") {
                  setViewMode("full");
                } else if (!hasExtractedFull) {
                  void loadFullText(article.link!);
                }
              }}
              disabled={isExtracting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100 bg-white dark:bg-[#252831] border border-[#EFEBE4] dark:border-[#2C2E38] transition-all cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-[#4D7C5D]" />
              {isExtracting
                ? "提取中..."
                : hasExtractedFull
                  ? "完整图文已就绪"
                  : "抓取全文"}
            </button>
          )}

          <button
            onClick={handleAISummaryClick}
            disabled={aiLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-[#4D7C5D] dark:text-[#76B087] bg-[#F0F5F1] dark:bg-[#1C2620] hover:bg-[#DEEAE2] dark:hover:bg-[#24352A] border border-[#DEEAE2] dark:border-[#2C3E32] transition-all cursor-pointer ml-auto"
          >
            {aiLoading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {aiLoading ? "生成中..." : "AI 深度速览"}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(overlayElement, document.body)
    : overlayElement;
};
