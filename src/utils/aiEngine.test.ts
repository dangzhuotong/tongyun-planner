import { describe, it, expect } from "vitest";
import { getEffectiveApiKey, canUseAI, describeAIError } from "./aiEngine";
import type { CustomizationConfig } from "../types";

describe("aiEngine pure helpers", () => {
  const baseConfig: CustomizationConfig = {
    qColors: {
      "urgent-important": "",
      "important-not-urgent": "",
      "urgent-not-important": "",
      "not-urgent-not-important": "",
    },
    cardBackground: "white",
    pinType: "pin",
  };

  describe("getEffectiveApiKey", () => {
    it("should return provider-specific key from providerApiKeys if present", () => {
      const config: CustomizationConfig = {
        ...baseConfig,
        aiProvider: "openai",
        providerApiKeys: {
          openai: "sk-openai-123",
          deepseek: "sk-deepseek-456",
        },
        aiApiKey: "fallback-key",
      };
      expect(getEffectiveApiKey(config)).toBe("sk-openai-123");
    });

    it("should fall back to legacy aiApiKey if providerApiKeys has no entry", () => {
      const config: CustomizationConfig = {
        ...baseConfig,
        aiProvider: "openai",
        providerApiKeys: {},
        aiApiKey: "legacy-key",
      };
      expect(getEffectiveApiKey(config)).toBe("legacy-key");
    });

    it("should return undefined when no key is set", () => {
      const config: CustomizationConfig = {
        ...baseConfig,
        aiProvider: "openai",
      };
      expect(getEffectiveApiKey(config)).toBeUndefined();
    });
  });

  describe("canUseAI", () => {
    it("should allow opencode and ollama without an API key", () => {
      const opencodeConfig: CustomizationConfig = {
        ...baseConfig,
        aiProvider: "opencode",
      };
      expect(canUseAI(opencodeConfig)).toBe(true);

      const ollamaConfig: CustomizationConfig = {
        ...baseConfig,
        aiProvider: "ollama",
      };
      expect(canUseAI(ollamaConfig)).toBe(true);
    });

    it("should require an API key for openai, anthropic, and deepseek", () => {
      const openaiWithoutKey: CustomizationConfig = {
        ...baseConfig,
        aiProvider: "openai",
      };
      expect(canUseAI(openaiWithoutKey)).toBe(false);

      const openaiWithKey: CustomizationConfig = {
        ...baseConfig,
        aiProvider: "openai",
        aiApiKey: "sk-123",
      };
      expect(canUseAI(openaiWithKey)).toBe(true);
    });
  });

  describe("describeAIError", () => {
    it("should describe API_KEY_MISSING in Chinese and English", () => {
      expect(describeAIError(new Error("API_KEY_MISSING"), "zh-CN")).toContain("API Key");
      expect(describeAIError(new Error("API_KEY_MISSING"), "en")).toContain("API key");
    });

    it("should describe quota and auth errors correctly", () => {
      expect(describeAIError("E_HTTP_401", "zh-CN")).toContain("Key 无效或已失效");
      expect(describeAIError("E_HTTP_429", "zh-CN")).toContain("额度不足或请求受限");
      expect(describeAIError("insufficient_quota", "en")).toContain("quota is exhausted");
    });

    it("should describe network and timeout errors", () => {
      expect(describeAIError("E_NETWORK: timed out", "zh-CN")).toContain("无法连接 AI 服务");
      expect(describeAIError("connect error", "en")).toContain("Could not reach the AI service");
    });

    it("should format unknown generic errors safely", () => {
      const err = describeAIError("some custom random error", "zh-CN");
      expect(err).toContain("AI 请求失败：some custom random error");
    });
  });
});
