import { useTranslation } from "../i18n/LanguageContext";
import { COMMON_TASK_TAGS } from "../utils/taskOrganization";

const englishTags: Record<string, string> = { 工作: "Work", 生活: "Life", 学习: "Learning" };

export function TaskTagPresets({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const { locale } = useTranslation();
  const en = locale === "en";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] text-slate-500 dark:text-slate-400">{en ? "Quick tags" : "快捷标签"}</span>
      {COMMON_TASK_TAGS.map(tag => {
        const selected = tags.includes(tag);
        const label = en ? englishTags[tag] : tag;
        return <button
          key={tag}
          type="button"
          aria-label={`${en ? "Tag" : "标签"}：${label}`}
          aria-pressed={selected}
          onClick={() => onChange(selected ? tags.filter(value => value !== tag) : [...tags, tag])}
          className={`rounded-lg border px-2 py-1 text-[10px] font-semibold cursor-pointer ${selected ? "bg-[#F0F5F1] dark:bg-[#232924] border-[#4D7C5D] text-[#4D7C5D] dark:text-[#6FAD84]" : "bg-transparent border-[#EFEBE4] dark:border-[#383A42] text-slate-500 dark:text-slate-400"}`}
        >{selected ? "✓ " : "+ "}{label}</button>;
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
    <select
      aria-label={en ? "Task tags" : "任务标签"}
      value={value}
      onChange={event => onChange(event.target.value)}
      className="max-w-full rounded-lg border border-[#EFEBE4] dark:border-[#383A42] bg-[#FAF8F5] dark:bg-[#282A30] px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200"
    >
      <option value="all">{en ? "All tags" : "全部标签"}</option>
      {tags.map(tag => <option key={tag} value={tag}>{en ? englishTags[tag] || tag : tag}</option>)}
    </select>
  );
}
