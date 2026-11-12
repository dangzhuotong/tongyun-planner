import { useRef } from "react";
import { useExternalCalendar } from "../../hooks/useExternalCalendar";
import { getLocalDateString } from "../../utils/date";

/** 个人日程的导入和订阅。节假日订阅仍在系统设置的节假日区块。 */
export function ExternalCalendarSettings() {
  const external = useExternalCalendar(getLocalDateString());
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="bg-[#FAF8F5] dark:bg-[#1E2026]/70 border border-[#EFEBE4] dark:border-[#2D3039] rounded-2xl p-3.5 space-y-2">
      <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block">外部日程</span>
      <p className="text-[10px] text-slate-400 font-medium">
        导入 .ics 或填写 HTTPS
        订阅地址后，当天的会议会显示在日历侧栏，并和待办时间盒标出重叠。这里只读取，不会写回外部日历。
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".ics,text/calendar"
          className="hidden"
          disabled={external.busy}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void external.importFile(file);
          }}
        />
        <button
          type="button"
          disabled={external.busy}
          onClick={() => fileRef.current?.click()}
          className="px-3 py-1.5 rounded-xl border border-[#EFEBE4] dark:border-[#2D3039] bg-white dark:bg-[#1C1D21] text-[10px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer disabled:opacity-50"
        >
          选择 .ics 文件
        </button>
        {external.hasCalendar && (
          <button
            type="button"
            disabled={external.busy}
            onClick={external.clear}
            className="px-2.5 py-1.5 rounded-xl border border-[#EFEBE4] dark:border-[#2D3039] text-slate-500 text-[10px] font-bold cursor-pointer disabled:opacity-50"
          >
            移除
          </button>
        )}
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void external.refresh();
        }}
      >
        <input
          aria-label="日历订阅地址"
          type="url"
          autoComplete="off"
          placeholder="https://example.com/calendar.ics"
          value={external.draft}
          onChange={(event) => external.setDraft(event.target.value)}
          className="flex-1 bg-white dark:bg-[#1C1D21] border border-[#EFEBE4] dark:border-[#2D3039] px-3 py-1.5 rounded-xl text-[11px] text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-[#4D7C5D]"
        />
        <button
          type="submit"
          disabled={external.busy || !external.draft.trim()}
          className="px-3 py-1.5 rounded-xl bg-[#4D7C5D] text-white text-[10px] font-bold cursor-pointer disabled:opacity-50 flex-shrink-0"
        >
          {external.source ? "刷新" : "连接"}
        </button>
      </form>
      {external.error && (
        <p role="alert" className="text-[10px] font-bold text-[#D4380D] dark:text-[#F06A4B]">
          {external.error}
        </p>
      )}
    </div>
  );
}
