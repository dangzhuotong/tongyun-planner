import { useTranslation } from "../i18n/LanguageContext";
import { TaskFilterSegments } from "./TaskFilterSegments";
import { TaskFilterMenu } from "./TaskFilterMenu";

export function TaskDateFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { locale } = useTranslation();
  const en = locale === "en";
  const extra = [
    { value: "week", label: en ? "Next 7 days" : "未来7天" },
    { value: "overdue", label: en ? "Overdue" : "逾期" },
    { value: "none", label: en ? "No date" : "无日期" },
  ];
  const selectedExtra = extra.find(option => option.value === value);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
    <TaskFilterSegments
      label={en ? "Dates" : "日期"}
      value={value}
      onChange={onChange}
      options={[
        { value: "actionable", label: en ? "Today’s work" : "今天要做", title: en ? "Today, overdue and undated tasks" : "包含今日、逾期和未设日期的待办" },
        { value: "today", label: en ? "Due today" : "仅今日到期" },
        { value: "all", label: en ? "All dates" : "全部日期" },
      ]}
    />
    <TaskFilterMenu label={selectedExtra?.label || (en ? "More dates" : "更多日期")} active={!!selectedExtra}>
      {extra.map(option => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)} className="min-h-8 rounded-lg px-3 text-xs text-slate-600 hover:bg-[#F7F5F1] dark:text-slate-300 dark:hover:bg-[#31343D]">{option.label}</button>)}
    </TaskFilterMenu>
    </div>
  );
}
