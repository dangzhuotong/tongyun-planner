import { RefreshCw } from "lucide-react";
import { useTranslation } from "../../i18n/LanguageContext";
import {
  type CompanyRosterEntry,
  type RosterVia,
  formatHeartbeat,
} from "../../utils/pipeline/companyRoster";

interface CompanyRosterStripProps {
  entries: CompanyRosterEntry[];
  via: RosterVia;
  error?: string | null;
  loading?: boolean;
  selectedId?: string;
  onSelect?: (id: string) => void;
  onRefresh?: () => void;
}

export function CompanyRosterStrip({
  entries,
  via,
  error,
  loading,
  selectedId,
  onSelect,
  onRefresh,
}: CompanyRosterStripProps) {
  const { t, locale } = useTranslation();
  const ap = t.agentPanel;
  const title =
    via === "pipeline"
      ? ap.rosterPipeline
      : via === "fixture"
        ? ap.rosterFixture
        : via === "cache"
          ? ap.rosterCache
          : via === "unavailable"
            ? ap.rosterUnavailable
            : ap.rosterLocal;
  const hint =
    via === "pipeline" || via === "fixture"
      ? ap.rosterPipelineHint
      : via === "cache"
        ? ap.rosterCacheHint
        : via === "unavailable"
          ? ap.rosterUnavailableHint
          : ap.rosterLocalHint;

  return (
    <section
      data-company-roster
      data-roster-via={via}
      className="rounded-2xl border border-[#EFEBE4] dark:border-[#33353A] bg-white/90 dark:bg-[#1C1D21] p-3 flex flex-col gap-2 shadow-2xs"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[11px] font-bold text-[#2D323A] dark:text-slate-100">{title}</h3>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#FAF8F5] dark:bg-[#282A30] text-slate-500 font-semibold border border-[#EFEBE4] dark:border-[#383A42]">
              {entries.length}
            </span>
            {onSelect && (
              <span className="text-[9px] text-slate-400 dark:text-slate-500 hidden sm:inline">
                · 点卡片可快速筛选看板
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed truncate">
            {hint}
          </p>
        </div>
        {onRefresh && (
          <button
            type="button"
            data-roster-refresh
            onClick={onRefresh}
            className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg border border-[#EFEBE4] dark:border-[#383A42] text-slate-500 dark:text-slate-300 hover:bg-[#FAF8F5] dark:hover:bg-[#282A30] cursor-pointer inline-flex items-center gap-1 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            {ap.rosterRefresh}
          </button>
        )}
      </div>
      {error && (
        <p className="text-[10px] font-bold text-[#A26D14] dark:text-[#E8BA60]" data-roster-error>
          {error}
        </p>
      )}
      {loading ? (
        <p className="text-[11px] text-slate-400">{ap.rosterLoading}</p>
      ) : entries.length === 0 ? (
        <p className="text-[11px] text-slate-400 dark:text-slate-500" data-roster-empty>
          {via === "unavailable" ? ap.rosterUnavailableHint : ap.rosterEmpty}
        </p>
      ) : (
        <ul className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
          {entries.map((entry) => {
            const beat = formatHeartbeat(
              { online: entry.online, tone: entry.tone, ageMs: entry.ageMs },
              locale,
            );
            const isSelected = selectedId === entry.id;
            const toneClass =
              entry.tone === "online"
                ? "bg-[#EAF5ED] text-[#2F6B42] border-[#CDE5D4] dark:bg-[#1E2E23] dark:text-[#78C496] dark:border-[#2B4232]"
                : entry.tone === "offline"
                  ? "bg-[#FEF9EE] text-[#A26D14] border-[#FBEAC4] dark:bg-[#322A1E] dark:text-[#E8BA60] dark:border-[#4B3C24]"
                  : "bg-[#FAF8F5] text-slate-500 border-[#EFEBE4] dark:bg-[#26282E] dark:text-slate-400 dark:border-[#33353A]";
            const selectedClass = isSelected
              ? "ring-2 ring-[#4D7C5D] dark:ring-[#78C496] shadow-xs"
              : "hover:border-[#4D7C5D]/50";
            return (
              <li
                key={entry.id}
                data-roster-id={entry.id}
                data-roster-slug={entry.slug}
                data-roster-online={entry.online ? "online" : entry.tone}
                onClick={() => onSelect?.(entry.id)}
                className={`shrink-0 rounded-xl border px-2.5 py-1.5 min-w-[7.5rem] ${toneClass} ${selectedClass} ${
                  onSelect ? "cursor-pointer" : ""
                } transition-all`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="text-[11px] font-bold truncate">{entry.handle}</div>
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      entry.tone === "online"
                        ? "bg-[#2F6B42] dark:bg-[#78C496] animate-pulse"
                        : "bg-slate-400/60 dark:bg-slate-500/60"
                    }`}
                  />
                </div>
                {entry.source === "company" && entry.slug !== entry.handle && (
                  <div className="text-[10px] opacity-80 truncate">{entry.slug}</div>
                )}
                <div className="text-[10px] font-bold mt-0.5">{beat}</div>
                {entry.machine && (
                  <div className="text-[9px] opacity-70 truncate">{entry.machine}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
