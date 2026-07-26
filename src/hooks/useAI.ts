import { useState, useCallback, useEffect, useMemo } from "react";
import type { CustomizationConfig } from "../types";
import { extractTasksFromNote, classifyCategory, getEffectiveApiKey } from "../utils/aiEngine";
import type { ExtractedTask } from "../utils/aiEngine";
import { useDebouncedValue } from "./useDebouncedValue";

export function useAI(customizationConfig: CustomizationConfig) {
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 200);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [aiInputText, setAiInputText] = useState("");
  const [aiInputLoading, setAiInputLoading] = useState(false);
  const [aiInputMessage, setAiInputMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [aiPreviewTasks, setAiPreviewTasks] = useState<ExtractedTask[]>([]);
  const [showAiInbox, setShowAiInbox] = useState(false);

  const handleAiBatchInput = useCallback(async () => {
    if (!aiInputText.trim()) {
      setAiInputMessage({ type: "error", text: "⚠️ 请先在输入框中写入您的日程规划内容！" });
      return;
    }
    if (!getEffectiveApiKey(customizationConfig)) {
      setAiInputMessage({ type: "error", text: "API_KEY_MISSING" });
      return;
    }
    setAiInputLoading(true);
    setAiInputMessage(null);
    try {
      const tasksList = await extractTasksFromNote(customizationConfig, aiInputText);
      if (tasksList && tasksList.length > 0) {
        setAiPreviewTasks(tasksList);
        setAiInputMessage(null);
      } else {
        setAiInputMessage({
          type: "error",
          text: "⚠️ AI 没能在您的输入中分析出明确的待办日程，请尝试更具体的描述 ☕",
        });
      }
    } catch (e: any) {
      if (e.message === "API_KEY_MISSING") {
        setAiInputMessage({ type: "error", text: "API_KEY_MISSING" });
      } else {
        setAiInputMessage({ type: "error", text: `❌ AI 解析失败: ${e.message || e}` });
      }
    } finally {
      setAiInputLoading(false);
    }
  }, [aiInputText, customizationConfig]);

  const aiAutoCategorize = useCallback(async (title: string, description: string) => {
    if (customizationConfig.aiAutoCategorize && getEffectiveApiKey(customizationConfig)) {
      return await classifyCategory(customizationConfig, title, description);
    }
    return null;
  }, [customizationConfig]);

  // Auto-dismiss AI messages
  useEffect(() => {
    if (aiInputMessage) {
      const timer = setTimeout(() => setAiInputMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [aiInputMessage]);

  return useMemo(() => ({
    searchQuery,
    debouncedSearchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    tagFilter,
    setTagFilter,
    aiInputText,
    setAiInputText,
    aiInputLoading,
    aiInputMessage,
    setAiInputMessage,
    aiPreviewTasks,
    setAiPreviewTasks,
    showAiInbox,
    setShowAiInbox,
    handleAiBatchInput,
    aiAutoCategorize,
  }), [searchQuery, debouncedSearchQuery, categoryFilter, tagFilter, aiInputText, aiInputLoading, aiInputMessage, aiPreviewTasks, showAiInbox, handleAiBatchInput, aiAutoCategorize]);
}
