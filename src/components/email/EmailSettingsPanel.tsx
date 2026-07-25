import React, { useState, useEffect } from "react";
import { Mail, Send } from "lucide-react";
import type { EmailConfig } from "../../types";
import { useTranslation } from "../../i18n/LanguageContext";

interface EmailSettingsPanelProps {
  triggerToast: (text: string, type: "success" | "error") => void;
}

const SMTP_PRESETS: Record<string, { host: string; port: number }> = {
  qq: { host: "smtp.qq.com", port: 465 },
  "163": { host: "smtp.163.com", port: 465 },
  gmail: { host: "smtp.gmail.com", port: 587 },
};

const EMAIL_HELP: Record<string, { title: string; steps: string[] }> = {
  qq: {
    title: "QQ邮箱 授权码获取",
    steps: [
      "登录 QQ邮箱 → 设置 → 账户",
      "找到「POP3/SMTP服务」→ 点击「开启」",
      "按提示发送短信到指定号码",
      "成功后会生成一个 16 位授权码",
      "将授权码填入上方「授权码」输入框（非 QQ 密码）",
    ],
  },
  "163": {
    title: "163邮箱 授权码获取",
    steps: [
      "登录 163邮箱 → 设置 → POP3/SMTP/IMAP",
      "开启「IMAP/SMTP服务」（如果已开启，先关闭再重新开启以刷新授权码）",
      "按提示发送短信验证",
      "成功后会生成 16 位授权码",
      "将授权码填入上方「授权码」输入框（非邮箱密码）",
      "如果 465 端口不行，试试切换端口为 994（SSL）或 587（STARTTLS）",
    ],
  },
  gmail: {
    title: "Gmail 应用专用密码",
    steps: [
      "登录 Google 账号 → 安全性 → 两步验证（需开启）",
      "在「应用专用密码」中生成一个新密码",
      "选择「邮件」和「Windows 计算机」",
      "将生成的 16 位密码填入上方「授权码」",
      "注意：Gmail 需使用 587 端口 + STARTTLS",
    ],
  },
};

