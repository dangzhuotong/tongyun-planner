import React, { useState, useRef, useEffect } from "react";
import { X, Check, Plus, ListTodo, Calendar, Flag, Repeat, Tag, Zap, Link2, Unlink, Paperclip, File, Trash2, Upload, Download, ExternalLink, RefreshCw } from "lucide-react";
import type { Task, Attachment, TaskPriority } from "../types";
import { useTranslation } from "../i18n/LanguageContext";
import { parseNaturalDate, formatNaturalPreview } from "../utils/dateParser";
import { storageManager, getAttachmentPath } from "../utils/storage";
import { PRIORITY_LEVELS } from "../constants";
import { CustomSelect } from "./CustomSelect";

interface TaskDetailModalProps {
  task: Task;
  onClose: () => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onAddSubtask: (taskId: string, title: string) => void;
  onSaveNotes: (taskId: string, notes: string) => void;
  onUpdateTags: (taskId: string, tags: string[]) => void;
  onEditTask: (taskId: string, updates: Partial<Task>) => void;
  allTasks?: Task[]; // for dependency selection
}

export const TaskDetailModal: React.FC<TaskDetailModalProps> = React.memo(({
  task,
  onClose,
  onToggleSubtask,
  onAddSubtask,
  onSaveNotes,
  onUpdateTags,
  onEditTask,
  allTasks,
}) => {
  const { t } = useTranslation();
  const tc = t.taskCard;
  const [notes, setNotes] = useState(task.notes || "");
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [tags, setTags] = useState<string[]>(task.tags || []);
  const [tagInput, setTagInput] = useState("");
  const [editDueDate, setEditDueDate] = useState(task.dueDate || "");
  const [editDueTime, setEditDueTime] = useState(task.dueTime || "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority || "medium");
  const [attachments, setAttachments] = useState<Attachment[]>(task.attachments || []);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imgUrls, setImgUrls] = useState<Record<string, string>>({});
  const blobUrls = useRef<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load blob URLs for image attachments
  useEffect(() => {
    // Revoke previous blob URLs
    blobUrls.current.forEach(url => URL.revokeObjectURL(url));
    blobUrls.current = [];

    const load = async () => {
      const map: Record<string, string> = {};
      for (const att of (task.attachments || [])) {
        if (!att.type.startsWith("image/")) continue;
        const publicUrl = storageManager.getPublicUrl(att.path);
        if (publicUrl) { map[att.id] = publicUrl; continue; }
        try {
          const url = await storageManager.getFileUrl(att.path, att.type);
          map[att.id] = url;
          blobUrls.current.push(url);
        } catch { /* ignore */ }
      }
      setImgUrls(map);
    };
    load();
    return () => {
      blobUrls.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, [task.attachments]);


  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
      onClick={onClose}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="bg-white rounded-2xl shadow-xl border border-[#EFEBE4] w-full max-w-md mx-4 max-h-[80vh] flex flex-col animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EFEBE4]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-bold text-slate-800 truncate">{task.title}</span>
            {task.repeat && task.repeat !== "none" && (
              <span className="text-[8.5px] px-1.5 py-0.5 rounded-lg border bg-[#F0F5F1] border-[#DEEAE2] text-[#4D7C5D] font-bold flex items-center gap-1 flex-shrink-0">
                <Repeat className="w-2.5 h-2.5" />
                <span>{tc["repeat" + task.repeat.charAt(0).toUpperCase() + task.repeat.slice(1)]}</span>
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer text-slate-400 hover:text-slate-600 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 custom-scrollbar">
          {/* Tags */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Tag className="w-3 h-3 text-slate-500" />
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">{tc.tags}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map((tag, i) => (
                <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-md bg-[#F0F5F1] border border-[#DEEAE2] text-[#4D7C5D] font-bold flex items-center gap-1">
                  {tag}
                  <button type="button" onClick={() => {
                    const next = tags.filter((_, j) => j !== i);
                    setTags(next);
                    onUpdateTags(task.id, next);
                  }} className="cursor-pointer hover:text-red-500">×</button>
                </span>
              ))}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (tagInput.trim() && !tags.includes(tagInput.trim())) {
                    const next = [...tags, tagInput.trim()];
                    setTags(next);
                    onUpdateTags(task.id, next);
                  }
                  setTagInput("");
                }}
                className="flex items-center bg-[#FAF8F5] border border-[#EFEBE4] px-2 rounded-xl"
              >
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder={tc.tagPlaceholder}
                  className="w-20 bg-transparent border-none text-[10px] text-slate-700 placeholder-slate-400 focus:outline-none font-medium py-1"
                />
              </form>
            </div>
          </div>

          {/* Description */}
          {task.description && (
            <p className="text-xs text-slate-600 leading-relaxed">{task.description}</p>
          )}

          {/* Meta info */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-medium bg-[#FAF8F5] px-2.5 py-1.5 rounded-lg border border-[#EFEBE4]">
              <Flag className="w-3 h-3" />
              <span>{
                task.category === "urgent-important" ? t.matrix.urgentImportant :
                task.category === "important-not-urgent" ? t.matrix.importantNotUrgent :
                task.category === "urgent-not-important" ? t.matrix.urgentNotImportant :
                t.matrix.notUrgentNotImportant
              }</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-medium bg-[#FAF8F5] px-2.5 py-1.5 rounded-lg border border-[#EFEBE4]">
              <span className="font-bold uppercase tracking-wider">{tc.priority}</span>
              <CustomSelect
                value={priority}
                onChange={(v) => { setPriority(v as TaskPriority); onEditTask(task.id, { priority: v as TaskPriority }); }}
                options={PRIORITY_LEVELS}
                className="w-20 text-[10px]"
                dropdownAlign="top"
              />
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-medium bg-[#FAF8F5] px-2.5 py-1.5 rounded-lg border border-[#EFEBE4]">
              <Calendar className="w-3 h-3" />
              <input
                type="date"
                value={editDueDate}
                onChange={(e) => { setEditDueDate(e.target.value); onEditTask(task.id, { dueDate: e.target.value || undefined }); }}
                className="bg-transparent border-none text-[10px] text-slate-700 font-bold focus:outline-none cursor-pointer w-24"
                title={t.taskCard.dueDate}
              />
              <input
                type="time"
                value={editDueTime}
                onChange={(e) => { setEditDueTime(e.target.value); onEditTask(task.id, { dueTime: e.target.value || undefined }); }}
                className="bg-transparent border-none text-[10px] text-slate-700 font-bold focus:outline-none cursor-pointer w-16"
              />
              {/* Natural date parser */}
              <NLPDateInputDetail onParse={(d, t) => { if (d) { setEditDueDate(d); onEditTask(task.id, { dueDate: d }); } if (t) { setEditDueTime(t); onEditTask(task.id, { dueTime: t }); } }} />
            </div>

            {/* Dependencies */}
            {allTasks && allTasks.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Link2 className="w-3 h-3 text-slate-500" />
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">前置任务</span>
                </div>
                <div className="flex flex-col gap-1">
                  {(task.dependsOn || []).map((depId) => {
                    const depTask = allTasks.find(t => t.id === depId);
                    return (
                      <div key={depId} className="flex items-center gap-2 bg-[#FAF8F5] px-2.5 py-1.5 rounded-lg border border-[#EFEBE4]">
                        <span className="flex-1 text-[10px] text-slate-700 font-medium truncate">{depTask?.title || '已删除'}</span>
                        {depTask && <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${depTask.dueDate ? 'bg-[#F0F5F1] text-[#4D7C5D]' : 'text-slate-400'}`}>{depTask.dueDate || '无日期'}</span>}
                        <button onClick={() => onEditTask(task.id, { dependsOn: (task.dependsOn || []).filter(id => id !== depId) })} className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors cursor-pointer">
                          <Unlink className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                  <DepTaskSearch
                    allTasks={allTasks.filter(t => t.id !== task.id && !(task.dependsOn || []).includes(t.id))}
                    onSelect={(depId) => onEditTask(task.id, { dependsOn: [...(task.dependsOn || []), depId] })}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Subtasks */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <ListTodo className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                {tc.subtasks}
              </span>
              {task.subtasks && task.subtasks.length > 0 && (
                <span className="text-[9px] text-slate-400 font-medium">
                  {task.subtasks.filter(s => s.completed).length}/{task.subtasks.length}
                </span>
              )}
            </div>
            <div className="space-y-1.5 mb-2">
              {(task.subtasks || []).map((sub) => (
                <div key={sub.id} className="flex items-center gap-2 px-1">
                  <button
                    onClick={() => onToggleSubtask(task.id, sub.id)}
                    className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 transition-all cursor-pointer ${
                      sub.completed
                        ? "bg-[#4D7C5D] border-[#4D7C5D]"
                        : "border-slate-300 hover:border-[#4D7C5D]"
                    }`}
                  >
                    {sub.completed && <Check className="w-2.5 h-2.5 text-white" />}
                  </button>
                  <span className={`text-xs font-medium ${sub.completed ? "text-slate-400 line-through" : "text-slate-700"}`}>
                    {sub.title}
                  </span>
                </div>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newSubtaskTitle.trim()) {
                  onAddSubtask(task.id, newSubtaskTitle.trim());
                  setNewSubtaskTitle("");
                }
              }}
              className="flex items-center gap-2 bg-[#FAF8F5] border border-[#EFEBE4] px-3 py-1.5 rounded-xl"
            >
              <Plus className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <input
                type="text"
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                placeholder={tc.subtaskPlaceholder}
                className="w-full bg-transparent border-none text-[11px] text-slate-700 placeholder-slate-400 focus:outline-none font-medium"
              />
            </form>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[10px] font-bold text-[#8B6E3C] uppercase tracking-wider block mb-1.5">
              {tc.notes}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t.listView.notesPlaceholder}
              className="w-full bg-[#FAF8F5]/60 border border-[#EFEBE4] px-3 py-2 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#4D7C5D] transition-all resize-none h-20 custom-scrollbar font-medium"
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={() => onSaveNotes(task.id, notes)}
                className="text-[10px] text-white bg-[#4D7C5D] hover:bg-[#3F684C] px-4 py-1.5 rounded-lg transition-colors font-bold cursor-pointer"
              >
                {t.listView.saveNotes}
              </button>
            </div>
          </div>

          {/* Attachments */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Paperclip className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">附件</span>
              {attachments.length > 0 && (
                <span className="text-[9px] text-slate-400 font-medium">{attachments.length}</span>
              )}
            </div>
            <div className="space-y-1.5 mb-2">
              {attachments.map((att) => {
                const isImage = att.type.startsWith("image/");
                const previewSrc = imgUrls[att.id];
                const hasPublicUrl = storageManager.getPublicUrl(att.path) !== null;
                return (
                  <div key={att.id} className="flex items-center gap-2 px-1 py-1.5 bg-[#FAF8F5] border border-[#EFEBE4] rounded-lg">
                    {isImage && previewSrc ? (
                      <button onClick={() => setPreviewUrl(previewSrc)} className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100 cursor-pointer hover:opacity-80 transition-opacity">
                        <img src={previewSrc} alt={att.name} className="w-full h-full object-cover" />
                      </button>
                    ) : (
                      <button onClick={async () => { try { const data = await storageManager.downloadFile(att.path); if (!data) return; const blob = new Blob([data], { type: att.type }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = att.name; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); } catch (e) { console.error(e); } }} className="w-10 h-10 rounded-lg bg-[#F0F5F1] flex items-center justify-center flex-shrink-0 cursor-pointer hover:bg-[#E3EBE5] transition-colors">
                        <File className="w-4 h-4 text-[#4D7C5D]" />
                      </button>
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-medium text-slate-700 truncate block">{att.name}</span>
                      <span className="text-[8px] text-slate-400">{(att.size / 1024).toFixed(1)} KB</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={async () => {
                          try {
                            const data = await storageManager.downloadFile(att.path);
                            if (!data) return;
                            const blob = new Blob([data], { type: att.type });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = att.name;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                          } catch (e) { console.error("Download failed", e); }
                        }}
                        className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
                        title="下载"
                      >
                        <Download className="w-3 h-3" />
                      </button>
                      {hasPublicUrl && (
                        <a href={storageManager.getPublicUrl(att.path)!} target="_blank" rel="noreferrer" className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-blue-600 transition-colors" title="在新标签页打开">
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      <button
                        onClick={() => {
                          const next = attachments.filter(a => a.id !== att.id);
                          setAttachments(next);
                          onEditTask(task.id, { attachments: next });
                        }}
                        className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                        title="删除"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || !storageManager.isConfigured()}
                className="flex items-center gap-1.5 text-[10px] bg-white border border-[#EFEBE4] hover:border-[#4D7C5D] disabled:opacity-40 text-slate-600 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer"
              >
                {uploading ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Upload className="w-3 h-3" />
                )}
                {uploading ? "上传中..." : "添加附件"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  setUploadError(null);
                  try {
                    const buffer = await file.arrayBuffer();
                    const bytes = new Uint8Array(buffer);
                    const attId = crypto.randomUUID();
                    // Sanitize filename to avoid path issues with spaces/special chars
                    const ext = file.name.includes(".") ? file.name.split(".").pop()! : "bin";
                    const safeName = `${attId}.${ext}`;
                    const path = getAttachmentPath(task.id, attId, safeName);
                    const savedPath = await storageManager.uploadFile(path, bytes, file.type);
                    const att: Attachment = {
                      id: attId,
                      name: file.name,
                      path: savedPath,
                      type: file.type,
                      size: file.size,
                      createdAt: new Date().toISOString(),
                    };
                    const next = [...attachments, att];
                    setAttachments(next);
                    onEditTask(task.id, { attachments: next });
                    if (att.type.startsWith("image/")) {
                      try {
                        const url = await storageManager.getFileUrl(att.path, att.type);
                        setImgUrls(prev => ({ ...prev, [att.id]: url }));
                      } catch { /* ignore */ }
                    }
                  } catch (err: any) {
                    console.error("Upload failed", err);
                    // Tauri invoke errors are plain strings, not Error objects
                    const msg = typeof err === "string" ? err : (err?.message || JSON.stringify(err));
                    setUploadError(`上传失败：${msg}`);
                  } finally {
                    setUploading(false);
                    e.target.value = "";
                  }
                }}
              />
              {!storageManager.isConfigured() && (
                <span className="text-[9px] text-amber-600">存储未配置，请在设置中配置存储后端</span>
              )}
              {uploadError && (
                <span className="text-[9px] text-red-500">{uploadError}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Image preview lightbox */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-8"
          onClick={() => setPreviewUrl(null)}
        >
          <button
            onClick={() => setPreviewUrl(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors cursor-pointer z-10"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={previewUrl}
            alt="preview"
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
});

// Dependency task search component
const DepTaskSearch: React.FC<{ allTasks: Task[]; onSelect: (id: string) => void }> = ({ allTasks, onSelect }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = allTasks.filter(t => t.title.toLowerCase().includes(query.toLowerCase())).slice(0, 6);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-[#4D7C5D] transition-colors cursor-pointer">
        <Plus className="w-3 h-3" /> 添加依赖
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-[#EFEBE4] rounded-xl shadow-lg p-2 w-64 animate-fade-in-up">
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索任务..." autoFocus className="w-full bg-[#FAF8F5] border border-[#EFEBE4] px-2 py-1.5 rounded-lg text-[10px] text-slate-700 placeholder-slate-400 focus:outline-none focus:border-[#C4D7B2] mb-1.5" />
          <div className="max-h-32 overflow-y-auto space-y-0.5">
            {filtered.map(t => (
              <button key={t.id} onClick={() => { onSelect(t.id); setOpen(false); setQuery(""); }} className="w-full text-left px-2 py-1.5 rounded-lg text-[10px] text-slate-600 hover:bg-[#F0F5F1] transition-colors cursor-pointer truncate">
                {t.title}
              </button>
            ))}
            {filtered.length === 0 && <p className="text-[9px] text-slate-400 text-center py-2">无匹配任务</p>}
          </div>
        </div>
      )}
    </div>
  );
};

// Natural language date input for TaskDetailModal
const NLPDateInputDetail: React.FC<{ onParse: (date?: string, time?: string) => void }> = ({ onParse }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const handleConfirm = () => {
    const parsed = parseNaturalDate(text);
    if (parsed) { onParse(parsed.dueDate, parsed.dueTime); setText(""); setOpen(false); }
  };
  return (
    <div className="relative inline-flex">
      <button type="button" onClick={() => setOpen(!open)} className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer" title="自然语言解析日期">
        <Zap className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-[#EFEBE4] rounded-xl shadow-lg p-2 animate-fade-in-up min-w-[180px]">
          <div className="flex items-center gap-1.5">
            <input type="text" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); if (e.key === "Escape") setOpen(false); }} placeholder="明天下午3点" className="flex-grow bg-[#FAF8F5] border border-[#EFEBE4] px-2 py-1 rounded-lg text-[10px] text-slate-700 placeholder-slate-400 focus:outline-none focus:border-[#C4D7B2]" />
            <button type="button" onClick={handleConfirm} className="text-[10px] px-2 py-1 rounded-lg bg-[#4D7C5D] text-white font-bold hover:bg-[#3F684C] transition-colors cursor-pointer">确定</button>
          </div>
          {text && (() => { const preview = parseNaturalDate(text); return preview ? <p className="text-[9px] text-slate-400 mt-1 px-1">→ {formatNaturalPreview(preview)}</p> : null; })()}
        </div>
      )}
    </div>
  );
};
