import { useTranslation } from "../i18n/LanguageContext";

export function TaskDateFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { locale } = useTranslation();
  const en = locale === "en";
  return (
    <select
      aria-label={en ? "Task dates" : "到期范围"}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      title={en ? "Today includes overdue and undated tasks. Future plans stay in All dates and Calendar." : "今天要做包含今日、逾期和未设日期的待办；未来计划可在全部日期或日历查看。"}
      className="max-w-full rounded-lg border border-[#EFEBE4] dark:border-[#383A42] bg-[#FAF8F5] dark:bg-[#282A30] px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200"
    >
      <option value="actionable">{en ? "Today’s work" : "今天要做"}</option>
      <option value="today">{en ? "Due today only" : "仅今日到期"}</option>
      <option value="all">{en ? "All dates" : "全部日期"}</option>
      <option value="week">{en ? "Next 7 days" : "未来7天"}</option>
      <option value="overdue">{en ? "Overdue" : "已逾期"}</option>
      <option value="none">{en ? "No date" : "无日期"}</option>
    </select>
  );
}
