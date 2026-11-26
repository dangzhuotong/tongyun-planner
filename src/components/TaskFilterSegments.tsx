export function TaskFilterSegments({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { value: string; label: string; title?: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <div className="flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-[#E8E4DC] bg-[#F7F5F1] p-1 dark:border-[#3B3E46] dark:bg-[#23252B]">
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={`min-h-8 rounded-lg border px-3 text-xs font-medium transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 dark:focus-visible:outline-slate-200 ${value === option.value
              ? "border-[#CFDDCF] bg-white text-[#365A40] shadow-xs dark:border-[#4C6654] dark:bg-[#34483A] dark:text-[#D7E9DB]"
              : "border-transparent text-slate-600 hover:bg-white/80 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-[#31343D] dark:hover:text-white"}`}
          >{option.label}</button>
        ))}
      </div>
    </div>
  );
}
