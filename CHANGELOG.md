# 更新日志

格式大致遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。应用版本号以 `package.json` / `src-tauri/tauri.conf.json` 为准，本文不负责发版。

## [1.0.0] - 2026-07-27

第一个正式安装包版本：Windows exe/msi、macOS Apple Silicon dmg。

### 新增与加固
- 日记附件改为本地文件（桌面端 `attachments/`），启动时迁移旧的 Base64
- 领域 SQLite 表（任务 / 日记 / 番茄 / 习惯）与串行写队列
- OpenCode / Ollama 无 Key 也可使用 AI 能力
- 首屏拆包、日记输入防抖、任务延迟落盘等性能优化
- AI 散文错误可定位（超时、额度、模型参数等）

### 说明
- 安装包未代码签名；Windows SmartScreen / macOS 未识别开发者属预期
- 无官方 Linux 安装包

## [0.2.1] - 2026-07-26

小版本发布（安装包）。功能与 0.2.0 同一代：习惯卡片、周报、日记搜索、倒数日分组等。

## [0.2.0] - 2026-07-26

### 新增
- 主页习惯打卡卡片；日记关联区可打卡
- 时光长廊、AI 周报、日记分词搜索
- 倒数日按「今天 / 本周 / 本月 / 更远 / 已过期」分组
- 资讯 → 稍后读 / 存为任务 / 收藏到日记
- 翻页日记本（去 Markdown 工具栏、日期滑条）
- 任务到期系统通知
- WebDAV / HTTP 空包保护，避免空本地盖掉远端日记与 AI Key

### 修复
- 完成任务被同步或「日记自动加入待办」写回活动列表
- 四象限在 Windows WebView2 下去掉拖拽

## [0.1.0] - 2026-06-27

### 新增
- 四象限任务（矩阵、列表、日历）
- 番茄钟、便签、桌面小组件
- 个性化主题与日落模式
- AI 分类（需自行配置密钥）
- WebDAV 同步与本地存储

### 技术栈
- React 19 + TypeScript + Vite + Tailwind CSS 4
- Tauri 2 + Rust
