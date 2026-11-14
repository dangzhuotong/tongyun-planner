# 本机 Agent API 与 MCP

这是桌面端的本机接口。默认关闭，通过设置页或本机配置授权后才监听 `127.0.0.1:17321`。Planner 必须正在运行；隐藏主窗口可以继续用，退出 App 后不可用。浏览器版与远程 Agent 不在本期支持范围内。

## 开启与分权

打开桌面版 **设置 → Agent**，填写客户端名称，勾选允许的操作，再点击「创建授权」。令牌只在当前页面展示一次。保存到该客户端的私密环境变量后，可在手帐设置页撤销授权或查看近期操作记录。

脚本也可以管理授权。将一个独立 32 字节随机令牌的 64 字符十六进制文本（不含换行）做 SHA-256，把散列写入应用配置目录的 `agent-api-grants.json`。macOS 的正式版目录是 `~/Library/Application Support/com.tongyunplanner.app/`。仅允许本机用户读写。文件示例：

```json
[
  {
    "client": "my-planner-agent",
    "token_sha256": "<64 字符 SHA-256 十六进制散列>",
    "allow": ["list_tasks", "create_task", "create_note"]
  }
]
```

首次手工创建配置文件后重开桌面版。授权变更会在下一次请求时生效。端口冲突会在创建授权时提示。撤销最后一个授权后，当前进程继续监听到退出，所有令牌均会被拒绝。

## 调用

请求都需要 `Authorization: Bearer <令牌>`。浏览器来源和非回环 Host 会被拒绝。

| 方法 | 地址 | 用途 |
|---|---|---|
| GET | `http://127.0.0.1:17321/v1/agent` | 返回该客户端获准的操作 |
| POST | 同上 | JSON 请求执行一次操作，形如 `{"operation":"list_tasks","arguments":{"query":"会议","limit":10}}` |

- `list_tasks`、`list_notes`、`list_journal`：可传 `query`、`limit`（默认 10，最大 50）及 `offset`。结果包含 `items` 和 `nextOffset`；文本字段最长 4,000 字符。任务查询包括已完成项。返回不含附件、配置或团队派活字段。
- `create_task`：必填 `title`；可选 `description`、`category` 和 `dueDate`。
- `create_note`：必填 `text`；可选 `title`。
- `create_journal`：必填 `title`、`content`；可选 `date`（默认今天）和 `isDaily`（默认随记）。日期为 `YYYY-MM-DD`。同一天已有日记时返回 409。Agent 新建日记时不会立即触发关联任务生成。

成功响应包含 `requestId` 和 `data`；新增成功时 `data.id` 为新记录 ID。401 表示令牌无效，403 表示权限不足或请求来源不允许，400 表示操作或参数无效。创建请求可附 `Idempotency-Key`（1–64 个 ASCII 字母、数字、点、下划线或连字符）。同一客户端以相同键和参数重试会收到原回执；同一键配不同参数会收到 409。首次调用结果不确定时，原键仍能防止重复写入；请到手帐和日志核对结果。未带键的创建请求需在重试前手工核对。

## 接入 MCP 客户端

在源代码目录安装依赖（`npm ci`），然后将下面配置放入支持标准输入输出的 MCP 客户端。使用客户端的私密环境变量配置提供 `TONGYUN_PLANNER_AGENT_TOKEN`；不要把令牌写进仓库。推荐 Node 22。工具列表只展示该令牌有权执行的操作。三个创建工具的可选 `requestKey` 对应 HTTP 的 `Idempotency-Key`。

```json
{
  "mcpServers": {
    "tongyun-planner": {
      "command": "node",
      "args": ["/absolute/path/to/tongyun-planner/scripts/planner-mcp-stdio.mjs"]
    }
  }
}
```

## 审计与危险操作

日志文件 `agent-api-audit.jsonl` 位于 Planner 的本机应用数据目录（macOS 同上述目录）。每行记录客户端名、操作、时间、请求 ID 和状态，不记录令牌或正文。允许执行的操作先记开始记录；日志不可写时不执行。单个日志达到约 1 MiB 时轮转，保留最近三份历史文件。设置页展示最近 50 条记录。

接口只提供查询及逐条创建。删除、批量修改、覆盖、恢复、读取设置及访问附件均未开放，也没有确认后绕过限制的入口。审计只保存在当前设备。幂等回执独立保存在应用数据目录，可跨重启继续使用。
