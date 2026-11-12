const MCP_SCRIPT = "/Users/d/code/tongyun-work/repos/tongyun-planner/scripts/planner-mcp-stdio.mjs";

/** 交给外部 Agent 的接入说明。令牌只在刚创建、页面上还能看到时写入。 */
export function buildAgentConnectPrompt(token: string, english = false): string {
  const secret = token.trim() || (english ? "<paste the token shown once>" : "<贴上刚创建的令牌>");
  if (english) {
    return [
      "Tongyun Planner must stay open. The local API is http://127.0.0.1:17321/v1/agent.",
      `Send Authorization: Bearer ${secret}.`,
      "GET lists the operations this token may call.",
      'POST a JSON body such as {"operation":"list_tasks","arguments":{"limit":10}}.',
      "Do not write the token into a repository.",
      "",
      "Cursor MCP config:",
      JSON.stringify(
        {
          mcpServers: {
            "tongyun-planner": {
              command: "node",
              args: [MCP_SCRIPT],
              env: { TONGYUN_PLANNER_AGENT_TOKEN: secret },
            },
          },
        },
        null,
        2,
      ),
    ].join("\n");
  }
  return [
    "橦云手帐必须保持打开。本机接口是 http://127.0.0.1:17321/v1/agent。",
    `请求头使用 Authorization: Bearer ${secret}。`,
    "GET 返回这个令牌允许的操作。",
    'POST 示例：{"operation":"list_tasks","arguments":{"limit":10}}。',
    "不要把令牌写进仓库。",
    "",
    "Cursor 的 MCP 配置：",
    JSON.stringify(
      {
        mcpServers: {
          "tongyun-planner": {
            command: "node",
            args: [MCP_SCRIPT],
            env: { TONGYUN_PLANNER_AGENT_TOKEN: secret },
          },
        },
      },
      null,
      2,
    ),
  ].join("\n");
}
