import { expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createPlannerMcp } from "./planner-mcp.mjs";

it("negotiates MCP, exposes only granted tools, and forwards errors and credentials to loopback", async () => {
  const token = "a".repeat(64);
  const request = vi.fn(async (_url, { method, body }) => {
    if (method === "GET") return Response.json({ operations: ["create_note"] });
    const { operation } = JSON.parse(body);
    return operation === "create_note"
      ? Response.json({ requestId: "sample", data: { id: "note-id" } })
      : Response.json({ requestId: "other", error: "scope_denied" }, { status: 403 });
  });
  const server = createPlannerMcp(token, request);
  const client = new Client({ name: "test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  try {
    await client.connect(clientTransport);
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(["create_note"]);
    const result = await client.callTool({ name: "create_note", arguments: { text: "test note" } });
    expect(result.isError).not.toBe(true);
    expect(result.content).toEqual([
      { type: "text", text: JSON.stringify({ requestId: "sample", data: { id: "note-id" } }) },
    ]);
    expect(request).toHaveBeenLastCalledWith(
      "http://127.0.0.1:17321/v1/agent",
      expect.objectContaining({
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "create_note", arguments: { text: "test note" } }),
        redirect: "error",
      }),
    );
    expect((await client.callTool({ name: "list_journal", arguments: {} })).isError).toBe(true);
    expect((await client.callTool({ name: "delete_note", arguments: {} })).isError).toBe(true);
    expect(request).toHaveBeenCalledTimes(3);
  } finally {
    await client.close();
    await server.close();
  }
});
