import { useState, type FormEvent } from "react";
import type { RequirementDraft } from "../../utils/pipeline/companyRoster";
import { useTranslation } from "../../i18n/LanguageContext";

interface RequirementComposerProps {
  onSubmit: (
    draft: RequirementDraft,
  ) => Promise<{ id: string; persisted?: "pipeline" | "fixture" }>;
}

export function RequirementComposer({ onSubmit }: RequirementComposerProps) {
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
      className="rounded-2xl border border-[#EFEBE4] dark:border-[#33353A] bg-[#FAF8F5] dark:bg-[#1C1E24] p-3 flex flex-col gap-2"
    >
      <div>
        <h3 className="text-[11px] font-bold text-[#2D323A] dark:text-slate-100">
          {ap.requirementTitle}
        </h3>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
          {ap.requirementHint}
        </p>
      </div>
      <input
        data-requirement-title
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={ap.requirementPlaceholder}
        className="w-full px-3 py-1.5 rounded-lg border border-[#EFEBE4] dark:border-[#383A42] bg-white dark:bg-[#26282E] text-xs text-slate-800 dark:text-slate-100"
      />
      <textarea
        data-requirement-detail
        value={detail}
        onChange={(event) => setDetail(event.target.value)}
        placeholder={ap.requirementDetail}
        rows={2}
        className="w-full px-3 py-1.5 rounded-lg border border-[#EFEBE4] dark:border-[#383A42] bg-white dark:bg-[#26282E] text-xs text-slate-800 dark:text-slate-100"
      />
      <div className="flex flex-wrap gap-2">
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
          className="flex-1 min-w-[8rem] px-2 py-1 rounded-lg border border-[#EFEBE4] dark:border-[#383A42] bg-white dark:bg-[#26282E] text-[11px]"
        />
        <button
          type="submit"
          data-requirement-submit
          disabled={pending}
          className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-[#4D7C5D] text-white hover:bg-[#3F684C] disabled:opacity-50 cursor-pointer"
        >
          {ap.requirementSubmit}
        </button>
      </div>
      {error && (
        <p className="text-[11px] text-[#B83E26] dark:text-[#E67058]" data-requirement-error>
          {error}
        </p>
      )}
      {receiptId && (
        <p
          className="text-[11px] font-bold text-[#2F6B42] dark:text-[#78C496]"
          data-requirement-id={receiptId}
          data-requirement-persisted={persisted || "pipeline"}
        >
          {persisted === "fixture" ? ap.requirementSavedFixture : ap.requirementSaved} {receiptId}
        </p>
      )}
    </form>
  );
}
