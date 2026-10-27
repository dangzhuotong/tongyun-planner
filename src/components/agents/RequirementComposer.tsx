import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import type { RequirementDraft } from "../../utils/pipeline/companyRoster";
import { useTranslation } from "../../i18n/LanguageContext";

interface RequirementComposerProps {
  onSubmit: (
    draft: RequirementDraft,
  ) => Promise<{ id: string; persisted?: "pipeline" | "fixture" }>;
  onClose?: () => void;
}

export function RequirementComposer({ onSubmit, onClose }: RequirementComposerProps) {
  const { t } = useTranslation();
  const ap = t.agentPanel;
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [priority, setPriority] = useState("p2");
  const [productId, setProductId] = useState("");
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<"pipeline" | "fixture" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setReceiptId(null);
    setPersisted(null);
    if (!title.trim()) {
      setError(ap.requirementNeedTitle);
      return;
    }
    setPending(true);
    try {
      const receipt = await onSubmit({
        title,
        detail,
        priority,
        productId: productId.trim() || null,
      });
      setReceiptId(receipt.id);
      setPersisted(receipt.persisted ?? "pipeline");
      setTitle("");
      setDetail("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : ap.requirementFailed);
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      data-requirement-form
      onSubmit={submit}
      className="rounded-2xl border border-[#EFEBE4] dark:border-[#33353A] bg-[#FAF8F5] dark:bg-[#1C1E24] p-3.5 flex flex-col gap-2.5 shadow-xs animate-fade-in-up"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[11px] font-bold text-[#2D323A] dark:text-slate-100">
            {ap.requirementTitle}
          </h3>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            {ap.requirementHint}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-[#EFEBE4]/60 dark:hover:bg-[#282A30] cursor-pointer"
            aria-label="关闭"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <input
        data-requirement-title
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
          if (error) setError(null);
        }}
        placeholder={ap.requirementPlaceholder}
        className="w-full px-3 py-1.5 rounded-lg border border-[#EFEBE4] dark:border-[#383A42] bg-white dark:bg-[#26282E] text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#4D7C5D]"
      />
      <textarea
        data-requirement-detail
        value={detail}
        onChange={(event) => setDetail(event.target.value)}
        placeholder={ap.requirementDetail}
        rows={2}
        className="w-full px-3 py-1.5 rounded-lg border border-[#EFEBE4] dark:border-[#383A42] bg-white dark:bg-[#26282E] text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#4D7C5D]"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
          {ap.requirementPriority}
          <select
            data-requirement-priority
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
            className="bg-white dark:bg-[#26282E] border border-[#EFEBE4] dark:border-[#383A42] rounded-lg px-2 py-1 text-[11px]"
          >
            <option value="p0">p0</option>
            <option value="p1">p1</option>
            <option value="p2">p2</option>
            <option value="p3">p3</option>
          </select>
        </label>
        <input
          data-requirement-product
          value={productId}
          onChange={(event) => setProductId(event.target.value)}
          placeholder={ap.requirementProduct}
          className="flex-1 min-w-[8rem] px-2 py-1 rounded-lg border border-[#EFEBE4] dark:border-[#383A42] bg-white dark:bg-[#26282E] text-[11px] focus:outline-none focus:border-[#4D7C5D]"
        />
        <div className="flex items-center gap-1.5 ml-auto">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-[#EFEBE4] dark:border-[#383A42] text-slate-500 dark:text-slate-300 hover:bg-white dark:hover:bg-[#26282E] cursor-pointer"
            >
              {t.common?.cancel || "取消"}
            </button>
          )}
          <button
            type="submit"
            data-requirement-submit
            disabled={pending}
            className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-[#4D7C5D] text-white hover:bg-[#3F684C] disabled:opacity-50 cursor-pointer shadow-xs"
          >
            {ap.requirementSubmit}
          </button>
        </div>
      </div>
      {error && (
        <p className="text-[11px] text-[#B83E26] dark:text-[#E67058]" data-requirement-error>
          {error}
        </p>
      )}
      {receiptId && (
        <div className="flex items-center justify-between gap-2 bg-[#F4F8F5] dark:bg-[#1C2620] border border-[#DEEAE2] dark:border-[#38433B] rounded-xl px-3 py-2">
          <p
            className="text-[11px] font-bold text-[#2F6B42] dark:text-[#78C496]"
            data-requirement-id={receiptId}
            data-requirement-persisted={persisted || "pipeline"}
          >
            {persisted === "fixture" ? ap.requirementSavedFixture : ap.requirementSaved} {receiptId}
          </p>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-[10px] font-bold text-[#2F6B42] dark:text-[#78C496] hover:underline cursor-pointer"
            >
              完成并收起
            </button>
          )}
        </div>
      )}
    </form>
  );
}
