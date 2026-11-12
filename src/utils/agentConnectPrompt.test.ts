import { describe, expect, it } from "vitest";
import { buildAgentConnectPrompt } from "./agentConnectPrompt";

describe("buildAgentConnectPrompt", () => {
  it("includes the visible token and the local MCP script", () => {
    const prompt = buildAgentConnectPrompt("abc123");
    expect(prompt).toContain("Authorization: Bearer abc123");
    expect(prompt).toContain("http://127.0.0.1:17321/v1/agent");
    expect(prompt).toContain("scripts/planner-mcp-stdio.mjs");
    expect(prompt).toContain('"TONGYUN_PLANNER_AGENT_TOKEN": "abc123"');
  });

  it("keeps a placeholder when the token is no longer on screen", () => {
    expect(buildAgentConnectPrompt("  ")).toContain("<贴上刚创建的令牌>");
  });
});
