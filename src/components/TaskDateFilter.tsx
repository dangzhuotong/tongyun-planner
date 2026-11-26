import { useTranslation } from "../i18n/LanguageContext";
import { TaskFilterSegments } from "./TaskFilterSegments";

export function TaskDateFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { locale } = useTranslation();
  const en = locale === "en";
  return (
    <TaskFilterSegments
      label={en ? "Dates" : "日期"}
      value={value}
      onChange={onChange}
      options={[
        { value: "actionable", label: en ? "Today’s work" : "今天要做", title: en ? "Today, overdue and undated tasks" : "包含今日、逾期和未设日期的待办" },
        { value: "today", label: en ? "Due today" : "仅今日到期" },
        { value: "all", label: en ? "All dates" : "全部日期" },
        { value: "week", label: en ? "7 days" : "未来7天" },
        { value: "overdue", label: en ? "Overdue" : "逾期" },
        { value: "none", label: en ? "No date" : "无日期" },
      ]}
    />
  );
}
