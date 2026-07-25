import { useState, useCallback, useMemo } from "react";
import type { StickyNote } from "../types";
import { useSync } from "./useSync";
import { createId } from "../utils/id";

export function useStickyNotes() {
  const { syncState } = useSync();
  const [stickyNotes, setStickyNotes] = useState<StickyNote[]>([]);

  const handleAddNote = useCallback(() => {
    const newNote = {
      id: createId("note"),
      text: "",
      color: "tea",
      rotate:
        Math.random() > 0.5
          ? Math.floor(Math.random() * 3) + 1
          : -(Math.floor(Math.random() * 3) + 1),
    };
    setStickyNotes((prev) => [newNote, ...prev]);
    syncState(newNote.id, "add_note", JSON.stringify(newNote));
  }, [syncState]);

  const handleEditNoteText = useCallback((id: string, text: string) => {
    setStickyNotes((prev) => prev.map((n) => (n.id === id ? { ...n, text } : n)));
    syncState(id, "edit_note_text", text);
  }, [syncState]);

  const handleEditNoteTitle = useCallback((id: string, title: string) => {
    setStickyNotes((prev) => prev.map((n) => (n.id === id ? { ...n, title } : n)));
    syncState(id, "edit_note_title", title);
  }, [syncState]);

  const handleChangeNoteColor = useCallback((id: string, color: string) => {
    setStickyNotes((prev) => prev.map((n) => (n.id === id ? { ...n, color } : n)));
    syncState(id, "change_note_color", color);
  }, [syncState]);

  const handleDeleteNote = useCallback((id: string) => {
    setStickyNotes((prev) => prev.filter((n) => n.id !== id));
    syncState(id, "delete_note");
  }, [syncState]);

  return useMemo(() => ({
    stickyNotes,
    setStickyNotes,
    handleAddNote,
    handleEditNoteText,
    handleEditNoteTitle,
    handleChangeNoteColor,
    handleDeleteNote,
  }), [stickyNotes, handleAddNote, handleEditNoteText, handleEditNoteTitle, handleChangeNoteColor, handleDeleteNote]);
}