export const EmailSettingsPanel: React.FC<EmailSettingsPanelProps> = ({ triggerToast }) => {
  const { t } = useTranslation();
  const s = t.settings;

  const [emailConfig, setEmailConfig] = useState<EmailConfig>(() => {
    const saved = localStorage.getItem("tongyun_email_config");
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore invalid JSON */ }
    }
    return {
      smtpProvider: "qq" as const,
      smtpHost: "smtp.qq.com",
      smtpPort: 465,
      smtpUser: "",
      smtpPass: "",
      recipientEmail: "",
      enableRemindBefore: true,
      remindBeforeMinutes: 30,
      enableDailyDigest: true,
      digestHour: 8,
      digestMinute: 0,
    };
  });
  const [showEmailHelp, setShowEmailHelp] = useState(false);
  const [emailSendResult, setEmailSendResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    localStorage.setItem("tongyun_email_config", JSON.stringify(emailConfig));
  }, [emailConfig]);

  const handleSelectEmailProvider = (provider: string) => {
    if (provider === "custom") {
      setEmailConfig(p => ({ ...p, smtpProvider: "custom" as const }));
    } else {
      const preset = SMTP_PRESETS[provider];
      if (preset) {
        setEmailConfig(p => ({
          ...p,
          smtpProvider: provider as EmailConfig["smtpProvider"],
          smtpHost: preset.host,
          smtpPort: preset.port,
        }));
      }
    }
  };

  const handleTestEmail = async () => {
    setEmailSendResult(null);
    if (!emailConfig.smtpUser || !emailConfig.smtpPass) {
      triggerToast(s.emailTestFail, "error");
      return;
    }
    const { invoke } = await import("@tauri-apps/api/core");
    try {
      await invoke("send_test_email", {
        config: {
          smtp_host: emailConfig.smtpHost,
          smtp_port: emailConfig.smtpPort,
          smtp_user: emailConfig.smtpUser,
          smtp_pass: emailConfig.smtpPass,
          recipient_email: emailConfig.recipientEmail,
        },
      });
      setEmailSendResult({ ok: true, msg: s.emailTestSuccess });
      triggerToast(s.emailTestSuccess, "success");
    } catch (e: any) {
      const errMsg = typeof e === "string" ? e : String(e);
      setEmailSendResult({ ok: false, msg: errMsg });
      triggerToast(s.emailTestFail, "error");
    }
  };

  return (
    <div className="space-y-4 flex-grow overflow-y-auto max-h-[520px] pr-1 custom-scrollbar">
      <div className="bg-[#FAF5ED] border border-[#EFE5D3] p-4 rounded-2xl flex items-start gap-3">
        <Mail className="w-5 h-5 text-[#8B6E3C] mt-0.5 shrink-0" />
        <div className="text-xs text-slate-600 leading-relaxed font-medium">
          <strong>📧 {s.emailTitle}</strong>
          <p className="mt-1">{s.emailDesc}</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-[11px] font-bold text-[#8B6E3C] tracking-wide uppercase">{s.emailProvider}</h4>
          {emailConfig.smtpProvider !== "custom" && (
            <button onClick={() => setShowEmailHelp(!showEmailHelp)} className="text-[10px] font-bold text-[#4D7C5D] hover:text-[#3F684C] flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[#F0F5F1] transition-all cursor-pointer">
              {showEmailHelp ? "收起帮助" : "❓ 如何获取授权码？"}
            </button>
          )}
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[{ id: "qq", label: "QQ邮箱" }, { id: "163", label: "163邮箱" }, { id: "gmail", label: "Gmail" }, { id: "custom", label: "✏️ " + (t.common.custom || "自定义") }].map((p) => (
            <button key={p.id} onClick={() => { handleSelectEmailProvider(p.id); setShowEmailHelp(false); }}
              className={`py-2.5 rounded-xl text-[10px] font-extrabold border transition-all duration-200 cursor-pointer text-center hover:scale-105 active:scale-95 ${emailConfig.smtpProvider === p.id ? "bg-[#FCF2F0] border-[#F5DFDB] text-[#A34E36] shadow-xs" : "bg-white border-[#EFEBE4] text-slate-500 hover:bg-[#FAF8F5] hover:border-slate-300"}`}
            >{p.label}</button>
          ))}
        </div>
      </div>

      {showEmailHelp && emailConfig.smtpProvider !== "custom" && (
        <div className="bg-[#FAF5ED] border border-[#EFE5D3] p-4 rounded-2xl animate-fade-in-up">
          <h5 className="text-xs font-bold text-[#8B6E3C] mb-2">📖 {EMAIL_HELP[emailConfig.smtpProvider]?.title || "帮助"}</h5>
          <ol className="space-y-1.5 ml-4">{EMAIL_HELP[emailConfig.smtpProvider]?.steps.map((step, i) => <li key={i} className="text-[11px] text-slate-600 leading-relaxed list-decimal">{step}</li>)}</ol>
          <p className="text-[10px] text-[#A34E36] font-bold mt-2">⚠️ 授权码是 16 位字符，不是你登录邮箱的密码</p>
        </div>
      )}

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase block">{s.emailSmtpHost}</label>
            <input type="text" value={emailConfig.smtpHost} onChange={e => setEmailConfig(p => ({ ...p, smtpHost: e.target.value }))} className="w-full bg-white border border-[#EFEBE4] px-2.5 py-1.5 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#4D7C5D]" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase block">{s.emailSmtpPort}</label>
            <input type="number" value={emailConfig.smtpPort} onChange={e => setEmailConfig(p => ({ ...p, smtpPort: parseInt(e.target.value) || 465 }))} className="w-full bg-white border border-[#EFEBE4] px-2.5 py-1.5 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#4D7C5D]" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase block">📤 发件邮箱（SMTP 登录）</label>
            <input type="text" value={emailConfig.smtpUser} onChange={e => setEmailConfig(p => ({ ...p, smtpUser: e.target.value }))} placeholder="yourname@163.com" className="w-full bg-white border border-[#EFEBE4] px-2.5 py-1.5 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#4D7C5D]" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase block">{s.emailSmtpPass}</label>
            <input type="password" value={emailConfig.smtpPass} onChange={e => setEmailConfig(p => ({ ...p, smtpPass: e.target.value }))} placeholder="••••••••" className="w-full bg-white border border-[#EFEBE4] px-2.5 py-1.5 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#4D7C5D]" />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase block">📥 接收提醒邮箱（收件箱）</label>
          <input type="text" value={emailConfig.recipientEmail} onChange={e => setEmailConfig(p => ({ ...p, recipientEmail: e.target.value }))} placeholder="yourname@163.com" className="w-full bg-white border border-[#EFEBE4] px-2.5 py-1.5 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#4D7C5D]" />
        </div>
      </div>

      <div className="border-t border-[#EFEBE4] pt-4">
        <p className="text-[11px] text-[#A34E36] font-medium leading-relaxed bg-[#FCF2F0] border border-[#F5DFDB] rounded-xl px-3 py-2">
          {s.emailRemindUnavailable || "⏳ 到期邮件提醒与每日汇总功能尚未实现，敬请期待。"}
        </p>
      </div>

      <div className="flex gap-3 pt-1 sticky bottom-0 bg-white/90 pb-1">
        <button type="button" onClick={() => { localStorage.setItem("tongyun_email_config", JSON.stringify(emailConfig)); triggerToast(s.emailSaved, "success"); }}
          className="flex-1 bg-[#4D7C5D] hover:bg-[#3F684C] text-white py-2.5 rounded-xl text-[10px] font-extrabold flex items-center justify-center gap-1.5 cursor-pointer hover:scale-105 active:scale-95 transition-all shadow-xs"
        ><Send className="w-3.5 h-3.5" />{s.emailSave}</button>
        <button type="button" onClick={handleTestEmail}
          className="flex-1 bg-[#8B6E3C] hover:bg-[#725A31] text-white py-2.5 rounded-xl text-[10px] font-extrabold flex items-center justify-center gap-1.5 cursor-pointer hover:scale-105 active:scale-95 transition-all shadow-xs"
        ><Send className="w-3.5 h-3.5" />{s.emailTest}</button>
      </div>

      {emailSendResult && (
        <div className={`p-3 rounded-xl border text-xs font-bold leading-relaxed ${emailSendResult.ok ? "bg-[#F0F5F1] border-[#DEEAE2] text-[#4D7C5D]" : "bg-[#FCF2F0] border-[#F5DFDB] text-[#A34E36]"}`}>
          <div className="flex items-start gap-2"><span>{emailSendResult.ok ? "✅" : "❌"}</span><span>{emailSendResult.msg}</span></div>
          {!emailSendResult.ok && emailSendResult.msg.includes("535") && (
            <div className="mt-2 pt-2 border-t border-[#F5DFDB] text-[10px] text-slate-600 font-medium space-y-1">
              <p>🔍 常见原因：</p>
              <ul className="list-disc ml-4 space-y-0.5">
                <li>未开启邮箱的 SMTP 服务（点上方「如何获取授权码？」查看步骤）</li>
                <li>填的是登录密码，不是 16 位授权码</li>
                <li>授权码已过期，需重新生成</li>
                <li>账号或授权码有多余空格</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
