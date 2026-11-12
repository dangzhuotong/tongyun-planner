import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createPlannerMcp } from "./planner-mcp.mjs";

try {
  const server = createPlannerMcp(process.env.TONGYUN_PLANNER_AGENT_TOKEN);
  await server.connect(new StdioServerTransport());
} catch (error) {
  console.error(error instanceof Error ? error.message : "Could not start Planner MCP.");
  process.exitCode = 1;
}
