# TongYun Sync Server

自建同步小服务：App / AI 只调 **HTTP + API Key**，MySQL 留在你自己的机器上。

与桌面端 `SyncCategory` 对齐：

`tasks` · `completedTasks` · `stickyNotes` · `pomodoroLogs` · `countdowns` · `habits` · `journal` · `config`

> `habits` 在库里是一份 JSON：`{ habits, habitLogs, moods }`（与 WebDAV `habits.json` 一致）。

## 架构

```
TongYun App / AI Agent
        │  HTTPS + X-API-Key
        ▼
   sync-api (:8787)     ← 本仓库 sync-server
        │
        ▼
   MySQL 8 (仅内网 / 本机)
```

## 快速启动（Docker）

```bash
cd sync-server
cp .env.example .env
# 编辑 .env：改 MYSQL_PASSWORD、API_KEY（务必换成长随机串）

docker compose up -d --build
curl http://127.0.0.1:8787/health
```

本机无 Docker 时：

```bash
# 先自备 MySQL，执行 schema.sql
python -m venv .venv
# Windows: .venv\Scripts\activate
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # 填好连接信息
uvicorn app.main:app --host 0.0.0.0 --port 8787 --reload
```

## 鉴权

每个请求带其一：

- 头：`X-API-Key: <你的密钥>`
- 或：`Authorization: Bearer <你的密钥>`

个人模式：`.env` 里 `API_KEY` + `USER_ID`。  
多用户：`API_KEY_MAP=keyA:alice,keyB:bob`。

**密钥只放服务器 `.env`，不要写进 Git，也不要放进「复制给 AI」的提示词。**

## API 一览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 探活（无需鉴权） |
| GET | `/v1/manifest` | 各类 `version` |
| GET | `/v1/categories` | 合法分类列表 |
| GET | `/v1/categories/{category}` | 拉一类数据 |
| PUT | `/v1/categories/{category}` | 写一类；可带 `base_version` 乐观锁 |
| GET | `/v1/snapshot` | 全量（形状对齐 App `SyncData`） |
| PUT | `/v1/snapshot` | 全量写入；`merge_by_version=true` 时按版本跳过较新的类 |

### 写单类示例

```bash
curl -s -X PUT http://127.0.0.1:8787/v1/categories/tasks \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"data":[{"id":"a1","title":"示例","category":"important-not-urgent"}],"version":1721433600000,"base_version":0}'
```

若服务端 `version > base_version` → **409**，响应里带 `server_data`，便于客户端合并。

### 全量快照示例

```bash
curl -s http://127.0.0.1:8787/v1/snapshot -H "X-API-Key: $API_KEY"
```

## 安全建议

1. MySQL **不要**对公网开放（compose 已绑 `127.0.0.1:3306`）
2. 对外只暴露 `8787`，前面加 HTTPS（Caddy / Nginx / Cloudflare Tunnel）
3. API Key 用长随机串；泄露就轮换 `.env` 并重启
4. 定期备份 MySQL volume / `mysqldump`

## 与桌面端的关系

桌面端设置 → 云同步 → 同步后端选 **「自建 Sync 服务」**：

1. 服务地址填 `http://127.0.0.1:8787`（或你的域名）
2. API Key 填本服务 `.env` 的 `API_KEY`
3. 点「测试连接」→「立即同步」

同步策略与 WebDAV 相同：先按分类 pull 远端更新，再 push 本地较新的分类。

## AI 提示词

见同目录 [`AI_PROMPT.md`](./AI_PROMPT.md)（**不含密钥**，可安全复制给助手）。
