import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import { NOTE_COLORS } from "./noteThemes";
import { StickyPin } from "./StickyPin";
import { invoke } from "@tauri-apps/api/core";
import { audioEngine } from "../utils/audioEngine";
import { useTranslation } from "../i18n/LanguageContext";
import { safeJsonParse } from "../utils/json";

interface FloatingNoteWindowProps {
  noteId: string;
}

export const FloatingNoteWindow: React.FC<FloatingNoteWindowProps> = ({ noteId }) => {
  const { t } = useTranslation(); const fn = t.floatingNote;
  const [text, setText] = useState("");
  const [color, setColor] = useState("tea");
  const [pinType, setPinType] = useState<"pin" | "tape" | "clip" | "heart" | "smiley">("pin");
  const [darkMode, setDarkMode] = useState<string>(() => {
    try {
      const raw = localStorage.getItem("aero_customization_config");
      return raw ? JSON.parse(raw).darkMode || "light" : "light";
    } catch { return "light"; }
  });
  const [isFolded, setIsFolded] = useState(false);

  // Apply dark class when darkMode changes
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      if (darkMode === "dark" || (darkMode === "auto" && mediaQuery.matches)) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    };
    update();
    if (darkMode === "auto") {
      mediaQuery.addEventListener("change", update);
      return () => mediaQuery.removeEventListener("change", update);
    }
  }, [darkMode]);

  const handleToggleFold = () => {
    audioEngine.playStickSound();
    setIsFolded((prev) => {
      const nextFolded = !prev;
      import("@tauri-apps/api/webviewWindow").then((m) => {
        import("@tauri-apps/api/dpi").then((dpi) => {
          const appWindow = m.getCurrentWebviewWindow();
          if (nextFolded) {
            appWindow.setSize(new dpi.LogicalSize(240, 60));
          } else {
            appWindow.setSize(new dpi.LogicalSize(240, 240));
          }
        });
      });
      return nextFolded;
    });
  };

  // Load initial data from localStorage
  useEffect(() => {
    const localNotes = localStorage.getItem("aero_sticky_notes");
    if (localNotes) {
      const notes = safeJsonParse<any[]>(localNotes, []);
        const currentNote = notes.find((n: any) => n.id === noteId);
        if (currentNote) {
          setText(currentNote.text);
          setColor(currentNote.color);
        }
    }

    const localConfig = localStorage.getItem("aero_customization_config");
    if (localConfig) {
      const config = safeJsonParse<any>(localConfig, {});
      if (config.pinType) {
        setPinType(config.pinType);
      }
    }
  }, [noteId]);

  // Sync state between windows
  const syncState = async (action: string, title: string) => {
    try {
      await invoke("sync_todo_state", {
        payload: {
          task_id: noteId,
          action,
          title,
          description: "",
          notes: "",
          category: "",
          timestamp: Date.now(),
        },
      });
    } catch (e) {
      console.error("Failed to broadcast note sync", e);
    }
  };

  const handleTextChange = (newText: string) => {
    setText(newText);
    
    // Update local storage
    const localNotes = localStorage.getItem("aero_sticky_notes");
    if (localNotes) {
      const notes = safeJsonParse<any[]>(localNotes, []);
      const updated = notes.map((n: any) =>
        n.id === noteId ? { ...n, text: newText } : n
      );
      localStorage.setItem("aero_sticky_notes", JSON.stringify(updated));
    }
    syncState("edit_note_text", newText);
  };

  const handleColorChange = (newColor: string) => {
    audioEngine.playStickSound();
    setColor(newColor);
    
    const localNotes = localStorage.getItem("aero_sticky_notes");
    if (localNotes) {
      const notes = safeJsonParse<any[]>(localNotes, []);
      const updated = notes.map((n: any) =>
        n.id === noteId ? { ...n, color: newColor } : n
      );
      localStorage.setItem("aero_sticky_notes", JSON.stringify(updated));
    }
    syncState("change_note_color", newColor);
  };

  // Drag handler
  const handleMouseDownDrag = (e: React.PointerEvent) => {
    // Avoid dragging when clicking inside textarea or buttons
    if (
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLButtonElement ||
      (e.target as HTMLElement).closest("button")
    ) {
      return;
    }
    if (e.button === 0) {
      import("@tauri-apps/api/webviewWindow").then((m) => {
        m.getCurrentWebviewWindow().startDragging();
      });
    }
  };

  const handleClose = () => {
    import("@tauri-apps/api/webviewWindow").then((m) => {
      m.getCurrentWebviewWindow().close();
    });
  };

  // Listen to other windows edits
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    
    import("@tauri-apps/api/event").then((m) => {
      if (cancelled) return;
      m.listen("todo-sync-event", (event: any) => {
        const payload = event.payload;
        if (payload.task_id === noteId) {
          if (payload.action === "edit_note_text") {
            setText(payload.title);
          } else if (payload.action === "change_note_color") {
            setColor(payload.title);
          } else if (payload.action === "delete_note") {
            handleClose();
          }
        } else if (payload.action === "settings_sync") {
          try {
            const config = JSON.parse(payload.title);
            setPinType(config.pinType || "pin");
            if (config.darkMode) setDarkMode(config.darkMode);
          } catch (e) {
            console.error(e);
          }
        } else if (payload.action === "restore_sync") {
          try {
            const restored = JSON.parse(payload.title);
            const matchingNote = (restored.stickyNotes || []).find((n: any) => n.id === noteId);
            if (matchingNote) {
              setText(matchingNote.text);
              setColor(matchingNote.color);
            } else {
              handleClose();
            }
            if (restored.customizationConfig) {
              setPinType(restored.customizationConfig.pinType || "pin");
            }
          } catch (e) {
            console.error(e);
          }
        }
      }).then((fn) => {
        if (!cancelled) unlisten = fn;
      });
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [noteId]);

  const theme = NOTE_COLORS[color as keyof typeof NOTE_COLORS] || NOTE_COLORS.tea;

  return (
    <div
      onPointerDown={handleMouseDownDrag}
      onDoubleClick={handleToggleFold}
      className="w-screen h-screen bg-transparent p-3.5 flex flex-col justify-between overflow-hidden cursor-move relative select-none"
    >
      <div
        className={`w-full h-full rounded-2xl border ${theme.bg} ${theme.border} ${theme.shadow} p-4 pt-7 shadow-lg flex flex-col justify-between relative transition-all duration-300`}
      >
        <StickyPin type={pinType} />

        {/* Custom drag bar and close button */}
        <div className="absolute top-2 right-2.5 z-20 flex items-center gap-1.5">
          <button
            onClick={handleToggleFold}
            className="w-4 h-4 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
            title={isFolded ? fn.expand : fn.fold}
          >
            {isFolded ? (
              <svg className="w-2.5 h-2.5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            ) : (
              <svg className="w-2.5 h-2.5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
              </svg>
            )}
          </button>
          <button
            onClick={handleClose}
            className="w-4 h-4 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
            title={fn.close}
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>

        {/* Text Area */}
        {!isFolded ? (
          <textarea
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder={fn.placeholder}
            className={`w-full bg-transparent resize-none focus:outline-none text-xs font-semibold leading-relaxed placeholder-slate-400/60 custom-scrollbar flex-grow cursor-text ${theme.text}`}
            style={{ minHeight: "100px" }}
          />
        ) : (
          <div className={`text-[10px] font-extrabold truncate pr-10 mt-1 cursor-pointer ${theme.text}`}>
            {text.trim() || fn.doubleClickHint}
          </div>
        )}

        {/* Color circles */}
        {!isFolded && (
          <div className="flex items-center gap-2 pt-2 border-t border-dashed border-slate-200/40">
            {Object.entries(NOTE_COLORS).map(([colorKey, t]) => (
              <button
                key={colorKey}
                onClick={() => handleColorChange(colorKey)}
                className={`w-3.5 h-3.5 rounded-full ${t.bg} border ${t.border} transition-all hover:scale-110 cursor-pointer ${
                  color === colorKey ? "ring-1 ring-slate-400 scale-110" : ""
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
