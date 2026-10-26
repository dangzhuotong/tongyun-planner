# 公司名册以库为准

Agent 面板的下拉、筛选、派活人选和在线心跳，以 `tongyun_pipeline.workers` 为准。本机 `domain_agents` 里的「本地助手」静态登记不是真相源。不新增显示用的 DDL 列。

## 读什么

- `workers`：只要 `enabled`，并且有 `last_seen_at` 或心跳（`tone` 不是 none）。没有心跳的工人不进派活名单。
- `agents`：只给对得上的工人补显示名（`display_name`）。人选 id 仍用 worker 的 `assignee` / agent 的 `slug`。仅因 agents 行存在、没有 worker 心跳的成员（例如不开定时任务的阿党、阿码）不进下拉和顶栏。
- `agents` 里没有、但 worker 已启用且有心跳的人（现在的 `cursor-cloud`）仍然入册，展示为 Cursor。

心跳：`last_seen_at` 在 3 分钟内且状态不是 offline，算在线，并写出年龄（例如「在线 · 12秒前」）。更早的 `last_seen_at` 仍算有心跳，显示为离线。

## 什么时候不读本机登记

配了公司库 DSN 时，下拉只显示这次读到的名册，或上次成功读库后留下的离线缓存。读失败、缓存也没有，名册为空，并说明没连上。这时不得用 `domain_agents` 的静态名单把下拉填上。

没配 DSN、也没有公司库缓存时，才显示本机 `domain_agents`，并标成「本机离线兜底」。

## 凭据从哪来

不新开一套密钥存放。按这个顺序找已有通路：

1. 桌面端读 `~/.tongyun/pipeline.dsn`，或 `pipeline.json` / `config.json` 里的 `pipeline_dsn` / `pipelineDsn` / `pipeline.dsn`，或 `.env` 的 `PIPELINE_DSN` / `TONGYUN_PIPELINE_DSN`。`config.json` 里泛泛的 `dsn` 不当成公司库。
2. 否则用现成远端 DSN：设置里的 `tongyun_remote_dsn`，或环境变量 `TONGYUN_REMOTE_DSN`。
3. 库名已经是 `tongyun_pipeline` 就直接用。否则沿用同一主机和账号，只把库名换成 `tongyun_pipeline`。

桌面进程通过 Tauri 命令 `read_pipeline_home_files` 读取上述文件，并且只把 DSN 相关字段交回界面，不把整份配置打进日志。

## 提需求

手帐把 `requirements` 写成一行：`id`、`title`、`detail`、`product_id`、`source=planner`、`status=open`、`priority`。`id` 由手帐生成并随插入返回，避免大整数在界面里丢精度。没有 DSN 或写库失败时不编造 id。

开发构建可设 `sessionStorage.tongyun_roster_fixture=1` 看合并后的演示名册。生产包忽略这个开关。

## 开工与改派

「新建」和「开始」写入 `tongyun_pipeline.tasks`。`assignee` 用有心跳的工人 slug（`cursor-cloud`、`agy-ibz` 这种）。`status` 用库里的可领值，优先 `todo`。列名从 `information_schema` 读，不猜一套固定 DDL。`id` 若是 TiDB `AUTO_RANDOM`（`EXTRA` 可能是空字符串，以 `SHOW CREATE TABLE` 为准），插入时省略 id，再用 `lastInsertId` 或 `planner_task_id` 回读真实 id。显式插入触发 8216 时只重试一次省略 id 的 INSERT。

写失败时本机看板不动，并显示错误。不会只把 `runStatus` 改成 running 来冒充开工。

本机「待跑 / 跑着」跟库里的 status：可领停在待跑，工人领成 doing / running 之后才进跑着。卡片上的改派下拉只列有心跳的工人，成功后回写 `tasks.assignee` 并放回可领。本机离线兜底不能当工人。

「改回自己」会先把公司库那一行标成取消；写失败则卡片仍留给工人。
