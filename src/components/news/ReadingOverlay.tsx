import React from "react";
import {
  ArrowLeft,
  X,
  ExternalLink,
  Sparkles,
  RefreshCw,
  Bookmark,
  BookmarkCheck,
} from "lucide-react";
import { openExternal } from "../../utils/openExternal";
import type { Article } from "./types";
import { sanitizeArticleHtml } from "./rssParser";

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
  const sizeMap = {
    sm: { title: "text-lg md:text-xl", body: "text-xs md:text-sm leading-relaxed" },
    md: { title: "text-xl md:text-2xl", body: "text-sm md:text-base leading-relaxed" },
    lg: { title: "text-2xl md:text-3xl", body: "text-base md:text-lg leading-loose" },
    xl: { title: "text-3xl md:text-4xl", body: "text-lg md:text-xl leading-loose" },
  };
  const { title: titleCls, body: bodyCls } = sizeMap[readerFontSize];
  const fontCls = readerFontFamily === "serif" ? "font-serif" : "font-sans";
  const colCls = readerColumns === "double" ? "lg:columns-2 lg:gap-8" : "";

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
      <div
        className={
          "bg-white/90 backdrop-blur-sm border border-[#EFEBE4] rounded-2xl w-full max-w-3xl h-[85vh] flex flex-col shadow-2xl relative animate-[fadeIn_0.2s_ease-out] " +
          fontCls
        }
      >
        <div className="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-[#EFEBE4]">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/5 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-[10px] text-slate-400 font-medium truncate max-w-[200px]">
            {article.feedName || "阅读"}
          </span>
          <div className="flex items-center gap-1.5 ml-auto">
            <div className="flex items-center bg-white border border-[#EFEBE4] rounded-lg p-0.5 gap-0.5">
              {(["sm", "md", "lg", "xl"] as const).map((sz) => (
                <button
                  key={sz}
                  onClick={() => onFontSizeChange(sz)}
                  className={
                    "w-5 h-5 rounded flex items-center justify-center transition-all cursor-pointer " +
                    (readerFontSize === sz
                      ? "bg-[#2D323A] text-white"
                      : "text-slate-400 hover:text-slate-600 hover:bg-slate-50")
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
            <button
              onClick={() => onFontFamilyChange(readerFontFamily === "serif" ? "sans" : "serif")}
              className={
                "px-2 py-1 rounded text-[9px] font-bold transition-all cursor-pointer border " +
                (readerFontFamily === "serif"
                  ? "bg-[#2D323A] text-white border-[#2D323A]"
                  : "bg-white text-slate-400 hover:text-slate-600 border-[#EFEBE4]")
              }
            >
              {readerFontFamily === "serif" ? "宋" : "黑"}
            </button>
            <button
              onClick={() => onColumnsChange(readerColumns === "double" ? "single" : "double")}
              className={
                "px-2 py-1 rounded text-[9px] font-bold transition-all cursor-pointer border " +
                (readerColumns === "double"
                  ? "bg-[#2D323A] text-white border-[#2D323A]"
                  : "bg-white text-slate-400 hover:text-slate-600 border-[#EFEBE4]")
              }
            >
              {readerColumns === "double" ? "双栏" : "单栏"}
            </button>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/5 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-grow overflow-y-auto px-6 md:px-10 py-6 custom-scrollbar">
          <div className="max-w-2xl mx-auto">
            <h2 className={titleCls + " font-black text-[#2D323A] mb-4"}>{article.title}</h2>
            <div className="flex items-center gap-3 text-[10px] text-slate-400 font-medium mb-6 border-b border-[#EFEBE4] pb-4">
              <span className="font-bold text-[#4D7C5D]">{article.feedName || "未知来源"}</span>
              <span>{article.pubDate}</span>
              {article.link && (
                <button
                  onClick={() => openExternal(article.link!)}
                  className="flex items-center gap-1 text-[#4D7C5D] hover:underline ml-auto cursor-pointer"
                >
                  原文 <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>

            {aiSummary && (
              <div className="bg-[#F0F5F1] border border-[#DEEAE2] rounded-xl p-4 mb-5 flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-[#4D7C5D]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Sparkles className="w-3 h-3 text-[#4D7C5D]" />
                </div>
                <div className="min-w-0 flex-grow">
                  <span className="text-[9px] font-bold text-[#4D7C5D]/60 uppercase tracking-[0.1em] block mb-1">
                    AI 速览
                  </span>
                  <p className="text-[11px] text-slate-600 leading-relaxed">{aiSummary}</p>
                </div>
                <button
                  onClick={onDismissSummary}
                  className="p-1 rounded hover:bg-black/5 text-slate-300 hover:text-slate-500 transition-colors cursor-pointer flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div
              className={`${colCls} ${bodyCls} prose prose-slate max-w-none text-slate-700 dark:text-slate-200 leading-relaxed font-normal [&_p]:mb-4 [&_img]:rounded-xl [&_img]:max-w-full [&_img]:h-auto [&_img]:my-4 [&_a]:text-[#4D7C5D] [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-[#4D7C5D]/40 [&_blockquote]:pl-4 [&_blockquote]:my-3 [&_blockquote]:italic [&_pre]:bg-slate-100 [&_pre]:dark:bg-[#252830] [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto`}
              dangerouslySetInnerHTML={{
                __html: sanitizeArticleHtml(
                  article.content ||
                    (article.description
                      ? `<p>${article.description}</p>`
                      : "<p>暂无正文内容，请点击上方「原文」链接阅读完整文章。</p>"),
                ),
              }}
            />
          </div>
        </div>

        <div className="border-t border-[#EFEBE4] px-5 py-3 flex items-center gap-2">
          <button
            onClick={() => toggleBookmark(article)}
            className={
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer border " +
              (isBookmarked(article)
                ? "bg-[#F0F5F1] text-[#4D7C5D] border-[#4D7C5D]/20"
                : "text-slate-400 hover:text-[#4D7C5D] bg-white/70 hover:bg-white border-[#EFEBE4] hover:border-[#4D7C5D]/30")
            }
          >
            {isBookmarked(article) ? (
              <BookmarkCheck className="w-3.5 h-3.5" />
            ) : (
              <Bookmark className="w-3.5 h-3.5" />
            )}
            {isBookmarked(article) ? "已收藏" : "收藏"}
          </button>
          <button
            onClick={() => onGenerateAISummary(article)}
            disabled={aiLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-[#4D7C5D] bg-[#F0F5F1] hover:bg-[#DEEAE2] border border-[#DEEAE2] transition-all cursor-pointer"
          >
            {aiLoading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {aiLoading ? "生成中..." : "AI 速览"}
          </button>
        </div>
      </div>
    </div>
  );
};
