import React from "react";
import { BookmarkPlus, ListTodo, NotebookPen } from "lucide-react";
import type { NewsRef, NewsActions } from "./newsActions";

interface NewsItemActionsProps {
  newsRef: NewsRef;
  actions: NewsActions;
  className?: string;
}

export const NewsItemActions: React.FC<NewsItemActionsProps> = ({
  newsRef,
  actions,
  className,
}) => {
  const btn =
    "flex items-center gap-1 px-1.5 py-1 rounded-md text-[9px] font-bold transition-all cursor-pointer border " +
    "border-[#EFEBE4] text-slate-400 hover:text-[#8B6E3C] hover:bg-[#FAF5ED] hover:border-[#E8E0D0] dark:text-slate-400 dark:hover:text-[#C4A05E] dark:hover:bg-[#4D525A]";

  return (
    <div className={"flex items-center gap-1 " + (className || "")}>
      <button
        type="button"
        title="稍后读"
        onClick={(e) => {
          e.stopPropagation();
          actions.readLater(newsRef);
        }}
        className={btn}
      >
        <BookmarkPlus className="w-3 h-3" />
        稍后读
      </button>
      <button
        type="button"
        title="存为任务"
        onClick={(e) => {
          e.stopPropagation();
          actions.saveTask(newsRef);
        }}
        className={btn}
      >
        <ListTodo className="w-3 h-3" />
        存为任务
      </button>
      <button
        type="button"
        title="收藏到日记"
        onClick={(e) => {
          e.stopPropagation();
          actions.saveJournal(newsRef);
        }}
        className={btn}
      >
        <NotebookPen className="w-3 h-3" />
        收藏到日记
      </button>
    </div>
  );
};
