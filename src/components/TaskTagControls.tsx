import { useTranslation } from "../i18n/LanguageContext";
import { COMMON_TASK_TAGS } from "../utils/taskOrganization";
import { TaskFilterSegments } from "./TaskFilterSegments";

const englishTags: Record<string, string> = { 工作: "Work", 生活: "Life", 学习: "Learning" };

export function TaskTagPresets({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const { locale } = useTranslation();
  const en = locale === "en";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-slate-600 dark:text-slate-300">{en ? "Quick tags" : "快捷标签"}</span>
      {COMMON_TASK_TAGS.map(tag => {
        const selected = tags.includes(tag);
        const label = en ? englishTags[tag] : tag;
        return <button
          key={tag}
          type="button"
          aria-label={`${en ? "Tag" : "标签"}：${label}`}
          aria-pressed={selected}
          onClick={() => onChange(selected ? tags.filter(value => value !== tag) : [...tags, tag])}
          className={`min-h-8 rounded-lg border px-3 text-xs font-medium cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 dark:focus-visible:outline-slate-200 ${selected ? "bg-[#F0F5F1] dark:bg-[#232924] border-[#4D7C5D] text-[#365A40] dark:text-[#B8D6C1]" : "bg-transparent border-[#D9D5CD] dark:border-[#555963] text-slate-600 dark:text-slate-300 hover:bg-[#F7F5F1] dark:hover:bg-[#31343D]"}`}
        >{selected ? "✓ " : ""}{label}</button>;
      })}
    </div>
  );
}

export function TaskTagFilter({ tasks, value, onChange }: {
  tasks: { tags?: string[] }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { locale } = useTranslation();
  const en = locale === "en";
  const tags = [...new Set<string>([...COMMON_TASK_TAGS, ...tasks.flatMap(task => task.tags || [])])];
  return (
    <TaskFilterSegments
      label={en ? "Tags" : "标签"}
      value={value}
      onChange={onChange}
      options={[{ value: "all", label: en ? "All" : "全部" }, ...tags.map(tag => ({ value: tag, label: en ? englishTags[tag] || tag : tag }))]}
    />
  );
}
