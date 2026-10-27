import React, { useRef, useState } from "react";
import { X, Download, Copy, Check, Sparkles, Heart } from "lucide-react";
import type { JournalEntry, Task } from "../../types";

interface JournalPostcardModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry?: JournalEntry;
  dateStr: string;
  completedTasks: Task[];
  lunarText?: string;
}

export const JournalPostcardModal: React.FC<JournalPostcardModalProps> = ({
  isOpen,
  onClose,
  entry,
  dateStr,
  completedTasks,
  lunarText,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const cardRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const [y, m, d] = dateStr.split("-");
  const weekdayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  const weekday = weekdayNames[dt.getDay()];

  // 获得已完成的任务（当天）
  const todayDone = completedTasks.filter((t) => t.dueDate === dateStr || (t.completedAt && new Date(t.completedAt).toISOString().startsWith(dateStr)));

  // 首张附件图片（如果有）
  const firstImage = entry?.attachments?.find((att) => att.type.startsWith("image/"));

  // 渲染为 Canvas 并导出
  const renderToCanvas = async (): Promise<HTMLCanvasElement | null> => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const scale = 2; // 高清视网膜绘制
    const width = 480;
    const height = 680;
    canvas.width = width * scale;
    canvas.height = height * scale;
    ctx.scale(scale, scale);

    // 1. 底卡背景（复古手帐暖宣纸色）
    ctx.fillStyle = "#FAF7F2";
    ctx.fillRect(0, 0, width, height);

    // 纸张边缘细腻内阴影与复古边框
    ctx.strokeStyle = "#E8E2D5";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(16, 16, width - 32, height - 32);

    // 2. 顶部和纸胶带装饰（芥末黄斜条胶带）
    ctx.save();
    ctx.fillStyle = "rgba(212, 163, 115, 0.45)";
    ctx.fillRect(width / 2 - 50, 10, 100, 16);
    ctx.restore();

    // 3. 头部日期与心情
    ctx.fillStyle = "#2D323A";
    ctx.font = "bold 26px Georgia, 'Noto Serif SC', serif";
    ctx.fillText(`${Number(m)}月${Number(d)}日`, 36, 68);

    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = "#8B7E6F";
    ctx.fillText(`${weekday}${lunarText ? ` · 农历${lunarText}` : ""} · ${y}`, 36, 88);

    // 右上角邮戳印章
    ctx.save();
    ctx.strokeStyle = "#A34E36";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(width - 64, 60, 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = "bold 10px monospace";
    ctx.fillStyle = "#A34E36";
    ctx.textAlign = "center";
    ctx.fillText("TONGYUN", width - 64, 56);
    ctx.fillText(`${dateStr}`, width - 64, 70);
    ctx.restore();

    // 4. 心情展示
    if (entry?.mood) {
      ctx.fillStyle = "#4D7C5D";
      ctx.font = "bold 13px system-ui, sans-serif";
      ctx.fillText(`${entry.mood} 今日心情记印`, 36, 120);
    }

    // 5. 拍立得照片区域（如果有）
    let textStartY = 145;
    if (firstImage && firstImage.path) {
      // 拍立得底框
      ctx.fillStyle = "#FFFFFF";
      ctx.shadowColor = "rgba(0,0,0,0.06)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      ctx.fillRect(36, 135, width - 72, 180);
      ctx.shadowColor = "transparent";

      // 尝试绘制图片
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve; // 即使失败也继续渲染文本
          img.src = firstImage.path;
        });
        if (img.width > 0) {
          ctx.drawImage(img, 46, 145, width - 92, 140);
        }
      } catch {
        // 容错
      }
      textStartY = 335;
    }

    // 6. 日记正文摘录
    ctx.fillStyle = "#374151";
    ctx.font = "14px/1.7 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, serif";
    const content = entry?.content || "今天也是用心记录日常的一天，岁序常易，华章日新。";
    
    // 简易多行文本折行渲染
    const maxCharsPerLine = 24;
    const lines = [];
    for (let i = 0; i < content.length && lines.length < 8; i += maxCharsPerLine) {
      lines.push(content.slice(i, i + maxCharsPerLine));
    }
    lines.forEach((line, idx) => {
      ctx.fillText(line, 36, textStartY + idx * 24);
    });

    // 7. 今日成就徽章
    if (todayDone.length > 0) {
      const badgeY = height - 90;
      ctx.fillStyle = "#E8F3EB";
      ctx.beginPath();
      ctx.roundRect(36, badgeY, width - 72, 34, 8);
      ctx.fill();

      ctx.fillStyle = "#4D7C5D";
      ctx.font = "bold 12px system-ui, sans-serif";
      ctx.fillText(`🌿 今日完成 ${todayDone.length} 项心愿与待办:`, 48, badgeY + 22);

      const doneSample = todayDone.slice(0, 2).map((t) => t.title).join(" · ");
      ctx.fillStyle = "#6B7280";
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText(doneSample.length > 20 ? doneSample.slice(0, 20) + "…" : doneSample, 210, badgeY + 22);
    }

    // 8. 底部手写落款
    ctx.fillStyle = "#9CA3AF";
    ctx.font = "italic 11px Georgia, serif";
    ctx.fillText("🌿 橦云手帐 · 记录生活的温度", 36, height - 32);

    return canvas;
  };

  const handleDownload = async () => {
    setSaving(true);
    try {
      const canvas = await renderToCanvas();
      if (!canvas) return;
      const link = document.createElement("a");
      link.download = `Aero-Postcard-${dateStr}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    setSaving(true);
    try {
      const canvas = await renderToCanvas();
      if (!canvas) return;
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // 降级为下载
          handleDownload();
        }
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs select-none animate-fade-in">
      <div className="relative w-full max-w-lg bg-[#FAF8F5] dark:bg-[#1E2026] border border-[#E8E2D5] dark:border-[#33353A] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* 头部导航 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E2D5] dark:border-[#33353A] bg-white/70 dark:bg-[#252830]/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#E8F3EB] dark:bg-[#1E3024] flex items-center justify-center text-[#4D7C5D] dark:text-[#78C496]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                生成手账明信片
              </h3>
              <p className="text-[10px] text-slate-400">
                将今日日记排版为唯美卡片，一键保存分享
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 预览卡片主体 */}
        <div className="p-6 flex justify-center overflow-y-auto max-h-[65vh] custom-scrollbar bg-slate-100/50 dark:bg-[#15161A]/50">
          <div
            ref={cardRef}
            className="w-full max-w-sm bg-[#FFFDF9] dark:bg-[#242730] border border-[#E8E2D5] dark:border-[#383B44] rounded-2xl p-6 shadow-xl relative select-none"
          >
            {/* 和纸胶带装饰 */}
            <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-24 h-5 bg-[#D4A373]/40 rounded-sm transform -rotate-1 border-t border-b border-white/40" />

            {/* 日期与邮戳 */}
            <div className="flex items-start justify-between border-b border-[#E8E2D5]/60 dark:border-[#383B44]/60 pb-3 mt-1">
              <div>
                <h4 className="text-2xl font-serif font-bold text-slate-800 dark:text-slate-100">
                  {Number(m)}月{Number(d)}日
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {weekday} {lunarText ? `· 农历${lunarText}` : ""} · {y}
                </p>
              </div>

              {/* 复古邮戳 */}
              <div className="w-13 h-13 rounded-full border-2 border-dashed border-[#A34E36]/50 flex flex-col items-center justify-center text-[#A34E36] transform rotate-12">
                <span className="text-[8px] font-mono font-bold tracking-tighter">AERO</span>
                <span className="text-[7px] font-mono">{dateStr}</span>
              </div>
            </div>

            {/* 心情贴纸 */}
            {entry?.mood && (
              <div className="mt-3 flex items-center gap-1.5 text-xs text-[#4D7C5D] dark:text-[#78C496] font-bold">
                <span className="text-base">{entry.mood}</span>
                <span>今日情绪印记</span>
              </div>
            )}

            {/* 拍立得卡片 (如有照片) */}
            {firstImage && (
              <div className="my-4 bg-white dark:bg-[#1A1C20] p-2.5 pb-4 rounded-xl shadow-xs border border-[#E8E2D5] dark:border-[#33353A] transform -rotate-1">
                <img
                  src={firstImage.path}
                  alt="今日照片"
                  className="w-full aspect-[4/3] object-cover rounded-md"
                />
                <p className="text-[10px] font-serif italic text-slate-400 mt-2 text-center">
                  今日时光 · 随手定格
                </p>
              </div>
            )}

            {/* 日记文本 */}
            <div className="my-3 text-xs leading-relaxed text-slate-700 dark:text-slate-300 font-medium whitespace-pre-wrap">
              {entry?.content || "今天也是用心记录日常的一天，岁序常易，华章日新。"}
            </div>

            {/* 今日达成 */}
            {todayDone.length > 0 && (
              <div className="mt-4 p-2.5 rounded-xl bg-[#F0F5F1] dark:bg-[#1C2620] border border-[#DEEAE2] dark:border-[#263D2E] text-[11px] text-[#4D7C5D] dark:text-[#78C496]">
                <span className="font-bold">🌿 今日斩获 {todayDone.length} 项成就: </span>
                <span className="text-slate-500 dark:text-slate-400">
                  {todayDone.slice(0, 2).map((t) => t.title).join(" · ")}
                </span>
              </div>
            )}

            {/* 底部落款 */}
            <div className="mt-5 pt-3 border-t border-[#E8E2D5]/40 dark:border-[#383B44]/40 flex items-center justify-between text-[10px] text-slate-400 font-serif">
              <span className="italic">🌿 橦云手帐 · 记录生活的温度</span>
              <Heart className="w-3 h-3 text-[#E07A5F]" />
            </div>
          </div>
        </div>

        {/* 底部操作条 */}
        <div className="px-6 py-4 border-t border-[#E8E2D5] dark:border-[#33353A] bg-white/70 dark:bg-[#252830]/70 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            支持复制到剪贴板，直接粘贴到微信/小红书
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              disabled={saving}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold border border-[#E8E2D5] dark:border-[#383A42] text-slate-700 dark:text-slate-200 hover:bg-[#FAF8F5] dark:hover:bg-[#2A2C35] cursor-pointer transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "已复制到剪贴板！" : "复制图片"}</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold bg-[#4D7C5D] hover:bg-[#3F684C] text-white shadow-xs cursor-pointer transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{saving ? "正在导出..." : "保存高清 PNG"}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
