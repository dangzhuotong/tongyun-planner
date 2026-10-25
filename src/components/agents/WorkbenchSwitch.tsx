import type { WorkSurface } from "../../utils/workbenchView";
import { useTranslation } from "../../i18n/LanguageContext";

interface WorkbenchSwitchProps {
  value: WorkSurface;
  onChange: (next: WorkSurface) => void;
}

export function WorkbenchSwitch({ value, onChange }: WorkbenchSwitchProps) {
  const { t } = useTranslation();
  const tb = t.titleBar;

  const item = (id: WorkSurface, label: string) => {
    const selected = value === id;
    return (
      <button
        type="button"
        data-work-surface={id}
        aria-pressed={selected}
        onClick={() => onChange(id)}
        onPointerDown={(event) => event.stopPropagation()}
        className={`px-2.5 h-6 rounded-md text-[10px] font-bold tracking-wide transition-colors cursor-pointer ${
          selected
            ? "bg-white dark:bg-[#2A2C32] text-[#2D323A] dark:text-slate-100 shadow-sm"
            : "text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100"
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      role="group"
      aria-label={`${tb.mine} / ${tb.agent}`}
      data-workbench-switch
      className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[#E7E1D8] dark:bg-[#12141A] border border-[#E0D9CE] dark:border-[#2B2D33]"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {item("mine", tb.mine)}
      {item("agent", tb.agent)}
    </div>
  );
}
