import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function TaskFilterMenu({ label, active = false, children }: { label: string; active?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(event.target as Node)) ref.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.open) {
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return <details ref={ref} className="relative shrink-0">
    <summary className={`min-h-8 list-none [&::-webkit-details-marker]:hidden flex cursor-pointer items-center gap-1 rounded-lg border px-2.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 ${active ? "border-[#CFDDCF] bg-[#F0F5F1] text-[#365A40] dark:border-[#4C6654] dark:bg-[#34483A] dark:text-[#D7E9DB]" : "border-[#E8E4DC] bg-[#FAF8F5] text-slate-600 dark:border-[#3B3E46] dark:bg-[#23252B] dark:text-slate-300"}`}>
      {label}<ChevronDown className="h-3 w-3" />
    </summary>
    <div className="absolute right-0 top-full z-50 mt-2 min-w-44 rounded-xl border border-[#E8E4DC] bg-white p-1.5 shadow-lg dark:border-[#3B3E46] dark:bg-[#23252B] [&>button]:w-full [&>button]:justify-start [&>button]:text-left"
      onClick={event => { if ((event.target as HTMLElement).closest("button") && ref.current) ref.current.open = false; }}>
      {children}
    </div>
  </details>;
}
