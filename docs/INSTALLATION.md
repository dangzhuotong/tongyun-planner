# 安装、更新与迁移

[返回介绍](../README.md) · [English](#english)

## 安装

在 [Releases](https://github.com/dangzhuotong/tongyun-planner/releases/latest) 下载对应系统的安装包。

- **Windows**：通常选择 `.exe` 安装程序，也提供 `.msi`。安装包尚未做操作系统代码签名，可能出现 SmartScreen 提示；确认下载来源是本仓库后，按系统提示处理。
- **macOS**：选择 Universal `.dmg`，支持 Apple Silicon 与 Intel。当前没有 Apple 代码签名与公证，首次打开可能被系统拦截。可在系统设置的隐私与安全性中查看对应应用的提示，并决定是否允许打开。
- **Linux**：按系统选择 `.AppImage` 或 `.deb`。

## 更新

在 **设置 → 系统与语言** 查看当前版本并点击 **检查更新**。启动时也会检查更新；有可用版本时按弹窗操作。

v1.0 的更新公钥与后续版本不同，需要先手动安装当前最新版。安装新版后可使用应用内更新。

更新包签名用于验证更新来源，不等同于操作系统代码签名或 Apple 公证。维护者的发布流程见[发版说明](RELEASE.md)。

## 备份与换机

- 设置中的 JSON 导出与桌面端每日快照可备份支持的数据；每日快照保留最近 14 份。
- JSON 不含 AI 密钥，也不会打包本地图片附件文件。完整迁移时，应另行保留应用数据目录中的附件文件。
- WebDAV 同步范围为任务、已完成任务、便签、番茄记录、倒数日、日记和应用配置；不要将它当作整个应用目录的备份。
- 密钥默认需在新设备重新填写。主动开启密钥同步后，需要在其他设备设置相同口令才能导入加密密钥。
- 本机配置中可能含敏感信息，完整备份不要公开分享。

存储实现与同步边界见[架构说明](../ARCHITECTURE.md)和[安全说明](../SECURITY.md)。

---

## English

[English overview](../README.en.md) · [简体中文](#安装更新与迁移)

### Install

Download an installer for your system from [Releases](https://github.com/dangzhuotong/tongyun-planner/releases/latest).

- **Windows**: choose the `.exe` installer or `.msi`. Installers do not currently have operating-system code signing, so SmartScreen may display a warning. Verify the download source before proceeding.
- **macOS**: use the Universal `.dmg` for Apple Silicon or Intel. The app is not currently Apple-signed or notarized. If blocked on first launch, review the app-specific notice in your system's Privacy & Security settings before deciding whether to allow it.
- **Linux**: choose `.AppImage` or `.deb` as appropriate for your distribution.

### Update

Open **Settings → System & Language** to view the installed version and check for updates. The app also checks at startup and shows a prompt when an update is available.

Version 1.0 uses an older updater key. Install the current release manually once before using in-app updates. Updater signatures are separate from operating-system code signing and Apple notarization.

### Back up and move devices

- Export JSON from Settings, or use daily desktop snapshots, which retain the latest 14 files.
- JSON exports omit API keys and do not bundle local image attachments. Copy attachment files separately for a complete move.
- WebDAV sync covers tasks, completed tasks, sticky notes, focus logs, countdowns, journal entries, and app configuration. It is not a backup of the entire app data directory.
- Enter keys again on a new device, or explicitly enable encrypted secret sync and use the same passphrase on both devices.
- A full local backup can contain credentials. Keep it private.
