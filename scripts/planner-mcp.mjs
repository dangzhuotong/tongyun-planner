import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const endpoint = "http://127.0.0.1:17321/v1/agent";
const text = (maxLength) => ({ type: "string", minLength: 1, maxLength });
const date = { type: "string", format: "date" };
const list = {
  query: text(200),
  limit: { type: "integer", minimum: 1, maximum: 50 },
  offset: { type: "integer", minimum: 0, maximum: 1_000_000 },
};
const tool = (name, description, properties, required = [], readOnlyHint = false) => ({
  name,
  description,
  inputSchema: {
    type: "object",
    properties: readOnlyHint
      ? properties
      : {
          ...properties,
          requestKey: {
            type: "string",
            pattern: "^[A-Za-z0-9._-]{1,64}$",
            description: "Reuse this key only when retrying the same create request.",
          },
        },
    required,
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint,
    destructiveHint: false,
    idempotentHint: readOnlyHint,
    openWorldHint: false,
  },
});
const tools = [
  tool("list_tasks", "Search or page through active and completed tasks.", list, [], true),
  tool(
    "create_task",
    "Create one new task in Planner.",
    {
      title: text(200),
      description: text(4000),
      dueDate: date,
      category: {
        enum: [
          "urgent-important",
          "urgent-not-important",
          "important-not-urgent",
          "not-urgent-not-important",
        ],
      },
    },
    ["title"],
  ),
  tool("list_notes", "Search or page through sticky notes.", list, [], true),
  tool(
    "create_note",
    "Create one new sticky note in Planner.",
    {
      title: text(200),
      text: text(8000),
    },
    ["text"],
  ),
  tool(
    "list_journal",
    "Search or page through journal entries. Text fields are previews; attachments are excluded.",
    list,
    [],
    true,
  ),
  tool(
    "create_journal",
    "Create one new journal entry. An existing daily entry is never overwritten.",
    {
      title: text(200),
      content: text(16000),
      date,
      isDaily: { type: "boolean" },
    },
    ["title", "content"],
  ),
];

export function createPlannerMcp(token, request = fetch) {
  if (!/^[0-9a-f]{64}$/i.test(token ?? ""))
    throw new Error("Set TONGYUN_PLANNER_AGENT_TOKEN to your 64-character token.");
  const server = new Server(
    { name: "tongyun-planner", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );
  async function call(body, requestKey) {
    const response = await request(endpoint, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(requestKey !== undefined ? { "Idempotency-Key": requestKey } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });
    return { ok: response.ok, value: await response.json() };
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    let access;
    try {
      access = await call();
    } catch {
      throw new Error(
        "Planner API unavailable. Check that the desktop app and Agent API are enabled.",
      );
    }
    if (!access.ok || !Array.isArray(access.value.operations)) {
      throw new Error("Planner API rejected the connection. Check the client token and grants.");
    }
    return { tools: tools.filter(({ name }) => access.value.operations.includes(name)) };
  });

  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    const result = (value, isError = false) => ({
      content: [{ type: "text", text: JSON.stringify(value) }],
      ...(isError ? { isError } : {}),
    });
    if (!tools.some((tool) => tool.name === params.name))
      return result({ error: "unsupported_operation" }, true);
    try {
      const { requestKey, ...args } = params.arguments ?? {};
      if (
        requestKey !== undefined &&
        (typeof requestKey !== "string" || !/^[A-Za-z0-9._-]{1,64}$/.test(requestKey))
      ) {
        return result({ error: "invalid_request_key" }, true);
      }
      const { ok, value } = await call({ operation: params.name, arguments: args }, requestKey);
      return result(value, !ok);
    } catch {
      return result(
        {
          error: "connection_failed_outcome_unknown",
          message: "Check Planner and the audit log before retrying a create.",
        },
        true,
      );
    }
  });
  return server;
}
